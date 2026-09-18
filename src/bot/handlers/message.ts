// 一般訊息的入口：菜單貼文接收、揪團貼文裡的自然語言、被 @ 時的問答。
//
// 三條路都先給 Ack Reaction，需要等 LLM 的再加 Streaming Preview。
// 貼文裡的點餐與取消在 `message_order.ts`，被 @ 的問答在 `message_chat.ts`。

import type { Message, OmitPartialGroupDMChannel } from "discord.js";

import { parse_menu_text } from "../../domain/menu_draft.ts";
import { extract_menu_from_text } from "../../llm/tasks/menu_extract.ts";
import { create_logger } from "../../shared/logger.ts";
import { with_ack } from "../ack.ts";
import type { BotContext } from "../context.ts";
import { notice_embed } from "../embeds.ts";
import { pick_locale, t, type Locale } from "../i18n.ts";
import { present_draft, skipped_note } from "../menu_flow.ts";
import { load_session } from "../session_flow.ts";
import { answer_question } from "./message_chat.ts";
import { handle_session_message } from "./message_order.ts";

const log = create_logger("message");
const MAX_INPUT_LENGTH = 4000;

type AnyMessage = OmitPartialGroupDMChannel<Message<boolean>>;

export async function handle_message(ctx: BotContext, message: AnyMessage): Promise<void> {
  if (message.author.bot || !message.content.trim()) {
    return;
  }

  const locale = guess_locale(message);
  const content = message.content.slice(0, MAX_INPUT_LENGTH);
  const mentioned = ctx.client.user ? message.mentions.users.has(ctx.client.user.id) : false;

  // 1) 正在等這個人貼菜單
  const pending = ctx.pending.take(message.channelId, message.author.id);
  if (pending) {
    await with_ack(message, () =>
      capture_menu(ctx, message, pending.restaurant_id, pending.restaurant_name, content, locale),
    );
    return;
  }

  // 2) 在揪團貼文裡：點餐、取消，都對不到才往下走
  const bundle = await load_session(ctx.pool, message.channelId);
  if (bundle) {
    const handled = await with_ack(message, () =>
      handle_session_message(ctx, message, bundle, content, locale, mentioned),
    );
    if (handled || !mentioned) {
      return;
    }
  }

  // 3) 被 @ 到：自然語言問答（貼文裡對不到菜單的閒聊也走這條）
  if (mentioned) {
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
      embeds: [notice_embed(t(locale, "error.parse_failed", { detail: content.slice(0, 80) }))],
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
