// 自然語言點餐解析：「我要一個雞腿飯加大杯紅茶」→ 菜單品項 × 數量。
//
// 重要原則：LLM 只負責「指到哪一項、要幾份」，價格一律從資料庫取。
// 模型會編價格，資料庫不會；把錢的部分留在我們自己手上。
//
// 數量算錯的修法（0.3.0）：舊版先在整句裡抓數字當數量、再把所有數字連同量詞
// 從句子裡刪掉，於是「三杯雞飯」被讀成三份「雞飯」，「牛三寶麵」「四季豆」也一起遭殃。
// 現在改成**先比對品名，再從剩下的字裡讀數量**——品名吃掉的字不可能同時是數量。

import { normalise_key, similarity } from "../../shared/text.ts";
import type { MenuItem } from "../../db/types.ts";
import type { LlmGateway } from "../gateway.ts";
import { extract_json } from "../json.ts";

export type ParsedPick = {
  item: MenuItem;
  quantity: number;
  note: string;
};

export type ParseOutcome = {
  picks: ParsedPick[];
  /** 講了但對不到菜單的字句，原樣回報給使用者確認。 */
  unmatched: string[];
  used_llm: boolean;
  provider?: string;
};

export const MAX_QUANTITY = 20;
const MATCH_THRESHOLD = 0.34;

/** 量詞。只有數字後面接量詞、或數字就在句首時才算數量。 */
const CLASSIFIER = "個份杯碗客碟盤支條包串盒組人";
const CLASSIFIER_GROUP = `[${CLASSIFIER}]`;

const DIGIT_WORDS: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 兩: 2, 倆: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9,
};

/** 一～九十九的中文數字。菜單點餐不會有更大的數量。 */
export function chinese_to_number(raw: string): number | undefined {
  const text = raw.trim();
  if (!text) {
    return undefined;
  }
  if (!/^[零一二兩倆三四五六七八九十]+$/.test(text)) {
    return undefined;
  }
  const ten = text.indexOf("十");
  if (ten < 0) {
    const value = DIGIT_WORDS[text];
    return text.length === 1 ? value : undefined;
  }
  const head = text.slice(0, ten);
  const tail = text.slice(ten + 1);
  const tens = head ? (DIGIT_WORDS[head] ?? Number.NaN) : 1;
  const units = tail ? (DIGIT_WORDS[tail] ?? Number.NaN) : 0;
  const value = tens * 10 + units;
  return Number.isFinite(value) ? value : undefined;
}

/**
 * 先用規則試一次：能對上就不打 LLM。
 * 免費層配額有限，能省一次就省一次，而且規則比模型穩定。
 */
export function parse_order_by_rules(text: string, items: MenuItem[]): ParseOutcome {
  const picks: ParsedPick[] = [];
  const unmatched: string[] = [];

  for (const segment of split_segments(text)) {
    const resolved = resolve_segment(segment, items);
    if (resolved) {
      picks.push(resolved);
    } else if (segment.trim()) {
      unmatched.push(segment.trim());
    }
  }

  return { picks: merge_picks(picks), unmatched, used_llm: false };
}

/**
 * 一段話對一個品項。
 * 先整段比對品名；對得到就把品名從字串裡挖掉，數量只從剩下的字讀，
 * 這樣「三杯雞」「牛三寶麵」裡的數字就不會被誤認成數量。
 */
function resolve_segment(segment: string, items: MenuItem[]): ParsedPick | undefined {
  const key = normalise_key(segment);
  if (!key) {
    return undefined;
  }

  const contained = longest_contained(key, items);
  if (contained) {
    const residue = key.replace(contained.name_key, " ");
    return { item: contained, quantity: read_quantity(residue), note: "" };
  }

  // 對不到完整品名時，才把句首的數量詞剝掉重試（「兩份招牌」→「招牌」）。
  const { quantity, rest } = strip_leading_quantity(key);
  const fuzzy = best_fuzzy_match(rest || key, items);
  return fuzzy ? { item: fuzzy, quantity, note: "" } : undefined;
}

/** 句子裡完整出現的品名取最長的一個：「雞腿飯」與「招牌雞腿飯」並存時要選後者。 */
function longest_contained(key: string, items: MenuItem[]): MenuItem | undefined {
  let best: MenuItem | undefined;
  for (const item of items) {
    if (!item.is_available || item.name_key.length < 2) {
      continue;
    }
    if (key.includes(item.name_key) && item.name_key.length > (best?.name_key.length ?? 0)) {
      best = item;
    }
  }
  return best;
}

function best_fuzzy_match(text: string, items: MenuItem[]): MenuItem | undefined {
  let best: MenuItem | undefined;
  let best_score = 0;
  for (const item of items) {
    if (!item.is_available) {
      continue;
    }
    const score = similarity(text, item.name);
    if (score > best_score) {
      best_score = score;
      best = item;
    }
  }
  return best_score >= MATCH_THRESHOLD ? best : undefined;
}

