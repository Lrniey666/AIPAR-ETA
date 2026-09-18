// 儀表板要用的彙總查詢。
//
// 網站的定位是「輔助 Discord bot 的管理與查閱」，首頁得先回答
// 「現在有多少餐廳／有沒有正在收單的揪團／這陣子花了多少」這幾個問題。
// 一次 SQL 拿完，避免首頁打十幾次查詢。

import type { Db } from "./pool.ts";

export type Overview = {
  restaurants: number;
  active_menus: number;
  sessions: number;
  open_sessions: number;
  order_lines: number;
  spend_cents: number;
  llm_calls_24h: number;
};

export type GuildOverview = {
  guild_id: string;
  session_count: number;
  last_at: Date | null;
};

export async function overview_counts(pool: Db): Promise<Overview> {
  const result = await pool.query<Record<keyof Overview, string>>(
    `SELECT
       (SELECT COUNT(*) FROM restaurants WHERE is_active)                      AS restaurants,
       (SELECT COUNT(*) FROM menus WHERE status = 'active')                    AS active_menus,
       (SELECT COUNT(*) FROM order_sessions)                                   AS sessions,
       (SELECT COUNT(*) FROM order_sessions WHERE status = 'open')             AS open_sessions,
       (SELECT COUNT(*) FROM order_lines)                                      AS order_lines,
       (SELECT COALESCE(SUM(unit_price_cents * quantity), 0) FROM order_lines) AS spend_cents,
       (SELECT COUNT(*) FROM llm_calls
         WHERE created_at >= NOW() - INTERVAL '24 hours')                      AS llm_calls_24h`,
  );

  const row = result.rows[0];
  return {
    restaurants: Number(row?.restaurants ?? 0),
    active_menus: Number(row?.active_menus ?? 0),
    sessions: Number(row?.sessions ?? 0),
    open_sessions: Number(row?.open_sessions ?? 0),
    order_lines: Number(row?.order_lines ?? 0),
    spend_cents: Number(row?.spend_cents ?? 0),
    llm_calls_24h: Number(row?.llm_calls_24h ?? 0),
  };
}

/** 有揪團紀錄的伺服器；帳務頁沒帶 guild 時用來讓人挑一個。 */
export async function list_guild_overviews(pool: Db, limit = 25): Promise<GuildOverview[]> {
  const result = await pool.query<{ guild_id: string; session_count: string; last_at: Date | null }>(
    `SELECT guild_id, COUNT(*) AS session_count, MAX(created_at) AS last_at
       FROM order_sessions
      GROUP BY guild_id
      ORDER BY last_at DESC NULLS LAST
      LIMIT $1`,
    [limit],
  );
  return result.rows.map((row) => ({
    guild_id: row.guild_id,
    session_count: Number(row.session_count),
    last_at: row.last_at,
  }));
}
