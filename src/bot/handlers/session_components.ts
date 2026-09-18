// 揪團貼文的按鈕與下拉處理。custom id 格式見 `components.ts`。
//
// 面板有兩個：點餐（數量 ＋ 品項 ＋ 翻頁）與清除（逐項選 ＋ 全部清除）。
// 數量被編在品項下拉的 custom id 裡——Discord 的下拉彼此不共享狀態，
// 改數量時就整個面板重畫一次，下一次選品項自然帶著新數量回來。

import { MessageFlags, type MessageComponentInteraction } from "discord.js";

import { get_menu_item } from "../../db/menus.ts";
import { clear_user_lines } from "../../db/orders.ts";
import type { MenuItem } from "../../db/types.ts";
import { format_cents } from "../../shared/money.ts";
import { clamp_pick_quantity, clear_panel_rows, order_panel_rows } from "../components_order.ts";
import type { BotContext } from "../context.ts";
import { notice_embed, status_label } from "../embeds.ts";
import { t, type Locale } from "../i18n.ts";
import { can_manage_session, member_display_name, reply_error, respond } from "../reply.ts";
import {
  add_picks,
  format_person_total,
  load_session,
  lock_and_settle,
  lock_session,
  own_lines,
  refresh_summary_message,
  remove_lines,
  session_menu_items,
  settlement_text,
  type SessionBundle,
} from "../session_flow.ts";

/** 會改動點餐內容的動作；已封單就整組擋掉，免得每個分支各檢查一次。 */
const MUTATING = new Set(["pick", "page", "qty", "add", "clear", "remove", "clearall"]);

export async function handle_session_component(
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

  if (bundle.session.status !== "open" && MUTATING.has(action)) {
    await reply_error(
      interaction,
      t(locale, "error.session_closed", { status: status_label(bundle.session.status, locale) }),
    );
    return;
  }

  switch (action) {
    case "pick":
      await open_order_panel(ctx, interaction, bundle, locale);
      return;
    case "page":
      await change_page(ctx, interaction, bundle, args, locale);
      return;
    case "qty":
      await change_quantity(ctx, interaction, bundle, args, locale);
      return;
    case "add":
      await add_from_panel(ctx, interaction, bundle, args, locale);
      return;
    case "mine":
      await show_mine(interaction, bundle, locale);
      return;
    case "clear":
      await open_clear_panel(ctx, interaction, bundle, locale);
      return;
    case "remove":
      await remove_selected(ctx, interaction, bundle, locale);
      return;
    case "clearall":
      await clear_all(ctx, interaction, bundle, locale);
      return;
    case "refresh":
      await interaction.deferUpdate();
      await refresh_summary_message(ctx.client, ctx.pool, interaction.channelId, locale);
      return;
    case "lock":
      await lock(ctx, interaction, bundle, locale);
      return;
    case "settle":
      await settle(ctx, interaction, bundle, locale);
      return;
    default:
      await interaction.deferUpdate();
  }
}

async function open_order_panel(
  ctx: BotContext,
  interaction: MessageComponentInteraction,
  bundle: SessionBundle,
  locale: Locale,
): Promise<void> {
  const items = await session_menu_items(ctx.pool, bundle.session);
  await interaction.reply({
    embeds: [notice_embed(t(locale, "session.pick_placeholder"))],
    components: order_panel_rows(bundle.session.id, items, 0, 1, locale),
    flags: MessageFlags.Ephemeral,
  });
}

async function change_page(
  ctx: BotContext,
  interaction: MessageComponentInteraction,
  bundle: SessionBundle,
  args: string[],
  locale: Locale,
): Promise<void> {
  const items = await session_menu_items(ctx.pool, bundle.session);
  await interaction.update({
    components: order_panel_rows(
      bundle.session.id,
      items,
      to_int(args[1], 0),
      clamp_pick_quantity(to_int(args[2], 1)),
      locale,
    ),
  });
}

async function change_quantity(
  ctx: BotContext,
  interaction: MessageComponentInteraction,
  bundle: SessionBundle,
  args: string[],
  locale: Locale,
): Promise<void> {
  if (!interaction.isStringSelectMenu()) {
    await interaction.deferUpdate();
    return;
  }
  const items = await session_menu_items(ctx.pool, bundle.session);
  const quantity = clamp_pick_quantity(to_int(interaction.values[0], 1));

  await interaction.update({
    embeds: [notice_embed(t(locale, "session.quantity_changed", { quantity }))],
    components: order_panel_rows(bundle.session.id, items, to_int(args[1], 0), quantity, locale),
  });
}

