// OCR HTTP 契約：對齊 `src/llm/ocr.ts` 客戶端與 `src/domain/ocr_layout.ts`。
// 這一檔不碰 ONNX，離線測試可以直接 import。

export type AxisBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type OcrRequest = {
  image: Buffer;
  model: string;
};

export type PublicLine = {
  text: string;
  score: number;
  box: Array<[number, number]>;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function strip_data_url(value: string): string {
  const comma = value.indexOf(",");
  return value.startsWith("data:") && comma >= 0 ? value.slice(comma + 1) : value;
}

export function axis_box_to_corners(box: AxisBox): Array<[number, number]> {
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  return [
    [box.x, box.y],
    [right, box.y],
    [right, bottom],
    [box.x, bottom],
  ];
}

export function to_public_line(line: { text: string; score: number; box: AxisBox }): PublicLine {
  return {
    text: line.text,
    score: line.score,
    box: axis_box_to_corners(line.box),
  };
}

/** 把 POST /ocr 的 JSON 收成圖片位元組。形狀不對就丟可讀的錯誤。 */
export function parse_ocr_request(payload: unknown): OcrRequest {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("請求必須是 JSON 物件");
  }
  const record = payload as Record<string, unknown>;
  const raw = record.image;
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("缺少 image（base64 或 data URL）");
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(strip_data_url(raw.trim()), "base64");
  } catch {
    throw new Error("image 不是合法的 base64");
  }
  if (buffer.byteLength === 0) {
    throw new Error("image 解出來是空的");
  }
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`圖片超過 ${MAX_IMAGE_BYTES / 1024 / 1024} MB 上限`);
  }
  const model = typeof record.model === "string" && record.model.trim() ? record.model.trim() : "PP-OCRv6-small";
  return { image: buffer, model };
}

export { MAX_IMAGE_BYTES };
