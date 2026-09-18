// 中文比對的正規化：全形轉半形、異體字統一、去標點。
// 這些對應取自菜單辨識實驗的經驗（臺／台、麺／麵 在同一份菜單上會混用）。

const FULLWIDTH_OFFSET = 0xfee0;
const PUNCTUATION = /[\s\-_/·•、，,。．.＋+()（）【】\[\]|「」『』"'’“”:：;；!！?？~～]+/g;

const VARIANTS: Array<[RegExp, string]> = [
  [/臺/g, "台"],
  [/[麺麪]/g, "麵"],
  [/鉄/g, "鐵"],
  [/塩/g, "鹽"],
  [/糸/g, "絲"],
];

/** 全形英數轉半形，並把全形空白轉成半形空白。 */
export function to_halfwidth(value: string): string {
  return value
    .replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - FULLWIDTH_OFFSET))
    .replace(/\u3000/g, " ");
}

/** 用於索引與比對的鍵：去空白、去標點、統一異體字、轉小寫。 */
export function normalise_key(value: string): string {
  let text = to_halfwidth(value).trim().toLowerCase();
  for (const [pattern, replacement] of VARIANTS) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(PUNCTUATION, "");
}

/** 顯示用的清理：壓掉重複空白與控制字元，但保留原字。 */
export function tidy_display(value: string, max_length = 120): string {
  const text = to_halfwidth(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max_length ? `${text.slice(0, max_length - 1)}…` : text;
}

/** 兩個名稱是否指同一樣東西：正規化後相等，或其中一方完整包含另一方。 */
export function names_match(left: string, right: string): boolean {
  const a = normalise_key(left);
  const b = normalise_key(right);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  return a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a));
}

/**
 * 0–1 的粗略相似度，給搜尋排序與點餐比對用。
 *
 * 取兩個訊號的較大值：
 *   bigram Dice   一般情況下最準
 *   單字涵蓋率     救「珍奶」對「珍珠奶茶」這種縮寫——縮寫沒有共同 bigram，
 *                  只看 bigram 會得到 0。涵蓋率再乘上長度比，避免短查詢亂配。
 */
export function similarity(left: string, right: string): number {
  const a = normalise_key(left);
  const b = normalise_key(right);
  if (!a || !b) {
    return 0;
  }
  if (a === b) {
    return 1;
  }
  return Math.max(bigram_dice(a, b), abbreviation_score(a, b));
}

function bigrams(value: string): Set<string> {
  const set = new Set<string>();
  if (value.length === 1) {
    set.add(value);
  }
  for (let index = 0; index + 1 < value.length; index += 1) {
    set.add(value.slice(index, index + 2));
  }
  return set;
}

function bigram_dice(a: string, b: string): number {
  const left = bigrams(a);
  const right = bigrams(b);
  let shared = 0;
  for (const gram of left) {
    if (right.has(gram)) {
      shared += 1;
    }
  }
  return (2 * shared) / (left.size + right.size);
}

function abbreviation_score(a: string, b: string): number {
  const left = new Set(a);
  const right = new Set(b);
  const shorter = left.size <= right.size ? left : right;
  const longer = shorter === left ? right : left;

  let shared = 0;
  for (const char of shorter) {
    if (longer.has(char)) {
      shared += 1;
    }
  }
  const containment = shared / shorter.size;
  const length_ratio = shorter.size / longer.size;
  return containment * length_ratio;
}
