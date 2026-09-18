// Discord bot 進入點。
// 啟動順序：設定 → 資料庫（含遷移）→ LLM 閘道 → 健康檢查 → 上線。

import { start_bot } from "./bot/client.ts";
import { load_config } from "./config.ts";
import { run_migrations } from "./db/migrate.ts";
import { record_llm_call } from "./db/observability.ts";
import { create_pool, ping_database } from "./db/pool.ts";
import { start_health_server } from "./health.ts";
import { LlmGateway } from "./llm/gateway.ts";
import { OcrClient } from "./llm/ocr.ts";
import { describe_registry } from "./llm/providers.ts";
import { create_logger, set_log_level } from "./shared/logger.ts";

const config = load_config();
set_log_level(config.log_level);
const log = create_logger("bot");

const pool = create_pool(config);
await run_migrations(pool);

const gateway = new LlmGateway(undefined, (record) => {
  void record_llm_call(pool, record);
});

const ocr = new OcrClient();
log.info("菜單對帳 OCR", { status: ocr.describe() });

const registry = gateway.registry;
log.info("LLM 供應商", { available: describe_registry(registry) });
for (const skipped of registry.skipped) {
  log.info("略過供應商", { provider: skipped.key, reason: skipped.reason });
}

let is_discord_ready = () => false;
let stop_bot: (() => Promise<void>) | undefined;

if (config.discord.bot_token) {
  const handle = await start_bot(config, pool, gateway, ocr);
  stop_bot = handle.stop;
  is_discord_ready = handle.is_ready;
} else {
  log.warn("未設定 DISCORD_BOT_TOKEN，只維持容器存活與資料庫健康檢查。");
}

const health = start_health_server("0.0.0.0", config.bot_health_port, "bot", async () => {
  const db = await ping_database(pool);
  return {
    ok: true,
    service: "bot",
    name: "AIPAR ETA",
    timezone: config.timezone,
    discord_configured: Boolean(config.discord.bot_token),
    discord_ready: is_discord_ready(),
    llm: {
      text: registry.text.map((provider) => `${provider.key}:${provider.model}`),
      vision: registry.vision.map((provider) => `${provider.key}:${provider.vision_model}`),
      skipped: registry.skipped,
    },
    ocr: { available: ocr.available(), detail: ocr.describe() },
    database: db,
  };
});

async function shutdown(signal: string): Promise<void> {
  log.info("收到終止訊號，準備關閉", { signal });
  health.close();
  await stop_bot?.().catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// 未捕捉的錯誤只記錄不結束行程：驗收要求連續運行一週，
// 單一則訊息處理失敗不該讓整個 bot 下線（Docker 會重啟，但重啟就會漏掉訊息）。
process.on("unhandledRejection", (reason) => {
  log.error("未處理的 Promise 拒絕", { reason: reason instanceof Error ? reason.message : String(reason) });
});
process.on("uncaughtException", (error) => {
  log.error("未捕捉的例外", { error: error.message });
});
