// 互動回覆的共用工具：語言判定、錯誤回覆、餐廳解析。
// 所有處理器都走這裡，回覆行為（ephemeral 與否、錯誤格式）才會一致。

import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  type MessageComponentInteraction,
} from "discord.js";

import { get_restaurant, search_restaurants } from "../db/restaurants.ts";
import type { Db } from "../db/pool.ts";
import type { Restaurant } from "../db/types.ts";
import { create_logger } from "../shared/logger.ts";
import { error_embed } from "./embeds.ts";
import { pick_locale, t, type Locale } from "./i18n.ts";

const log = create_logger("bot");

/**
 * 可回覆的互動。
 * 刻意用結構型別而不是 discord.js 的 RepliableInteraction 聯集——
 * 指令、按鈕、下拉都吃得下同一組方法，用聯集反而要在每個呼叫點做窄化。
 */
export type RepliableLike = {
  deferred: boolean;
  replied: boolean;
  locale: string;
  reply(options: InteractionReplyOptions): Promise<unknown>;
  editReply(options: InteractionEditReplyOptions): Promise<unknown>;
  followUp(options: InteractionReplyOptions): Promise<unknown>;
};

export function locale_of(interaction: { locale?: string | null }): Locale {
  return pick_locale(interaction.locale ?? null);
}

export function member_display_name(interaction: {
  member: unknown;
  user: { displayName?: string; username: string };
}): string {
  const member = interaction.member as GuildMember | null;
  return member?.displayName ?? interaction.user.displayName ?? interaction.user.username;
}

/** 已回覆或已 defer 時改用 followUp／editReply，避免 InteractionAlreadyReplied。 */
export async function respond(
  interaction: RepliableLike,
  options: InteractionReplyOptions,
): Promise<void> {
  try {
    if (interaction.deferred) {
      await interaction.editReply({
        content: options.content ?? null,
        embeds: options.embeds ?? [],
        components: options.components ?? [],
      });
      return;
    }
    if (interaction.replied) {
      await interaction.followUp(options);
      return;
    }
    await interaction.reply(options);
  } catch (error) {
    log.warn("回覆互動失敗", { error: error instanceof Error ? error.message : String(error) });
  }
}

export async function reply_error(interaction: RepliableLike, message: string): Promise<void> {
  await respond(interaction, {
    embeds: [error_embed(message)],
    flags: MessageFlags.Ephemeral,
  });
}

export async function reply_generic_error(
  interaction: RepliableLike,
  error: unknown,
): Promise<void> {
  const locale = locale_of(interaction);
  const detail = error instanceof Error ? error.message : String(error);
  log.error("處理互動時發生錯誤", { detail });
  await reply_error(interaction, t(locale, "error.generic", { detail: detail.slice(0, 300) }));
}

/**
 * 餐廳選項可能是自動完成送回的 id，也可能是使用者硬打的名稱。
 * 先當 id 查，查不到再用關鍵字搜尋，取最像的一間。
 */
export async function resolve_restaurant(pool: Db, raw: string): Promise<Restaurant | undefined> {
  const value = raw.trim();
  if (!value) {
    return undefined;
  }
  if (/^\d+$/.test(value)) {
    const byId = await get_restaurant(pool, Number(value));
    if (byId) {
      return byId;
    }
  }
  const matches = await search_restaurants(pool, value, 1);
  return matches[0];
}

/** 開團者或有「管理伺服器」權限的人才能做的事。 */
export function can_manage_session(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  host_user_id: string,
): boolean {
  if (interaction.user.id === host_user_id) {
    return true;
  }
  const member = interaction.member as GuildMember | null;
  return member?.permissions?.has?.("ManageGuild") === true;
}

export function guild_of(interaction: { guild: Guild | null }): Guild | undefined {
  return interaction.guild ?? undefined;
}