async function add_from_panel(
  ctx: BotContext,
  interaction: MessageComponentInteraction,
  bundle: SessionBundle,
  args: string[],
  locale: Locale,
): Promise<void> {
  if (!interaction.isStringSelectMenu()) {
    await interaction.deferUpdate();
    return;
  }
  const quantity = clamp_pick_quantity(to_int(args[2], 1));

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
    bundle.session,
    { id: interaction.user.id, display_name: member_display_name(interaction) },
    items.map((item) => ({ item, quantity, note: "" })),
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
}

async function show_mine(
  interaction: MessageComponentInteraction,
  bundle: SessionBundle,
  locale: Locale,
): Promise<void> {
  const mine = bundle.summary.people.find((person) => person.discord_user_id === interaction.user.id);
  const body = mine
    ? `${mine.lines
        .map(
          (line) =>
            `• ${line.item_name} × ${line.quantity} — ${format_cents(line.unit_price_cents * line.quantity)}`,
        )
        .join("\n")}\n\n**${t(locale, "common.total")}**：${format_cents(mine.total_cents)}`
    : t(locale, "session.mine_empty");

  await interaction.reply({
    embeds: [notice_embed(`**${t(locale, "session.mine_title")}**\n${body}`)],
    flags: MessageFlags.Ephemeral,
  });
}

async function open_clear_panel(
  ctx: BotContext,
  interaction: MessageComponentInteraction,
  bundle: SessionBundle,
  locale: Locale,
): Promise<void> {
  const lines = await own_lines(ctx.pool, bundle.session.id, interaction.user.id);
  if (lines.length === 0) {
    await interaction.reply({
      content: t(locale, "session.nothing_to_clear"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.reply({
    embeds: [notice_embed(t(locale, "session.clear_placeholder"))],
    components: clear_panel_rows(bundle.session.id, lines, locale),
    flags: MessageFlags.Ephemeral,
  });
}

async function remove_selected(
  ctx: BotContext,
  interaction: MessageComponentInteraction,
  bundle: SessionBundle,
  locale: Locale,
): Promise<void> {
  if (!interaction.isStringSelectMenu()) {
    await interaction.deferUpdate();
    return;
  }
  const lines = await own_lines(ctx.pool, bundle.session.id, interaction.user.id);
  const wanted = new Set(interaction.values.map((value) => Number(value)));
  const targets = lines.filter((line) => wanted.has(line.id));

  const summary = await remove_lines(ctx.pool, bundle.session, interaction.user.id, targets);
  await interaction.update({
    content: summary ? t(locale, "session.removed", { summary }) : t(locale, "session.nothing_to_clear"),
    embeds: [],
    components: [],
  });
  await refresh_summary_message(ctx.client, ctx.pool, interaction.channelId, locale);
}

async function clear_all(
  ctx: BotContext,
  interaction: MessageComponentInteraction,
  bundle: SessionBundle,
  locale: Locale,
): Promise<void> {
  const removed = await clear_user_lines(ctx.pool, bundle.session.id, interaction.user.id);
  await interaction.update({
    content: t(locale, "session.cleared", { count: removed }),
    embeds: [],
    components: [],
  });
  await refresh_summary_message(ctx.client, ctx.pool, interaction.channelId, locale);
}

async function lock(
  ctx: BotContext,
  interaction: MessageComponentInteraction,
  bundle: SessionBundle,
  locale: Locale,
): Promise<void> {
  if (!can_manage_session(interaction, bundle.session.host_user_id)) {
    await reply_error(interaction, t(locale, "error.host_only"));
    return;
  }
  await interaction.reply({ content: t(locale, "session.locked"), flags: MessageFlags.Ephemeral });
  await lock_session(ctx.client, ctx.pool, bundle.session, locale);
}

async function settle(
  ctx: BotContext,
  interaction: MessageComponentInteraction,
  bundle: SessionBundle,
  locale: Locale,
): Promise<void> {
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

function to_int(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}
