// 伺服器層級設定（目前只有揪團論壇頻道）。

import type { Db } from "./pool.ts";

export type GuildSettings = {
  guild_id: string;
  forum_channel_id: string;
};

export async function get_guild_settings(pool: Db, guild_id: string): Promise<GuildSettings | undefined> {
  const result = await pool.query<GuildSettings>(
    "SELECT guild_id, forum_channel_id FROM guild_settings WHERE guild_id = $1",
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
