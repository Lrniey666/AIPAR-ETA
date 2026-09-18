// 記帳資料存取。餘額 = 已付 + 調整 - 應付；負數代表還欠錢。
// charge 對「同一場揪團的同一個人」有唯一索引，重跑結算不會重複計費。

import type { Db } from "./pool.ts";
import type { DebtEdge, LedgerBalance, LedgerEntry, LedgerKind } from "./types.ts";

const COLUMNS = `id, session_id, guild_id, discord_user_id, kind, amount_cents,
                 counterparty_user_id, note, created_by, created_at`;

export type NewLedgerEntry = {
  session_id: number | null;
  guild_id: string;
  discord_user_id: string;
  kind: LedgerKind;
  amount_cents: number;
  /** 對象（欠誰／付給誰）。留空＝只影響個人結餘，不建立債務關係。 */
  counterparty_user_id?: string;
  note?: string;
  created_by?: string;
};

/** 寫入一筆帳。charge 若已存在同場同人，直接沿用舊的（冪等）。 */
export async function record_entry(pool: Db, input: NewLedgerEntry): Promise<LedgerEntry | undefined> {
  const result = await pool.query<LedgerEntry>(
    `INSERT INTO ledger_entries
       (session_id, guild_id, discord_user_id, kind, amount_cents,
        counterparty_user_id, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT DO NOTHING
     RETURNING ${COLUMNS}`,
    [
      input.session_id,
      input.guild_id,
      input.discord_user_id,
      input.kind,
      input.amount_cents,
      input.counterparty_user_id ?? "",
      input.note ?? "",
      input.created_by ?? "",
    ],
  );
  return result.rows[0];
}

export async function list_entries(
  pool: Db,
  guild_id: string,
  discord_user_id: string,
  limit = 20,
): Promise<LedgerEntry[]> {
  const result = await pool.query<LedgerEntry>(
    `SELECT ${COLUMNS} FROM ledger_entries
      WHERE guild_id = $1 AND discord_user_id = $2
      ORDER BY created_at DESC, id DESC LIMIT $3`,
    [guild_id, discord_user_id, limit],
  );
  return result.rows;
}

export async function list_session_entries(pool: Db, session_id: number): Promise<LedgerEntry[]> {
  const result = await pool.query<LedgerEntry>(
    `SELECT ${COLUMNS} FROM ledger_entries WHERE session_id = $1 ORDER BY created_at, id`,
    [session_id],
  );
  return result.rows;
}

const BALANCE_SELECT = `
  SELECT e.discord_user_id,
         COALESCE(u.display_name, e.discord_user_id)                        AS display_name,
         SUM(CASE WHEN e.kind = 'charge' THEN e.amount_cents ELSE 0 END)    AS charged_cents,
         SUM(CASE WHEN e.kind = 'payment' THEN e.amount_cents ELSE 0 END)   AS paid_cents,
         SUM(CASE WHEN e.kind = 'charge' THEN -e.amount_cents
                  ELSE e.amount_cents END)                                  AS balance_cents
    FROM ledger_entries e
    LEFT JOIN app_users u ON u.discord_user_id = e.discord_user_id
   WHERE e.guild_id = $1`;

/** 整個伺服器每個人的結餘。 */
export async function list_balances(pool: Db, guild_id: string): Promise<LedgerBalance[]> {
  const result = await pool.query<LedgerBalance>(
    `${BALANCE_SELECT}
     GROUP BY e.discord_user_id, u.display_name
     ORDER BY balance_cents ASC`,
    [guild_id],
  );
  return result.rows.map(to_balance);
}

export async function get_balance(
  pool: Db,
  guild_id: string,
  discord_user_id: string,
): Promise<LedgerBalance | undefined> {
  const result = await pool.query<LedgerBalance>(
    `${BALANCE_SELECT} AND e.discord_user_id = $2
     GROUP BY e.discord_user_id, u.display_name`,
    [guild_id, discord_user_id],
  );
  const row = result.rows[0];
  return row ? to_balance(row) : undefined;
}

/**
 * 有指定對象的帳，依「誰→誰」加總成單向邊。
 * charge 讓 A 欠 B；payment／adjustment 反向抵銷。兩個方向的互抵留給 domain 處理，
 * 這裡只負責把資料庫的事實原樣搬出來。
 */
export async function list_debt_edges(pool: Db, guild_id: string): Promise<DebtEdge[]> {
  const result = await pool.query<DebtEdge>(
    `SELECT discord_user_id                     AS from_user_id,
            counterparty_user_id                AS to_user_id,
            SUM(CASE WHEN kind = 'charge' THEN amount_cents
                     ELSE -amount_cents END)    AS amount_cents
       FROM ledger_entries
      WHERE guild_id = $1
        AND counterparty_user_id <> ''
        AND counterparty_user_id <> discord_user_id
      GROUP BY discord_user_id, counterparty_user_id`,
    [guild_id],
  );
  return result.rows.map((row) => ({
    from_user_id: row.from_user_id,
    to_user_id: row.to_user_id,
    amount_cents: Number(row.amount_cents),
  }));
}

// SUM() 在 pg 回的是字串，這裡統一轉成數字再往上送。
function to_balance(row: LedgerBalance): LedgerBalance {
  return {
    discord_user_id: row.discord_user_id,
    display_name: row.display_name,
    charged_cents: Number(row.charged_cents),
    paid_cents: Number(row.paid_cents),
    balance_cents: Number(row.balance_cents),
  };
}
