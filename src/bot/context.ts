// Bot 執行期共用的相依。處理器都吃這一包，不各自去 new 連線或 client。

import type { Client } from "discord.js";

import type { AppConfig } from "../config.ts";
import type { Db } from "../db/pool.ts";
import type { LlmGateway } from "../llm/gateway.ts";
import type { PendingStore } from "./pending.ts";

export type BotContext = {
  config: AppConfig;
  pool: Db;
  gateway: LlmGateway;
  client: Client;
  /** 等待使用者貼上菜單文字的暫存狀態（記憶體，重啟即失效）。 */
  pending: PendingStore;
};
