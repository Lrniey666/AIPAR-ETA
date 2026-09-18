// 自然語言互動會用到的 Embed：餐廳清單（含菜單狀態）與記憶。
//
// 餐廳清單一定要把「尚無菜單」印出來。只列店名的話，使用者會以為 bot 知道那家賣什麼，
// 而模型看到只有店名的清單時也會自己補菜色——0.3.0 修的那個幻覺就是這樣來的。

import { EmbedBuilder } from "discord.js";

import type { ItemHit } from "../db/menus.ts";
import type { MemoryFact } from "../db/memory.ts";
import type { RestaurantFact } from "../domain/grounding.ts";
import type { Candidate } from "../domain/recommend.ts";
import { format_cents } from "../shared/money.ts";
import { format_datetime } from "../shared/time.ts";
import { brand_author, brand_footer, COLOUR } from "./branding.ts";
import { truncate_field } from "./embeds.ts";
import { t, type Locale } from "./i18n.ts";

const SCOPE_KEY = {
  user: "memory.scope_user",
  channel: "memory.scope_channel",
  guild: "memory.scope_guild",
} as const;

/** 目前建檔的餐廳，每一間都標明有沒有菜單。 */
export function restaurant_status_embed(facts: RestaurantFact[], locale: Locale): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLOUR.primary)
    .setAuthor(brand_author(t(locale, "chat.restaurants_title")));

  if (facts.length === 0) {
    return embed.setDescription(t(locale, "chat.no_restaurants"));
  }

  const lines = facts.map((fact) => {
    const alias =
      fact.restaurant.aliases.length > 0 ? `（${fact.restaurant.aliases.join("、")}）` : "";
    const state =
      fact.menu_version === undefined
        ? t(locale, "chat.menu_state_none")
        : t(locale, "chat.menu_state_have", {
            version: fact.menu_version,
            count: fact.item_count,
          });
    const mark = fact.menu_version === undefined ? "▫️" : "▪️";
    return `${mark} **${fact.restaurant.name}**${alias} — ${state}`;
  });

  return embed
    .setDescription(truncate_field(lines.join("\n"), 4000))
    .setFooter(brand_footer(t(locale, "menu.pick_restaurant")));
}

/**
 * 某道菜在哪幾家有。每一行都來自 `menu_items`，
 * 所以這裡列出的品項與價格一定在資料庫裡真的存在。
 */
export function dish_hits_embed(dish: string, hits: ItemHit[], locale: Locale) {
  const grouped = new Map<string, ItemHit[]>();
  for (const hit of hits) {
    const bucket = grouped.get(hit.restaurant_name) ?? [];
    bucket.push(hit);
    grouped.set(hit.restaurant_name, bucket);
  }

  const body = [...grouped.entries()].map(([name, items]) => {
    const lines = items.map((item) => {
      const sold_out = item.is_available ? "" : "（停售）";
      const note = item.note ? `　*${item.note}*` : "";
      return `　• ${item.item_name} — ${format_cents(item.price_cents)}${sold_out}${note}`;
    });
    return `**${name}**\n${lines.join("\n")}`;
  });

  return new EmbedBuilder()
    .setColor(COLOUR.primary)
    .setAuthor(brand_author(t(locale, "chat.dish_found", { dish })))
    .setDescription(truncate_field(body.join("\n\n"), 4000));
}

/**
 * 推薦。每一樣都是從 `menu_items` 抽出來的，所以品名與價格一定查得到出處。
 * 模型完全不參與這一段——推薦最容易編，也最不該編。
 */
export function recommend_embed(picks: Candidate[], locale: Locale): EmbedBuilder {
  const lines = picks.map((pick) => {
    const note = pick.note ? `　*${pick.note}*` : "";
    return `• **${pick.item_name}** — ${format_cents(pick.price_cents)}${note}\n　　${pick.restaurant_name}`;
  });

  return new EmbedBuilder()
    .setColor(COLOUR.primary)
    .setAuthor(brand_author(t(locale, "chat.recommend_title")))
    .setDescription(
      `${t(locale, "chat.recommend_intro")}\n\n${truncate_field(lines.join("\n"), 3800)}`,
    )
    .setFooter(brand_footer(t(locale, "chat.recommend_again")));
}

/** `/記憶 我的` 與「你有記憶功能嗎」共用的 Embed。 */
export function memory_embed(
  facts: MemoryFact[],
  turn_count: number,
  locale: Locale,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLOUR.info)
    .setAuthor(brand_author(t(locale, "memory.title")))
    .setDescription(t(locale, "memory.status", { turns: turn_count, facts: facts.length }))
    .setFooter(brand_footer(t(locale, "memory.privacy")));

  if (facts.length === 0) {
    embed.addFields({ name: t(locale, "memory.scope_user"), value: t(locale, "memory.none") });
    return embed;
  }

  // 依範圍分組：使用者要分得出哪些是關於自己、哪些是整個頻道共用的。
  for (const scope of ["user", "channel", "guild"] as const) {
    const bucket = facts.filter((fact) => fact.scope === scope);
    if (bucket.length === 0) {
      continue;
    }
    embed.addFields({
      name: t(locale, SCOPE_KEY[scope]),
      value: truncate_field(
        bucket
          .map((fact) => `• ${fact.fact_value}　\`${format_datetime(fact.updated_at)}\``)
          .join("\n"),
      ),
    });
  }
  return embed;
}
