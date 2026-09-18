// 餐廳資料存取。搜尋同時比對正式名稱、別名與正規化鍵。

import { normalise_key, similarity } from "../shared/text.ts";
import type { Db } from "./pool.ts";
import type { Restaurant } from "./types.ts";

export type NewRestaurant = {
  name: string;
  aliases?: string[];
  phone?: string;
  address?: string;
  note?: string;
  created_by?: string;
};

const COLUMNS = `id, name, name_key, aliases, phone, address, note, is_active,
                 created_by, created_at, updated_at`;

export async function create_restaurant(pool: Db, input: NewRestaurant): Promise<Restaurant> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("餐廳名稱不可空白。");
  }
  const result = await pool.query<Restaurant>(
    `INSERT INTO restaurants (name, name_key, aliases, phone, address, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (name_key) DO UPDATE
        SET aliases    = EXCLUDED.aliases,
            phone      = COALESCE(NULLIF(EXCLUDED.phone, ''), restaurants.phone),
            address    = COALESCE(NULLIF(EXCLUDED.address, ''), restaurants.address),
            note       = COALESCE(NULLIF(EXCLUDED.note, ''), restaurants.note),
            is_active  = TRUE,
            updated_at = NOW()
     RETURNING ${COLUMNS}`,
    [
      name,
      normalise_key(name),
      (input.aliases ?? []).map((alias) => alias.trim()).filter(Boolean),
      input.phone?.trim() ?? "",
      input.address?.trim() ?? "",
      input.note?.trim() ?? "",
      input.created_by ?? "",
    ],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("新增餐廳失敗，資料庫未回傳資料列。");
  }
  return row;
}

export async function get_restaurant(pool: Db, id: number): Promise<Restaurant | undefined> {
  const result = await pool.query<Restaurant>(`SELECT ${COLUMNS} FROM restaurants WHERE id = $1`, [id]);
  return result.rows[0];
}

export async function list_restaurants(pool: Db, limit = 50): Promise<Restaurant[]> {
  const result = await pool.query<Restaurant>(
    `SELECT ${COLUMNS} FROM restaurants WHERE is_active ORDER BY name LIMIT $1`,
    [limit],
  );
  return result.rows;
}

/**
 * 關鍵字搜尋：先讓資料庫做粗篩（名稱／別名／正規化鍵），再用字元相似度排序。
 * 粗篩交給 SQL 是為了不要把整張表撈進記憶體，排序留在應用層是因為中文 bigram 比較好調。
 */
export async function search_restaurants(pool: Db, keyword: string, limit = 10): Promise<Restaurant[]> {
  const raw = keyword.trim();
  if (!raw) {
    return list_restaurants(pool, limit);
  }
  const key = normalise_key(raw);
  const result = await pool.query<Restaurant>(
    `SELECT ${COLUMNS} FROM restaurants
      WHERE is_active
        AND (name ILIKE '%' || $1 || '%'
             OR name_key LIKE '%' || $2 || '%'
             OR EXISTS (SELECT 1 FROM unnest(aliases) AS alias WHERE alias ILIKE '%' || $1 || '%'))
      LIMIT 100`,
    [raw, key],
  );

  const scored = result.rows.map((row) => ({
    row,
    score: Math.max(similarity(raw, row.name), ...row.aliases.map((alias) => similarity(raw, alias)), 0),
  }));
  scored.sort((left, right) => right.score - left.score || left.row.name.localeCompare(right.row.name));
  return scored.slice(0, limit).map((entry) => entry.row);
}

export type RestaurantWithMenu = Restaurant & {
  /** 目前上線的菜單版本；null＝尚無菜單。 */
  menu_version: number | null;
  item_count: number;
};

/**
 * 餐廳連同「有沒有上線菜單」一起撈。
 *
 * 自然語言回答需要這一欄：只給店名清單的話，模型看到店名就會自己想像它賣什麼
 * （實際發生過）。「尚無菜單」是要明講的事實，不是可以省略的空值，
 * 所以用一次 LEFT JOIN 拿齊，不要讓呼叫端逐間補查。
 */
export async function list_restaurants_with_menu(
  pool: Db,
  limit = 50,
): Promise<RestaurantWithMenu[]> {
  const result = await pool.query<RestaurantWithMenu>(
    `SELECT ${COLUMNS.split(",").map((column) => `r.${column.trim()}`).join(", ")},
            m.version AS menu_version,
            COALESCE((SELECT COUNT(*) FROM menu_items mi WHERE mi.menu_id = m.id), 0) AS item_count
       FROM restaurants r
       LEFT JOIN menus m ON m.restaurant_id = r.id AND m.status = 'active'
      WHERE r.is_active
      ORDER BY r.name
      LIMIT $1`,
    [limit],
  );
  return result.rows.map((row) => ({
    ...row,
    menu_version: row.menu_version === null ? null : Number(row.menu_version),
    item_count: Number(row.item_count),
  }));
}

export async function add_alias(pool: Db, id: number, alias: string): Promise<void> {
  const value = alias.trim();
  if (!value) {
    return;
  }
  await pool.query(
    `UPDATE restaurants
        SET aliases = (SELECT ARRAY(SELECT DISTINCT unnest(aliases || $2::TEXT[]))),
            updated_at = NOW()
      WHERE id = $1`,
    [id, [value]],
  );
}

export async function deactivate_restaurant(pool: Db, id: number): Promise<void> {
  await pool.query("UPDATE restaurants SET is_active = FALSE, updated_at = NOW() WHERE id = $1", [id]);
}
