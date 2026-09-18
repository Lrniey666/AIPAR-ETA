// /memory（記憶）的處理：查看、記住、忘記。
//
// 記憶預設是私人的（ephemeral 回覆、scope=user）。要整個頻道共用得明確勾選，
// 因為「我不吃牛」是個人偏好，不該替別人決定。

import { MessageFlags, type AutocompleteInteraction, type ChatInputCommandInteraction } from "discord.js";

import {
  clear_turns,
  count_turns,
  forget_all,
  forget_fact,
  list_context_facts,
  list_facts,
  remember_fact,
} from "../../db/memory.ts";
import type { BotContext } from "../context.ts";
import { memory_embed } from "../embeds_chat.ts";
import { t } from "../i18n.ts";
import { locale_of, reply_error, respond } from "../reply.ts";

export async function handle_memory(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const locale = locale_of(interaction);
  const guild_id = interaction.guildId;
  if (!guild_id) {
    await reply_error(interaction, t(locale, "error.guild_only"));
    return;
  }

  const user_id = interaction.user.id;
  const channel_id = interaction.channelId;

  switch (interaction.options.getSubcommand()) {
    case "mine": {
      const facts = await list_context_facts(ctx.pool, guild_id, user_id, channel_id);
      const turns = await count_turns(ctx.pool, channel_id);
      await respond(interaction, {
        embeds: [memory_embed(facts, turns, locale)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    case "save": {
      const text = interaction.options.getString("text", true).trim();
      const shared = interaction.options.getBoolean("shared") ?? false;
      const saved = await remember_fact(ctx.pool, {
        guild_id,
        scope: shared ? "channel" : "user",
        subject_id: shared ? channel_id : user_id,
        // 用內容本身當主題鍵：同一句再講一次是覆蓋，不會越積越多。
        fact_key: text.slice(0, 20),
        fact_value: text,
        created_by: user_id,
      });
      if (!saved) {
        await reply_error(interaction, t(locale, "error.parse_failed", { detail: text.slice(0, 40) }));
        return;
      }
      await respond(interaction, {
        content: t(locale, "memory.saved", { summary: saved.fact_value }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    case "forget": {
      const text = interaction.options.getString("text")?.trim();

      // 留空＝全部忘掉：長期事實與這個頻道的短期對話一起清。
      if (!text) {
        const facts = await forget_all(ctx.pool, guild_id, "user", user_id);
        const turns = await clear_turns(ctx.pool, channel_id);
        await respond(interaction, {
          content: t(locale, "memory.forgot_all", { facts, turns }),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const removed =
        (await forget_fact(ctx.pool, guild_id, "user", user_id, text)) ||
        (await forget_fact(ctx.pool, guild_id, "channel", channel_id, text));

      await respond(interaction, {
        content: removed
          ? t(locale, "memory.forgotten", { summary: text })
          : t(locale, "memory.not_found"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    default:
      await reply_error(interaction, t(locale, "error.generic", { detail: "memory" }));
  }
}

/**
 * 「忘記」的自動完成：把記過的事列出來讓人選。
 * 值送回 `fact_key`，處理器不用再從一段自由文字猜要刪哪一條。
 */
export async function autocomplete_memory(
  ctx: BotContext,
  interaction: AutocompleteInteraction,
): Promise<void> {
  const guild_id = interaction.guildId;
  if (!guild_id) {
    await interaction.respond([]);
    return;
  }

  const keyword = String(interaction.options.getFocused() ?? "").trim();
  const mine = await list_facts(ctx.pool, guild_id, "user", interaction.user.id, 25);
  const shared = await list_facts(ctx.pool, guild_id, "channel", interaction.channelId, 25);

  const options = [...mine, ...shared]
    .filter((fact) => !keyword || fact.fact_value.includes(keyword))
    .slice(0, 25)
    .map((fact) => ({ name: fact.fact_value.slice(0, 100), value: fact.fact_key.slice(0, 100) }));

  await interaction.respond(options);
}
