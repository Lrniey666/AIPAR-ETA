// 揪團的共用流程：取得本場、加點、取消、重畫彙總、封單、結算。
// 斜線指令、按鈕與背景排程都呼叫這裡，幾條路徑的行為才不會走鐘。

import { type Client, type ThreadChannel } from "discord.js";

import { get_active_menu, list_menu_items } from "../db/menus.ts";
import {
  add_order_line,
  delete_user_lines,
  get_session_by_channel,
  list_order_lines,
  list_user_lines,
  set_session_status,
} from "../db/orders.ts";
import type { Db } from "../db/pool.ts";
import { get_restaurant } from "../db/restaurants.ts";
import type { MenuItem, OrderLine, OrderSession, Restaurant, SessionStatus } from "../db/types.ts";
import { upsert_user } from "../db/users.ts";
import { summarise_orders, type OrderSummary } from "../domain/ordering.ts";
import { settle_session, type SettlementResult } from "../domain/settlement.ts";
import type { ParsedPick } from "../llm/tasks/order_parse.ts";
import { create_logger } from "../shared/logger.ts";
import { format_cents } from "../shared/money.ts";
import { session_rows } from "./components_order.ts";
import { session_embed } from "./embeds.ts";
import { t, type Locale } from "./i18n.ts";

const log = create_logger("session");

const LOCK_PREFIX = "🔒 ";

export type SessionBundle = {
  session: OrderSession;
  restaurant: Restaurant;
  summary: OrderSummary;
};

/** 依頻道（論壇貼文）取出這場的完整狀態。 */
export async function load_session(pool: Db, channel_id: string): Promise<SessionBundle | undefined> {
  const session = await get_session_by_channel(pool, channel_id);
  if (!session) {
    return undefined;
  }
  const restaurant = await get_restaurant(pool, session.restaurant_id);
  if (!restaurant) {
    return undefined;
  }
  const lines = await list_order_lines(pool, session.id);
  return { session, restaurant, summary: summarise_orders(lines) };
}

export async function session_menu_items(pool: Db, session: OrderSession): Promise<MenuItem[]> {
  if (session.menu_id) {
    return list_menu_items(pool, session.menu_id);
  }
  const menu = await get_active_menu(pool, session.restaurant_id);
  return menu ? list_menu_items(pool, menu.id) : [];
}

/** 把選好的品項寫成點餐列；價格一律取自菜單，不吃輸入端給的數字。 */
export async function add_picks(
  pool: Db,
  session: OrderSession,
  user: { id: string; display_name: string },
  picks: ParsedPick[],
  source: "natural-language" | "component",
): Promise<string> {
  await upsert_user(pool, user.id, user.display_name);
  const parts: string[] = [];

  for (const pick of picks) {
    await add_order_line(pool, {
      session_id: session.id,
      discord_user_id: user.id,
      display_name: user.display_name,
      menu_item_id: pick.item.id,
      item_name: pick.item.name,
      unit_price_cents: pick.item.price_cents,
      quantity: pick.quantity,
      note: pick.note,
      source,
    });
    parts.push(`${pick.item.name} × ${pick.quantity}`);
  }
  return parts.join("、");
}

/** 取消自己的幾列點餐；回傳被刪掉的摘要，好照實回報刪了什麼。 */
export async function remove_lines(
  pool: Db,
  session: OrderSession,
  user_id: string,
  lines: OrderLine[],
): Promise<string> {
  const removed = await delete_user_lines(
    pool,
    session.id,
    user_id,
    lines.map((line) => line.id),
  );
  if (removed === 0) {
    return "";
  }
  return lines.map((line) => `${line.item_name} × ${line.quantity}`).join("、");
}

export async function own_lines(pool: Db, session_id: number, user_id: string): Promise<OrderLine[]> {
  return list_user_lines(pool, session_id, user_id);
}

