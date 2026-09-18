import { load_config } from "./config.ts";
import { create_pool, ping_database } from "./db.ts";
import { start_health_server } from "./health.ts";

const config = load_config();
const pool = create_pool(config);

start_health_server(config.app_host, config.app_port, "web", async () => {
  const db = await ping_database(pool);
  return {
    ok: true,
    service: "web",
    name: "AIPAR ETA",
    timezone: config.timezone,
    database: db,
  };
});
