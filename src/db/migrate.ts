// 遷移器：依檔名順序套用 src/db/sql/*.sql，每個檔案一筆交易，套過的不再套。

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { create_logger } from "../shared/logger.ts";
import type { Db } from "./pool.ts";

const log = create_logger("migrate");
const SQL_DIR = path.join(import.meta.dirname, "sql");

async function ensure_registry(pool: Db): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function run_migrations(pool: Db): Promise<string[]> {
  await ensure_registry(pool);

  const files = (await readdir(SQL_DIR)).filter((name) => name.endsWith(".sql")).sort();
  const applied = new Set(
    (await pool.query<{ filename: string }>("SELECT filename FROM schema_migrations")).rows.map(
      (row) => row.filename,
    ),
  );

  const fresh: string[] = [];
  for (const filename of files) {
    if (applied.has(filename)) {
      continue;
    }
    const sql = await readFile(path.join(SQL_DIR, filename), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
      await client.query("COMMIT");
      fresh.push(filename);
      log.info("已套用遷移", { filename });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`遷移 ${filename} 失敗：${message}`);
    } finally {
      client.release();
    }
  }

  if (fresh.length === 0) {
    log.info("資料結構已是最新", { total: files.length });
  }
  return fresh;
}
