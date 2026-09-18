// 揪團紀錄與帳務頁。
//
// 帳務分兩塊：個人結餘（吃了多少、付了多少）與債務關係（誰該把錢拿給誰）。
// 兩者不同，頁面上也分開呈現——只看結餘會知道自己欠 250 卻不知道要給誰。

import { list_balances, list_debt_edges } from "../../db/ledger.ts";
import { get_session, list_order_lines, list_sessions } from "../../db/orders.ts";
import type { Db } from "../../db/pool.ts";
import { get_restaurant } from "../../db/restaurants.ts";
import { list_guild_overviews } from "../../db/stats.ts";
import { get_user } from "../../db/users.ts";
import { net_debts, simplify_debts } from "../../domain/debts.ts";
import { summarise_orders } from "../../domain/ordering.ts";
import { total_outstanding_cents } from "../../domain/settlement.ts";
import type { DebtEdge } from "../../db/types.ts";
import { format_cents } from "../../shared/money.ts";
import { format_datetime } from "../../shared/time.ts";
import { empty, escape_html, layout, panel, stat, status_chip, STATUS_LABEL, table } from "../render.ts";
import { page_not_found, type PageResult } from "./pages.ts";

export async function page_sessions(pool: Db): Promise<PageResult> {
  const sessions = await list_sessions(pool, undefined, 60);

  const rows = sessions.map(
    (session) =>
      `<tr><td><a href="/sessions/${session.id}">${escape_html(session.title)}</a></td>` +
      `<td>${status_chip(session.status)}</td>` +
      `<td>${escape_html(format_datetime(session.created_at))}</td>` +
      `<td>${escape_html(session.deadline_at ? format_datetime(session.deadline_at) : "—")}</td></tr>`,
  );

  return {
    status: 200,
    html: layout({
      title: "揪團紀錄",
      subtitle: `最近 ${sessions.length} 場；每場的全體清單與每人應付在各自的頁面。`,
      generated_at: format_datetime(),
      active: "/sessions",
      body: table(["揪團", "狀態", "建立時間", "截止時間"], rows) || empty("還沒有揪團紀錄。"),
    }),
  };
}

export async function page_session(pool: Db, id: number): Promise<PageResult> {
  const session = await get_session(pool, id);
  if (!session) {
    return page_not_found();
  }
  const restaurant = await get_restaurant(pool, session.restaurant_id);
  const summary = summarise_orders(await list_order_lines(pool, session.id));
  const payer = session.payer_user_id ? await get_user(pool, session.payer_user_id) : undefined;

  const stats = `<div class="grid grid--stats">
    ${stat("合計", format_cents(summary.total_cents))}
    ${stat("人數", String(summary.headcount))}
    ${stat("份數", String(summary.total_quantity))}
    ${stat("收款人", payer?.display_name ?? session.payer_user_id ?? "—", "大家把錢拿給這個人")}
  </div>`;

  const item_rows = summary.items.map(
    (item) =>
      `<tr><td>${escape_html(item.item_name)}${item.note ? `（${escape_html(item.note)}）` : ""}</td>` +
      `<td class="amount">${item.quantity}</td>` +
      `<td class="amount">${escape_html(format_cents(item.total_cents))}</td></tr>`,
  );

  const people_rows = summary.people.map(
    (person) =>
      `<tr><td>${escape_html(person.display_name)}</td>` +
      `<td class="amount">${person.quantity}</td>` +
      `<td class="amount">${escape_html(format_cents(person.total_cents))}</td></tr>`,
  );

  const body = `${stats}
<div class="grid grid--split" style="margin-top:20px">
  ${panel("全體清單", table(["品項", "#數量", "#小計"], item_rows) || empty("還沒有人點餐。"))}
  ${panel("每人應付", table(["成員", "#份數", "#金額"], people_rows) || empty("還沒有人點餐。"))}
</div>`;

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
      active: "/sessions",
      body,
    }),
  };
}

