// 組出自然語言回答要用的全部事實：身分、餐廳（含菜單狀態）、揪團、帳、記憶。
//
// 抽成一支的理由是「模型看得到什麼」必須只有一個地方決定。
// 散在各處的話，之後很容易在某條路徑上忘了帶菜單狀態，
// 模型就又會照著店名自己編菜——那正是 0.3.0 要修的幻覺。

import type { Message, OmitPartialGroupDMChannel } from "discord.js";

import { get_balance, list_debt_edges } from "../db/ledger.ts";
import { list_context_facts, recent_turns } from "../db/memory.ts";
import type { Db } from "../db/pool.ts";
import { list_restaurants_with_menu } from "../db/restaurants.ts";
import { debts_for_user } from "../domain/debts.ts";
import { build_facts_block, type GroundingInput, type RestaurantFact } from "../domain/grounding.ts";
import type { HistoryTurn } from "../llm/tasks/reply.ts";
import { format_cents } from "../shared/money.ts";
import { COMMAND_NAMES } from "./commands/definitions.ts";
import { status_label } from "./embeds.ts";
import { balance_state } from "./embeds_ledger.ts";
import { t, type Locale } from "./i18n.ts";
import { load_session } from "./session_flow.ts";

type AnyMessage = OmitPartialGroupDMChannel<Message<boolean>>;

/** 發訊息的人是誰、在哪裡發的。私訊沒有伺服器，一律用空字串代表。 */
export type Speaker = {
  guild_id: string;
  guild_name: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  display_name: string;
};

export function read_speaker(message: AnyMessage): Speaker {
  const channel = message.channel as { name?: string } | null;
  return {
    guild_id: message.guildId ?? "",
    guild_name: message.guild?.name ?? "",
    channel_id: message.channelId,
    channel_name: channel?.name ?? "",
    user_id: message.author.id,
    display_name:
      message.member?.displayName ?? message.author.displayName ?? message.author.username,
  };
}

export type ChatContext = {
  speaker: Speaker;
  restaurants: RestaurantFact[];
  history: HistoryTurn[];
  facts: string;
};

/** 一次把所有事實撈齊。每個欄位都可能是空的，但不會是「沒帶到」。 */
export async function load_chat_context(
  pool: Db,
  message: AnyMessage,
  locale: Locale,
): Promise<ChatContext> {
  const speaker = read_speaker(message);

  const restaurants: RestaurantFact[] = (await list_restaurants_with_menu(pool, 40)).map((row) => ({
    restaurant: row,
    menu_version: row.menu_version ?? undefined,
    item_count: row.item_count,
  }));

  const bundle = await load_session(pool, speaker.channel_id);
  const balance = speaker.guild_id
    ? await get_balance(pool, speaker.guild_id, speaker.user_id)
    : undefined;
  const debts = speaker.guild_id
    ? debts_for_user(await list_debt_edges(pool, speaker.guild_id), speaker.user_id)
    : { owes: [], owed: [] };

  const memories = speaker.guild_id
    ? (await list_context_facts(pool, speaker.guild_id, speaker.user_id, speaker.channel_id)).map(
        (fact) => `- ${describe_scope(fact.scope, speaker)}：${fact.fact_value}`,
      )
    : [];

  const turns = await recent_turns(pool, speaker.channel_id, 10);
  const history: HistoryTurn[] = turns.map((turn) => ({
    role: turn.role,
    // 帶上發話者，多人頻道裡模型才分得出「我」是誰。
    content: turn.role === "user" && turn.display_name ? `${turn.display_name}：${turn.content}` : turn.content,
  }));

  const grounding: GroundingInput = {
    identity: {
      guild_name: speaker.guild_name,
      channel_name: speaker.channel_name,
      user_display_name: speaker.display_name,
    },
    restaurants,
    session: bundle
      ? `${bundle.restaurant.name}．${status_label(bundle.session.status, locale)}`
      : undefined,
    balance: balance ? balance_state(balance, locale) : undefined,
    debts: debts.owes.map((edge) =>
      t(locale, "ledger.owe_to", { user: edge.to_user_id, amount: format_cents(edge.amount_cents) }),
    ),
    memories,
    commands: [...COMMAND_NAMES[locale]],
  };

  return { speaker, restaurants, history, facts: build_facts_block(grounding, locale) };
}

function describe_scope(scope: string, speaker: Speaker): string {
  if (scope === "user") {
    return speaker.display_name;
  }
  if (scope === "channel") {
    return `#${speaker.channel_name || speaker.channel_id}`;
  }
  return speaker.guild_name || "這個伺服器";
}
