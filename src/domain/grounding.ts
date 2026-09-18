// 把回答綁在資料庫上：找出句子提到哪幾間餐廳、組出可以給模型看的事實、
// 以及在模型回完之後檢查它有沒有編東西。
//
// 這個模組是為了一個實際發生的幻覺寫的：
// 使用者問「四海豆漿大王有甚麼好吃的」，那間店確實在資料庫裡，但**還沒建菜單**，
// 模型卻列出四道菜。追下去有兩個原因：
//
//   一、`search_restaurants()` 是拿「整句」去比對店名，方向反了。
//       店名是句子的一部分，不是句子是店名的一部分，所以查無餐廳。
//   二、查無餐廳就掉進模型，而模型手上只有一張店名清單、沒有「這家沒有菜單」這件事，
//       於是它照著店名自己編了合理的菜色。
//
// 四道防線，順序不能換：
//   1. `find_mentioned_restaurants()`  句子提到已建檔的店 → 交給確定性流程，不進模型
//   2. `build_facts_block()`           模型拿到的餐廳清單一律標注有沒有菜單
//   3. 系統提示（`tasks/reply.ts`）     文字回覆不得出現菜名與價格
//   4. `looks_like_invented_menu()`    模型還是列了菜就丟掉整段回覆，改用安全回覆

import type { Restaurant } from "../db/types.ts";
import { normalise_key } from "../shared/text.ts";

/** 一間餐廳在資料庫裡的完整狀態。沒有菜單是一種狀態，不是缺資料。 */
export type RestaurantFact = {
  restaurant: Restaurant;
  /** 目前上線的菜單版本；undefined＝尚無菜單，我們並不知道它賣什麼。 */
  menu_version?: number;
  item_count: number;
};

export type IdentityFact = {
  guild_name: string;
  channel_name: string;
  user_display_name: string;
};

export type GroundingInput = {
  identity: IdentityFact;
  restaurants: RestaurantFact[];
  /** 這個頻道正在進行的揪團描述，例如「雷荷豆腐鍋專賣店．開放中」。 */
  session?: string;
  /** 發問者的結餘描述。 */
  balance?: string;
  /** 發問者該把錢拿給誰。 */
  debts: string[];
  /** 長期記憶，已排好版的一行一條。 */
  memories: string[];
  commands: string[];
};

/** 太短的店名容易誤中（「飯」「麵」），要求至少兩個字。 */
const MIN_NAME_KEY_LENGTH = 2;

/** 完整命中店名，還是只對到一部分（「麵店」→「老余麵店」）。 */
export type MentionKind = "exact" | "partial";

export type Mention = {
  fact: RestaurantFact;
  kind: MentionKind;
  /** 實際對上的那段字，partial 時用來回問「你是說⋯⋯嗎」。 */
  matched: string;
};

/**
 * 句子裡提到了哪幾間已建檔的餐廳。
 *
 * 比對方向是「店名出現在句子裡」，而不是反過來——這正是原本查不到的地方。
 * 別名一起比，命中最長的排前面（「聞香來簡餐」要贏過「聞香來」）。
 *
 * 完整對不到時再退一步找**共同片段**：「給我麵店」對得到「老余麵店」。
 * 但只有在那段字**只屬於一家**的時候才算——「店」四家都有，那不是線索是巧合。
 */
export function find_mentions(text: string, restaurants: RestaurantFact[]): Mention[] {
  const haystack = normalise_key(text);
  if (!haystack) {
    return [];
  }

  const exact: Array<{ mention: Mention; length: number }> = [];
  for (const fact of restaurants) {
    let best = "";
    for (const candidate of [fact.restaurant.name, ...fact.restaurant.aliases]) {
      const key = normalise_key(candidate);
      if (key.length >= MIN_NAME_KEY_LENGTH && haystack.includes(key) && key.length > best.length) {
        best = key;
      }
    }
    if (best) {
      exact.push({ mention: { fact, kind: "exact", matched: best }, length: best.length });
    }
  }

  if (exact.length > 0) {
    exact.sort((left, right) => right.length - left.length);
    return exact.map((hit) => hit.mention);
  }

  return find_partial(haystack, restaurants);
}

/** 保留舊名稱：只要完整命中的那幾間。 */
export function find_mentioned_restaurants(
  text: string,
  restaurants: RestaurantFact[],
): RestaurantFact[] {
  return find_mentions(text, restaurants)
    .filter((mention) => mention.kind === "exact")
    .map((mention) => mention.fact);
}

/** 共同片段比對。片段要夠長、而且只能屬於一家，否則寧可不猜。 */
function find_partial(haystack: string, restaurants: RestaurantFact[]): Mention[] {
  const owners = new Map<string, Set<number>>();
  const best_for: Map<number, string> = new Map();

  for (const fact of restaurants) {
    for (const candidate of [fact.restaurant.name, ...fact.restaurant.aliases]) {
      for (const fragment of shared_fragments(haystack, normalise_key(candidate))) {
        const set = owners.get(fragment) ?? new Set<number>();
        set.add(fact.restaurant.id);
        owners.set(fragment, set);
        if (fragment.length > (best_for.get(fact.restaurant.id)?.length ?? 0)) {
          best_for.set(fact.restaurant.id, fragment);
        }
      }
    }
  }

  const mentions: Mention[] = [];
  for (const fact of restaurants) {
    const fragment = best_for.get(fact.restaurant.id);
    if (fragment && owners.get(fragment)?.size === 1) {
      mentions.push({ fact, kind: "partial", matched: fragment });
    }
  }

  mentions.sort((left, right) => right.matched.length - left.matched.length);
  // 兩家以上同時「只對到一部分」就是講不清楚，全部不算，讓上層走一般流程。
  return mentions.length === 1 ? mentions : [];
}

