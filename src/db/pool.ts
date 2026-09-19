import pg from "pg";

import type { AppConfig } from "../config.ts";

const { Pool, types } = pg;

// int8（BIGSERIAL／IDENTITY）預設會被 pg 轉成字串，避免精度問題。
// 本系統的鍵值遠小於 2^53，轉成 number 比到處處理字串安全也好讀。
types.setTypeParser(types.builtins.INT8, (value: string) => Number(value));

export type Db = pg.Pool;
export type DbClient = pg.PoolClient;

export function create_pool(config: AppConfig): Db {
  return new Pool({
    host: config.postgres_host,
    port: config.postgres_port,
    database: config.postgres_db,
    user: config.postgres_user,
    password: config.postgres_password,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10_000,
    max: 8,
    application_name: "aiparc-eta",
  });
}

export async function ping_database(pool: Db): Promise<{ ok: true; now: string }> {
  const result = await pool.query<{ now: Date }>("SELECT NOW() AS now");
  const now = result.rows[0]?.now;
  if (!now) {
    throw new Error("資料庫回應缺少 NOW()，連線狀態異常。");
  }
  return { ok: true, now: now.toISOString() };
}

/** 在單一連線上跑交易；丟例外就整筆回滾。 */
export async function with_transaction<T>(pool: Db, work: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
