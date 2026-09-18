// 伺服器端渲染的頁面。沒有前端框架，也沒有建置步驟——校內一台機器就跑得起來。

import { get_active_menu, list_menu_items } from "../../db/menus.ts";
import { get_session, list_order_lines, list_sessions } from "../../db/orders.ts";
import type { Db } from "../../db/pool.ts";
import { get_restaurant, list_restaurants } from "../../db/restaurants.ts";
import { summarise_orders } from "../../domain/ordering.ts";
import { format_cents } from "../../shared/money.ts";
import { format_datetime } from "../../shared/time.ts";
import { escape_html, layout } from "../render.ts";

const STATUS_LABEL: Record<string, string> = {
  open: "開放中",
  locked: "已封單",
  settled: "已結算",
  cancelled: "已取消",
};

export type PageResult = { status: number; html: string };

export async function page_index(pool: Db): Promise<PageResult> {
  const restaurants = await list_restaurants(pool, 100);
  const sessions = await list_sessions(pool, undefined, 10);

  const restaurant_rows =
    restaurants.length === 0
      ? `<p class="empty">尚未建立任何餐廳。</p>`
      : `<table><thead><tr><th>餐廳</th><th>別名</th><th>電話</th></tr></thead><tbody>${restaurants
          .map(
            (restaurant) =>
              `<tr><td><a href="/restaurants/${restaurant.id}">${escape_html(restaurant.name)}</a></td>` +
              `<td>${escape_html(restaurant.aliases.join("、"))}</td>` +
              `<td>${escape_html(restaurant.phone)}</td></tr>`,
          )
          .join("")}</tbody></table>`;

  const session_rows =
    sessions.length === 0
      ? `<p class="empty">還沒有揪團紀錄。</p>`
      : `<table><thead><tr><th>揪團</th><th>狀態</th><th>建立時間</th></tr></thead><tbody>${sessions
          .map(
            (session) =>
              `<tr><td><a href="/sessions/${session.id}">${escape_html(session.title)}</a></td>` +
              `<td><span class="tag">${escape_html(STATUS_LABEL[session.status] ?? session.status)}</span></td>` +
              `<td>${escape_html(format_datetime(session.created_at))}</td></tr>`,
          )
          .join("")}</tbody></table>`;

  return {
    status: 200,
    html: layout({
      title: "總覽",
      subtitle: "實驗室伙食系統的餐廳、菜單與揪團紀錄",
      generated_at: format_datetime(),
      body: `<h2>餐廳</h2>${restaurant_rows}<h2>最近揪團</h2>${session_rows}`,
    }),
  };
}

export async function page_restaurant(pool: Db, id: number): Promise<PageResult> {
  const restaurant = await get_restaurant(pool, id);
  if (!restaurant) {
    return not_found();
  }
  const menu = await get_active_menu(pool, id);
  const items = menu ? await list_menu_items(pool, menu.id) : [];

  const meta = [
    restaurant.aliases.length > 0 ? `別名：${restaurant.aliases.join("、")}` : "",
    restaurant.phone ? `電話：${restaurant.phone}` : "",
    restaurant.address ? `地址：${restaurant.address}` : "",
  ]
    .filter(Boolean)
    .join("　·　");

  const body =
    items.length === 0
      ? `<p class="empty">這間餐廳還沒有上線的菜單。</p>`
      : `<table><thead><tr><th>分類</th><th>品項</th><th class="amount">價格</th><th>備註</th></tr></thead><tbody>${items
          .map(
            (item) =>
              `<tr><td>${escape_html(item.category)}</td><td>${escape_html(item.name)}</td>` +
              `<td class="amount">${escape_html(format_cents(item.price_cents))}</td>` +
              `<td>${escape_html(item.note)}</td></tr>`,
          )
          .join("")}</tbody></table>`;

  return {
    status: 200,
    html: layout({
      title: restaurant.name,
      subtitle: meta || undefined,
      generated_at: format_datetime(),
      body: `${menu ? `<p><span class="tag">菜單 v${menu.version}</span></p>` : ""}${body}`,
    }),
  };
}

export async function page_session(pool: Db, id: number): Promise<PageResult> {
  const session = await get_session(pool, id);
  if (!session) {
    return not_found();
  }
  const restaurant = await get_restaurant(pool, session.restaurant_id);
  const summary = summarise_orders(await list_order_lines(pool, session.id));

  const items =
    summary.items.length === 0
      ? `<p class="empty">還沒有人點餐。</p>`
      : `<table><thead><tr><th>品項</th><th class="amount">數量</th><th class="amount">小計</th></tr></thead><tbody>${summary.items
          .map(
            (item) =>
              `<tr><td>${escape_html(item.item_name)}${item.note ? `（${escape_html(item.note)}）` : ""}</td>` +
              `<td class="amount">${item.quantity}</td>` +
              `<td class="amount">${escape_html(format_cents(item.total_cents))}</td></tr>`,
          )
          .join("")}</tbody></table>`;

  const people =
    summary.people.length === 0
      ? ""
      : `<h2>每人應付</h2><table><thead><tr><th>成員</th><th class="amount">份數</th><th class="amount">金額</th></tr></thead><tbody>${summary.people
          .map(
            (person) =>
              `<tr><td>${escape_html(person.display_name)}</td>` +
              `<td class="amount">${person.quantity}</td>` +
              `<td class="amount">${escape_html(format_cents(person.total_cents))}</td></tr>`,
          )
          .join("")}</tbody></table>`;

  const subtitle = [
    restaurant?.name ?? "",
    STATUS_LABEL[session.status] ?? session.status,
    `合計 ${format_cents(summary.total_cents)}`,
  ]
    .filter(Boolean)
    .join("　·　");

  return {
    status: 200,
    html: layout({
      title: session.title,
      subtitle,
      generated_at: format_datetime(),
      body: `<h2>全體清單</h2>${items}${people}`,
    }),
  };
}

function not_found(): PageResult {
  return {
    status: 404,
    html: layout({
      title: "找不到頁面",
      generated_at: format_datetime(),
      body: `<p class="empty">找不到這筆資料。</p><p><a href="/">回總覽</a></p>`,
    }),
  };
}
