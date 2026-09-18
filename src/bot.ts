import { load_config } from "./config.ts";
import { create_pool, ping_database } from "./db.ts";
import { start_health_server } from "./health.ts";

const config = load_config();
const pool = create_pool(config);

if (!config.discord_bot_token) {
  console.warn("[bot] 未設定 DISCORD_BOT_TOKEN，目前只維持容器存活與資料庫健康檢查。");
} else {
  console.log("[bot] 已讀到 Discord 權杖，指令與事件處理尚未實作。");
}

start_health_server("0.0.0.0", config.bot_health_port, "bot", async () => {
  const db = await ping_database(pool);
  return {
    ok: true,
    service: "bot",
    name: "AIPAR ETA",
    timezone: config.timezone,
    discord_configured: Boolean(config.discord_bot_token),
    database: db,
  };
});
