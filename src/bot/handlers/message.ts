// 一般訊息處理：菜單貼文接收、揪團貼文裡的自然語言點餐、被 @ 時的自然語言問答。
//
// 三條路都先給 Ack Reaction，需要等 LLM 的再加 Streaming Preview。

import type { Message, OmitPartialGroupDMChannel } from "discord.js";

import { get_active_menu, list_menu_items } from "../../db/menus.ts";
import { list_restaurants, search_restaurants } from "../../db/restaurants.ts";
import type { Restaurant } from "../../db/types.ts";
import { parse_menu_text } from "../../domain/menu_draft.ts";
import { classify_intent } from "../../llm/tasks/intent.ts";
import { extract_menu_from_text } from "../../llm/tasks/menu_extract.ts";
import { parse_order } from "../../llm/tasks/order_parse.ts";
import { generate_reply } from "../../llm/tasks/reply.ts";
import { create_logger } from "../../shared/logger.ts";
import { StreamPreview, with_ack } from "../ack.ts";
import { COMMAND_NAMES } from "../commands/definitions.ts";
import type { BotContext } from "../context.ts";
import { menu_embed, notice_embed, status_label } from "../embeds.ts";
import { pick_locale, t, type Locale } from "../i18n.ts";
import { present_draft, skipped_note } from "../menu_flow.ts";
import {
  add_picks,
  format_person_total,
  load_session,
  refresh_summary_message,
  session_menu_items,
} from "../session_flow.ts";

const log = create_logger("message");
const MAX_INPUT_LENGTH = 4000;

type AnyMessage = OmitPartialGroupDMChannel<Message<boolean>>;

export async function handle_message(ctx: BotContext, message: AnyMessage): Promise<void> {
  if (message.author.bot || !message.content.trim()) {
    return;
  }

  const locale = guess_locale(message);
  const content = message.content.slice(0, MAX_INPUT_LENGTH);

  // 1) 正在等這個人貼菜單
  const pending = ctx.pending.take(message.channelId, message.author.id);
  if (pending) {
    await with_ack(message, () => capture_menu(ctx, message, pending.restaurant_id, pending.restaurant_name, content, locale));
    return;
  }

  // 2) 在揪團貼文裡：試著把這句話當點餐
  const bundle = await load_session(ctx.pool, message.channelId);
  if (bundle) {
    await with_ack(message, () => order_from_message(ctx, message, content, locale));
    return;
  }

  // 3) 被 @ 到：自然語言問答
  if (ctx.client.user && message.mentions.users.has(ctx.client.user.id)) {
    const question = content.replace(/<@!?\d+>/g, " ").trim();
    await with_ack(message, () => answer_question(ctx, message, question, locale));
  }
}

/** Discord 沒有在 MessageCreate 給使用者語言，用內容有沒有中文粗略判斷。 */
function guess_locale(message: AnyMessage): Locale {
  if (message.guild?.preferredLocale) {
    const preferred = pick_locale(message.guild.preferredLocale);
    if (preferred === "zh-TW") {
      return preferred;
    }
  }
  return /[一-鿿]/.test(message.content) ? "zh-TW" : "en-GB";
}

