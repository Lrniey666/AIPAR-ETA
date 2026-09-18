// 伺服器端渲染的頁面：儀表板與系統狀態。
// 餐廳與菜單在 `pages_catalogue.ts`，揪團與帳務在 `pages_orders.ts`。
// 沒有前端框架，也沒有建置步驟——校內一台機器就跑得起來。

import { summarise_llm_usage } from "../../db/observability.ts";
import { list_sessions } from "../../db/orders.ts";
import { ping_database, type Db } from "../../db/pool.ts";
import { list_restaurants } from "../../db/restaurants.ts";
import { list_guild_overviews, overview_counts } from "../../db/stats.ts";
import { format_cents } from "../../shared/money.ts";
import { format_datetime } from "../../shared/time.ts";
import { empty, escape_html, layout, panel, stat, status_chip, table } from "../render.ts";

export type PageResult = { status: number; html: string };

export async function page_index(pool: Db): Promise<PageResult> {
  const counts = await overview_counts(pool);
  const sessions = await list_sessions(pool, undefined, 8);
  const restaurants = await list_restaurants(pool, 8);

  const stats = `<div class="grid grid--stats">
    ${stat("餐廳", String(counts.restaurants), `${counts.active_menus} 份菜單使用中`)}
    ${stat("揪團場次", String(counts.sessions), `${counts.open_sessions} 場開放中`)}
    ${stat("累計點餐", String(counts.order_lines), `共 ${format_cents(counts.spend_cents)}`)}
    ${stat("LLM 呼叫（24 小時）", String(counts.llm_calls_24h), "含成功與失敗")}
  </div>`;

  const session_rows = sessions.map(
    (session) =>
      `<tr><td><a href="/sessions/${session.id}">${escape_html(session.title)}</a></td>` +
      `<td>${status_chip(session.status)}</td>` +
      `<td>${escape_html(format_datetime(session.created_at))}</td></tr>`,
  );

  const restaurant_rows = restaurants.map(
    (restaurant) =>
      `<tr><td><a href="/restaurants/${restaurant.id}">${escape_html(restaurant.name)}</a></td>` +
      `<td>${escape_html(restaurant.aliases.join("、") || "—")}</td></tr>`,
  );

  const body = `${stats}
<div class="grid grid--split" style="margin-top:20px">
  ${panel(
    "最近揪團",
    `${table(["揪團", "狀態", "建立時間"], session_rows) || empty("還沒有揪團紀錄。")}${link("/sessions", "看全部揪團")}`,
  )}
  ${panel(
    "餐廳",
    `${table(["餐廳", "別名"], restaurant_rows) || empty("尚未建立任何餐廳。")}${link("/restaurants", "看全部餐廳")}`,
  )}
</div>`;

  return {
    status: 200,
    html: layout({
      title: "儀表板",
      subtitle: "實驗室伙食系統的即時概況；所有寫入都在 Discord，這裡唯讀。",
      generated_at: format_datetime(),
      active: "/",
      body,
    }),
  };
}

export async function page_status(pool: Db): Promise<PageResult> {
  const usage = await summarise_llm_usage(pool, 24);
  const guilds = await list_guild_overviews(pool, 25);

  let database: string;
  try {
    const ping = await ping_database(pool);
    database = `連線正常．資料庫時間 ${format_datetime(new Date(ping.now))}`;
  } catch (error) {
    database = `連線異常：${error instanceof Error ? error.message : String(error)}`;
  }

  const usage_rows = usage.map(
    (row) =>
      `<tr><td>${escape_html(row.provider)}</td><td>${escape_html(row.model)}</td>` +
      `<td class="amount">${row.ok_count}</td>` +
      `<td class="amount">${row.fail_count}</td>` +
      `<td class="amount">${row.avg_latency_ms} ms</td></tr>`,
  );

  const guild_rows = guilds.map(
    (guild) =>
      `<tr><td><a href="/ledger/${encodeURIComponent(guild.guild_id)}">${escape_html(guild.guild_id)}</a></td>` +
      `<td class="amount">${guild.session_count}</td>` +
      `<td>${escape_html(guild.last_at ? format_datetime(guild.last_at) : "—")}</td></tr>`,
  );

  const body = `${panel("資料庫", `<p>${escape_html(database)}</p>`)}
${panel(
  "LLM 呼叫（最近 24 小時）",
  table(["供應商", "模型", "#成功", "#失敗", "#平均延遲"], usage_rows) ||
    empty("最近 24 小時沒有 LLM 呼叫紀錄。"),
)}
${panel(
  "有揪團紀錄的伺服器",
  table(["伺服器 ID", "#場次", "最近一次"], guild_rows) || empty("還沒有任何揪團。"),
)}`;

  return {
    status: 200,
    html: layout({
      title: "系統狀態",
      subtitle: "資料庫、免費 LLM 用量與各伺服器的使用情形。",
      generated_at: format_datetime(),
      active: "/status",
      body,
    }),
  };
}

function link(href: string, label: string): string {
  return `<p><a href="${href}">${escape_html(label)} →</a></p>`;
}

export function page_not_found(): PageResult {
  return {
    status: 404,
    html: layout({
      title: "找不到頁面",
      generated_at: format_datetime(),
      body: `${empty("找不到這筆資料。")}<p><a href="/">回儀表板 →</a></p>`,
    }),
  };
}
