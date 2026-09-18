// 觀測資料：LLM 呼叫紀錄與菜單上傳紀錄。出事時要答得出「什麼時候、打到哪一家、為什麼失敗」。

import type { Db } from "./pool.ts";
import type { UploadStatus } from "./types.ts";

export type LlmCallRecord = {
  task: string;
  provider: string;
  model: string;
  ok: boolean;
  latency_ms: number;
  status_code?: number;
  error?: string;
};

/** 寫失敗不該影響主要流程，所以這裡自己吞例外。 */
export async function record_llm_call(pool: Db, record: LlmCallRecord): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO llm_calls (task, provider, model, ok, latency_ms, status_code, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        record.task,
        record.provider,
        record.model,
        record.ok,
        Math.round(record.latency_ms),
        record.status_code ?? null,
        (record.error ?? "").slice(0, 500),
      ],
    );
  } catch {
    // 觀測資料寫不進去就算了，不要拖垮點餐。
  }
}

export type LlmUsageRow = {
  provider: string;
  model: string;
  ok_count: number;
  fail_count: number;
  avg_latency_ms: number;
};

export async function summarise_llm_usage(pool: Db, hours = 24): Promise<LlmUsageRow[]> {
  const result = await pool.query<LlmUsageRow>(
    `SELECT provider, model,
            COUNT(*) FILTER (WHERE ok)         AS ok_count,
            COUNT(*) FILTER (WHERE NOT ok)     AS fail_count,
            COALESCE(ROUND(AVG(latency_ms)), 0) AS avg_latency_ms
       FROM llm_calls
      WHERE created_at >= NOW() - ($1 || ' hours')::INTERVAL
      GROUP BY provider, model
      ORDER BY ok_count DESC`,
    [String(hours)],
  );
  return result.rows.map((row) => ({
    provider: row.provider,
    model: row.model,
    ok_count: Number(row.ok_count),
    fail_count: Number(row.fail_count),
    avg_latency_ms: Number(row.avg_latency_ms),
  }));
}

export type NewMenuUpload = {
  restaurant_id: number | null;
  source_url: string;
  provider?: string;
  model?: string;
  status?: UploadStatus;
  raw_response?: unknown;
  error?: string;
  created_by?: string;
};

export async function record_menu_upload(pool: Db, input: NewMenuUpload): Promise<number | undefined> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO menu_uploads
       (restaurant_id, source_url, provider, model, status, raw_response, error, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      input.restaurant_id,
      input.source_url.slice(0, 2000),
      input.provider ?? "",
      input.model ?? "",
      input.status ?? "pending",
      input.raw_response === undefined ? null : JSON.stringify(input.raw_response),
      (input.error ?? "").slice(0, 500),
      input.created_by ?? "",
    ],
  );
  return result.rows[0]?.id;
}

export async function link_upload_to_menu(
  pool: Db,
  upload_id: number,
  menu_id: number,
  status: UploadStatus = "applied",
): Promise<void> {
  await pool.query("UPDATE menu_uploads SET menu_id = $2, status = $3 WHERE id = $1", [
    upload_id,
    menu_id,
    status,
  ]);
}
