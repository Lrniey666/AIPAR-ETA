// /groupbuy（揪團）與 /settle（結算）。
//
// /order（點餐）在 0.3.0 移除：貼文裡已經有「點餐」按鈕與自然語言兩條路。

import {
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ForumChannel,
} from "discord.js";

import { get_guild_settings } from "../../db/guilds.ts";
import { get_active_menu, list_menu_items } from "../../db/menus.ts";
import { create_session, set_summary_message } from "../../db/orders.ts";
import { format_date, minutes_from_now } from "../../shared/time.ts";
import type { BotContext } from "../context.ts";
import { session_rows } from "../components_order.ts";
import { menu_embed, session_embed } from "../embeds.ts";
import { t } from "../i18n.ts";
import { can_manage_session, locale_of, reply_error, resolve_restaurant, respond } from "../reply.ts";
import {
  load_session,
  lock_and_settle,
  refresh_summary_message,
  settlement_text,
} from "../session_flow.ts";

export async function handle_groupbuy(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const locale = locale_of(interaction);
  const guild = interaction.guild;
  if (!guild) {
    await reply_error(interaction, t(locale, "error.guild_only"));
    return;
  }

  const raw = interaction.options.getString("restaurant", true);
  const restaurant = await resolve_restaurant(ctx.pool, raw);
  if (!restaurant) {
    await reply_error(interaction, t(locale, "error.restaurant_missing", { name: raw }));
    return;
  }

  const menu = await get_active_menu(ctx.pool, restaurant.id);
  if (!menu) {
    await reply_error(interaction, t(locale, "error.menu_missing", { name: restaurant.name }));
    return;
  }

  const settings = await get_guild_settings(ctx.pool, guild.id);
  if (!settings?.forum_channel_id) {
    await reply_error(interaction, t(locale, "setup.missing_forum"));
    return;
  }
  const forum = await guild.channels.fetch(settings.forum_channel_id).catch(() => null);
  if (!forum || forum.type !== ChannelType.GuildForum) {
    await reply_error(interaction, t(locale, "setup.missing_forum"));
    return;
  }

  // 截止時間只收分鐘數字；Discord 已經擋掉範圍外的值，這裡是最後一道。
  const minutes = interaction.options.getInteger("minutes");
  let deadline_at: Date | null = null;
  if (minutes !== null) {
    const at = minutes_from_now(minutes);
    if (!at) {
      await reply_error(interaction, t(locale, "session.deadline_invalid"));
      return;
    }
    deadline_at = at;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const payer = interaction.options.getUser("payer") ?? interaction.user;
  const title =
    interaction.options.getString("title") ??
    t(locale, "session.post_title", { date: format_date(), name: restaurant.name });

  const items = await list_menu_items(ctx.pool, menu.id);
  const { embed: menu_view } = menu_embed(restaurant, menu, items, locale, 0);

  // 論壇貼文的第一則訊息就是菜單，成員一點進來就看得到；要通知的身分組也在這裡 ping。
  const role_id = settings.notify_role_id;
  const opening = role_id
    ? t(locale, "session.open_ping", { role: `<@&${role_id}>`, name: restaurant.name })
    : "";
  const thread = await (forum as ForumChannel).threads.create({
    name: title.slice(0, 100),
    message: {
      content: [opening, t(locale, "session.menu_posted")].filter(Boolean).join("\n"),
      embeds: [menu_view],
      allowedMentions: { roles: role_id ? [role_id] : [], parse: [] },
    },
  });

  const session = await create_session(ctx.pool, {
    guild_id: guild.id,
    channel_id: thread.id,
    restaurant_id: restaurant.id,
    menu_id: menu.id,
    title,
    host_user_id: interaction.user.id,
    payer_user_id: payer.id,
    deadline_at,
  });

  const bundle = await load_session(ctx.pool, thread.id);
  const summary_message = await thread.send({
    content: t(locale, "session.order_hint"),
    embeds: [session_embed(session, restaurant, bundle!.summary, locale)],
    components: session_rows(session.id, session.status, locale),
  });
  await set_summary_message(ctx.pool, session.id, summary_message.id);

  await respond(interaction, {
    content: t(locale, "session.created", { title, link: `<#${thread.id}>` }),
  });
}

export async function handle_settle(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const locale = locale_of(interaction);
  const bundle = await load_session(ctx.pool, interaction.channelId);
  if (!bundle) {
    await reply_error(interaction, t(locale, "error.session_missing"));
    return;
  }
  if (!can_manage_session(interaction, bundle.session.host_user_id)) {
    await reply_error(interaction, t(locale, "error.host_only"));
    return;
  }
  if (bundle.summary.people.length === 0) {
    await reply_error(interaction, t(locale, "session.no_orders"));
    return;
  }

  await interaction.deferReply();
  const result = await lock_and_settle(ctx.pool, bundle, interaction.user.id);
  await respond(interaction, { content: settlement_text(result, locale) });
  await refresh_summary_message(ctx.client, ctx.pool, interaction.channelId, locale);
}