/** 兩個字串共有、長度 ≥ MIN_NAME_KEY_LENGTH 的連續片段。 */
function shared_fragments(left: string, right: string): string[] {
  const found: string[] = [];
  for (let start = 0; start + MIN_NAME_KEY_LENGTH <= right.length; start += 1) {
    for (let end = right.length; end - start >= MIN_NAME_KEY_LENGTH; end -= 1) {
      const fragment = right.slice(start, end);
      if (left.includes(fragment)) {
        found.push(fragment);
        break; // 同一個起點只留最長的
      }
    }
  }
  return found;
}

/**
 * 模型是不是又把菜單編出來了。
 *
 * 兩種形狀：講出了金額，或列了兩行以上「我們不認得的東西」。
 * 事實區塊裡從來沒有價格，所以模型講得出價格就一定是編的。
 *
 * 條列的部分刻意放寬：帶 `/` 的行（「用 /菜單 查」）與**列出已知店名**的行都放行。
 * 條列本身不是罪，條列「不存在的菜」才是——第一版把所有條列都擋掉，
 * 結果連「要不要看看這兩家」都被換成罐頭句，反而更難溝通。
 */
export function looks_like_invented_menu(text: string, allowed_names: string[] = []): boolean {
  if (/(?:NT\$|\bNT\s|\$)\s*\d/i.test(text) || /\d+\s*(?:元|塊)/.test(text)) {
    return true;
  }

  const allowed = allowed_names.map((name) => normalise_key(name)).filter(Boolean);

  const suspicious = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(?:[-*•‧・▪]|\d+[.)、])\s*\S/.test(line))
    .filter((line) => !line.includes("/"))
    .filter((line) => {
      const key = normalise_key(line);
      return !allowed.some((name) => key.includes(name));
    });

  return suspicious.length >= 2;
}

/**
 * 組出模型唯一能引用的事實。
 *
 * 餐廳一律標注菜單狀態：「尚無菜單」是明確的事實，不是省略。
 * 沒有這一行，模型看到店名就會自己想像它賣什麼。
 */
export function build_facts_block(input: GroundingInput, locale: string): string {
  return locale.startsWith("zh") ? build_zh(input) : build_en(input);
}

function build_zh(input: GroundingInput): string {
  const blocks: string[] = [];

  blocks.push(
    [
      "【現在是誰在跟你說話】",
      `伺服器：${input.identity.guild_name || "（私訊）"}`,
      `頻道：${input.identity.channel_name || "（未知）"}`,
      `發問者：${input.identity.user_display_name}`,
    ].join("\n"),
  );

  blocks.push(
    [
      "【資料庫裡的餐廳】沒列在這裡的餐廳一律當成不存在。",
      ...(input.restaurants.length > 0
        ? input.restaurants.map(describe_restaurant_zh)
        : ["（目前一間都沒有）"]),
      "標示「尚無菜單」的店，代表**我們並不知道它賣什麼**；要照實說還沒建菜單，不准舉例、不准猜。",
    ].join("\n"),
  );

  if (input.session) {
    blocks.push(`【這個頻道的揪團】${input.session}`);
  }
  if (input.balance) {
    blocks.push(`【發問者的帳】${input.balance}`);
  }
  if (input.debts.length > 0) {
    blocks.push(`【發問者的欠款】${input.debts.join("；")}`);
  }
  if (input.memories.length > 0) {
    blocks.push(["【你記得的事】", ...input.memories].join("\n"));
  }

  blocks.push(`【可用指令】${input.commands.join("、")}`);
  return blocks.join("\n\n");
}

function build_en(input: GroundingInput): string {
  const blocks: string[] = [];

  blocks.push(
    [
      "[Who you are talking to]",
      `Server: ${input.identity.guild_name || "(direct message)"}`,
      `Channel: ${input.identity.channel_name || "(unknown)"}`,
      `Asking: ${input.identity.user_display_name}`,
    ].join("\n"),
  );

  blocks.push(
    [
      "[Restaurants on file] Anything not listed here does not exist.",
      ...(input.restaurants.length > 0
        ? input.restaurants.map(describe_restaurant_en)
        : ["(none yet)"]),
      "Where it says NO MENU, we genuinely do not know what they serve. Say the menu has not been added yet; do not give examples and do not guess.",
    ].join("\n"),
  );

  if (input.session) {
    blocks.push(`[Group order in this channel] ${input.session}`);
  }
  if (input.balance) {
    blocks.push(`[Their balance] ${input.balance}`);
  }
  if (input.debts.length > 0) {
    blocks.push(`[What they owe] ${input.debts.join("; ")}`);
  }
  if (input.memories.length > 0) {
    blocks.push(["[What you remember]", ...input.memories].join("\n"));
  }

  blocks.push(`[Available commands] ${input.commands.join(", ")}`);
  return blocks.join("\n\n");
}

function describe_restaurant_zh(fact: RestaurantFact): string {
  const alias = fact.restaurant.aliases.length > 0 ? `（別名：${fact.restaurant.aliases.join("、")}）` : "";
  const menu =
    fact.menu_version === undefined
      ? "**尚無菜單**"
      : `菜單 v${fact.menu_version}，${fact.item_count} 項`;
  return `- ${fact.restaurant.name}${alias}：${menu}`;
}

function describe_restaurant_en(fact: RestaurantFact): string {
  const alias = fact.restaurant.aliases.length > 0 ? ` (aka ${fact.restaurant.aliases.join(", ")})` : "";
  const menu =
    fact.menu_version === undefined
      ? "**NO MENU on file**"
      : `menu v${fact.menu_version}, ${fact.item_count} items`;
  return `- ${fact.restaurant.name}${alias}: ${menu}`;
}
