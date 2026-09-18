// /help（說明）、/website（網站）、/setup（設定）與餐廳名稱的自動完成。

import {
  ChannelType,
  MessageFlags,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";

import { set_forum_channel, set_notify_role } from "../../db/guilds.ts";
import { list_restaurants, search_restaurants } from "../../db/restaurants.ts";
import { branding } from "../branding.ts";
import type { BotContext } from "../context.ts";
import { help_embed, website_embed, website_rows } from "../embeds_help.ts";
import { t } from "../i18n.ts";
import { locale_of, reply_error, respond } from "../reply.ts";

export async function handle_help(interaction: ChatInputCommandInteraction): Promise<void> {
  const locale = locale_of(interaction);
  await respond(interaction, {
    embeds: [help_embed(locale)],
    components: website_rows(locale),
    flags: MessageFlags.Ephemeral,
  });
}

/** 把網站位址用連結按鈕交出去；沒設定 `PUBLIC_BASE_URL` 就照實說沒有。 */
export async function handle_website(interaction: ChatInputCommandInteraction): Promise<void> {
  const locale = locale_of(interaction);
  const { site_url } = branding();
  if (!site_url) {
    await reply_error(interaction, t(locale, "website.missing"));
    return;
  }
  await respond(interaction, {
    embeds: [website_embed(locale, site_url)],
    components: website_rows(locale),
  });
}

export async function handle_setup(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const locale = locale_of(interaction);
  const guild_id = interaction.guildId;
  if (!guild_id) {
    await reply_error(interaction, t(locale, "error.guild_only"));
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "forum") {
    const channel = interaction.options.getChannel("channel", true);
    if (channel.type !== ChannelType.GuildForum) {
      await reply_error(interaction, t(locale, "setup.not_forum", { channel: `<#${channel.id}>` }));
      return;
    }
    await set_forum_channel(ctx.pool, guild_id, channel.id, interaction.user.id);
    await respond(interaction, {
      content: t(locale, "setup.done", { channel: `<#${channel.id}>` }),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "role") {
    // 留空＝取消通知，不用另外做一支「清除」子指令。
    const role = interaction.options.getRole("role");
    await set_notify_role(ctx.pool, guild_id, role?.id ?? "", interaction.user.id);
    await respond(interaction, {
      content: role
        ? t(locale, "setup.role_done", { role: `<@&${role.id}>` })
        : t(locale, "setup.role_cleared"),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  }
}

/**
 * 餐廳名稱自動完成。回傳值是資料庫 id，處理器就不用再猜使用者指的是哪一間。
 * Discord 要求 3 秒內回覆，所以這裡只查一次、上限 25 筆。
 */
export async function handle_autocomplete(
  ctx: BotContext,
  interaction: AutocompleteInteraction,
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "restaurant") {
    await interaction.respond([]);
    return;
  }

  const keyword = String(focused.value ?? "").trim();
  const restaurants = keyword
    ? await search_restaurants(ctx.pool, keyword, 25)
    : await list_restaurants(ctx.pool, 25);

  await interaction.respond(
    restaurants.map((restaurant) => ({
      name: restaurant.name.slice(0, 100),
      value: String(restaurant.id),
    })),
  );
}
