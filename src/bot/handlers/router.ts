// 互動總路由。所有 InteractionCreate 都先進這裡，錯誤也統一在這裡收。

import type { Interaction } from "discord.js";

import { create_logger } from "../../shared/logger.ts";
import type { BotContext } from "../context.ts";
import { reply_generic_error } from "../reply.ts";
import { handle_component } from "./components.ts";
import { handle_ledger } from "./ledger.ts";
import { handle_menu } from "./menu.ts";
import { handle_autocomplete, handle_help, handle_setup, handle_website } from "./misc.ts";
import { handle_restaurant } from "./restaurant.ts";
import { handle_groupbuy, handle_settle } from "./session.ts";

const log = create_logger("router");

export async function route_interaction(ctx: BotContext, interaction: Interaction): Promise<void> {
  try {
    if (interaction.isAutocomplete()) {
      await handle_autocomplete(ctx, interaction);
      return;
    }

    if (interaction.isChatInputCommand()) {
      log.info("收到指令", {
        command: interaction.commandName,
        user: interaction.user.id,
        guild: interaction.guildId ?? "-",
      });

      switch (interaction.commandName) {
        case "restaurant":
          await handle_restaurant(ctx.pool, interaction);
          return;
        case "menu":
          await handle_menu(ctx, interaction);
          return;
        case "groupbuy":
          await handle_groupbuy(ctx, interaction);
          return;
        case "settle":
          await handle_settle(ctx, interaction);
          return;
        case "ledger":
          await handle_ledger(ctx, interaction);
          return;
        case "help":
          await handle_help(interaction);
          return;
        case "website":
          await handle_website(interaction);
          return;
        case "setup":
          await handle_setup(ctx, interaction);
          return;
        default:
          log.warn("未知指令", { command: interaction.commandName });
          return;
      }
    }

    if (interaction.isMessageComponent()) {
      await handle_component(ctx, interaction);
    }
  } catch (error) {
    if (interaction.isRepliable()) {
      await reply_generic_error(interaction, error);
      return;
    }
    log.error("互動處理失敗", { error: error instanceof Error ? error.message : String(error) });
  }
}
