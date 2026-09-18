// 揪團貼文裡的自然語言：點餐與取消。
//
// 貼文裡本來就會有閒聊，所以對不到菜單時預設安靜——只有被 @ 到才回話。
// 取消是破壞性動作，規則對不到就請使用者講清楚，不交給模型猜。

import type { Message, OmitPartialGroupDMChannel } from "discord.js";

import { parse_order } from "../../llm/tasks/order_parse.ts";
import { is_cancel_request, plan_cancellation } from "../../llm/tasks/order_cancel.ts";
import { clear_user_lines } from "../../db/orders.ts";
import { status_label } from "../embeds.ts";
import type { BotContext } from "../context.ts";
import { t, type Locale } from "../i18n.ts";
import {
  add_picks,
  format_person_total,
  load_session,
  own_lines,
  refresh_summary_message,
  remove_lines,
  session_menu_items,
  type SessionBundle,
} from "../session_flow.ts";

type AnyMessage = OmitPartialGroupDMChannel<Message<boolean>>;

function speaker(message: AnyMessage): { id: string; display_name: string } {
  return {
    id: message.author.id,
    display_name: message.member?.displayName ?? message.author.displayName ?? message.author.username,
  };
}

async function say(message: AnyMessage, content: string): Promise<void> {
  await message.reply({ content, allowedMentions: { repliedUser: false } });
}

/**
 * 貼文裡的一句話。回傳 true 代表已經處理掉了，呼叫端不用再往下走。
 *
 * 對不到菜單就回 false：沒被 @ 到的話那多半只是同事在聊天，安靜略過；
 * 被 @ 到的話由上層轉給自然語言問答，讓 bot 接一句話再把話題帶回點餐，
 * 而不是丟一句「看不懂這段內容」把對話堵死。
 */
export async function handle_session_message(
  ctx: BotContext,
  message: AnyMessage,
  bundle: SessionBundle,
  content: string,
  locale: Locale,
  mentioned: boolean,
): Promise<boolean> {
  if (bundle.session.status !== "open") {
    if (mentioned) {
      await say(
        message,
        t(locale, "error.session_closed", { status: status_label(bundle.session.status, locale) }),
      );
    }
    return mentioned;
  }

  if (is_cancel_request(content)) {
    return cancel_from_message(ctx, message, bundle, content, locale);
  }
  return order_from_message(ctx, message, bundle, content, locale);
}

async function order_from_message(
  ctx: BotContext,
  message: AnyMessage,
  bundle: SessionBundle,
  content: string,
  locale: Locale,
): Promise<boolean> {
  const items = await session_menu_items(ctx.pool, bundle.session);
  const outcome = await parse_order(ctx.gateway, content, items);

  if (outcome.picks.length === 0) {
    return false;
  }

  const summary_text = await add_picks(
    ctx.pool,
    bundle.session,
    speaker(message),
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

  await say(message, lines.join("\n"));
  await refresh_summary_message(ctx.client, ctx.pool, message.channelId, locale);
  return true;
}

async function cancel_from_message(
  ctx: BotContext,
  message: AnyMessage,
  bundle: SessionBundle,
  content: string,
  locale: Locale,
): Promise<boolean> {
  const lines = await own_lines(ctx.pool, bundle.session.id, message.author.id);
  if (lines.length === 0) {
    await say(message, t(locale, "session.nothing_to_clear"));
    return true;
  }

  const plan = plan_cancellation(content, lines);

  if (plan.mode === "all") {
    const removed = await clear_user_lines(ctx.pool, bundle.session.id, message.author.id);
    await say(message, t(locale, "session.cleared", { count: removed }));
    await refresh_summary_message(ctx.client, ctx.pool, message.channelId, locale);
    return true;
  }

  if (plan.mode === "lines") {
    const summary = await remove_lines(ctx.pool, bundle.session, message.author.id, plan.lines);
    await say(
      message,
      summary ? t(locale, "session.removed", { summary }) : t(locale, "session.nothing_to_clear"),
    );
    await refresh_summary_message(ctx.client, ctx.pool, message.channelId, locale);
    return true;
  }

  // 講不清楚要取消哪一項時，寧可多問一句，也不要刪錯東西。
  await say(message, t(locale, "session.cancel_ambiguous"));
  return true;
}
