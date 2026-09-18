// Discord client 的建立與事件接線。
//
// Intents 說明：
//   Guilds                伺服器與頻道基本資料
//   GuildMessages         收得到訊息事件
//   MessageContent        讀得到訊息內容（自然語言點餐一定要）——這是特權 Intent，
//                         必須先到 Discord 開發者後台把它打開，否則 bot 會收到空字串
//   GuildMessageReactions Ack Reaction 要能加、能收回

import { Client, Events, GatewayIntentBits, Partials } from "discord.js";

import type { AppConfig } from "../config.ts";
import type { Db } from "../db/pool.ts";
import type { LlmGateway } from "../llm/gateway.ts";
import { describe_registry } from "../llm/providers.ts";
import { create_logger } from "../shared/logger.ts";
import type { BotContext } from "./context.ts";
import { handle_message } from "./handlers/message.ts";
import { route_interaction } from "./handlers/router.ts";
import { PendingStore } from "./pending.ts";
import { register_commands } from "./register.ts";
import { start_deadline_watcher } from "./scheduler.ts";

const log = create_logger("client");

export type BotHandle = {
  client: Client;
  context: BotContext;
  /** 是否已完成 Discord 握手；健康檢查用。 */
  is_ready: () => boolean;
  stop: () => Promise<void>;
};

export async function start_bot(config: AppConfig, pool: Db, gateway: LlmGateway): Promise<BotHandle> {
  if (!config.discord.bot_token) {
    throw new Error("缺少 DISCORD_BOT_TOKEN，無法啟動 Discord bot。");
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction],
  });

  const context: BotContext = {
    config,
    pool,
    gateway,
    client,
    pending: new PendingStore(),
  };

  let stop_watcher: (() => void) | undefined;
  let ready = false;

  client.once(Events.ClientReady, (ready_client) => {
    ready = true;
    log.info("Discord bot 已上線", {
      user: ready_client.user.tag,
      guilds: ready_client.guilds.cache.size,
      llm: describe_registry(gateway.registry),
    });
    stop_watcher = start_deadline_watcher(ready_client, pool);
  });

  client.on(Events.InteractionCreate, (interaction) => {
    void route_interaction(context, interaction);
  });

  client.on(Events.MessageCreate, (message) => {
    void handle_message(context, message).catch((error: unknown) => {
      log.error("處理訊息失敗", { error: error instanceof Error ? error.message : String(error) });
    });
  });

  client.on(Events.Error, (error) => {
    log.error("Discord client 錯誤", { error: error.message });
  });

  client.on(Events.Warn, (message) => {
    log.warn("Discord client 警告", { message });
  });

  if (config.discord.client_id) {
    await register_commands(config.discord).catch((error: unknown) => {
      // 註冊失敗不該讓 bot 起不來——舊的指令通常還在，之後再重試即可。
      log.error("註冊斜線指令失敗", { error: error instanceof Error ? error.message : String(error) });
    });
  } else {
    log.warn("未設定 DISCORD_CLIENT_ID，略過斜線指令註冊");
  }

  await client.login(config.discord.bot_token);

  return {
    client,
    context,
    is_ready: () => ready,
    stop: async () => {
      stop_watcher?.();
      await client.destroy();
    },
  };
}
