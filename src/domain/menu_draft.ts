// 菜單草稿的正規化與純文字解析。
// 人工輸入永遠是主路徑（辨識實驗顯示自動化天花板不高），所以這裡先用規則解析，
// 解析不出來才交給 LLM；兩條路最後都收斂到同一個 DraftItem 形狀。

import { parse_price_to_cents } from "../shared/money.ts";
import { normalise_key, tidy_display } from "../shared/text.ts";
import type { DraftItem } from "../db/types.ts";

export const MAX_DRAFT_ITEMS = 300;

/** 「分類：」或「【分類】」或「-- 分類 --」這類單獨成行的標題。 */
const CATEGORY_LINE = /^(?:[-—=*#\s]*)(?:【(.+?)】|\[(.+?)\]|(.+?)\s*[:：])(?:[-—=*\s]*)$/;

/**
 * 解析人工貼上的菜單文字。每行一個品項，價格在行尾：
 *   雞腿飯 90
 *   排骨飯｜85｜不辣
 *   【飲料】
 *   紅茶 20
 */
export function parse_menu_text(text: string): { items: DraftItem[]; skipped: string[] } {
  const items: DraftItem[] = [];
  const skipped: string[] = [];
  let category = "";

  for (const raw_line of text.split(/\r?\n/)) {
    const line = raw_line.trim();
    if (!line || /^[-—=*#\s]+$/.test(line)) {
      continue;
    }

    const parsed = parse_menu_line(line, category);
    if (parsed) {
      items.push(parsed);
      continue;
    }

    const category_match = CATEGORY_LINE.exec(line);
    const heading = category_match?.[1] ?? category_match?.[2] ?? category_match?.[3];
    if (heading && heading.length <= 20) {
      category = tidy_display(heading, 20);
      continue;
    }
    skipped.push(line);
  }

  return { items: dedupe_items(items), skipped };
}

/** 單行解析：名稱與價格用分隔符號或空白隔開，價格必須在最後一段。 */
export function parse_menu_line(line: string, category = ""): DraftItem | undefined {
  const cleaned = line.replace(/^[\d]+[.、)]\s*/, "").trim();
  const segments = cleaned
    .split(/[｜|\t]+|\s{2,}|\s+(?=[nN][tT]?\$?\d|\$\d|\d)/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (segments.length < 2) {
    return undefined;
  }

  let price_index = -1;
  for (let index = segments.length - 1; index >= 1; index -= 1) {
    if (parse_price_to_cents(segments[index] ?? "") !== undefined) {
      price_index = index;
      break;
    }
  }
  if (price_index < 1) {
    return undefined;
  }

  const price_cents = parse_price_to_cents(segments[price_index] ?? "");
  const name = segments.slice(0, price_index).join(" ").trim();
  if (price_cents === undefined || !name) {
    return undefined;
  }

  return {
    category,
    name: tidy_display(name, 60),
    price_cents,
    unit: "",
    note: tidy_display(segments.slice(price_index + 1).join(" "), 80),
  };
}

/** 同名同價只留一筆；同名不同價保留（大杯／小杯常見），但價格併進備註。 */
export function dedupe_items(items: DraftItem[]): DraftItem[] {
  const seen = new Map<string, DraftItem>();
  for (const item of items) {
    const key = `${normalise_key(item.category)}::${normalise_key(item.name)}::${item.price_cents}`;
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  return [...seen.values()].slice(0, MAX_DRAFT_ITEMS);
}

type RawItem = {
  name?: unknown;
  price?: unknown;
  price_cents?: unknown;
  unit?: unknown;
  note?: unknown;
};

/**
 * 把 LLM 吐出來的自由形狀收斂成 DraftItem。
 * 這裡刻意嚴格：價格不是數字就整筆丟掉，寧可少一筆也不要把幻覺價格寫進資料庫。
 */
export function normalise_llm_menu(payload: unknown): { items: DraftItem[]; title: string; notes: string[] } {
  const root = as_record(payload);
  const title = typeof root.title === "string" ? tidy_display(root.title, 60) : "";
  const notes = Array.isArray(root.notes)
    ? root.notes.filter((note): note is string => typeof note === "string").map((n) => tidy_display(n, 120))
    : [];

  const items: DraftItem[] = [];
  const categories = Array.isArray(root.categories) ? root.categories : [];
  for (const raw_category of categories) {
    const category_record = as_record(raw_category);
    const category = typeof category_record.name === "string" ? tidy_display(category_record.name, 20) : "";
    const raw_items = Array.isArray(category_record.items) ? category_record.items : [];
    for (const raw_item of raw_items) {
      const item = to_draft_item(as_record(raw_item) as RawItem, category);
      if (item) {
        items.push(item);
      }
    }
  }

  // 有些模型會忽略 categories，直接給一層 items。
  if (items.length === 0 && Array.isArray(root.items)) {
    for (const raw_item of root.items) {
      const item = to_draft_item(as_record(raw_item) as RawItem, "");
      if (item) {
        items.push(item);
      }
    }
  }

  return { items: dedupe_items(items), title, notes };
}

function to_draft_item(raw: RawItem, category: string): DraftItem | undefined {
  const name = typeof raw.name === "string" ? tidy_display(raw.name, 60) : "";
  if (!name) {
    return undefined;
  }
  const price_cents = to_cents(raw.price_cents ?? raw.price);
  if (price_cents === undefined) {
    return undefined;
  }
  return {
    category,
    name,
    price_cents,
    unit: typeof raw.unit === "string" ? tidy_display(raw.unit, 10) : "",
    note: typeof raw.note === "string" ? tidy_display(raw.note, 80) : "",
  };
}

function to_cents(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1_000_000) {
    return Math.round(value * 100);
  }
  if (typeof value === "string") {
    return parse_price_to_cents(value);
  }
  return undefined;
}

function as_record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
