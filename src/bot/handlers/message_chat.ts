// 被 @ 到時的自然語言問答：查菜單、查帳、記憶、求助，以及閒聊。
//
// 路由的原則是「能用資料庫確定回答的，就絕對不要交給模型」。
// 這不只是省配額——實際發生過的幻覺是：使用者問一間**已建檔但沒有菜單**的店有什麼好吃，
// 舊流程查不到餐廳（比對方向反了）就掉進模型，模型照著店名編出四道菜。
//
// 所以現在的順序是：
//   1. 記憶問題          → 照實回答記得多少，不讓模型自己說「我沒有記憶」
//   2. 要我記住的事      → 寫進長期記憶並確認
//   3. 句子提到已建檔的店 → 一律確定性回覆（菜單 Embed 或「還沒建菜單」）
//   4. 查帳／求助        → Embed
//   5. 其他              → 才交給模型，而且回完還要過一次守門

import type { EmbedBuilder, Message, OmitPartialGroupDMChannel } from "discord.js";

import {
  get_active_menu,
  list_active_items,
  list_menu_items,
  search_active_items,
} from "../../db/menus.ts";
import { get_balance, list_debt_edges, list_entries } from "../../db/ledger.ts";
import { count_turns, list_context_facts, record_turn, remember_fact } from "../../db/memory.ts";
import { upsert_user } from "../../db/users.ts";
import { debts_for_user } from "../../domain/debts.ts";
import { extract_dish_query } from "../../domain/dish_query.ts";
import { find_mentions, type RestaurantFact } from "../../domain/grounding.ts";
import { capture_memory, is_memory_question } from "../../domain/memory_capture.ts";
import { pick_recommendations, seed_from } from "../../domain/recommend.ts";
import { classify_intent } from "../../llm/tasks/intent.ts";
import { generate_reply } from "../../llm/tasks/reply.ts";
import { create_logger } from "../../shared/logger.ts";
import { StreamPreview } from "../ack.ts";
import { load_chat_context, type ChatContext } from "../chat_context.ts";
import type { BotContext } from "../context.ts";
import { menu_embed, notice_embed } from "../embeds.ts";
import {
  dish_hits_embed,
  memory_embed,
  recommend_embed,
  restaurant_status_embed,
} from "../embeds_chat.ts";
import { help_embed } from "../embeds_help.ts";
import { balance_embed, personal_debts_field } from "../embeds_ledger.ts";
import { t, type Locale } from "../i18n.ts";
import { format_date } from "../../shared/time.ts";

const log = create_logger("chat");

type AnyMessage = OmitPartialGroupDMChannel<Message<boolean>>;

export async function answer_question(
  ctx: BotContext,
  message: AnyMessage,
  question: string,
  locale: Locale,
): Promise<void> {
  const context = await load_chat_context(ctx.pool, message, locale);
  const { speaker } = context;

  // 認得人：顯示名稱進 app_users，網站與帳務才顯示得出人名而不是一串 id。
  await upsert_user(ctx.pool, speaker.user_id, speaker.display_name, locale);

  if (!question) {
    await send(ctx, message, context, { embeds: [help_embed(locale)] }, "help");
    return;
  }

  await record_turn(ctx.pool, {
    guild_id: speaker.guild_id,
    channel_id: speaker.channel_id,
    discord_user_id: speaker.user_id,
    display_name: speaker.display_name,
    role: "user",
    content: question,
  });

  if (is_memory_question(question)) {
    await answer_memory(ctx, message, context, locale);
    return;
  }

  const captured = capture_memory(question);
  if (captured && speaker.guild_id) {
    await remember_fact(ctx.pool, {
      guild_id: speaker.guild_id,
      scope: captured.scope,
      subject_id: captured.scope === "user" ? speaker.user_id : speaker.channel_id,
      fact_key: captured.fact_key,
      fact_value: captured.fact_value,
      created_by: speaker.user_id,
    });
    await send(
      ctx,
      message,
      context,
      { content: t(locale, "memory.saved", { summary: captured.summary }) },
      "memory",
    );
    return;
  }

  const intent = await classify_intent(ctx.gateway, question);

  // 句子提到哪間店，是拿資料庫的店名去比句子——反過來比是舊版查不到的原因。
  const mentions = find_mentions(question, context.restaurants);
  const named = mentions.find((mention) => mention.kind === "exact");

  // 完整講出店名＝問的就是那一家，最明確，先處理。
  if (named && intent.name !== "ledger-query") {
    await answer_about_restaurant(ctx, message, context, named.fact, locale);
    return;
  }

  // 「有沒有豆腐鍋可以吃」問的是某道菜在哪家有。直接查 menu_items，
  // 交給模型的話它會挑一家名字聽起來像的回答——那是猜的不是查的。
  //
  // 這一段要排在「只對到部分店名」之前：「豆腐鍋」既是菜名也是「雷荷豆腐鍋專賣店」的一段，
  // 但問的人要的是「哪裡吃得到」，不是那家店的整份菜單。
  const dish = extract_dish_query(question);
  if (dish) {
    await answer_about_dish(ctx, message, context, dish, locale);
    return;
  }

  // 只對到一部分（「給我麵店」→「老余麵店」）就先確認一句再回答，不要裝作聽懂了。
  const guessed = mentions.find((mention) => mention.kind === "partial");
  if (guessed && intent.name !== "ledger-query") {
    await answer_about_restaurant(
      ctx,
      message,
      context,
      guessed.fact,
      locale,
      t(locale, "chat.maybe_restaurant", { name: guessed.fact.restaurant.name }),
    );
    return;
  }

  // 「推薦一下」「幫我挑」要的是一個答案。從 menu_items 抽幾樣真的存在的，
  // 模型完全不碰——第一版把這種話也丟去回餐廳清單，等於問什麼都同一塊罐頭。
  if (intent.name === "recommend") {
    await answer_recommendation(ctx, message, context, locale);
    return;
  }

  if (intent.name === "help") {
    await send(ctx, message, context, { embeds: [help_embed(locale)] }, "help");
    return;
  }

  if (intent.name === "ledger-query" && speaker.guild_id) {
    await answer_ledger(ctx, message, context, locale);
    return;
  }

  // 明著要看「有哪些店／菜單」才給清單。其餘話題交給模型，
  // 它手上有事實區塊，講得出店名但講不出不存在的菜。
  if (intent.name === "menu-query") {
    await send(
      ctx,
      message,
      context,
      { embeds: [restaurant_status_embed(context.restaurants, locale)] },
      "menu-query",
    );
    return;
  }

  await answer_with_model(ctx, message, context, question, locale);
}

