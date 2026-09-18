// /groupbuy（揪團）、/order（點餐）、/settle（結算）三支指令。

import {
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ForumChannel,
  type ThreadChannel,
} from "discord.js";

import { get_guild_settings } from "../../db/guilds.ts";
import { get_active_menu, list_menu_items } from "../../db/menus.ts";
import { clear_user_lines, create_session, set_summary_message } from "../../db/orders.ts";
import { parse_order } from "../../llm/tasks/order_parse.ts";
import { format_date, parse_duration_to_date } from "../../shared/time.ts";
import { item_select_rows, session_rows } from "../components.ts";
import type { BotContext } from "../context.ts";
import { menu_embed, notice_embed, session_embed, status_label } from "../embeds.ts";
import { t } from "../i18n.ts";
import {
  can_manage_session,
  locale_of,
  member_display_name,
  reply_error,
  resolve_restaurant,
  respond,
} from "../reply.ts";
import {
  add_picks,
  format_person_total,
  load_session,
  lock_and_settle,
  refresh_summary_message,
  session_menu_items,
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

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const deadline_raw = interaction.options.getString("deadline") ?? "";
  const deadline_at = deadline_raw ? (parse_duration_to_date(deadline_raw) ?? null) : null;
  const title =
    interaction.options.getString("title") ??
    t(locale, "session.post_title", { date: format_date(), name: restaurant.name });

  const items = await list_menu_items(ctx.pool, menu.id);
  const { embed: menu_view } = menu_embed(restaurant, menu, items, locale, 0);

  // 論壇貼文的第一則訊息就是菜單，成員一點進來就看得到。
  const thread = await (forum as ForumChannel).threads.create({
    name: title.slice(0, 100),
    message: {
      content: t(locale, "session.menu_posted"),
      embeds: [menu_view],
    },
  });

  const session = await create_session(ctx.pool, {
    guild_id: guild.id,
    channel_id: thread.id,
    restaurant_id: restaurant.id,
    menu_id: menu.id,
    title,
    host_user_id: interaction.user.id,
    deadline_at,
  });

  const bundle = await load_session(ctx.pool, thread.id);
  const summary_message = await thread.send({
    embeds: [session_embed(session, restaurant, bundle!.summary, locale)],
    components: session_rows(session.id, session.status, locale),
  });
  await set_summary_message(ctx.pool, session.id, summary_message.id);

  await respond(interaction, {
    content: t(locale, "session.created", { title, link: `<#${thread.id}>` }),
  });
}

export async function handle_order(ctx: BotContext, interaction: ChatInputCommandInteraction): Promise<void> {
  const locale = locale_of(interaction);
  const bundle = await load_session(ctx.pool, interaction.channelId);
  if (!bundle) {
    await reply_error(interaction, t(locale, "error.session_missing"));
    return;
  }
  if (bundle.session.status !== "open") {
    await reply_error(
      interaction,
      t(locale, "error.session_closed", { status: status_label(bundle.session.status, locale) }),
    );
    return;
  }

  const items = await session_menu_items(ctx.pool, bundle.session);
  const text = interaction.options.getString("text");

  // 沒帶文字就給下拉選單——按鈕／下拉是主路徑，自然語言是加分項。
  if (!text) {
    await respond(interaction, {
      embeds: [notice_embed(t(locale, "session.pick_placeholder"))],
      components: item_select_rows(bundle.session.id, items, 0, locale),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const outcome = await parse_order(ctx.gateway, text, items);

  if (outcome.picks.length === 0) {
    await reply_error(
      interaction,
      t(locale, "error.parse_failed", { detail: outcome.unmatched.join(" / ") || text }),
    );
    return;
  }

  const summary_text = await add_picks(
    ctx.pool,
    bundle.session,
    { id: interaction.user.id, display_name: member_display_name(interaction) },
    outcome.picks,
    "natural-language",
  );

  const updated = await load_session(ctx.pool, interaction.channelId);
  const lines = [
    t(locale, "session.added", {
      summary: summary_text,
      amount: format_person_total(updated!.summary, interaction.user.id),
    }),
  ];
  if (outcome.unmatched.length > 0) {
    lines.push(t(locale, "session.unmatched", { detail: outcome.unmatched.join(" / ") }));
  }

  await respond(interaction, { content: lines.join("\n") });
  await refresh_summary_message(ctx.client, ctx.pool, interaction.channelId, locale);
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

/** 給元件處理器共用：清掉自己的點餐。 */
export async function clear_own_lines(
  ctx: BotContext,
  channel_id: string,
  user_id: string,
): Promise<number> {
  const bundle = await load_session(ctx.pool, channel_id);
  if (!bundle) {
    return 0;
  }
  return clear_user_lines(ctx.pool, bundle.session.id, user_id);
}

/** 封單時順手把貼文標記成已封存的標題前綴，讓論壇列表一眼看得出來。 */
export async function mark_thread_locked(thread: ThreadChannel, locked: boolean): Promise<void> {
  const prefix = "🔒 ";
  const has_prefix = thread.name.startsWith(prefix);
  if (locked && !has_prefix) {
    await thread.setName(`${prefix}${thread.name}`.slice(0, 100)).catch(() => undefined);
  } else if (!locked && has_prefix) {
    await thread.setName(thread.name.slice(prefix.length)).catch(() => undefined);
  }
}
