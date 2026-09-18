// 自然語言取消點餐：「取消我的紅茶」「剛剛那個雞腿飯不要了」「全部取消」。
//
// 原本只能按「清除我的」把整個人的點餐一次清光，想少點一杯只能全清再重點。
// 這裡一樣是規則優先：取消是破壞性動作，寧可對不到而請使用者再講一次，
// 也不要讓模型猜出一個「順手多刪一筆」的結果。

import type { OrderLine } from "../../db/types.ts";
import { normalise_key } from "../../shared/text.ts";

export type CancelPlan =
  /** 這句話不是在取消。 */
  | { mode: "none" }
  /** 取消這個人在這場的全部點餐。 */
  | { mode: "all" }
  /** 取消指定的幾列。 */
  | { mode: "lines"; lines: OrderLine[] }
  /** 是取消，但講不清要取消哪一項——請使用者再說一次或改用按鈕。 */
  | { mode: "ambiguous" };

/** 明確的取消動詞。單獨一個「不要」不算——「不要香菜」是備註不是取消。 */
const CANCEL_WORDS = [
  "取消",
  "不要了",
  "不用了",
  "退掉",
  "刪掉",
  "刪除",
  "去掉",
  "拿掉",
  "移除",
  "退訂",
  "cancel",
  "remove",
  "delete",
];

const ALL_WORDS = ["全部", "所有", "都取消", "都不要", "清空", "整個", "all", "everything"];

const CANCEL_NOISE = /(取消|不要了|不用了|退掉|刪掉|刪除|去掉|拿掉|移除|退訂|cancel|remove|delete|我的|剛剛|剛才|那個|那些|一下|幫我|麻煩|請|的)/g;

function contains_any(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

export function is_cancel_request(raw: string): boolean {
  return contains_any(raw.toLowerCase(), CANCEL_WORDS);
}

/**
 * 決定要取消什麼。
 * 只在自己的點餐列裡比對——刪別人的東西永遠不該從一句話推出來。
 */
export function plan_cancellation(raw: string, own_lines: OrderLine[]): CancelPlan {
  const text = raw.toLowerCase();
  if (!is_cancel_request(text)) {
    return { mode: "none" };
  }
  if (own_lines.length === 0) {
    return { mode: "all" }; // 沒東西可取消，交給上層回「你還沒點」
  }
  if (contains_any(text, ALL_WORDS)) {
    return { mode: "all" };
  }

  const key = normalise_key(text.replace(CANCEL_NOISE, " "));
  if (!key) {
    // 只說了「取消」而沒指名：只有一列時不會有歧義，可以直接刪。
    return own_lines.length === 1 ? { mode: "lines", lines: own_lines } : { mode: "ambiguous" };
  }

  const matched = own_lines.filter((line) => {
    const name_key = normalise_key(line.item_name);
    return name_key.length >= 2 && (key.includes(name_key) || name_key.includes(key));
  });

  if (matched.length > 0) {
    return { mode: "lines", lines: matched };
  }
  return { mode: "ambiguous" };
}