async function capture_menu(
  ctx: BotContext,
  message: AnyMessage,
  restaurant_id: number,
  restaurant_name: string,
  content: string,
  locale: Locale,
): Promise<void> {
  const by_rules = parse_menu_text(content);
  let items = by_rules.items;
  let source_note = t(locale, "menu.source_manual");
  let skipped = by_rules.skipped;

  if (items.length === 0 && ctx.gateway.has_text()) {
    try {
      const extraction = await extract_menu_from_text(ctx.gateway, content);
      items = extraction.items;
      source_note = t(locale, "menu.source_vision", {
        model: `${extraction.provider}/${extraction.model}`,
      });
      skipped = [];
    } catch (error) {
      log.warn("以 LLM 解析菜單文字失敗", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (items.length === 0) {
    await message.reply({
      embeds: [
        notice_embed(t(locale, "error.parse_failed", { detail: content.slice(0, 80) })),
      ],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const draft = await present_draft(ctx.pool, {
    restaurant_id,
    restaurant_name,
    items,
    source: "manual",
    source_note,
    created_by: message.author.id,
    locale,
  });

  await message.reply({
    content: skipped_note(skipped, locale),
    embeds: [draft.embed],
    components: draft.components,
    allowedMentions: { repliedUser: false },
  });
}

async function order_from_message(
  ctx: BotContext,
  message: AnyMessage,
  content: string,
  locale: Locale,
): Promise<void> {
  const bundle = await load_session(ctx.pool, message.channelId);
  if (!bundle) {
    return;
  }

  const mentioned = ctx.client.user ? message.mentions.users.has(ctx.client.user.id) : false;

  if (bundle.session.status !== "open") {
    if (mentioned) {
      await message.reply({
        content: t(locale, "error.session_closed", {
          status: status_label(bundle.session.status, locale),
        }),
        allowedMentions: { repliedUser: false },
      });
    }
    return;
  }

  const items = await session_menu_items(ctx.pool, bundle.session);
  const outcome = await parse_order(ctx.gateway, content, items);

  if (outcome.picks.length === 0) {
    // 對不到就安靜——貼文裡本來就會有閒聊，被 @ 到才需要回話。
    if (mentioned) {
      await message.reply({
        content: t(locale, "error.parse_failed", { detail: content.slice(0, 60) }),
        allowedMentions: { repliedUser: false },
      });
    }
    return;
  }

  const summary_text = await add_picks(
    ctx.pool,
    bundle.session,
    {
      id: message.author.id,
      display_name: message.member?.displayName ?? message.author.displayName ?? message.author.username,
    },
    outcome.picks,
    "natural-language",
  );

  const updated = await load_session(ctx.pool, message.channelId);
  const lines = [
    t(locale, "session.added", {
      summary: summary_text,
      amount: format_person_total(updated!.summary, message.author.id),
    }),
  ];
  if (outcome.unmatched.length > 0) {
    lines.push(t(locale, "session.unmatched", { detail: outcome.unmatched.join(" / ") }));
  }

  await message.reply({ content: lines.join("\n"), allowedMentions: { repliedUser: false } });
  await refresh_summary_message(ctx.client, ctx.pool, message.channelId, locale);
}

async function answer_question(
  ctx: BotContext,
  message: AnyMessage,
  question: string,
  locale: Locale,
): Promise<void> {
  if (!question) {
    await message.reply({ content: t(locale, "help.footer"), allowedMentions: { repliedUser: false } });
    return;
  }

  const intent = await classify_intent(ctx.gateway, question);

  // 查菜單屬於確定性需求，直接查資料庫並用 Embed 回，不要讓模型轉述。
  if (intent.name === "menu-query") {
    const restaurant = await find_restaurant(ctx, intent.restaurant || question);
    if (restaurant) {
      await send_menu_reply(ctx, message, restaurant, locale);
      return;
    }
  }

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
    const restaurants = await list_restaurants(ctx.pool, 20);
    const text = await generate_reply(
      ctx.gateway,
      question,
      {
        restaurants: restaurants.map((restaurant) => restaurant.name),
        locale,
        commands: [...COMMAND_NAMES[locale]],
      },
      (chunk) => preview.push(chunk),
    );
    await preview.finish(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    log.warn("自然語言回覆失敗", { detail });
    await preview.fail(t(locale, "error.llm_unavailable"));
  }
}

async function find_restaurant(ctx: BotContext, keyword: string): Promise<Restaurant | undefined> {
  const matches = await search_restaurants(ctx.pool, keyword, 1);
  return matches[0];
}

async function send_menu_reply(
  ctx: BotContext,
  message: AnyMessage,
  restaurant: Restaurant,
  locale: Locale,
): Promise<void> {
  const menu = await get_active_menu(ctx.pool, restaurant.id);
  if (!menu) {
    await message.reply({
      content: t(locale, "error.menu_missing", { name: restaurant.name }),
      allowedMentions: { repliedUser: false },
    });
    return;
  }
  const items = await list_menu_items(ctx.pool, menu.id);
  const { embed } = menu_embed(restaurant, menu, items, locale, 0);
  await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
}
