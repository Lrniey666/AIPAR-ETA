// PP-OCRv6 small 的 HTTP 客戶端。菜單圖片辨識的「對帳」來源。
//
// 為什麼是獨立 HTTP 服務而不是塞進 bot：實驗室機器效能普通，辨識會拖垮 Discord。
// 本 Repository 的服務在 `ocr/`（PP-OCRv6 small ONNX），Compose 起 `ocr` 容器並覆寫
// `OCR_BASE_URL=http://ocr:8868`。沒設定就整段略過，回到純視覺流程。
//
// 線上格式與 `src/domain/ocr_layout.ts` 的 `parse_ocr_payload` 對齊，兩種都吃：
//   本專案約定  {"lines":[{"text","score","box"}]}
//   PaddleOCR   {"results":[[{"text","confidence","text_region"}]]}

import { create_logger } from "../shared/logger.ts";
import { parse_ocr_payload, type OcrLine } from "../domain/ocr_layout.ts";

const log = create_logger("ocr");

export type OcrConfig = {
  base_url: string;
  path: string;
  api_key: string;
  /** 只是記錄用；服務端自己決定載入哪個權重。 */
  model: string;
  timeout_ms: number;
  min_score: number;
};

export type OcrOutcome = {
  lines: OcrLine[];
  model: string;
  latency_ms: number;
};

const DEFAULT_PATH = "/ocr";
const DEFAULT_MODEL = "PP-OCRv6-small";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MIN_SCORE = 0.6;

function read_text(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function read_number(name: string, fallback: number, min: number, max: number): number {
  const raw = read_text(name);
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

/** 沒設定就回略過原因，讓啟動日誌與 /health 說得出為什麼沒有 OCR。 */
export function load_ocr_config(): OcrConfig | { skipped: string } {
  const base_url = read_text("OCR_BASE_URL").replace(/\/+$/, "");
  if (!base_url) {
    return { skipped: "未設定 OCR_BASE_URL" };
  }
  return {
    base_url,
    path: read_text("OCR_PATH") || DEFAULT_PATH,
    api_key: read_text("OCR_API_KEY"),
    model: read_text("OCR_MODEL") || DEFAULT_MODEL,
    timeout_ms: read_number("OCR_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, 1000, 120_000),
    min_score: read_number("OCR_MIN_SCORE", DEFAULT_MIN_SCORE, 0, 1),
  };
}

/** data URL 只取 base64 本體；服務端要的是純 base64。 */
export function strip_data_url(value: string): string {
  const comma = value.indexOf(",");
  return value.startsWith("data:") && comma >= 0 ? value.slice(comma + 1) : value;
}

export class OcrClient {
  #config: OcrConfig | undefined;
  #skipped: string;

  constructor(config?: OcrConfig | { skipped: string }) {
    const resolved = config ?? load_ocr_config();
    if ("skipped" in resolved) {
      this.#config = undefined;
      this.#skipped = resolved.skipped;
    } else {
      this.#config = resolved;
      this.#skipped = "";
    }
  }

  available(): boolean {
    return this.#config !== undefined;
  }

  get skipped_reason(): string {
    return this.#skipped;
  }

  get min_score(): number {
    return this.#config?.min_score ?? DEFAULT_MIN_SCORE;
  }

  describe(): string {
    return this.#config ? `${this.#config.model} @ ${this.#config.base_url}` : `（略過：${this.#skipped}）`;
  }

  /**
   * 辨識一張圖。失敗一律拋例外，由呼叫端決定要不要退回純視覺流程——
   * OCR 只是對帳用的加分項，掛掉不該讓菜單建檔整個失敗。
   */
  async recognise(image: string): Promise<OcrOutcome> {
    const config = this.#config;
    if (!config) {
      throw new Error(`OCR 未啟用：${this.#skipped}`);
    }

    const started = performance.now();
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (config.api_key) {
      headers.authorization = `Bearer ${config.api_key}`;
    }

    const response = await fetch(`${config.base_url}${config.path}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        image: strip_data_url(image),
        model: config.model,
        // 直書與翻倒的照片都靠服務端的方向分類器先轉正。
        detect_orientation: true,
        use_angle_cls: true,
      }),
      signal: AbortSignal.timeout(config.timeout_ms),
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200).replace(/\s+/g, " ");
      throw new Error(`OCR 服務回應 HTTP ${response.status}：${detail || response.statusText}`);
    }

    const lines = parse_ocr_payload(await response.json());
    const latency_ms = performance.now() - started;
    log.info("OCR 辨識完成", { model: config.model, lines: lines.length, latency_ms: Math.round(latency_ms) });
    return { lines, model: config.model, latency_ms };
  }
}
