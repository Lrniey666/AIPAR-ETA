// LLM 閘道：先換同一家的下一把金鑰，再換下一家；全掛才拋例外。
//
// 順序：provider1/key1 → provider1/key2 → provider2/key1 → …
//   429／5xx／連線錯：同一把可重試一次（聽 Retry-After），再不行換下一把
//   401／403：這把金鑰無效，立刻換下一把
//   400：請求本身有問題，跳過這家剩下的金鑰
//   回覆為空：當成這家失敗，換下一家
//   require_json 卻挖不出 JSON：同上（菜單圖常見：思考／截斷把 JSON 弄壞）
//
// 等待上限刻意壓在幾秒內——Discord 互動不能讓使用者等一分鐘。

import { create_logger } from "../shared/logger.ts";
import { extract_json } from "./json.ts";
import { load_providers, type Provider, type ProviderRegistry } from "./providers.ts";
import {
  AUTH_STATUS,
  ProviderCallError,
  call_provider,
  retry_after_ms,
  type CallOptions,
  type ChatMessage,
} from "./transport.ts";

const log = create_logger("llm");

export type Attempt = {
  provider: string;
  model: string;
  ok: boolean;
  status?: number;
  error?: string;
  waited_ms: number;
};

export type GatewayResult = {
  provider: string;
  model: string;
  text: string;
  latency_ms: number;
  attempts: Attempt[];
};

export type CallRecorder = (record: {
  task: string;
  provider: string;
  model: string;
  ok: boolean;
  latency_ms: number;
  status_code?: number;
  error?: string;
}) => void;

export type GatewayOptions = {
  /** 記在 llm_calls 的任務名稱，例如 menu-vision、order-parse。 */
  task: string;
  messages: ChatMessage[];
  mode?: "text" | "vision";
  temperature?: number;
  max_tokens?: number;
  json_mode?: boolean;
  /** 回覆必須挖得出 JSON；挖不到就當這家失敗、換下一家。菜單辨識用。 */
  require_json?: boolean;
  on_delta?: (chunk: string) => void;
  signal?: AbortSignal;
  /** 只試這幾家（測試或指定供應商時用）。 */
  only?: string[];
};

export class NoProviderAvailable extends Error {
  constructor(mode: string, skipped: string) {
    super(`沒有可用的 ${mode} LLM 供應商。${skipped}`);
    this.name = "NoProviderAvailable";
  }
}

export class AllProvidersFailed extends Error {
  attempts: Attempt[];

  constructor(attempts: Attempt[]) {
    const detail = attempts.map((a) => `${a.provider}: ${a.error ?? "未知錯誤"}`).join("；");
    super(`所有 LLM 供應商都失敗了 → ${detail}`);
    this.name = "AllProvidersFailed";
    this.attempts = attempts;
  }
}

const RETRY_CAP_MS = 4000;
const RETRIES_PER_KEY = 1;

export class LlmGateway {
  #registry: ProviderRegistry;
  #record: CallRecorder | undefined;

  constructor(registry?: ProviderRegistry, record?: CallRecorder) {
    this.#registry = registry ?? load_providers();
    this.#record = record;
  }

  get registry(): ProviderRegistry {
    return this.#registry;
  }

  /** 重新讀環境變數；改 .env 重啟容器就會生效。 */
  reload(): void {
    this.#registry = load_providers();
  }

  has_text(): boolean {
    return this.#registry.text.length > 0;
  }

  has_vision(): boolean {
    return this.#registry.vision.length > 0;
  }

  async complete(options: GatewayOptions): Promise<GatewayResult> {
    const mode = options.mode ?? "text";
    const pool = mode === "vision" ? this.#registry.vision : this.#registry.text;
    const providers = options.only
      ? pool.filter((provider) => options.only!.includes(provider.key))
      : pool;

    if (providers.length === 0) {
      const skipped = this.#registry.skipped.map((s) => `${s.key}（${s.reason}）`).join("、");
      throw new NoProviderAvailable(mode, skipped ? `已跳過：${skipped}` : "");
    }

    const attempts: Attempt[] = [];
    for (const provider of providers) {
      const model = mode === "vision" ? provider.vision_model : provider.model;
      const result = await this.#try_provider(provider, model, options, attempts);
      if (result) {
        return { ...result, attempts };
      }
    }
    throw new AllProvidersFailed(attempts);
  }

  async #try_provider(
    provider: Provider,
    model: string,
    options: GatewayOptions,
    attempts: Attempt[],
  ): Promise<Omit<GatewayResult, "attempts"> | undefined> {
    const call_options: CallOptions = {
      model,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      json_mode: options.json_mode,
      on_delta: options.on_delta,
      signal: options.signal,
    };

    for (const api_key of provider.api_keys) {
      for (let attempt = 0; attempt <= RETRIES_PER_KEY; attempt += 1) {
        try {
          const outcome = await call_provider(provider, api_key, call_options);
          if (options.require_json && extract_json(outcome.text) === undefined) {
            const preview = outcome.text.replace(/\s+/g, " ").trim().slice(0, 80);
            throw new ProviderCallError(
              preview ? `模型沒有回傳可解析的 JSON（${preview}）` : "模型沒有回傳可解析的 JSON",
              undefined,
              false,
            );
          }
          attempts.push({ provider: provider.key, model, ok: true, waited_ms: 0 });
          this.#record?.({
            task: options.task,
            provider: provider.key,
            model,
            ok: true,
            latency_ms: outcome.latency_ms,
          });
          return { provider: provider.key, model, text: outcome.text, latency_ms: outcome.latency_ms };
        } catch (raw) {
          const error = raw as ProviderCallError & { headers?: Headers };
          const status = error.status;
          let waited = 0;

          const can_retry_same_key = error.transient && attempt < RETRIES_PER_KEY;
          if (can_retry_same_key) {
            waited = retry_after_ms(error.headers ?? new Headers(), attempt, RETRY_CAP_MS);
            await sleep(waited);
          }

          attempts.push({
            provider: provider.key,
            model,
            ok: false,
            status,
            error: error.message.slice(0, 200),
            waited_ms: waited,
          });
          this.#record?.({
            task: options.task,
            provider: provider.key,
            model,
            ok: false,
            latency_ms: 0,
            status_code: status,
            error: error.message,
          });
          log.warn("供應商呼叫失敗", { provider: provider.key, status, task: options.task });

          if (status !== undefined && AUTH_STATUS.has(status)) {
            break; // 這把金鑰無效，換下一把
          }
          if (!error.transient) {
            return undefined; // 400 之類：換金鑰也一樣，直接換下一家
          }
          if (!can_retry_same_key) {
            break; // 這把重試次數用完，換下一把
          }
        }
      }
    }
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
