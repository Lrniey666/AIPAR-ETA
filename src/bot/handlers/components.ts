// 按鈕與下拉的互動路由。custom id 格式見 components.ts。

import { MessageFlags, type MessageComponentInteraction, type ThreadChannel } from "discord.js";

import { get_menu_item } from "../../db/menus.ts";
import { clear_user_lines } from "../../db/orders.ts";
import type { MenuItem } from "../../db/types.ts";
import { format_cents } from "../../shared/money.ts";
import { decode_id, item_select_rows } from "../components.ts";
import type { BotContext } from "../context.ts";
import { notice_embed, status_label } from "../embeds.ts";
import { t, type Locale } from "../i18n.ts";
import { can_manage_session, locale_of, member_display_name, reply_error, respond } from "../reply.ts";
import {
  add_picks,
  change_status,
  format_person_total,
  load_session,
  lock_and_settle,
  refresh_summary_message,
  session_menu_items,
  settlement_text,
} from "../session_flow.ts";
import { mark_thread_locked } from "./session.ts";
import {
  handle_draft_component,
  handle_menu_component,
  handle_restaurant_component,
} from "./menu_components.ts";

export async function handle_component(
  ctx: BotContext,
  interaction: MessageComponentInteraction,
): Promise<void> {
  const { scope, action, args } = decode_id(interaction.customId);
  const locale = locale_of(interaction);

  if (action === "noop") {
    await interaction.deferUpdate();
    return;
  }

  if (scope === "session") {
    await handle_session_component(ctx, interaction, action, args, locale);
    return;
  }
  if (scope === "draft") {
    await handle_draft_component(ctx, interaction, action, args, locale);
    return;
  }
  if (scope === "menu") {
    await handle_menu_component(ctx, interaction, action, args, locale);
    return;
  }
  if (scope === "restaurant") {
    await handle_restaurant_component(ctx, interaction, locale);
    return;
  }
  await interaction.deferUpdate();
}

async function handle_session_component(
  ctx: BotContext,
  interaction: MessageComponentInteraction,
  action: string,
  args: string[],
  locale: Locale,
): Promise<void> {
  const bundle = await load_session(ctx.pool, interaction.channelId);
  if (!bundle) {
    await reply_error(interaction, t(locale, "error.session_missing"));
    return;
  }
  const { session } = bundle;
  const open = session.status === "open";

  if (action === "pick" || action === "page") {
    if (!open) {
      await reply_error(
        interaction,
        t(locale, "error.session_closed", { status: status_label(session.status, locale) }),
      );
      return;
    }
    const items = await session_menu_items(ctx.pool, session);
    const page = action === "page" ? Number(args[1] ?? 0) : 0;
    const rows = item_select_rows(session.id, items, Number.isFinite(page) ? page : 0, locale);

    if (action === "page") {
      await interaction.update({ components: rows });
      return;
    }
    await interaction.reply({
      embeds: [notice_embed(t(locale, "session.pick_placeholder"))],
      components: rows,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === "add" && interaction.isStringSelectMenu()) {
    if (!open) {
      await reply_error(
        interaction,
        t(locale, "error.session_closed", { status: status_label(session.status, locale) }),
      );
      return;
    }
    const items: MenuItem[] = [];
    for (const value of interaction.values) {
      const item = await get_menu_item(ctx.pool, Number(value));
      if (item) {
        items.push(item);
      }
    }
    if (items.length === 0) {
      await reply_error(interaction, t(locale, "error.parse_failed", { detail: "—" }));
      return;
    }

    const summary_text = await add_picks(
      ctx.pool,
      session,
      { id: interaction.user.id, display_name: member_display_name(interaction) },
      items.map((item) => ({ item, quantity: 1, note: "" })),
      "component",
    );
    const updated = await load_session(ctx.pool, interaction.channelId);

    await interaction.update({
      content: t(locale, "session.added", {
        summary: summary_text,
        amount: format_person_total(updated!.summary, interaction.user.id),
      }),
      embeds: [],
      components: [],
    });
    await refresh_summary_message(ctx.client, ctx.pool, interaction.channelId, locale);
    return;
  }

  if (action === "mine") {
    const mine = bundle.summary.people.find((person) => person.discord_user_id === interaction.user.id);
    const body = mine
      ? mine.lines
          .map((line) => `• ${line.item_name} × ${line.quantity} — ${format_cents(line.unit_price_cents * line.quantity)}`)
          .join("\n") + `\n\n**${t(locale, "common.total")}**：${format_cents(mine.total_cents)}`
      : t(locale, "session.mine_empty");

    await interaction.reply({
      embeds: [notice_embed(`**${t(locale, "session.mine_title")}**\n${body}`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === "clear") {
    const removed = await clear_user_lines(ctx.pool, session.id, interaction.user.id);
    await interaction.reply({
      content: t(locale, "session.cleared", { count: removed }),
      flags: MessageFlags.Ephemeral,
    });
    await refresh_summary_message(ctx.client, ctx.pool, interaction.channelId, locale);
    return;
  }

  if (action === "refresh") {
    await interaction.deferUpdate();
    await refresh_summary_message(ctx.client, ctx.pool, interaction.channelId, locale);
    return;
  }

  if (action === "lock") {
    if (!can_manage_session(interaction, session.host_user_id)) {
      await reply_error(interaction, t(locale, "error.host_only"));
      return;
    }
    await change_status(ctx.pool, session, "locked");
    if (interaction.channel?.isThread()) {
      await mark_thread_locked(interaction.channel as ThreadChannel, true);
    }
    await interaction.reply({ content: t(locale, "session.locked"), flags: MessageFlags.Ephemeral });
    await refresh_summary_message(ctx.client, ctx.pool, interaction.channelId, locale);
    return;
  }

  if (action === "settle") {
    if (!can_manage_session(interaction, session.host_user_id)) {
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
    return;
  }

  await interaction.deferUpdate();
}