/** 某人在這場的小計。 */
export function person_total_cents(summary: OrderSummary, user_id: string): number {
  return summary.people.find((person) => person.discord_user_id === user_id)?.total_cents ?? 0;
}

export function format_person_total(summary: OrderSummary, user_id: string): string {
  return format_cents(person_total_cents(summary, user_id));
}

/**
 * 重畫貼文裡那則彙總訊息。
 * 找不到訊息（被刪掉）就安靜略過——彙總不該讓點餐流程失敗。
 */
export async function refresh_summary_message(
  client: Client,
  pool: Db,
  session_id_or_channel: string,
  locale: Locale,
): Promise<void> {
  try {
    const bundle = await load_session(pool, session_id_or_channel);
    if (!bundle || !bundle.session.summary_msg_id) {
      return;
    }
    const channel = await client.channels.fetch(bundle.session.channel_id);
    if (!channel?.isThread()) {
      return;
    }
    const message = await (channel as ThreadChannel).messages.fetch(bundle.session.summary_msg_id);
    await message.edit({
      embeds: [session_embed(bundle.session, bundle.restaurant, bundle.summary, locale)],
      components: session_rows(bundle.session.id, bundle.session.status, locale),
    });
  } catch (error) {
    log.warn("更新彙總訊息失敗", {
      channel: session_id_or_channel,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function change_status(
  pool: Db,
  session: OrderSession,
  status: SessionStatus,
): Promise<OrderSession> {
  return (await set_session_status(pool, session.id, status)) ?? { ...session, status };
}

/** 封單時在貼文標題前加鎖頭，論壇列表一眼就看得出來哪幾場已經收單。 */
export async function mark_thread_locked(thread: ThreadChannel, locked: boolean): Promise<void> {
  const has_prefix = thread.name.startsWith(LOCK_PREFIX);
  if (locked && !has_prefix) {
    await thread.setName(`${LOCK_PREFIX}${thread.name}`.slice(0, 100)).catch(() => undefined);
  } else if (!locked && has_prefix) {
    await thread.setName(thread.name.slice(LOCK_PREFIX.length)).catch(() => undefined);
  }
}

/**
 * 封單的唯一入口：手動按鈕與排程自動封單都走這裡。
 *
 * 分成兩條路時，排程版只改了資料庫狀態、沒改標題也沒重畫彙總，
 * 於是「時間到了自動封單」和「有人按下封單」在貼文上看起來完全不一樣。
 */
export async function lock_session(
  client: Client,
  pool: Db,
  session: OrderSession,
  locale: Locale,
  notice?: string,
): Promise<void> {
  await change_status(pool, session, "locked");

  try {
    const channel = await client.channels.fetch(session.channel_id);
    if (channel?.isThread()) {
      const thread = channel as ThreadChannel;
      await mark_thread_locked(thread, true);
      if (notice) {
        await thread.send(notice).catch(() => undefined);
      }
    }
  } catch (error) {
    log.warn("封單時更新貼文失敗", {
      session: session.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  await refresh_summary_message(client, pool, session.channel_id, locale);
}

/** 封單並結算；回傳結果給呼叫端組訊息。 */
export async function lock_and_settle(
  pool: Db,
  bundle: SessionBundle,
  actor_id: string,
): Promise<SettlementResult> {
  const result = await settle_session(pool, bundle.session, bundle.summary, actor_id);
  await change_status(pool, bundle.session, "settled");
  return result;
}

export function settlement_text(result: SettlementResult, locale: Locale): string {
  const lines = [
    t(locale, "session.settled", {
      count: result.charged.length,
      amount: format_cents(result.total_cents),
    }),
  ];
  if (result.already_charged.length > 0) {
    lines.push(t(locale, "session.already_settled", { count: result.already_charged.length }));
  }
  if (result.collectable_cents > 0) {
    lines.push(
      t(locale, "session.collect", {
        payer: result.payer_user_id,
        amount: format_cents(result.collectable_cents),
      }),
    );
  }
  return lines.join("\n");
}
