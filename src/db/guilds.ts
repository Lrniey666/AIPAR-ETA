// 伺服器層級設定：揪團論壇頻道與開團要 ping 的身分組。

import type { Db } from "./pool.ts";

export type GuildSettings = {
  guild_id: string;
  forum_channel_id: string;
  /** 開團時要 ping 的身分組；空字串＝不 ping。 */
  notify_role_id: string;
};

const COLUMNS = "guild_id, forum_channel_id, notify_role_id";

export async function get_guild_settings(pool: Db, guild_id: string): Promise<GuildSettings | undefined> {
  const result = await pool.query<GuildSettings>(
    `SELECT ${COLUMNS} FROM guild_settings WHERE guild_id = $1`,
    [guild_id],
  );
  return result.rows[0];
}

export async function set_forum_channel(
  pool: Db,
  guild_id: string,
  forum_channel_id: string,
  updated_by: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO guild_settings (guild_id, forum_channel_id, updated_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (guild_id) DO UPDATE
        SET forum_channel_id = EXCLUDED.forum_channel_id,
            updated_by       = EXCLUDED.updated_by,
            updated_at       = NOW()`,
    [guild_id, forum_channel_id, updated_by],
  );
}

/** 指定開團通知身分組；傳空字串＝取消通知。 */
export async function set_notify_role(
  pool: Db,
  guild_id: string,
  notify_role_id: string,
  updated_by: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO guild_settings (guild_id, notify_role_id, updated_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (guild_id) DO UPDATE
        SET notify_role_id = EXCLUDED.notify_role_id,
            updated_by     = EXCLUDED.updated_by,
            updated_at     = NOW()`,
    [guild_id, notify_role_id, updated_by],
  );
}
