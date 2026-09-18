// Discord 使用者的顯示名稱與語言偏好；網站端要靠這張表把 ID 換成人名。

import type { Db } from "./pool.ts";

export type AppUser = {
  discord_user_id: string;
  display_name: string;
  locale: string;
};

export async function upsert_user(
  pool: Db,
  discord_user_id: string,
  display_name: string,
  locale = "",
): Promise<void> {
  await pool.query(
    `INSERT INTO app_users (discord_user_id, display_name, locale)
     VALUES ($1, $2, $3)
     ON CONFLICT (discord_user_id) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            locale       = COALESCE(NULLIF(EXCLUDED.locale, ''), app_users.locale),
            updated_at   = NOW()`,
    [discord_user_id, display_name.slice(0, 100), locale],
  );
}

export async function get_user(pool: Db, discord_user_id: string): Promise<AppUser | undefined> {
  const result = await pool.query<AppUser>(
    "SELECT discord_user_id, display_name, locale FROM app_users WHERE discord_user_id = $1",
    [discord_user_id],
  );
  return result.rows[0];
}
