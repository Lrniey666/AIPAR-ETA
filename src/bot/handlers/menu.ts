// /menu（菜單）：查看、圖片辨識、人工輸入、版本切換。

import {
  ActionRowBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import { count_items_by_menu, get_active_menu, list_menu_items, list_menu_versions } from "../../db/menus.ts";
import { record_menu_upload } from "../../db/observability.ts";
import { list_restaurants } from "../../db/restaurants.ts";
import type { Restaurant } from "../../db/types.ts";
import { parse_menu_text } from "../../domain/menu_draft.ts";
import { extract_menu_from_image, extract_menu_from_text } from "../../llm/tasks/menu_extract.ts";
import { format_date } from "../../shared/time.ts";
import { encode_id, menu_page_row, restaurant_select_row } from "../components.ts";
import type { BotContext } from "../context.ts";
import { menu_embed, notice_embed } from "../embeds.ts";
import { t, type Locale } from "../i18n.ts";
import { present_draft, skipped_note } from "../menu_flow.ts";
import { locale_of, reply_error, resolve_restaurant, respond } from "../reply.ts";

const MENU_STATUS_KEY = {
  draft: "menu.status_draft",
  active: "menu.status_active",
  archived: "menu.status_archived",
} as const;

export async function handle_menu(ctx: BotContext, interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub === "show") {
    await show_menu(ctx, interaction);
    return;
  }
  if (sub === "upload") {
    await upload_menu(ctx, interaction);
    return;
  }
  if (sub === "input") {
    await input_menu(ctx, interaction);
    return;
  }
  if (sub === "version") {
    await list_versions(ctx, interaction);
  }
}

async function show_menu(ctx: BotContext, interaction: ChatInputCommandInteraction): Promise<void> {
  const locale = locale_of(interaction);
  const raw = interaction.options.getString("restaurant");

  if (!raw) {
    const restaurants = await list_restaurants(ctx.pool, 25);
    if (restaurants.length === 0) {
      await reply_error(interaction, t(locale, "restaurant.list_empty"));
      return;
    }
    await respond(interaction, {
      embeds: [notice_embed(t(locale, "menu.pick_restaurant"))],
      components: [restaurant_select_row(restaurants, "show", locale)],
    });
    return;
  }

  const restaurant = await resolve_restaurant(ctx.pool, raw);
  if (!restaurant) {
    await reply_error(interaction, t(locale, "error.restaurant_missing", { name: raw }));
    return;
  }
  await send_menu(ctx, interaction, restaurant, locale);
}

/** 顯示某間餐廳目前上線的菜單；沒有就提示去建檔。 */
export async function send_menu(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
  restaurant: Restaurant,
  locale: Locale,
): Promise<void> {
  const menu = await get_active_menu(ctx.pool, restaurant.id);
  if (!menu) {
    await reply_error(interaction, t(locale, "error.menu_missing", { name: restaurant.name }));
    return;
  }
  const items = await list_menu_items(ctx.pool, menu.id);
  const { embed, pages } = menu_embed(restaurant, menu, items, locale, 0);
  await respond(interaction, {
    embeds: [embed],
    components: pages > 1 ? [menu_page_row(menu.id, 0, pages, locale)] : [],
  });
}

async function upload_menu(ctx: BotContext, interaction: ChatInputCommandInteraction): Promise<void> {
  const locale = locale_of(interaction);
  const raw = interaction.options.getString("restaurant", true);
  const attachment = interaction.options.getAttachment("image", true);

  const restaurant = await resolve_restaurant(ctx.pool, raw);
  if (!restaurant) {
    await reply_error(interaction, t(locale, "error.restaurant_missing", { name: raw }));
    return;
  }
  if (!ctx.gateway.has_vision()) {
    await reply_error(interaction, t(locale, "error.vision_unavailable"));
    return;
  }

  // 辨識要好幾秒，先 defer 佔住互動，這就是斜線指令版的 ack。
  await interaction.deferReply();
  await interaction.editReply({ embeds: [notice_embed(t(locale, "menu.reading_image"))] });

  try {
    const extraction = await extract_menu_from_image(ctx.gateway, attachment.url);
    const upload_id = await record_menu_upload(ctx.pool, {
      restaurant_id: restaurant.id,
      source_url: attachment.url,
      provider: extraction.provider,
      model: extraction.model,
      status: "parsed",
      raw_response: { title: extraction.title, notes: extraction.notes, items: extraction.items },
      created_by: interaction.user.id,
    });

    const draft = await present_draft(ctx.pool, {
      restaurant_id: restaurant.id,
      restaurant_name: restaurant.name,
      items: extraction.items,
      source: "vision",
      source_note: t(locale, "menu.source_vision", { model: `${extraction.provider}/${extraction.model}` }),
      created_by: interaction.user.id,
      locale,
      upload_id,
    });

    await interaction.editReply({ embeds: [draft.embed], components: draft.components });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await record_menu_upload(ctx.pool, {
      restaurant_id: restaurant.id,
      source_url: attachment.url,
      status: "failed",
      error: detail,
      created_by: interaction.user.id,
    });
    await reply_error(interaction, t(locale, "error.parse_failed", { detail: detail.slice(0, 200) }));
  }
}

