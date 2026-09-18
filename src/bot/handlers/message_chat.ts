// 被 @ 到時的自然語言問答：查菜單、查帳、問怎麼用，以及閒聊。
//
// 查菜單與查帳是確定性需求，直接查資料庫並用 Embed 回，不讓模型轉述數字——
// 模型會編金額，資料庫不會（`SPEC/llm-gateway.md` 的第一條紅線）。
// 剩下的才交給模型，而且把「目前有哪些餐廳、這裡有沒有揪團、你欠多少、要拿給誰」
// 一起餵進去，讓它能先接一句話再把話題帶回吃飯，而不是一律回「查不到」。

import type { Message, OmitPartialGroupDMChannel } from "discord.js";

import { get_active_menu, list_menu_items } from "../../db/menus.ts";
import { get_balance, list_debt_edges, list_entries } from "../../db/ledger.ts";
import { list_restaurants, search_restaurants } from "../../db/restaurants.ts";
import type { Restaurant } from "../../db/types.ts";
import { debts_for_user } from "../../domain/debts.ts";
import { classify_intent } from "../../llm/tasks/intent.ts";
import { generate_reply } from "../../llm/tasks/reply.ts";
import { create_logger } from "../../shared/logger.ts";
import { format_cents } from "../../shared/money.ts";
import { StreamPreview } from "../ack.ts";
import { COMMAND_NAMES } from "../commands/definitions.ts";
import type { BotContext } from "../context.ts";
import { menu_embed, notice_embed, status_label } from "../embeds.ts";
import { balance_embed, balance_state, personal_debts_field } from "../embeds_ledger.ts";
import { help_embed } from "../embeds_help.ts";
import { t, type Locale } from "../i18n.ts";
import { load_session } from "../session_flow.ts";

const log = create_logger("chat");

type AnyMessage = OmitPartialGroupDMChannel<Message<boolean>>;

export async function answer_question(
  ctx: BotContext,
  message: AnyMessage,
  question: string,
  locale: Locale,
): Promise<void> {
  if (!question) {
    await message.reply({
      embeds: [help_embed(locale)],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const intent = await classify_intent(ctx.gateway, question);

  if (intent.name === "help") {
    await message.reply({ embeds: [help_embed(locale)], allowedMentions: { repliedUser: false } });
    return;
  }

  if (intent.name === "menu-query" && (await reply_with_menu(ctx, message, intent.restaurant || question, locale))) {
    return;
  }

  if (intent.name === "ledger-query" && (await reply_with_ledger(ctx, message, locale))) {
    return;
  }

  await reply_with_model(ctx, message, question, locale);
}

/** 查得到菜單就用 Embed 回；查不到回 false，讓上層退回模型回答。 */
async function reply_with_menu(
  ctx: BotContext,
  message: AnyMessage,
  keyword: string,
  locale: Locale,
): Promise<boolean> {
  const restaurant = await find_restaurant(ctx, keyword);
  if (!restaurant) {
    return false;
  }
  const menu = await get_active_menu(ctx.pool, restaurant.id);
  if (!menu) {
    await message.reply({
      content: t(locale, "error.menu_missing", { name: restaurant.name }),
      allowedMentions: { repliedUser: false },
    });
    return true;
  }
  const items = await list_menu_items(ctx.pool, menu.id);
  const { embed } = menu_embed(restaurant, menu, items, locale, 0);
  await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
  return true;
}

/** 自然語言查帳。金額一律來自資料庫，Embed 回覆與 `/帳務 我的` 完全一致。 */
async function reply_with_ledger(
  ctx: BotContext,
  message: AnyMessage,
  locale: Locale,
): Promise<boolean> {
  const guild_id = message.guildId;
  if (!guild_id) {
    return false;
  }

  const balance = await get_balance(ctx.pool, guild_id, message.author.id);
  const entries = await list_entries(ctx.pool, guild_id, message.author.id, 10);
  const { owes, owed } = debts_for_user(await list_debt_edges(ctx.pool, guild_id), message.author.id);

  if (!balance && owes.length === 0 && owed.length === 0) {
    await message.reply({
      embeds: [notice_embed(t(locale, "ledger.empty"))],
      allowedMentions: { repliedUser: false },
    });
    return true;
  }

  const embed = balance_embed(
    balance ? [balance] : [],
    entries,
    t(locale, "ledger.mine_title"),
    locale,
  );
  embed.addFields(personal_debts_field(owes, owed, locale));

  await message.reply({
    embeds: [embed],
    allowedMentions: { repliedUser: false, parse: [] },
  });
  return true;
}

async function reply_with_model(
  ctx: BotContext,
  message: AnyMessage,
  question: string,
  locale: Locale,
): Promise<void> {
  if (!ctx.gateway.has_text()) {
    await message.reply({
      content: t(locale, "error.llm_unavailable"),
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const preview = new StreamPreview(message, "⏳");
  await preview.start();

  try {
    const text = await generate_reply(
      ctx.gateway,
      question,
      await build_context(ctx, message, locale),
      (chunk) => preview.push(chunk),
    );
    await preview.finish(text);
  } catch (error) {
    log.warn("自然語言回覆失敗", {
      detail: error instanceof Error ? error.message : String(error),
    });
    await preview.fail(t(locale, "error.llm_unavailable"));
  }
}

/** 餵給模型的事實。全部取自資料庫，模型只能在這個範圍內講話。 */
async function build_context(ctx: BotContext, message: AnyMessage, locale: Locale) {
  const restaurants = await list_restaurants(ctx.pool, 20);
  const bundle = await load_session(ctx.pool, message.channelId);
  const guild_id = message.guildId;

  const balance = guild_id ? await get_balance(ctx.pool, guild_id, message.author.id) : undefined;
  const debts = guild_id
    ? debts_for_user(await list_debt_edges(ctx.pool, guild_id), message.author.id)
    : { owes: [], owed: [] };

  return {
    restaurants: restaurants.map((restaurant) => restaurant.name),
    locale,
    commands: [...COMMAND_NAMES[locale]],
    session: bundle
      ? `${bundle.restaurant.name}．${status_label(bundle.session.status, locale)}`
      : undefined,
    balance: balance ? balance_state(balance, locale) : undefined,
    debts: debts.owes.map((edge) =>
      t(locale, "ledger.owe_to", { user: edge.to_user_id, amount: format_cents(edge.amount_cents) }),
    ),
  };
}

async function find_restaurant(ctx: BotContext, keyword: string): Promise<Restaurant | undefined> {
  const matches = await search_restaurants(ctx.pool, keyword, 1);
  return matches[0];
}
