// 「推薦吃什麼」「幫我挑」要給的是**一個答案**，不是一份清單。
//
// 為什麼不交給模型：推薦一定會講到具體的菜名和價格，而那正是最容易被編出來的東西。
// 所以改成程式從 `menu_items` 抽幾樣真的存在的，模型完全不碰——
// 推薦得到的每一道菜、每一個價格都查得到出處。
//
// 抽樣要「同一個人在同一天問會得到同一組答案」：一直換會顯得隨便，
// 永遠不變又像壞掉。所以用（使用者＋日期）當種子，不用 Math.random()。

export type Candidate = {
  restaurant_id: number;
  restaurant_name: string;
  item_name: string;
  price_cents: number;
  note: string;
};

/**
 * 加購項目不適合當推薦。
 * 菜單裡的「加豬五花」「換細麵」「加大」是附加選項，單獨推薦一個「加肉片」很怪。
 * 只看開頭的動詞，不看價格——飲料也很便宜，但飲料是可以推薦的。
 */
const ADD_ON_PREFIX = /^(?:加|換|升級|續|多加|單點加|另加)/;

export function is_recommendable(item_name: string): boolean {
  const name = item_name.trim();
  return name.length > 0 && !ADD_ON_PREFIX.test(name);
}

/** 32-bit FNV-1a。只是要一個穩定又夠散的種子，不是密碼學用途。 */
export function seed_from(...parts: string[]): number {
  let hash = 0x811c9dc5;
  for (const char of parts.join("|")) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** xorshift32。同一個種子永遠給同一串數字，測試才釘得住。 */
function make_random(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

/**
 * 挑幾樣來推薦。
 *
 * 盡量**一家一樣**：同一家連出三道，看起來像在推銷而不是在給選擇。
 * 店家不夠時才允許同一家出第二樣。
 */
export function pick_recommendations(
  all_candidates: Candidate[],
  seed: number,
  count = 3,
): Candidate[] {
  // 先把加購項目拿掉；全部都是加購時就不挑剔了，有總比沒有好。
  const main = all_candidates.filter((candidate) => is_recommendable(candidate.item_name));
  const candidates = main.length > 0 ? main : all_candidates;

  if (candidates.length === 0 || count <= 0) {
    return [];
  }

  const random = make_random(seed);
  const by_restaurant = new Map<number, Candidate[]>();
  for (const candidate of candidates) {
    const bucket = by_restaurant.get(candidate.restaurant_id) ?? [];
    bucket.push(candidate);
    by_restaurant.set(candidate.restaurant_id, bucket);
  }

  // 店家順序打散，但用的是同一個種子，所以同一次呼叫的結果是固定的。
  const restaurants = shuffle([...by_restaurant.keys()], random);
  const picked: Candidate[] = [];
  const used = new Set<string>();

  // 第一輪一家挑一樣，不夠再繞第二輪。
  for (let round = 0; picked.length < count && round < count; round += 1) {
    let added_this_round = false;
    for (const restaurant_id of restaurants) {
      if (picked.length >= count) {
        break;
      }
      const bucket = by_restaurant.get(restaurant_id) ?? [];
      const choice = take_unused(bucket, used, random);
      if (choice) {
        picked.push(choice);
        added_this_round = true;
      }
    }
    if (!added_this_round) {
      break; // 所有品項都用完了
    }
  }

  return picked;
}

function take_unused(
  bucket: Candidate[],
  used: Set<string>,
  random: () => number,
): Candidate | undefined {
  const available = bucket.filter((item) => !used.has(key_of(item)));
  if (available.length === 0) {
    return undefined;
  }
  const choice = available[Math.floor(random() * available.length)] ?? available[0]!;
  used.add(key_of(choice));
  return choice;
}

function key_of(candidate: Candidate): string {
  return `${candidate.restaurant_id}:${candidate.item_name}:${candidate.price_cents}`;
}

function shuffle<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}
