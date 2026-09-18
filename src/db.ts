import pg from "pg";

import type { AppConfig } from "./config.ts";

const { Pool } = pg;

export function create_pool(config: AppConfig): pg.Pool {
  return new Pool({
    host: config.postgres_host,
    port: config.postgres_port,
    database: config.postgres_db,
    user: config.postgres_user,
    password: config.postgres_password,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10_000,
    max: 5,
  });
}

export async function ping_database(pool: pg.Pool): Promise<{ ok: true; now: string }> {
  const result = await pool.query<{ now: Date }>("SELECT NOW() AS now");
  const now = result.rows[0]?.now;
  if (!now) {
    throw new Error("資料庫回應缺少 NOW()，連線狀態異常。");
  }
  return { ok: true, now: now.toISOString() };
}
