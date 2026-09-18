// 菜單資料存取。菜單以「版本」為單位整批寫入，改菜單＝出新版，不就地改舊版。

import { normalise_key } from "../shared/text.ts";
import { with_transaction, type Db } from "./pool.ts";
import type { DraftItem, Menu, MenuItem, MenuSource, MenuStatus } from "./types.ts";

const MENU_COLUMNS = `id, restaurant_id, version, source, status, note,
                      created_by, created_at, activated_at`;
const ITEM_COLUMNS = `id, menu_id, category, name, name_key, price_cents,
                      unit, note, position, is_available`;

export type NewMenu = {
  restaurant_id: number;
  source: MenuSource;
  items: DraftItem[];
  note?: string;
  created_by?: string;
  status?: MenuStatus;
};

/** 建立新版菜單並寫入所有品項。status 預設 draft，確認後再 activate。 */
export async function create_menu_version(pool: Db, input: NewMenu): Promise<Menu> {
  if (input.items.length === 0) {
    throw new Error("菜單至少要有一個品項。");
  }
  return with_transaction(pool, async (client) => {
    const version_result = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM menus WHERE restaurant_id = $1`,
      [input.restaurant_id],
    );
    const version = version_result.rows[0]?.next_version ?? 1;

    const menu_result = await client.query<Menu>(
      `INSERT INTO menus (restaurant_id, version, source, status, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${MENU_COLUMNS}`,
      [
        input.restaurant_id,
        version,
        input.source,
        input.status ?? "draft",
        input.note ?? "",
        input.created_by ?? "",
      ],
    );
    const menu = menu_result.rows[0];
    if (!menu) {
      throw new Error("建立菜單失敗，資料庫未回傳資料列。");
    }

    // 逐列 INSERT 在幾十筆的規模下完全夠用，也讓錯誤訊息指得到是哪一列。
    for (const [index, item] of input.items.entries()) {
      await client.query(
        `INSERT INTO menu_items (menu_id, category, name, name_key, price_cents, unit, note, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          menu.id,
          item.category,
          item.name,
          normalise_key(item.name),
          item.price_cents,
          item.unit,
          item.note,
          index,
        ],
      );
    }
    return menu;
  });
}

/** 讓某一版菜單上線，同一間餐廳的其他版本改為封存。 */
export async function activate_menu(pool: Db, menu_id: number): Promise<Menu | undefined> {
  return with_transaction(pool, async (client) => {
    const target = await client.query<Menu>(`SELECT ${MENU_COLUMNS} FROM menus WHERE id = $1`, [menu_id]);
    const menu = target.rows[0];
    if (!menu) {
      return undefined;
    }
    await client.query(
      `UPDATE menus SET status = 'archived'
        WHERE restaurant_id = $1 AND id <> $2 AND status = 'active'`,
      [menu.restaurant_id, menu_id],
    );
    const updated = await client.query<Menu>(
      `UPDATE menus SET status = 'active', activated_at = NOW()
        WHERE id = $1 RETURNING ${MENU_COLUMNS}`,
      [menu_id],
    );
    return updated.rows[0];
  });
}

export async function get_menu(pool: Db, menu_id: number): Promise<Menu | undefined> {
  const result = await pool.query<Menu>(`SELECT ${MENU_COLUMNS} FROM menus WHERE id = $1`, [menu_id]);
  return result.rows[0];
}

export async function get_active_menu(pool: Db, restaurant_id: number): Promise<Menu | undefined> {
  const result = await pool.query<Menu>(
    `SELECT ${MENU_COLUMNS} FROM menus WHERE restaurant_id = $1 AND status = 'active'`,
    [restaurant_id],
  );
  return result.rows[0];
}

export async function list_menu_versions(pool: Db, restaurant_id: number, limit = 10): Promise<Menu[]> {
  const result = await pool.query<Menu>(
    `SELECT ${MENU_COLUMNS} FROM menus WHERE restaurant_id = $1 ORDER BY version DESC LIMIT $2`,
    [restaurant_id, limit],
  );
  return result.rows;
}

