// 菜單擷取：圖片或雜亂文字 → 結構化草稿。
// 提示詞沿用 free-llm-api-test 的版本（實測 JSON 可解析率最高的一版），
// 並保留「看不清就不要猜」這條——寧可少一筆，也不要把幻覺價格寫進資料庫。

import { normalise_llm_menu } from "../../domain/menu_draft.ts";
import type { DraftItem } from "../../db/types.ts";
import type { LlmGateway } from "../gateway.ts";
import { extract_json } from "../json.ts";
import type { ContentPart } from "../transport.ts";

export const MENU_SCHEMA_PROMPT = `把看到的菜單內容轉成 JSON。不要 markdown 圍欄，不要解釋，不要思考過程。
看不清楚的字不要猜、不要編造不存在的品項。
形狀：
{
  "title": "菜單標題或店名，看不見就空字串",
  "currency": "TWD",
  "categories": [
    { "name": "分類名稱", "items": [ {"name": "品名", "price": 70, "unit": "份", "note": ""} ] }
  ],
  "notes": ["菜單上的其他文字"]
}
規則：
- price 用數字（新台幣元），不要加單位符號
- 同一品項有大小／套餐兩個價，就各出一列，用 note 標明差異
- 看不清就不要收進 items，寧可漏也不要編
- 只輸出 JSON`;

export type MenuExtraction = {
  items: DraftItem[];
  title: string;
  notes: string[];
  provider: string;
  model: string;
  raw: string;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** 把圖片抓下來轉成 data URL。直接把 CDN 連結丟給模型不可靠（簽章會過期）。 */
export async function fetch_image_as_data_url(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) {
    throw new Error(`下載圖片失敗：HTTP ${response.status}`);
  }
  const content_type = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
  if (!ALLOWED_IMAGE_TYPES.has(content_type)) {
    throw new Error(`不支援的圖片格式：${content_type || "未知"}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`圖片超過 ${MAX_IMAGE_BYTES / 1024 / 1024} MB 上限。`);
  }
  return `data:${content_type};base64,${buffer.toString("base64")}`;
}

/** 讀菜單圖片。成功率取決於版型：橫排印刷最穩，直書幾乎讀不出來（見 OCR 實驗報告）。 */
export async function extract_menu_from_image(
  gateway: LlmGateway,
  image_url: string,
): Promise<MenuExtraction> {
  const data_url = image_url.startsWith("data:") ? image_url : await fetch_image_as_data_url(image_url);
  const content: ContentPart[] = [
    { type: "text", text: `這是一張台灣餐廳菜單／價目表照片。\n${MENU_SCHEMA_PROMPT}` },
    { type: "image_url", image_url: { url: data_url } },
  ];

  const result = await gateway.complete({
    task: "menu-vision",
    mode: "vision",
    messages: [{ role: "user", content }],
    temperature: 0,
    max_tokens: 4096,
  });

  return to_extraction(result.text, result.provider, result.model);
}

/** 讀人工貼上的菜單文字。規則解析失敗時才會走到這裡。 */
export async function extract_menu_from_text(
  gateway: LlmGateway,
  text: string,
): Promise<MenuExtraction> {
  const result = await gateway.complete({
    task: "menu-text",
    mode: "text",
    messages: [
      { role: "system", content: "你是菜單整理助理，只輸出 JSON。" },
      { role: "user", content: `以下是一份台灣餐廳菜單的文字。\n${MENU_SCHEMA_PROMPT}\n\n---\n${text}` },
    ],
    temperature: 0,
    max_tokens: 4096,
    json_mode: true,
  });

  return to_extraction(result.text, result.provider, result.model);
}

function to_extraction(raw: string, provider: string, model: string): MenuExtraction {
  const payload = extract_json(raw);
  if (payload === undefined) {
    throw new Error("模型沒有回傳可解析的 JSON。");
  }
  const { items, title, notes } = normalise_llm_menu(payload);
  if (items.length === 0) {
    throw new Error("模型回傳的 JSON 裡沒有任何有效品項。");
  }
  return { items, title, notes, provider, model, raw };
}
