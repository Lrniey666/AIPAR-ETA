// 菜單擷取：圖片或雜亂文字 → 結構化草稿。
//
// 提示詞的兩次修訂都來自實測踩到的坑：
//   一、直書菜單（由上而下、由右至左）與整張躺著的照片，模型會把同一欄的字拆散、
//       或把相鄰兩欄的品名和價格配錯對。提示詞現在明講版面可能是直書或旋轉，
//       並要求先判斷方向再讀。
//   二、台灣菜單上到處是勾選框「□」、圈選數字、大／小杯雙價，
//       這些會被當成品名的一部分或當成價格，要逐條講清楚。
//
// 有 OCR 服務時，會把 OCR 讀到的文字一起附上當對照（見 `src/llm/ocr.ts`）。
// 對照只是參考，最後仍以模型讀出來的結構為準，再交給 `domain/menu_reconcile.ts` 對帳。
//
// 不變的紅線：看不清就不要猜。寧可少一筆，也不要把幻覺價格寫進資料庫。

import { normalise_llm_menu } from "../../domain/menu_draft.ts";
import type { PageOrientation } from "../../domain/ocr_layout.ts";
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
  "layout": "horizontal 或 vertical",
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

/** 版面相關的叮嚀。直書菜單讀不出來是這次修訂的主因，講得比原本細。 */
const LAYOUT_PROMPT = `先判斷文字方向再開始讀：
- 台灣菜單很常是**直書**：每一欄的字由上而下，欄與欄由**右至左**。這時品名在上、價格在同一欄的下方或右側對應的那一欄，不要用「左右相鄰」去配對。
- 照片也可能整張躺著（順時針或逆時針轉了 90 度）。先在腦中把畫面轉正，再照轉正後的方向讀。
- 橫排菜單則是由上而下、同一列由左而右。
配對品名與價格時：
- 勾選框「□」「☐」「○」與前面的編號都不是品名的一部分，去掉。
- 一列有多個價格（大／小杯、套餐／單點）就拆成多列，差異寫進 note。
- 電話、地址、營業時間、加價說明、QR code 旁的文字都不是品項，放進 notes。
- 加價選項（例如「加蛋 +10」）也不是品項，放進 notes。`;

export type MenuExtraction = {
  items: DraftItem[];
  title: string;
  notes: string[];
  provider: string;
  model: string;
  raw: string;
};

export type ImageExtractOptions = {
  /** OCR 讀到的文字（已排成閱讀順序）；沒有就不附。 */
  ocr_text?: string;
  orientation?: PageOrientation;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_OCR_CHARS = 4000;
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

/** 組出視覺請求的文字部分。抽出來是為了讓提示詞的組裝有地方單測。 */
export function build_vision_prompt(options: ImageExtractOptions = {}): string {
  const parts = ["這是一張台灣餐廳菜單／價目表照片。", LAYOUT_PROMPT];

  if (options.orientation === "vertical") {
    parts.push("OCR 的版面分析判定這張是**直書**，請依直書的方向閱讀。");
  } else if (options.orientation === "horizontal") {
    parts.push("OCR 的版面分析判定這張是橫排。");
  }

  const ocr_text = options.ocr_text?.trim();
  if (ocr_text) {
    parts.push(
      "以下是 OCR 依閱讀順序讀出的文字，**僅供對照**：OCR 會讀錯字，也可能漏行；" +
        "以你在圖上看到的為準，但如果 OCR 有而你沒看到，請回頭在圖上確認一次。\n" +
        `<ocr>\n${ocr_text.slice(0, MAX_OCR_CHARS)}\n</ocr>`,
    );
  }

  parts.push(MENU_SCHEMA_PROMPT);
  return parts.join("\n\n");
}

/** 讀菜單圖片。有 OCR 對照時準確率明顯較好，尤其是直書版面。 */
export async function extract_menu_from_image(
  gateway: LlmGateway,
  image_url: string,
  options: ImageExtractOptions = {},
): Promise<MenuExtraction> {
  const data_url = image_url.startsWith("data:") ? image_url : await fetch_image_as_data_url(image_url);
  const content: ContentPart[] = [
    { type: "text", text: build_vision_prompt(options) },
    { type: "image_url", image_url: { url: data_url } },
  ];

  const result = await gateway.complete({
    task: "menu-vision",
    mode: "vision",
    messages: [{ role: "user", content }],
    temperature: 0,
    max_tokens: 4096,
    json_mode: true,
    require_json: true,
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
      {
        role: "user",
        content:
          "以下是一份台灣餐廳菜單的文字，可能是直書菜單被逐欄讀出來的，順序不一定整齊。\n" +
          `${MENU_SCHEMA_PROMPT}\n\n---\n${text}`,
      },
    ],
    temperature: 0,
    max_tokens: 4096,
    json_mode: true,
    require_json: true,
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
