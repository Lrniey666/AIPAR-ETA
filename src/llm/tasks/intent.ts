// 自然語言意圖判讀：使用者這句話是要查菜單、開揪團、看帳，還是純聊天。
// 一樣是規則先行、模型墊底——大部分訊息用關鍵字就判得出來，免費層配額要省著用。

import { to_halfwidth } from "../../shared/text.ts";
import type { LlmGateway } from "../gateway.ts";
import { extract_json } from "../json.ts";
import { is_cancel_request } from "./order_cancel.ts";

export type IntentName =
  | "menu-query"
  | "create-session"
  | "ledger-query"
  | "order"
  | "cancel-order"
  | "help"
  | "chat";

export type Intent = {
  name: IntentName;
  /** 句子裡疑似餐廳名的片段，可能為空。 */
  restaurant: string;
  confidence: number;
  used_llm: boolean;
};

const MENU_WORDS = ["菜單", "有什麼", "賣什麼", "價目", "多少錢", "menu", "價位", "幾元"];
const SESSION_WORDS = ["揪團", "開團", "一起訂", "團購", "訂餐", "揪", "開單"];
// 帳務的強訊號要排在菜單之前判斷：「我還欠多少錢」同時命中「欠」和「多少錢」，
// 但問的顯然是帳不是菜單。
const LEDGER_STRONG_WORDS = [
  "帳",
  "欠",
  "結算",
  "付錢",
  "分攤",
  "誰欠",
  "我付了",
  "要付多少",
  "balance",
  "ledger",
  "owe",
];
const LEDGER_WEAK_WORDS = ["多少要付", "還要付", "算一下", "結清"];
const ORDER_WORDS = ["我要", "我點", "幫我點", "來一", "來個", "點一"];
const HELP_WORDS = ["怎麼用", "說明", "help", "指令", "教學"];

function contains_any(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

// 句首的人稱與動詞。抽出來的候選常常還黏著這些字，要逐層剝掉。
const LEADING_NOISE = /^(?:請問|麻煩|幫我|我想|我要|給我|想看|看看|我|你|想|看|查|問|要|今天|明天)/;

/** 從「聞香來的菜單」「我想看阿嬤古早味有什麼」抽出餐廳名片段。 */
export function guess_restaurant(text: string): string {
  const patterns = [
    /(?:看|查|問|要)?\s*([\u4e00-\u9fff\w\s]{2,20}?)\s*(?:的)?\s*菜單/,
    /([\u4e00-\u9fff\w\s]{2,20}?)\s*(?:有什麼|賣什麼|價目|多少錢)/,
    /(?:揪團|開團|訂|一起吃|團購)\s*([\u4e00-\u9fff\w\s]{2,20})/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const candidate = match?.[1]?.trim();
    if (candidate && candidate.length >= 2) {
      const stripped = strip_leading_noise(candidate);
      if (stripped.length >= 2) {
        return stripped;
      }
    }
  }
  return "";
}

/** 一層一層剝掉句首雜訊，但不會把候選剝到剩不到兩個字。 */
function strip_leading_noise(value: string): string {
  let text = value.trim();
  for (let round = 0; round < 4; round += 1) {
    const next = text.replace(LEADING_NOISE, "").trim();
    if (next === text || next.length < 2) {
      break;
    }
    text = next;
  }
  return text;
}

export function classify_by_rules(raw: string): Intent {
  const text = to_halfwidth(raw).toLowerCase();
  const restaurant = guess_restaurant(raw);

  if (contains_any(text, HELP_WORDS)) {
    return { name: "help", restaurant, confidence: 0.8, used_llm: false };
  }
  // 取消要排在點餐之前：「取消我要的雞腿飯」同時命中兩邊，但做的事完全相反。
  if (is_cancel_request(raw)) {
    return { name: "cancel-order", restaurant, confidence: 0.8, used_llm: false };
  }
  if (contains_any(text, SESSION_WORDS)) {
    return { name: "create-session", restaurant, confidence: 0.75, used_llm: false };
  }
  if (contains_any(text, LEDGER_STRONG_WORDS)) {
    return { name: "ledger-query", restaurant, confidence: 0.75, used_llm: false };
  }
  if (contains_any(text, MENU_WORDS)) {
    return { name: "menu-query", restaurant, confidence: 0.8, used_llm: false };
  }
  if (contains_any(text, LEDGER_WEAK_WORDS)) {
    return { name: "ledger-query", restaurant, confidence: 0.7, used_llm: false };
  }
  if (contains_any(text, ORDER_WORDS)) {
    return { name: "order", restaurant, confidence: 0.6, used_llm: false };
  }
  return { name: "chat", restaurant, confidence: 0.3, used_llm: false };
}

const INTENT_VALUES: IntentName[] = [
  "menu-query",
  "create-session",
  "ledger-query",
  "order",
  "cancel-order",
  "help",
  "chat",
];

export async function classify_intent(gateway: LlmGateway | undefined, raw: string): Promise<Intent> {
  const by_rules = classify_by_rules(raw);
  if (by_rules.confidence >= 0.7 || !gateway?.has_text()) {
    return by_rules;
  }

  try {
    const result = await gateway.complete({
      task: "intent",
      mode: "text",
      messages: [
        {
          role: "system",
          content: "你是點餐機器人的意圖分類器，只輸出 JSON，不要解釋。",
        },
        {
          role: "user",
          content:
            `使用者說：「${raw}」\n\n` +
            `從這些意圖挑一個：${INTENT_VALUES.join("、")}\n` +
            `menu-query＝查菜單，create-session＝想揪團訂餐，order＝正在點餐，` +
            `cancel-order＝要取消已經點的東西，ledger-query＝查帳、問誰欠誰或結算，` +
            `help＝問怎麼用，chat＝閒聊或其他。\n` +
            `輸出：{"intent":"menu-query","restaurant":"店名或空字串"}`,
        },
      ],
      temperature: 0,
      max_tokens: 200,
      json_mode: true,
    });

    const payload = extract_json(result.text) as { intent?: unknown; restaurant?: unknown } | undefined;
    const name = INTENT_VALUES.find((value) => value === payload?.intent);
    if (!name) {
      return by_rules;
    }
    return {
      name,
      restaurant:
        typeof payload?.restaurant === "string" && payload.restaurant.trim()
          ? payload.restaurant.trim().slice(0, 40)
          : by_rules.restaurant,
      confidence: 0.65,
      used_llm: true,
    };
  } catch {
    return by_rules;
  }
}
