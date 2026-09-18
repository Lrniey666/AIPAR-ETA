// /ledger（帳務）：個人結餘與欠款、全伺服器總覽、誰欠誰、記錄付款。

import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";

import { get_balance, list_balances, list_debt_edges, list_entries, record_entry } from "../../db/ledger.ts";
import { upsert_user } from "../../db/users.ts";
import { debts_for_user, simplify_debts, net_debts } from "../../domain/debts.ts";
import { total_outstanding_cents } from "../../domain/settlement.ts";
import { dollars_to_cents, format_cents } from "../../shared/money.ts";
import type { BotContext } from "../context.ts";
import { balance_embed, debts_embed, personal_debts_field } from "../embeds_ledger.ts";
import { t } from "../i18n.ts";
import { locale_of, member_display_name, reply_error, respond } from "../reply.ts";

export async function handle_ledger(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const locale = locale_of(interaction);
  const guild_id = interaction.guildId;
  if (!guild_id) {
    await reply_error(interaction, t(locale, "error.guild_only"));
    return;
  }

  switch (interaction.options.getSubcommand()) {
    case "mine":
      await show_mine(ctx, interaction, guild_id);
      return;
    case "all":
      await show_all(ctx, interaction, guild_id);
      return;
    case "who":
      await show_who(ctx, interaction, guild_id);
      return;
    case "pay":
      await record_payment(ctx, interaction, guild_id);
  }
}

async function show_mine(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
  guild_id: string,
): Promise<void> {
  const locale = locale_of(interaction);
  const balance = await get_balance(ctx.pool, guild_id, interaction.user.id);
  const entries = await list_entries(ctx.pool, guild_id, interaction.user.id, 10);
  const { owes, owed } = debts_for_user(
    await list_debt_edges(ctx.pool, guild_id),
    interaction.user.id,
  );

  const embed = balance_embed(
    balance ? [balance] : [],
    entries,
    t(locale, "ledger.mine_title"),
    locale,
  );
  // 結餘回答「我欠多少」，債務回答「我要拿給誰」——兩件事要一起看才完整。
  embed.addFields(personal_debts_field(owes, owed, locale));

  await respond(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function show_all(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
  guild_id: string,
): Promise<void> {
  const locale = locale_of(interaction);
  const balances = await list_balances(ctx.pool, guild_id);
  const embed = balance_embed(balances, undefined, t(locale, "ledger.all_title"), locale);
  if (balances.length > 0) {
    embed.setFooter({
      text: t(locale, "ledger.outstanding", {
        amount: format_cents(total_outstanding_cents(balances)),
      }),
    });
  }
  await respond(interaction, { embeds: [embed] });
}

async function show_who(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
  guild_id: string,
): Promise<void> {
  const locale = locale_of(interaction);
  const edges = await list_debt_edges(ctx.pool, guild_id);
  await respond(interaction, {
    embeds: [debts_embed(net_debts(edges), simplify_debts(edges), locale)],
    allowedMentions: { parse: [] },
  });
}

async function record_payment(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
  guild_id: string,
): Promise<void> {
  const locale = locale_of(interaction);
  const amount = interaction.options.getNumber("amount", true);
  const target = interaction.options.getUser("user") ?? interaction.user;
  const to = interaction.options.getUser("to");
  const note = interaction.options.getString("note") ?? "";
  const cents = dollars_to_cents(amount);

  if (cents <= 0) {
    await reply_error(interaction, t(locale, "error.parse_failed", { detail: String(amount) }));
    return;
  }

  await upsert_user(
    ctx.pool,
    target.id,
    target.id === interaction.user.id ? member_display_name(interaction) : target.username,
  );
  if (to) {
    await upsert_user(ctx.pool, to.id, to.username);
  }

  await record_entry(ctx.pool, {
    session_id: null,
    guild_id,
    discord_user_id: target.id,
    kind: "payment",
    amount_cents: cents,
    // 有指定收款人時才會抵銷債務關係；沒指定就只動個人結餘。
    counterparty_user_id: to?.id ?? "",
    note,
    created_by: interaction.user.id,
  });

  const balance = await get_balance(ctx.pool, guild_id, target.id);
  await respond(interaction, {
    content: to
      ? t(locale, "ledger.payment_to", {
          name: `<@${target.id}>`,
          amount: format_cents(cents),
          to: to.id,
        })
      : t(locale, "ledger.recorded_payment", {
          name: `<@${target.id}>`,
          amount: format_cents(cents),
        }),
    embeds: balance ? [balance_embed([balance], undefined, t(locale, "ledger.mine_title"), locale)] : [],
    allowedMentions: { parse: [] },
  });
}
