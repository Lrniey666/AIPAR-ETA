// /restaurant（餐廳）：建檔、列表、查單一間。

import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";

import { get_active_menu, list_menu_items } from "../../db/menus.ts";
import type { Db } from "../../db/pool.ts";
import {
  create_restaurant,
  list_restaurants,
  search_restaurants,
} from "../../db/restaurants.ts";
import { restaurant_embed, restaurant_list_embed } from "../embeds.ts";
import { t } from "../i18n.ts";
import { locale_of, reply_error, resolve_restaurant, respond } from "../reply.ts";

export async function handle_restaurant(
  pool: Db,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const locale = locale_of(interaction);
  const sub = interaction.options.getSubcommand();

  if (sub === "add") {
    const name = interaction.options.getString("name", true).trim();
    const aliases = (interaction.options.getString("alias") ?? "")
      .split(/[,，、]/)
      .map((value) => value.trim())
      .filter(Boolean);

    const restaurant = await create_restaurant(pool, {
      name,
      aliases,
      phone: interaction.options.getString("phone") ?? "",
      address: interaction.options.getString("address") ?? "",
      note: interaction.options.getString("note") ?? "",
      created_by: interaction.user.id,
    });

    await respond(interaction, {
      content: t(locale, "restaurant.added", { name: restaurant.name }),
      embeds: [restaurant_embed(restaurant, undefined, 0, locale)],
    });
    return;
  }

  if (sub === "list") {
    const keyword = interaction.options.getString("keyword") ?? "";
    const restaurants = keyword
      ? await search_restaurants(pool, keyword, 25)
      : await list_restaurants(pool, 25);
    await respond(interaction, { embeds: [restaurant_list_embed(restaurants, locale)] });
    return;
  }

  if (sub === "info") {
    const raw = interaction.options.getString("restaurant", true);
    const restaurant = await resolve_restaurant(pool, raw);
    if (!restaurant) {
      await reply_error(interaction, t(locale, "error.restaurant_missing", { name: raw }));
      return;
    }
    const menu = await get_active_menu(pool, restaurant.id);
    const items = menu ? await list_menu_items(pool, menu.id) : [];
    await respond(interaction, {
      embeds: [restaurant_embed(restaurant, menu, items.length, locale)],
    });
    return;
  }

  await respond(interaction, {
    content: t(locale, "error.generic", { detail: sub }),
    flags: MessageFlags.Ephemeral,
  });
}