/** 規則對不到時才叫模型。回傳形狀與規則版一致，上層不用分兩套處理。 */
export async function parse_order_with_llm(
  gateway: LlmGateway,
  text: string,
  items: MenuItem[],
): Promise<ParseOutcome> {
  const catalogue = items
    .slice(0, 200)
    .map((item, index) => `${index + 1}. ${item.name}${item.note ? `（${item.note}）` : ""}`)
    .join("\n");

  const result = await gateway.complete({
    task: "order-parse",
    mode: "text",
    messages: [
      {
        role: "system",
        content:
          "你是點餐紀錄助理。使用者用中文口語點餐，你要對照菜單編號，只輸出 JSON，不要解釋。",
      },
      {
        role: "user",
        content:
          `菜單：\n${catalogue}\n\n使用者說：「${text}」\n\n` +
          `輸出形狀：{"picks":[{"index":1,"quantity":1,"note":"去冰"}],"unmatched":["對不到菜單的字句"]}\n` +
          `規則：\n` +
          `- index 必須是上面菜單的編號；對不到就放進 unmatched，不要硬湊。\n` +
          `- quantity 是**份數**。品名裡本來就有的數字不是份數：「三杯雞」是菜名，份數是 1；` +
          `「牛三寶麵」「四季豆」「雙拼」同理。沒有明講幾份就是 1。\n` +
          `- 只有「兩個」「3份」「x2」這種明確講份數的才改 quantity。\n` +
          `- 只輸出 JSON。`,
      },
    ],
    temperature: 0,
    max_tokens: 800,
    json_mode: true,
  });

  const payload = extract_json(result.text) as
    | { picks?: Array<{ index?: unknown; quantity?: unknown; note?: unknown }>; unmatched?: unknown[] }
    | undefined;

  if (!payload) {
    return { picks: [], unmatched: [text], used_llm: true, provider: result.provider };
  }

  const picks: ParsedPick[] = [];
  for (const raw of payload.picks ?? []) {
    const index = Number(raw.index);
    const item = Number.isInteger(index) ? items[index - 1] : undefined;
    if (!item) {
      continue;
    }
    picks.push({
      item,
      quantity: clamp_quantity(Number(raw.quantity)),
      note: typeof raw.note === "string" ? raw.note.slice(0, 80) : "",
    });
  }

  const unmatched = (payload.unmatched ?? [])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim().slice(0, 80));

  return { picks: merge_picks(picks), unmatched, used_llm: true, provider: result.provider };
}

/** 規則優先、模型墊底；兩邊都對不到就照實回報，不要瞎猜。 */
export async function parse_order(
  gateway: LlmGateway | undefined,
  text: string,
  items: MenuItem[],
): Promise<ParseOutcome> {
  const by_rules = parse_order_by_rules(text, items);
  if (by_rules.picks.length > 0 && by_rules.unmatched.length === 0) {
    return by_rules;
  }
  if (!gateway?.has_text()) {
    return by_rules;
  }
  try {
    const by_llm = await parse_order_with_llm(gateway, text, items);
    return by_llm.picks.length > 0 ? by_llm : by_rules;
  } catch {
    return by_rules;
  }
}

/**
 * 切句。刻意不切「和」「與」——「和風沙拉」「宮保與麻婆」這種品名會被切斷；
 * 「跟」「還有」「加」這些在口語裡幾乎只當連接詞用，才留著切。
 */
function split_segments(text: string): string[] {
  return text
    .split(/[，,、；;。\n＋+]+|跟|還有|以及|另外|再來|再加|外加/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * 從「品名以外的殘字」讀份數。
 * 只認三種寫法：數字接量詞、x／× 接數字、單獨的數字或中文數字。
 * 讀不到就是 1——沒講就是一份，這比猜一個數字安全。
 */
export function read_quantity(residue: string): number {
  const text = to_ascii_digits(residue);

  const multiplied = new RegExp(`[x*×](\\d+)`).exec(text);
  if (multiplied?.[1]) {
    return clamp_quantity(Number(multiplied[1]));
  }

  const with_classifier = new RegExp(`(\\d+)\\s*${CLASSIFIER_GROUP}`).exec(text);
  if (with_classifier?.[1]) {
    return clamp_quantity(Number(with_classifier[1]));
  }

  const chinese_with_classifier = new RegExp(
    `([零一二兩倆三四五六七八九十]+)\\s*${CLASSIFIER_GROUP}`,
  ).exec(text);
  if (chinese_with_classifier?.[1]) {
    const value = chinese_to_number(chinese_with_classifier[1]);
    if (value !== undefined) {
      return clamp_quantity(value);
    }
  }

  const bare = /^\s*(\d+)\s*$/.exec(text);
  if (bare?.[1]) {
    return clamp_quantity(Number(bare[1]));
  }

  const bare_chinese = /^\s*([零一二兩倆三四五六七八九十]+)\s*$/.exec(text);
  if (bare_chinese?.[1]) {
    const value = chinese_to_number(bare_chinese[1]);
    if (value !== undefined) {
      return clamp_quantity(value);
    }
  }
  return 1;
}

/** 句首的「兩份」「3 個」剝掉，回傳份數與剩下的字。只剝句首，句中的不動。 */
export function strip_leading_quantity(key: string): { quantity: number; rest: string } {
  const text = to_ascii_digits(key);
  const match = new RegExp(`^(?:我要|我點|幫我點|來|給我)?\\s*(\\d+|[零一二兩倆三四五六七八九十]+)\\s*${CLASSIFIER_GROUP}?`).exec(
    text,
  );
  const token = match?.[1];
  if (!token) {
    return { quantity: 1, rest: text };
  }
  const value = /^\d+$/.test(token) ? Number(token) : chinese_to_number(token);
  if (value === undefined || value < 1) {
    return { quantity: 1, rest: text };
  }
  return { quantity: clamp_quantity(value), rest: text.slice(match[0].length).trim() };
}

function to_ascii_digits(value: string): string {
  return value.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
}

export function clamp_quantity(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }
  return Math.min(Math.trunc(value), MAX_QUANTITY);
}

/** 同一品項同備註合併成一列，數量相加。 */
function merge_picks(picks: ParsedPick[]): ParsedPick[] {
  const merged = new Map<string, ParsedPick>();
  for (const pick of picks) {
    const key = `${pick.item.id}::${pick.note}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity = clamp_quantity(existing.quantity + pick.quantity);
    } else {
      merged.set(key, { ...pick });
    }
  }
  return [...merged.values()];
}
