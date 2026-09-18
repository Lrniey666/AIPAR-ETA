// 揪團貼文的按鈕與下拉。
//
// 從 `components.ts` 拆出來的原因是點餐面板長出了數量選擇與逐項清除，
// 再塞回原檔會超過單檔 300 行的警戒線（.cursorrules §File Size & Structure）。
//
// 面板設計（PLAN §Discord bot互動設計：Embed ＋ 按鈕／下拉，不要 Modal）：
//   點餐面板  [每項數量 ▾] [品項 ▾（可複選）] [◀ 第 n／m 頁 ▶]
//   清除面板  [要清掉哪幾筆 ▾（可複選）] [全部清除]
// 數量選在品項之前，且數量被編進品項下拉的 custom id——
// Discord 的多個下拉彼此不共享狀態，把數量寫進 id 是唯一不必另建暫存的作法。

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";

import type { MenuItem, OrderLine, SessionStatus } from "../db/types.ts";
import { format_cents } from "../shared/money.ts";
import { clamp_label, encode_id, SELECT_PAGE_SIZE } from "./components.ts";
import { t, type Locale } from "./i18n.ts";

export const MAX_PICK_QUANTITY = 10;
/** 下拉一次最多選幾個品項；Discord 上限 25，但選太多會看不清楚。 */
const MAX_PICK_ITEMS = 10;

export type OrderRow = ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>;

/** 揪團貼文底下的操作列。狀態不同，按鈕也不同。 */
export function session_rows(
  session_id: number,
  status: SessionStatus,
  locale: Locale,
): ActionRowBuilder<ButtonBuilder>[] {
  const open = status === "open";
  const primary = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(encode_id("session", "pick", session_id))
      .setLabel(t(locale, "session.button_order"))
      .setEmoji("🍱")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!open),
    new ButtonBuilder()
      .setCustomId(encode_id("session", "mine", session_id))
      .setLabel(t(locale, "session.button_mine"))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(encode_id("session", "clear", session_id))
      .setLabel(t(locale, "session.button_clear"))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!open),
  );

  const admin = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(encode_id("session", "refresh", session_id))
      .setLabel(t(locale, "session.button_refresh"))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(encode_id("session", "lock", session_id))
      .setLabel(t(locale, "session.button_lock"))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!open),
    new ButtonBuilder()
      .setCustomId(encode_id("session", "settle", session_id))
      .setLabel(t(locale, "session.button_settle"))
      .setEmoji("🧾")
      .setStyle(ButtonStyle.Success)
      .setDisabled(status === "settled" || status === "cancelled"),
  );

  return [primary, admin];
}

/**
 * 點餐面板。`quantity` 會被編進品項下拉的 custom id，
 * 使用者改數量時整個面板重畫一次，下一次選品項就帶著新的數量送回來。
 */
export function order_panel_rows(
  session_id: number,
  items: MenuItem[],
  page: number,
  quantity: number,
  locale: Locale,
): OrderRow[] {
  const pages = Math.max(1, Math.ceil(items.length / SELECT_PAGE_SIZE));
  const current_page = Math.min(Math.max(page, 0), pages - 1);
  const current_quantity = clamp_pick_quantity(quantity);
  const slice = items.slice(current_page * SELECT_PAGE_SIZE, (current_page + 1) * SELECT_PAGE_SIZE);

  const quantity_select = new StringSelectMenuBuilder()
    .setCustomId(encode_id("session", "qty", session_id, current_page))
    .setPlaceholder(t(locale, "session.quantity_placeholder", { quantity: current_quantity }))
    .addOptions(
      Array.from({ length: MAX_PICK_QUANTITY }, (_unused, index) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(t(locale, "session.quantity_option", { quantity: index + 1 }))
          .setValue(String(index + 1))
          .setDefault(index + 1 === current_quantity),
      ),
    );

  const item_select = new StringSelectMenuBuilder()
    .setCustomId(encode_id("session", "add", session_id, current_page, current_quantity))
    .setPlaceholder(t(locale, "session.pick_placeholder"))
    .setMinValues(1)
    .setMaxValues(Math.max(1, Math.min(slice.length, MAX_PICK_ITEMS)))
    .addOptions(
      slice.map((item) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(clamp_label(item.name, 100))
          .setValue(String(item.id))
          .setDescription(
            clamp_label(`${format_cents(item.price_cents)}${item.note ? ` · ${item.note}` : ""}`, 100),
          ),
      ),
    );

  const rows: OrderRow[] = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(quantity_select),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(item_select),
  ];

  if (pages > 1) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(encode_id("session", "page", session_id, current_page - 1, current_quantity))
          .setLabel("◀")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(current_page === 0),
        new ButtonBuilder()
          .setCustomId(encode_id("session", "noop", session_id))
          .setLabel(t(locale, "common.page", { page: current_page + 1, pages }))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(encode_id("session", "page", session_id, current_page + 1, current_quantity))
          .setLabel("▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(current_page >= pages - 1),
      ),
    );
  }
  return rows;
}

/**
 * 清除面板：先挑要清掉哪幾筆，真的要全清才按第二排的按鈕。
 * 舊版只有「清除我的」一鍵全清，想少點一杯只能全清重點。
 */
export function clear_panel_rows(session_id: number, lines: OrderLine[], locale: Locale): OrderRow[] {
  const slice = lines.slice(0, SELECT_PAGE_SIZE);
  const select = new StringSelectMenuBuilder()
    .setCustomId(encode_id("session", "remove", session_id))
    .setPlaceholder(t(locale, "session.clear_placeholder"))
    .setMinValues(1)
    .setMaxValues(Math.max(1, slice.length))
    .addOptions(
      slice.map((line) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(clamp_label(`${line.item_name} × ${line.quantity}`, 100))
          .setValue(String(line.id))
          .setDescription(
            clamp_label(
              `${format_cents(line.unit_price_cents * line.quantity)}${line.note ? ` · ${line.note}` : ""}`,
              100,
            ),
          ),
      ),
    );

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(encode_id("session", "clearall", session_id))
        .setLabel(t(locale, "session.button_clear_all"))
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

export function clamp_pick_quantity(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }
  return Math.min(Math.trunc(value), MAX_PICK_QUANTITY);
}