async function input_menu(ctx: BotContext, interaction: ChatInputCommandInteraction): Promise<void> {
  const locale = locale_of(interaction);
  const raw = interaction.options.getString("restaurant", true);
  const text = interaction.options.getString("text");

  const restaurant = await resolve_restaurant(ctx.pool, raw);
  if (!restaurant) {
    await reply_error(interaction, t(locale, "error.restaurant_missing", { name: raw }));
    return;
  }

  // 沒帶內容就轉成「等你貼一則訊息」——避開 Modal，也讓使用者能貼多行。
  if (!text) {
    ctx.pending.set({
      kind: "menu-text",
      restaurant_id: restaurant.id,
      restaurant_name: restaurant.name,
      user_id: interaction.user.id,
      channel_id: interaction.channelId,
    });
    await respond(interaction, {
      embeds: [notice_embed(t(locale, "menu.capture_prompt"))],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();
  await present_text_draft(ctx, interaction, restaurant, text, locale);
}

/** 文字轉草稿：規則優先，解析不出東西才動用 LLM。 */
export async function present_text_draft(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
  restaurant: Restaurant,
  text: string,
  locale: Locale,
): Promise<void> {
  const normalised = text.replace(/[；;]/g, "\n");
  const by_rules = parse_menu_text(normalised);

  let items = by_rules.items;
  let source_note = t(locale, "menu.source_manual");
  let skipped = by_rules.skipped;

  if (items.length === 0 && ctx.gateway.has_text()) {
    try {
      const extraction = await extract_menu_from_text(ctx.gateway, normalised);
      items = extraction.items;
      source_note = t(locale, "menu.source_vision", {
        model: `${extraction.provider}/${extraction.model}`,
      });
      skipped = [];
    } catch {
      // 模型也讀不出來，照規則版的結果回報。
    }
  }

  if (items.length === 0) {
    await reply_error(
      interaction,
      t(locale, "error.parse_failed", { detail: skipped.slice(0, 2).join(" / ") || text.slice(0, 60) }),
    );
    return;
  }

  const draft = await present_draft(ctx.pool, {
    restaurant_id: restaurant.id,
    restaurant_name: restaurant.name,
    items,
    source: "manual",
    source_note,
    created_by: interaction.user.id,
    locale,
  });

  const note = skipped_note(skipped, locale);
  await respond(interaction, {
    content: note,
    embeds: [draft.embed],
    components: draft.components,
  });
}

async function list_versions(ctx: BotContext, interaction: ChatInputCommandInteraction): Promise<void> {
  const locale = locale_of(interaction);
  const raw = interaction.options.getString("restaurant", true);
  const restaurant = await resolve_restaurant(ctx.pool, raw);
  if (!restaurant) {
    await reply_error(interaction, t(locale, "error.restaurant_missing", { name: raw }));
    return;
  }

  const versions = await list_menu_versions(ctx.pool, restaurant.id, 20);
  if (versions.length === 0) {
    await reply_error(interaction, t(locale, "error.menu_missing", { name: restaurant.name }));
    return;
  }
  const counts = await count_items_by_menu(ctx.pool, versions.map((menu) => menu.id));

  const rows = versions.map((menu) =>
    t(locale, "menu.version_row", {
      version: menu.version,
      status: t(locale, MENU_STATUS_KEY[menu.status]),
      count: counts.get(menu.id) ?? 0,
      date: format_date(menu.created_at),
    }),
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId(encode_id("menu", "activate", restaurant.id))
    .setPlaceholder(t(locale, "menu.versions_title", { name: restaurant.name }))
    .addOptions(
      versions.slice(0, 25).map((menu, index) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`v${menu.version}`)
          .setValue(String(menu.id))
          .setDescription((rows[index] ?? "").slice(0, 100)),
      ),
    );

  await respond(interaction, {
    embeds: [
      notice_embed(
        `**${t(locale, "menu.versions_title", { name: restaurant.name })}**\n${rows.join("\n")}`,
      ),
    ],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  });
}
