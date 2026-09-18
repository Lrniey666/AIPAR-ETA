// 從一句話裡抓出「要長期記住的事」。
//
// 為什麼用規則不用模型：長期記憶是會被寫進資料庫、之後每次對話都拿出來用的東西。
// 讓模型決定要記什麼，等於讓它把自己的推測變成日後的「事實」——
// 幻覺會從一次性的錯話升級成持久的錯資料。所以只記使用者**明講**要記的。
//
// 沒有命中任何規則就不記。使用者想確保記住，可以用 `/記憶 記住`。

import type { MemoryScope } from "../db/memory.ts";
import { tidy_display } from "../shared/text.ts";

export type CapturedMemory = {
  scope: MemoryScope;
  fact_key: string;
  fact_value: string;
  /** 回話時用的確認句，讓使用者看得到我們到底記了什麼。 */
  summary: string;
};

type Rule = {
  pattern: RegExp;
  fact_key: string;
  /** 記下來的句子怎麼寫，`{value}` 會被代換。 */
  template: string;
  scope: MemoryScope;
};

/**
 * 每條規則都要有明確的觸發詞。
 * 「我不吃牛」會被記住，「這家的牛肉麵不好吃」不會——後者沒有在交代偏好。
 */
const RULES: Rule[] = [
  { pattern: /(?:對|吃)\s*([^，,。；;！!？?\n]{1,20}?)\s*過敏/, fact_key: "過敏", template: "對 {value} 過敏", scope: "user" },
  { pattern: /我(?:們)?(?:都)?不(?:吃|喝)\s*([^，,。；;！!？?\n]{1,20})/, fact_key: "不吃", template: "不吃 {value}", scope: "user" },
  { pattern: /我(?:們)?(?:是)?(?:吃)?素(?:食)?(?:者|的)?/, fact_key: "素食", template: "吃素", scope: "user" },
  { pattern: /(?:叫我|我叫|我的?稱呼是)\s*([^，,。；;！!？?\n]{1,20})/, fact_key: "稱呼", template: "希望被叫 {value}", scope: "user" },
  { pattern: /我(?:最)?(?:喜歡|愛|偏好)\s*(?:吃|喝)?\s*([^，,。；;！!？?\n]{1,20})/, fact_key: "偏好", template: "喜歡 {value}", scope: "user" },
  { pattern: /我(?:們)?(?:常|通常|都)(?:訂|點|吃)\s*([^，,。；;！!？?\n]{1,20})/, fact_key: "常訂", template: "常訂 {value}", scope: "user" },
];

/** 「記住…」是最直接的指示：整句剩下的部分就是要記的內容。 */
const EXPLICIT = /(?:記住|記得|幫我記(?:住|下)?|請記)\s*[:：]?\s*([^\n]{1,120})/;

/** 「這個頻道」「我們這邊」＝頻道範圍的事實，不是個人的。 */
const CHANNEL_HINT = /(?:這(?:個)?(?:頻道|群|串)|我們這(?:邊|裡))/;

/** 句尾的語助詞與客套話，記進資料庫前先剝掉。 */
const TRAILING_NOISE = /(?:喔|唷|喲|啦|囉|嘍|耶|呢|哦|欸|好嗎|好不好|謝謝|拜託|[。，,！!？?\s])+$/;

export function capture_memory(raw: string): CapturedMemory | undefined {
  const text = raw.trim();
  if (!text) {
    return undefined;
  }

  const explicit = EXPLICIT.exec(text);
  if (explicit?.[1]) {
    const value = clean(explicit[1]);
    if (value) {
      const scope: MemoryScope = CHANNEL_HINT.test(text) ? "channel" : "user";
      // 用內容本身當主題鍵：同一句話再講一次會覆蓋，不會越積越多。
      return { scope, fact_key: value.slice(0, 20), fact_value: value, summary: value };
    }
  }

  for (const rule of RULES) {
    const match = rule.pattern.exec(text);
    if (!match) {
      continue;
    }
    const value = clean(match[1] ?? "");
    if (rule.template.includes("{value}") && !value) {
      continue;
    }
    const summary = rule.template.replace("{value}", value);
    return { scope: rule.scope, fact_key: rule.fact_key, fact_value: summary, summary };
  }

  return undefined;
}

/** 「你有記憶功能嗎」「你記得我說過什麼」——要照實回答，不要讓模型自己編。 */
export function is_memory_question(raw: string): boolean {
  const text = raw.toLowerCase();
  return (
    /記憶|記得(?:我|什麼|甚麼|嗎)|記不記得|還記得|忘記了?嗎/.test(text) ||
    /\bmemory\b|\bremember\b/.test(text)
  );
}

function clean(value: string): string {
  return tidy_display(value.replace(TRAILING_NOISE, ""), 120).trim();
}
