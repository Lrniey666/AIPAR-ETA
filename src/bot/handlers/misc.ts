// /help（說明）、/setup（設定）與餐廳名稱的自動完成。

import {
  ChannelType,
  MessageFlags,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";

import { set_forum_channel } from "../../db/guilds.ts";
import { list_restaurants, search_restaurants } from "../../db/restaurants.ts";
import type { BotContext } from "../context.ts";
import { COLOUR } from "../embeds.ts";
import { EmbedBuilder } from "discord.js";
import { t } from "../i18n.ts";
import { locale_of, reply_error, respond } from "../reply.ts";

export async function handle_help(interaction: ChatInputCommandInteraction): Promise<void> {
  const locale = locale_of(interaction);
  const embed = new EmbedBuilder()
    .setColor(COLOUR.primary)
    .setTitle(t(locale, "help.title"))
    .setDescription(t(locale, "help.body"))
    .setFooter({ text: t(locale, "help.footer") });

  await respond(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
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

  if (interaction.options.getSubcommand() !== "forum") {
    return;
  }

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
