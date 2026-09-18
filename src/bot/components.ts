// 互動元件與 custom id 的編解碼。
// PLAN 要求盡量用 Embed ＋ 按鈕／下拉，避免 Modal，所有操作都收斂在這裡。

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";

import { format_cents } from "../shared/money.ts";
import type { MenuItem, Restaurant, SessionStatus } from "../db/types.ts";
import { t, type Locale } from "./i18n.ts";

/** custom id 的格式：scope:action:參數…（Discord 上限 100 字元）。 */
export type CustomId = {
  scope: string;
  action: string;
  args: string[];
};

export function encode_id(scope: string, action: string, ...args: (string | number)[]): string {
  return [scope, action, ...args.map(String)].join(":").slice(0, 100);
}

export function decode_id(custom_id: string): CustomId {
  const [scope = "", action = "", ...args] = custom_id.split(":");
  return { scope, action, args };
}

export const SELECT_PAGE_SIZE = 25;

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

/** 品項下拉選單。超過 25 項就分頁，另外掛一列換頁按鈕。 */
export function item_select_rows(
  session_id: number,
  items: MenuItem[],
  page: number,
  locale: Locale,
): ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] {
  const pages = Math.max(1, Math.ceil(items.length / SELECT_PAGE_SIZE));
  const current = Math.min(Math.max(page, 0), pages - 1);
  const slice = items.slice(current * SELECT_PAGE_SIZE, (current + 1) * SELECT_PAGE_SIZE);

  const select = new StringSelectMenuBuilder()
    .setCustomId(encode_id("session", "add", session_id, current))
    .setPlaceholder(t(locale, "session.pick_placeholder"))
    .setMinValues(1)
    .setMaxValues(Math.max(1, Math.min(slice.length, 10)))
    .addOptions(
      slice.map((item) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(clamp(item.name, 100))
          .setValue(String(item.id))
          .setDescription(clamp(`${format_cents(item.price_cents)}${item.note ? ` · ${item.note}` : ""}`, 100)),
      ),
    );

  const rows: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
  ];

  if (pages > 1) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(encode_id("session", "page", session_id, current - 1))
          .setLabel("◀")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(current === 0),
        new ButtonBuilder()
          .setCustomId(encode_id("session", "noop", session_id))
          .setLabel(t(locale, "common.page", { page: current + 1, pages }))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(encode_id("session", "page", session_id, current + 1))
          .setLabel("▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(current >= pages - 1),
      ),
    );
  }
  return rows;
}

/** 菜單草稿的確認／取消。寫進資料庫前一定要有人按下去。 */
export function draft_rows(menu_id: number, locale: Locale): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(encode_id("draft", "confirm", menu_id))
        .setLabel(t(locale, "common.confirm"))
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(encode_id("draft", "cancel", menu_id))
        .setLabel(t(locale, "common.cancel"))
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

/** 沒指定餐廳時，用下拉讓使用者選。 */
export function restaurant_select_row(
  restaurants: Restaurant[],
  action: string,
  locale: Locale,
): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(encode_id("restaurant", action))
      .setPlaceholder(t(locale, "menu.pick_restaurant"))
      .addOptions(
        restaurants.slice(0, SELECT_PAGE_SIZE).map((restaurant) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(clamp(restaurant.name, 100))
            .setValue(String(restaurant.id))
            .setDescription(clamp(restaurant.address || restaurant.note || " ", 100)),
        ),
      ),
  );
}

/** 菜單翻頁列。 */
export function menu_page_row(menu_id: number, page: number, pages: number, locale: Locale) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(encode_id("menu", "page", menu_id, page - 1))
      .setLabel("◀")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(encode_id("menu", "noop", menu_id))
      .setLabel(t(locale, "common.page", { page: page + 1, pages }))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(encode_id("menu", "page", menu_id, page + 1))
      .setLabel("▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pages - 1),
  );
}

function clamp(value: string, max: number): string {
  const text = value.trim() || " ";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