/**
 * 推薦幾樣。抽樣用（發問者＋日期）當種子：同一個人同一天問會得到同一組，
 * 不會每問一次就整組換掉顯得隨便；換一天或換個人就會不一樣。
 */
async function answer_recommendation(
  ctx: BotContext,
  message: AnyMessage,
  context: ChatContext,
  locale: Locale,
): Promise<void> {
  const candidates = await list_active_items(ctx.pool, 400);
  const picks = pick_recommendations(
    candidates.map((item) => ({
      restaurant_id: item.restaurant_id,
      restaurant_name: item.restaurant_name,
      item_name: item.item_name,
      price_cents: item.price_cents,
      note: item.note,
    })),
    seed_from(context.speaker.user_id, format_date(), String(context.history.length)),
    3,
  );

  if (picks.length === 0) {
    await send(ctx, message, context, { content: t(locale, "chat.recommend_empty") }, "recommend");
    return;
  }
  await send(ctx, message, context, { embeds: [recommend_embed(picks, locale)] }, "recommend");
}

/**
 * 問到某一間店。有菜單就給菜單 Embed，沒有就照實說還沒建——
 * 這條路徑完全不碰模型，所以不可能生出不存在的菜色。
 */
async function answer_about_restaurant(
  ctx: BotContext,
  message: AnyMessage,
  context: ChatContext,
  fact: RestaurantFact,
  locale: Locale,
  prefix?: string,
): Promise<void> {
  const menu = fact.menu_version === undefined ? undefined : await get_active_menu(ctx.pool, fact.restaurant.id);

  if (!menu) {
    const body = t(locale, "chat.no_menu_yet", { name: fact.restaurant.name });
    await send(
      ctx,
      message,
      context,
      { content: prefix ? `${prefix}
${body}` : body },
      "menu-query",
    );
    return;
  }

  const items = await list_menu_items(ctx.pool, menu.id);
  const { embed } = menu_embed(fact.restaurant, menu, items, locale, 0);
  await send(ctx, message, context, { content: prefix, embeds: [embed] }, "menu-query");
}

/**
 * 問某一道菜在哪家有。答案全部來自 `menu_items`，所以列出來的品項一定真的存在。
 * 查不到時還要交代「哪幾家根本還沒建菜單」——那才是誠實的「查不到」，
 * 而不是讓使用者以為那道菜在全世界都不存在。
 */
async function answer_about_dish(
  ctx: BotContext,
  message: AnyMessage,
  context: ChatContext,
  dish: string,
  locale: Locale,
): Promise<void> {
  const hits = await search_active_items(ctx.pool, dish, 12);
  if (hits.length > 0) {
    await send(ctx, message, context, { embeds: [dish_hits_embed(dish, hits, locale)] }, "menu-query");
    return;
  }

  const without_menu = context.restaurants.filter((fact) => fact.menu_version === undefined);
  const hint =
    without_menu.length > 0
      ? t(locale, "chat.dish_hint_no_menu", {
          names: without_menu.map((fact) => fact.restaurant.name).join("、"),
        })
      : t(locale, "chat.dish_hint_none");

  await send(ctx, message, context, { content: t(locale, "chat.dish_none", { dish, hint }) }, "menu-query");
}

