// 互動元件與 custom id 的編解碼。
// PLAN 要求盡量用 Embed ＋ 按鈕／下拉，避免 Modal，所有操作都收斂在這裡。
//
// 揪團的點餐、清除面板在 `components_order.ts`；這裡留 id 編解碼、菜單與餐廳的元件。

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";

import type { Restaurant } from "../db/types.ts";
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

/** 選項的標籤與說明有長度上限，超過就截斷並補上刪節號。 */
export function clamp_label(value: string, max: number): string {
  const text = value.trim() || " ";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
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
            .setLabel(clamp_label(restaurant.name, 100))
            .setValue(String(restaurant.id))
            .setDescription(clamp_label(restaurant.address || restaurant.note || " ", 100)),
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

/** 連到校內網站的按鈕。沒設定 `PUBLIC_BASE_URL` 時呼叫端不會用到這一列。 */
export function link_row(url: string, label: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(label).setEmoji("🌐"),
  );
}