export async function list_menu_items(pool: Db, menu_id: number): Promise<MenuItem[]> {
  const result = await pool.query<MenuItem>(
    `SELECT ${ITEM_COLUMNS} FROM menu_items WHERE menu_id = $1 ORDER BY position, id`,
    [menu_id],
  );
  return result.rows;
}

export async function get_menu_item(pool: Db, item_id: number): Promise<MenuItem | undefined> {
  const result = await pool.query<MenuItem>(`SELECT ${ITEM_COLUMNS} FROM menu_items WHERE id = $1`, [
    item_id,
  ]);
  return result.rows[0];
}

export type ItemHit = {
  restaurant_id: number;
  restaurant_name: string;
  menu_version: number;
  item_name: string;
  price_cents: number;
  note: string;
  is_available: boolean;
};

/**
 * 在**所有上線中的菜單**裡找一道菜。
 *
 * 「有沒有豆腐鍋可以吃」要答得出是哪幾家有，而且只能答資料庫裡真的有的。
 * 交給模型的話，它會挑一家名字聽起來像的回答——那是猜的不是查的。
 */
export async function search_active_items(
  pool: Db,
  keyword: string,
  limit = 12,
): Promise<ItemHit[]> {
  const key = normalise_key(keyword);
  if (key.length < 1) {
    return [];
  }
  const result = await pool.query<ItemHit>(
    `SELECT r.id            AS restaurant_id,
            r.name          AS restaurant_name,
            m.version       AS menu_version,
            mi.name         AS item_name,
            mi.price_cents  AS price_cents,
            mi.note         AS note,
            mi.is_available AS is_available
       FROM menu_items mi
       JOIN menus m       ON m.id = mi.menu_id AND m.status = 'active'
       JOIN restaurants r ON r.id = m.restaurant_id AND r.is_active
      WHERE mi.name_key LIKE '%' || $1 || '%'
      ORDER BY r.name, mi.position
      LIMIT $2`,
    [key, limit],
  );
  return result.rows.map((row) => ({
    ...row,
    restaurant_id: Number(row.restaurant_id),
    menu_version: Number(row.menu_version),
    price_cents: Number(row.price_cents),
  }));
}

/** 所有上線菜單裡還在賣的品項；推薦就是從這裡抽，抽到的一定真的存在。 */
export async function list_active_items(pool: Db, limit = 400): Promise<ItemHit[]> {
  const result = await pool.query<ItemHit>(
    `SELECT r.id            AS restaurant_id,
            r.name          AS restaurant_name,
            m.version       AS menu_version,
            mi.name         AS item_name,
            mi.price_cents  AS price_cents,
            mi.note         AS note,
            mi.is_available AS is_available
       FROM menu_items mi
       JOIN menus m       ON m.id = mi.menu_id AND m.status = 'active'
       JOIN restaurants r ON r.id = m.restaurant_id AND r.is_active
      WHERE mi.is_available
      ORDER BY r.name, mi.position
      LIMIT $1`,
    [limit],
  );
  return result.rows.map((row) => ({
    ...row,
    restaurant_id: Number(row.restaurant_id),
    menu_version: Number(row.menu_version),
    price_cents: Number(row.price_cents),
  }));
}

export async function delete_menu(pool: Db, menu_id: number): Promise<void> {
  await pool.query("DELETE FROM menus WHERE id = $1 AND status = 'draft'", [menu_id]);
}

export async function set_item_availability(
  pool: Db,
  item_id: number,
  is_available: boolean,
): Promise<void> {
  await pool.query("UPDATE menu_items SET is_available = $2 WHERE id = $1", [item_id, is_available]);
}

/** 一次算出多個菜單版本的品項數，避免版本列表發 N 次查詢。 */
export async function count_items_by_menu(pool: Db, menu_ids: number[]): Promise<Map<number, number>> {
  if (menu_ids.length === 0) {
    return new Map();
  }
  const result = await pool.query<{ menu_id: number; total: string }>(
    "SELECT menu_id, COUNT(*) AS total FROM menu_items WHERE menu_id = ANY($1::BIGINT[]) GROUP BY menu_id",
    [menu_ids],
  );
  return new Map(result.rows.map((row) => [row.menu_id, Number(row.total)]));
}
