// 揪團與點餐資料存取。一則論壇貼文對應一場揪團（channel_id 唯一）。

import type { Db } from "./pool.ts";
import type { OrderLine, OrderLineSource, OrderSession, SessionStatus } from "./types.ts";

const SESSION_COLUMNS = `id, guild_id, channel_id, summary_msg_id, restaurant_id, menu_id,
                         title, status, host_user_id, deadline_at, created_at, closed_at`;
const LINE_COLUMNS = `id, session_id, discord_user_id, display_name, menu_item_id, item_name,
                      unit_price_cents, quantity, note, source, created_at, updated_at`;

export type NewSession = {
  guild_id: string;
  channel_id: string;
  restaurant_id: number;
  menu_id: number | null;
  title: string;
  host_user_id: string;
  deadline_at: Date | null;
};

export type NewOrderLine = {
  session_id: number;
  discord_user_id: string;
  display_name: string;
  menu_item_id: number | null;
  item_name: string;
  unit_price_cents: number;
  quantity: number;
  note?: string;
  source?: OrderLineSource;
};

export async function create_session(pool: Db, input: NewSession): Promise<OrderSession> {
  const result = await pool.query<OrderSession>(
    `INSERT INTO order_sessions
       (guild_id, channel_id, restaurant_id, menu_id, title, host_user_id, deadline_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${SESSION_COLUMNS}`,
    [
      input.guild_id,
      input.channel_id,
      input.restaurant_id,
      input.menu_id,
      input.title,
      input.host_user_id,
      input.deadline_at,
    ],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("建立揪團失敗，資料庫未回傳資料列。");
  }
  return row;
}

export async function get_session_by_channel(
  pool: Db,
  channel_id: string,
): Promise<OrderSession | undefined> {
  const result = await pool.query<OrderSession>(
    `SELECT ${SESSION_COLUMNS} FROM order_sessions WHERE channel_id = $1`,
    [channel_id],
  );
  return result.rows[0];
}

export async function get_session(pool: Db, id: number): Promise<OrderSession | undefined> {
  const result = await pool.query<OrderSession>(
    `SELECT ${SESSION_COLUMNS} FROM order_sessions WHERE id = $1`,
    [id],
  );
  return result.rows[0];
}

export async function list_sessions(
  pool: Db,
  guild_id: string | undefined,
  limit = 20,
): Promise<OrderSession[]> {
  const result = guild_id
    ? await pool.query<OrderSession>(
        `SELECT ${SESSION_COLUMNS} FROM order_sessions WHERE guild_id = $1
          ORDER BY created_at DESC LIMIT $2`,
        [guild_id, limit],
      )
    : await pool.query<OrderSession>(
        `SELECT ${SESSION_COLUMNS} FROM order_sessions ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
  return result.rows;
}

export async function set_summary_message(pool: Db, id: number, message_id: string): Promise<void> {
  await pool.query("UPDATE order_sessions SET summary_msg_id = $2 WHERE id = $1", [id, message_id]);
}

export async function set_session_status(
  pool: Db,
  id: number,
  status: SessionStatus,
): Promise<OrderSession | undefined> {
  const closed = status === "settled" || status === "cancelled";
  const result = await pool.query<OrderSession>(
    `UPDATE order_sessions
        SET status = $2, closed_at = CASE WHEN $3 THEN NOW() ELSE closed_at END
      WHERE id = $1 RETURNING ${SESSION_COLUMNS}`,
    [id, status, closed],
  );
  return result.rows[0];
}

/** 到期但還開著的揪團；排程用來自動封單。 */
export async function list_expired_open_sessions(pool: Db): Promise<OrderSession[]> {
  const result = await pool.query<OrderSession>(
    `SELECT ${SESSION_COLUMNS} FROM order_sessions
      WHERE status = 'open' AND deadline_at IS NOT NULL AND deadline_at <= NOW()`,
  );
  return result.rows;
}

export async function add_order_line(pool: Db, input: NewOrderLine): Promise<OrderLine> {
  const result = await pool.query<OrderLine>(
    `INSERT INTO order_lines
       (session_id, discord_user_id, display_name, menu_item_id, item_name,
        unit_price_cents, quantity, note, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${LINE_COLUMNS}`,
    [
      input.session_id,
      input.discord_user_id,
      input.display_name,
      input.menu_item_id,
      input.item_name,
      input.unit_price_cents,
      input.quantity,
      input.note ?? "",
      input.source ?? "component",
    ],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("新增點餐失敗，資料庫未回傳資料列。");
  }
  return row;
}

export async function list_order_lines(pool: Db, session_id: number): Promise<OrderLine[]> {
  const result = await pool.query<OrderLine>(
    `SELECT ${LINE_COLUMNS} FROM order_lines WHERE session_id = $1 ORDER BY created_at, id`,
    [session_id],
  );
  return result.rows;
}

/** 刪除某人在這場的點餐；回傳刪掉幾筆。 */
export async function clear_user_lines(
  pool: Db,
  session_id: number,
  discord_user_id: string,
): Promise<number> {
  const result = await pool.query(
    "DELETE FROM order_lines WHERE session_id = $1 AND discord_user_id = $2",
    [session_id, discord_user_id],
  );
  return result.rowCount ?? 0;
}

export async function delete_order_line(
  pool: Db,
  line_id: number,
  discord_user_id: string,
): Promise<boolean> {
  const result = await pool.query("DELETE FROM order_lines WHERE id = $1 AND discord_user_id = $2", [
    line_id,
    discord_user_id,
  ]);
  return (result.rowCount ?? 0) > 0;
}
