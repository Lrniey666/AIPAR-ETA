// 菜單相關的元件互動：草稿確認／取消、菜單翻頁、版本切換、餐廳下拉。
// 揪團的元件在 components.ts；拆開是因為兩邊依賴的模組幾乎不重疊。

import type { MessageComponentInteraction } from "discord.js";

import { get_active_menu, get_menu, list_menu_items } from "../../db/menus.ts";
import { get_restaurant } from "../../db/restaurants.ts";
import { menu_page_row } from "../components.ts";
import type { BotContext } from "../context.ts";
import { menu_embed } from "../embeds.ts";
import { t, type Locale } from "../i18n.ts";
import { cancel_draft, confirm_draft } from "../menu_flow.ts";
import { reply_error } from "../reply.ts";

export async function handle_draft_component(
  ctx: BotContext,
  interaction: MessageComponentInteraction,
  action: string,
  args: string[],
  locale: Locale,
): Promise<void> {
  const menu_id = Number(args[0]);
  if (!Number.isInteger(menu_id)) {
    await interaction.deferUpdate();
    return;
  }

  if (action === "confirm") {
    const result = await confirm_draft(ctx.pool, menu_id, locale);
    if (!result) {
      await reply_error(interaction, t(locale, "error.generic", { detail: `menu ${menu_id}` }));
      return;
    }
    await interaction.update({ content: result.text, embeds: [], components: [] });
    return;
  }

  if (action === "cancel") {
    await cancel_draft(ctx.pool, menu_id);
    await interaction.update({ content: t(locale, "common.cancelled"), embeds: [], components: [] });
    return;
  }
  await interaction.deferUpdate();
}

export async function handle_menu_component(
  ctx: BotContext,
  interaction: MessageComponentInteraction,
  action: string,
  args: string[],
  locale: Locale,
): Promise<void> {
  if (action === "page") {
    const menu_id = Number(args[0]);
    const page = Number(args[1] ?? 0);
    const menu = await get_menu(ctx.pool, menu_id);
    const restaurant = menu ? await get_restaurant(ctx.pool, menu.restaurant_id) : undefined;
    if (!menu || !restaurant) {
      await interaction.deferUpdate();
      return;
    }
    const items = await list_menu_items(ctx.pool, menu.id);
    const { embed, pages } = menu_embed(restaurant, menu, items, locale, page);
    await interaction.update({
      embeds: [embed],
      components: pages > 1 ? [menu_page_row(menu.id, page, pages, locale)] : [],
    });
    return;
  }

  if (action === "activate" && interaction.isStringSelectMenu()) {
    const menu_id = Number(interaction.values[0]);
    const result = await confirm_draft(ctx.pool, menu_id, locale);
    const menu = await get_menu(ctx.pool, menu_id);
    await interaction.update({
      content: result?.text ?? t(locale, "menu.activated", { version: menu?.version ?? "?" }),
      embeds: [],
      components: [],
    });
    return;
  }
  await interaction.deferUpdate();
}

export async function handle_restaurant_component(
  ctx: BotContext,
  interaction: MessageComponentInteraction,
  locale: Locale,
): Promise<void> {
  if (!interaction.isStringSelectMenu()) {
    await interaction.deferUpdate();
    return;
  }
  const restaurant = await get_restaurant(ctx.pool, Number(interaction.values[0]));
  if (!restaurant) {
    await interaction.deferUpdate();
    return;
  }
  const menu = await get_active_menu(ctx.pool, restaurant.id);
  if (!menu) {
    await interaction.update({
      content: t(locale, "error.menu_missing", { name: restaurant.name }),
      embeds: [],
      components: [],
    });
    return;
  }
  const items = await list_menu_items(ctx.pool, menu.id);
  const { embed, pages } = menu_embed(restaurant, menu, items, locale, 0);
  await interaction.update({
    content: null,
    embeds: [embed],
    components: pages > 1 ? [menu_page_row(menu.id, 0, pages, locale)] : [],
  });
}