/** 自然語言查帳。金額一律來自資料庫，Embed 與 `/帳務 我的` 完全一致。 */
async function answer_ledger(
  ctx: BotContext,
  message: AnyMessage,
  context: ChatContext,
  locale: Locale,
): Promise<void> {
  const { guild_id, user_id } = context.speaker;
  const balance = await get_balance(ctx.pool, guild_id, user_id);
  const entries = await list_entries(ctx.pool, guild_id, user_id, 10);
  const { owes, owed } = debts_for_user(await list_debt_edges(ctx.pool, guild_id), user_id);

  if (!balance && owes.length === 0 && owed.length === 0) {
    await send(ctx, message, context, { embeds: [notice_embed(t(locale, "ledger.empty"))] }, "ledger-query");
    return;
  }

  const embed = balance_embed(balance ? [balance] : [], entries, t(locale, "ledger.mine_title"), locale);
  embed.addFields(personal_debts_field(owes, owed, locale));
  await send(ctx, message, context, { embeds: [embed] }, "ledger-query");
}

/** 「你有記憶功能嗎」要由程式回答；讓模型自己說會得到「我沒有記憶」這種錯話。 */
async function answer_memory(
  ctx: BotContext,
  message: AnyMessage,
  context: ChatContext,
  locale: Locale,
): Promise<void> {
  const { guild_id, user_id, channel_id } = context.speaker;
  const facts = guild_id ? await list_context_facts(ctx.pool, guild_id, user_id, channel_id) : [];
  const turns = await count_turns(ctx.pool, channel_id);
  await send(ctx, message, context, { embeds: [memory_embed(facts, turns, locale)] }, "memory");
}

async function answer_with_model(
  ctx: BotContext,
  message: AnyMessage,
  context: ChatContext,
  question: string,
  locale: Locale,
): Promise<void> {
  if (!ctx.gateway.has_text()) {
    await send(ctx, message, context, { content: t(locale, "error.llm_unavailable") }, "chat");
    return;
  }

  const preview = new StreamPreview(message, "⏳");
  await preview.start();

  try {
    const outcome = await generate_reply(
      ctx.gateway,
      {
        question,
        locale,
        facts: context.facts,
        history: context.history,
        known_names: context.restaurants.flatMap((fact) => [
          fact.restaurant.name,
          ...fact.restaurant.aliases,
        ]),
      },
      (chunk) => preview.push(chunk),
    );

    // 最後一道防線：模型還是列了菜色或報了價，整段丟掉換成安全回覆。
    const text = outcome.blocked || !outcome.text ? t(locale, "chat.blocked") : outcome.text;
    if (outcome.blocked) {
      log.warn("模型回覆疑似自行編造菜單，已攔下", {
        channel: context.speaker.channel_id,
        sample: outcome.text.slice(0, 120),
      });
    }

    await preview.finish(text);
    await record_assistant(ctx, context, text, "chat");
  } catch (error) {
    log.warn("自然語言回覆失敗", {
      detail: error instanceof Error ? error.message : String(error),
    });
    await preview.fail(t(locale, "error.llm_unavailable"));
  }
}

type ReplyPayload = { content?: string; embeds?: EmbedBuilder[] };

/** 回覆並把這一輪記進短期記憶。所有路徑都走這裡，才不會有哪條路忘了記。 */
async function send(
  ctx: BotContext,
  message: AnyMessage,
  context: ChatContext,
  payload: ReplyPayload,
  intent: string,
): Promise<void> {
  await message.reply({
    content: payload.content,
    embeds: payload.embeds ?? [],
    allowedMentions: { repliedUser: false, parse: [] },
  });
  await record_assistant(ctx, context, summarise(payload), intent);
}

async function record_assistant(
  ctx: BotContext,
  context: ChatContext,
  content: string,
  intent: string,
): Promise<void> {
  await record_turn(ctx.pool, {
    guild_id: context.speaker.guild_id,
    channel_id: context.speaker.channel_id,
    role: "assistant",
    content,
    intent,
  });
}

/** Embed 記不進純文字的短期記憶，就記一句「送出了什麼」當作上下文。 */
function summarise(payload: ReplyPayload): string {
  if (payload.content) {
    return payload.content;
  }
  return payload.embeds && payload.embeds.length > 0 ? "（已用 Embed 回覆）" : "";
}
