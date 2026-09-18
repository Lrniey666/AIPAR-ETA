// 「有沒有豆腐鍋可以吃」這類問句：問的是**某道菜在哪家有**，不是某家店有什麼。
//
// 這條路一樣不能交給模型。模型手上有店名清單，被問到某道菜時很容易挑一家「聽起來像」的
// 回答——名字裡有「豆腐鍋」的店確實可能有，但那是猜的，不是查的。
// 抽出菜名之後直接查 `menu_items`，答案就只會是資料庫裡真的存在的東西。

import { normalise_key } from "../shared/text.ts";

/** 「有沒有 X」「哪家有 X」「想吃 X」——X 就是要查的菜名。 */
const PATTERNS: RegExp[] = [
  /(?:有沒有|有無)\s*([^，,。；;！!？?\n]{1,20}?)\s*(?:可以吃|可以點|可吃|能吃|嗎|\?|？|$)/,
  // 交替分支要把長的排前面，否則「誰有賣珍珠奶茶」會把「賣」也吃進菜名裡。
  /(?:哪|那)(?:一)?家\s*(?:有賣|賣|有)\s*([^，,。；;！!？?\n]{1,20})/,
  /(?:誰|哪裡|哪邊)\s*(?:有賣|賣|有)\s*([^，,。；;！!？?\n]{1,20})/,
  /(?:我)?(?:好)?想吃\s*([^，,。；;！!？?\n]{1,20})/,
  /(?:有人賣|有賣)\s*([^，,。；;！!？?\n]{1,20})/,
];

/** 抽出來還黏著的贅字。剝掉之後太短就當作沒問出菜名。 */
const NOISE = /^(?:什麼|甚麼|那個|這個|一點|點|些)+|(?:的|啊|呀|嗎|呢|喔|唷)+$/g;

const MIN_LENGTH = 2;

/**
 * 從句子裡抽出被問到的菜名。抽不出來回 undefined，呼叫端就走原本的路。
 * 刻意保守：寧可抽不到讓它走一般流程，也不要抽到一段沒意義的字去查資料庫。
 */
export function extract_dish_query(raw: string): string | undefined {
  const text = raw.trim();
  if (!text) {
    return undefined;
  }

  for (const pattern of PATTERNS) {
    const candidate = pattern.exec(text)?.[1]?.replace(NOISE, "").trim();
    if (candidate && [...candidate].length >= MIN_LENGTH && normalise_key(candidate).length >= MIN_LENGTH) {
      return candidate;
    }
  }
  return undefined;
}
