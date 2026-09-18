// 餐廳清單與單一餐廳的菜單頁。

import { get_active_menu, list_menu_items, list_menu_versions } from "../../db/menus.ts";
import type { Db } from "../../db/pool.ts";
import { get_restaurant, list_restaurants } from "../../db/restaurants.ts";
import { format_cents } from "../../shared/money.ts";
import { format_date, format_datetime } from "../../shared/time.ts";
import { empty, escape_html, layout, panel, table } from "../render.ts";
import { page_not_found, type PageResult } from "./pages.ts";

const MENU_STATUS: Record<string, string> = {
  draft: "草稿",
  active: "使用中",
  archived: "已封存",
};

export async function page_restaurants(pool: Db): Promise<PageResult> {
  const restaurants = await list_restaurants(pool, 200);

  const rows = restaurants.map(
    (restaurant) =>
      `<tr><td><a href="/restaurants/${restaurant.id}">${escape_html(restaurant.name)}</a></td>` +
      `<td>${escape_html(restaurant.aliases.join("、") || "—")}</td>` +
      `<td>${escape_html(restaurant.phone || "—")}</td>` +
      `<td>${escape_html(restaurant.address || "—")}</td></tr>`,
  );

  return {
    status: 200,
    html: layout({
      title: "餐廳與菜單",
      subtitle: `目前建檔 ${restaurants.length} 間；菜單版本與上線狀態在各餐廳頁面。`,
      generated_at: format_datetime(),
      active: "/restaurants",
      body:
        table(["餐廳", "別名", "電話", "地址"], rows) ||
        empty("尚未建立任何餐廳。用 Discord 的 /餐廳 新增 建立第一間。"),
    }),
  };
}

export async function page_restaurant(pool: Db, id: number): Promise<PageResult> {
  const restaurant = await get_restaurant(pool, id);
  if (!restaurant) {
    return page_not_found();
  }
  const menu = await get_active_menu(pool, id);
  const items = menu ? await list_menu_items(pool, menu.id) : [];
  const versions = await list_menu_versions(pool, id, 10);

  const meta = [
    restaurant.aliases.length > 0 ? `別名：${restaurant.aliases.join("、")}` : "",
    restaurant.phone ? `電話：${restaurant.phone}` : "",
    restaurant.address ? `地址：${restaurant.address}` : "",
  ]
    .filter(Boolean)
    .join("　·　");

  const item_rows = items.map(
    (item) =>
      `<tr><td>${escape_html(item.category || "—")}</td>` +
      `<td>${escape_html(item.name)}${item.is_available ? "" : '　<span class="chip chip--warn">停售</span>'}</td>` +
      `<td class="amount">${escape_html(format_cents(item.price_cents))}</td>` +
      `<td>${escape_html(item.note || "—")}</td></tr>`,
  );

  const version_rows = versions.map(
    (version) =>
      `<tr><td class="amount">v${version.version}</td>` +
      `<td><span class="chip">${escape_html(MENU_STATUS[version.status] ?? version.status)}</span></td>` +
      `<td>${escape_html(version.source)}</td>` +
      `<td>${escape_html(format_date(version.created_at))}</td></tr>`,
  );

  const body = `${panel(
    menu ? `目前菜單 v${menu.version}` : "目前菜單",
    table(["分類", "品項", "#價格", "備註"], item_rows) ||
      empty("這間餐廳還沒有上線的菜單。用 Discord 的 /菜單 上傳 或 /菜單 輸入 建立。"),
  )}
${panel("版本歷史", table(["#版本", "狀態", "來源", "建立日期"], version_rows) || empty("沒有任何版本。"))}`;

  return {
    status: 200,
    html: layout({
      title: restaurant.name,
      subtitle: meta || undefined,
      generated_at: format_datetime(),
      active: "/restaurants",
      body,
    }),
  };
}