/** 沒帶伺服器 id 時列出有紀錄的伺服器讓人挑一個。 */
export async function page_ledger_index(pool: Db): Promise<PageResult> {
  const guilds = await list_guild_overviews(pool, 25);

  const rows = guilds.map(
    (guild) =>
      `<tr><td><a href="/ledger/${encodeURIComponent(guild.guild_id)}">${escape_html(guild.guild_id)}</a></td>` +
      `<td class="amount">${guild.session_count}</td>` +
      `<td>${escape_html(guild.last_at ? format_datetime(guild.last_at) : "—")}</td></tr>`,
  );

  return {
    status: 200,
    html: layout({
      title: "帳務",
      subtitle: "帳是以 Discord 伺服器為單位記的，先選一個伺服器。",
      generated_at: format_datetime(),
      active: "/ledger",
      body: table(["伺服器 ID", "#揪團場次", "最近一次"], rows) || empty("還沒有任何帳務紀錄。"),
    }),
  };
}

export async function page_ledger(pool: Db, guild_id: string): Promise<PageResult> {
  const balances = await list_balances(pool, guild_id);
  const edges = await list_debt_edges(pool, guild_id);
  const names = await resolve_names(pool, edges, balances.map((balance) => balance.discord_user_id));

  const balance_rows = balances.map(
    (balance) =>
      `<tr><td>${escape_html(balance.display_name)}</td>` +
      `<td class="amount">${escape_html(format_cents(balance.charged_cents))}</td>` +
      `<td class="amount">${escape_html(format_cents(balance.paid_cents))}</td>` +
      `<td class="amount">${escape_html(format_cents(balance.balance_cents))}</td></tr>`,
  );

  const netted = net_debts(edges);
  const simplified = simplify_debts(edges);

  const body = `<div class="grid grid--stats">
    ${stat("有帳的人", String(balances.length))}
    ${stat("未結合計", format_cents(total_outstanding_cents(balances)), "所有人欠款加總")}
    ${stat("未結欠款筆數", String(netted.length), `建議轉帳 ${simplified.length} 筆`)}
  </div>
<div class="grid grid--split" style="margin-top:20px">
  ${panel("誰欠誰", debt_list(netted, names) || empty("目前沒有未結的欠款。"))}
  ${panel(
    "最少轉帳建議",
    `${debt_list(simplified, names) || empty("不需要任何轉帳。")}<p class="empty">互相抵銷之後，照這幾筆轉一次就結清。</p>`,
  )}
</div>
${panel(
  "個人結餘",
  table(["成員", "#累計應付", "#累計已付", "#結餘"], balance_rows) ||
    empty("這個伺服器還沒有帳務紀錄。"),
)}`;

  return {
    status: 200,
    html: layout({
      title: "帳務",
      subtitle: `伺服器 ${guild_id}．結餘為負代表還欠錢。`,
      generated_at: format_datetime(),
      active: "/ledger",
      body,
    }),
  };
}

function debt_list(edges: DebtEdge[], names: Map<string, string>): string {
  if (edges.length === 0) {
    return "";
  }
  const rows = edges.map(
    (edge) =>
      `<tr><td>${escape_html(names.get(edge.from_user_id) ?? edge.from_user_id)}</td>` +
      `<td>→ ${escape_html(names.get(edge.to_user_id) ?? edge.to_user_id)}</td>` +
      `<td class="amount owes"><b>${escape_html(format_cents(edge.amount_cents))}</b></td></tr>`,
  );
  return table(["誰", "要拿給誰", "#金額"], rows);
}

/** 把 Discord ID 換成顯示名稱；查不到就原樣顯示 ID，不要留空白。 */
async function resolve_names(
  pool: Db,
  edges: DebtEdge[],
  extra_ids: string[],
): Promise<Map<string, string>> {
  const ids = new Set<string>(extra_ids);
  for (const edge of edges) {
    ids.add(edge.from_user_id);
    ids.add(edge.to_user_id);
  }

  const names = new Map<string, string>();
  for (const id of ids) {
    const user = await get_user(pool, id);
    if (user) {
      names.set(id, user.display_name);
    }
  }
  return names;
}
