// 自然語言點餐解析：「我要一個雞腿飯加大杯紅茶」→ 菜單品項 × 數量。
//
// 重要原則：LLM 只負責「指到哪一項、要幾份」，價格一律從資料庫取。
// 模型會編價格，資料庫不會；把錢的部分留在我們自己手上。

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

const MAX_QUANTITY = 20;
const MATCH_THRESHOLD = 0.34;

const QUANTITY_WORDS: Record<string, number> = {
  一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

/**
 * 先用規則試一次：能對上就不打 LLM。
 * 免費層配額有限，能省一次就省一次，而且規則比模型穩定。
 */
export function parse_order_by_rules(text: string, items: MenuItem[]): ParseOutcome {
  const picks: ParsedPick[] = [];
  const unmatched: string[] = [];

  for (const segment of split_segments(text)) {
    const quantity = read_quantity(segment);
    const stripped = segment.replace(/[0-9０-９一二兩三四五六七八九十]+\s*(個|份|杯|碗|客|碟|盤|支|條|包)?/g, " ");
    const matched = best_match(stripped || segment, items);
    if (matched) {
      picks.push({ item: matched, quantity, note: "" });
    } else if (segment.trim()) {
      unmatched.push(segment.trim());
    }
  }

  return { picks: merge_picks(picks), unmatched, used_llm: false };
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
          `規則：index 必須是上面菜單的編號；對不到就放進 unmatched，不要硬湊；只輸出 JSON。`,
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
    const quantity = clamp_quantity(Number(raw.quantity));
    picks.push({
      item,
      quantity,
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

function split_segments(text: string): string[] {
  return text
    .split(/[，,、；;。\n＋+和跟還有及與]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function read_quantity(segment: string): number {
  const digits = /([0-9０-９]+)\s*(?:個|份|杯|碗|客|碟|盤|支|條|包)?/.exec(segment);
  if (digits?.[1]) {
    return clamp_quantity(
      Number(digits[1].replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))),
    );
  }
  const chinese = /([一二兩三四五六七八九十])\s*(?:個|份|杯|碗|客|碟|盤|支|條|包)/.exec(segment);
  if (chinese?.[1]) {
    return clamp_quantity(QUANTITY_WORDS[chinese[1]] ?? 1);
  }
  return 1;
}

function clamp_quantity(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }
  return Math.min(Math.trunc(value), MAX_QUANTITY);
}

function best_match(text: string, items: MenuItem[]): MenuItem | undefined {
  const key = normalise_key(text);
  if (key.length < 1) {
    return undefined;
  }
  let best: MenuItem | undefined;
  let best_score = 0;
  for (const item of items) {
    if (!item.is_available) {
      continue;
    }
    // 完整包含優先：「我要雞腿飯」裡面就有「雞腿飯」。
    const contains = key.includes(item.name_key) && item.name_key.length >= 2;
    const score = contains ? 1 : similarity(text, item.name);
    if (score > best_score) {
      best_score = score;
      best = item;
    }
  }
  return best_score >= MATCH_THRESHOLD ? best : undefined;
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
