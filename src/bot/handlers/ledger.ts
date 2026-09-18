// /ledger（帳務）：個人結餘、全伺服器總覽、記錄付款。

import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";

import { get_balance, list_balances, list_entries, record_entry } from "../../db/ledger.ts";
import { upsert_user } from "../../db/users.ts";
import { total_outstanding_cents } from "../../domain/settlement.ts";
import { dollars_to_cents, format_cents } from "../../shared/money.ts";
import type { BotContext } from "../context.ts";
import { balance_embed } from "../embeds.ts";
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

  const sub = interaction.options.getSubcommand();

  if (sub === "mine") {
    const balance = await get_balance(ctx.pool, guild_id, interaction.user.id);
    const entries = await list_entries(ctx.pool, guild_id, interaction.user.id, 10);
    await respond(interaction, {
      embeds: [
        balance_embed(balance ? [balance] : [], entries, t(locale, "ledger.mine_title"), locale),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "all") {
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
    return;
  }

  if (sub === "pay") {
    const amount = interaction.options.getNumber("amount", true);
    const target = interaction.options.getUser("user") ?? interaction.user;
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
    await record_entry(ctx.pool, {
      session_id: null,
      guild_id,
      discord_user_id: target.id,
      kind: "payment",
      amount_cents: cents,
      note,
      created_by: interaction.user.id,
    });

    const balance = await get_balance(ctx.pool, guild_id, target.id);
    await respond(interaction, {
      content: t(locale, "ledger.recorded_payment", {
        name: `<@${target.id}>`,
        amount: format_cents(cents),
      }),
      embeds: balance ? [balance_embed([balance], undefined, t(locale, "ledger.mine_title"), locale)] : [],
    });
  }
}
