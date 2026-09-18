// 單一次 HTTP 呼叫。只用 Node 內建 fetch，不引 SDK——各家都吃 OpenAI 的 wire format。

import type { Provider } from "./providers.ts";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};

export type CallOptions = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  /** 要求模型只吐 JSON；不是每家都支援，失敗時由呼叫端退回純文字解析。 */
  json_mode?: boolean;
  /** 有給就走串流，每段文字即時回呼（Discord 的 streaming preview 靠這個）。 */
  on_delta?: (chunk: string) => void;
  signal?: AbortSignal;
};

export type CallOutcome = {
  text: string;
  latency_ms: number;
  prompt_tokens?: number;
  completion_tokens?: number;
};

export class ProviderCallError extends Error {
  status: number | undefined;
  transient: boolean;

  constructor(message: string, status: number | undefined, transient: boolean) {
    super(message);
    this.name = "ProviderCallError";
    this.status = status;
    this.transient = transient;
  }
}

// 這些狀態代表「這把金鑰或這家現在不行」，不是請求寫錯。
const TRANSIENT_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
export const AUTH_STATUS = new Set([401, 403]);

function build_body(provider: Provider, options: CallOptions, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    temperature: options.temperature ?? 0,
    ...provider.extra_body,
  };
  if (options.max_tokens !== undefined) {
    body.max_tokens = options.max_tokens;
  }
  if (options.json_mode) {
    body.response_format = { type: "json_object" };
  }
  if (stream) {
    body.stream = true;
  }
  return body;
}

async function read_error_detail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 300).replace(/\s+/g, " ");
  } catch {
    return response.statusText;
  }
}

function to_call_error(error: unknown): ProviderCallError {
  if (error instanceof ProviderCallError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  // 連線層的錯（DNS、逾時、斷線）都算暫時性，換一家通常就好了。
  return new ProviderCallError(message, undefined, true);
}

export function retry_after_ms(headers: Headers, attempt: number, cap_ms: number): number {
  const retry_after = headers.get("retry-after");
  if (retry_after) {
    const seconds = Number(retry_after);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, cap_ms);
    }
  }
  return Math.min(500 * 2 ** attempt, cap_ms);
}

export async function call_provider(
  provider: Provider,
  api_key: string,
  options: CallOptions,
): Promise<CallOutcome> {
  const stream = Boolean(options.on_delta);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), provider.timeout_ms);
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;

  const started = performance.now();
  try {
    const response = await fetch(`${provider.base_url}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${api_key}`,
      },
      body: JSON.stringify(build_body(provider, options, stream)),
      signal,
    });

    if (!response.ok) {
      const detail = await read_error_detail(response);
      const transient = TRANSIENT_STATUS.has(response.status);
      const error = new ProviderCallError(`HTTP ${response.status}: ${detail}`, response.status, transient);
      // 429 時把 Retry-After 帶出去，讓 router 決定要等多久。
      (error as ProviderCallError & { headers?: Headers }).headers = response.headers;
      throw error;
    }

    const text = stream
      ? await consume_stream(response, options.on_delta!)
      : extract_text(await response.json());

    // 空回覆要當成這一家失敗，讓 router 換下一家。
    // 實測 Gemini 免費層常常把 max_tokens 花在思考上、正文留空；
    // 若當成成功回傳，上層只會拿到一個解析不出東西的空字串。
    if (!text.trim()) {
      throw new ProviderCallError("模型回覆為空（多半是 token 預算被思考吃光）", undefined, false);
    }

    return { text, latency_ms: performance.now() - started };
  } catch (error) {
    throw to_call_error(error);
  } finally {
    clearTimeout(timer);
  }
}

/** 推理型模型常把正文留空、只給 reasoning 欄位；兩個都撈才不會拿到空字串。 */
function extract_text(payload: unknown): string {
  const root = payload as {
    choices?: Array<{ message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown } }>;
  };
  const message = root?.choices?.[0]?.message;
  const candidates = [message?.content, message?.reasoning_content, message?.reasoning];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
    // Gemini 相容端點偶爾把 content 包成陣列。
    if (Array.isArray(candidate)) {
      const joined = candidate
        .map((part) => (typeof part === "string" ? part : ((part as { text?: string })?.text ?? "")))
        .join("");
      if (joined.trim()) {
        return joined;
      }
    }
  }
  return "";
}

async function consume_stream(response: Response, on_delta: (chunk: string) => void): Promise<string> {
  if (!response.body) {
    throw new ProviderCallError("串流回應沒有內容", undefined, true);
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") {
        continue;
      }
      try {
        const event = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const piece = event.choices?.[0]?.delta?.content;
        if (piece) {
          full += piece;
          on_delta(piece);
        }
      } catch {
        // 半截的 JSON 事件直接跳過，下一輪 buffer 會補齊。
      }
    }
  }
  return full;
}
