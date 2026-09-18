// 網站進入點。校內裝置連這一個埠就能看餐廳、菜單、揪團與帳務。

import { load_config } from "./config.ts";
import { run_migrations } from "./db/migrate.ts";
import { create_pool } from "./db/pool.ts";
import { create_logger, set_log_level } from "./shared/logger.ts";
import { start_web_server } from "./web/server.ts";

const config = load_config();
set_log_level(config.log_level);
const log = create_logger("web");

const pool = create_pool(config);
await run_migrations(pool);

const server = start_web_server(config, pool);

async function shutdown(signal: string): Promise<void> {
  log.info("收到終止訊號，準備關閉", { signal });
  server.close();
  await pool.end().catch(() => undefined);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  log.error("未處理的 Promise 拒絕", { reason: reason instanceof Error ? reason.message : String(reason) });
});
