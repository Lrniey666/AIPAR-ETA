// 斜線指令註冊。
// 設了 DISCORD_GUILD_ID 就只註冊到那一台伺服器（立即生效，開發時用），
// 沒設就註冊成全域指令（要等 Discord 散播，正式部署用）。

import { REST, Routes } from "discord.js";

import type { DiscordConfig } from "../config.ts";
import { create_logger } from "../shared/logger.ts";
import { COMMAND_DEFINITIONS } from "./commands/definitions.ts";

const log = create_logger("register");

export async function register_commands(config: DiscordConfig): Promise<number> {
  if (!config.bot_token || !config.client_id) {
    throw new Error("註冊指令需要 DISCORD_BOT_TOKEN 與 DISCORD_CLIENT_ID。");
  }

  const rest = new REST({ version: "10" }).setToken(config.bot_token);
  const body = COMMAND_DEFINITIONS.map((definition) => definition.toJSON());

  const route = config.dev_guild_id
    ? Routes.applicationGuildCommands(config.client_id, config.dev_guild_id)
    : Routes.applicationCommands(config.client_id);

  await rest.put(route, { body });
  log.info("已註冊斜線指令", {
    count: body.length,
    scope: config.dev_guild_id ? `guild:${config.dev_guild_id}` : "global",
  });
  return body.length;
}
