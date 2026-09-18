// JSON API。路徑一律 kebab-case（.cursorrules §語言與命名）。
// 這層只讀不寫——寫入一律經由 Discord bot，避免出現第二套授權模型。

import { get_active_menu, list_menu_items, list_menu_versions } from "../../db/menus.ts";
import { list_balances, list_debt_edges } from "../../db/ledger.ts";
import { summarise_llm_usage } from "../../db/observability.ts";
import { get_session, list_order_lines, list_sessions } from "../../db/orders.ts";
import type { Db } from "../../db/pool.ts";
import { get_restaurant, list_restaurants, search_restaurants } from "../../db/restaurants.ts";
import { overview_counts } from "../../db/stats.ts";
import { net_debts, simplify_debts } from "../../domain/debts.ts";
import { summarise_orders } from "../../domain/ordering.ts";
import type { DebtEdge } from "../../db/types.ts";
import { cents_to_dollars } from "../../shared/money.ts";

export type ApiResult = { status: number; body: unknown };

export const NOT_FOUND_RESULT: ApiResult = { status: 404, body: { ok: false, error: "找不到路徑" } };

const NOT_FOUND: ApiResult = { status: 404, body: { ok: false, error: "找不到資源" } };

export async function api_restaurants(pool: Db, keyword: string): Promise<ApiResult> {
  const restaurants = keyword ? await search_restaurants(pool, keyword, 50) : await list_restaurants(pool, 100);
  return {
    status: 200,
    body: {
      ok: true,
      count: restaurants.length,
      restaurants: restaurants.map((restaurant) => ({
        id: restaurant.id,
        name: restaurant.name,
        aliases: restaurant.aliases,
        phone: restaurant.phone,
        address: restaurant.address,
        note: restaurant.note,
      })),
    },
  };
}

export async function api_restaurant_detail(pool: Db, id: number): Promise<ApiResult> {
  const restaurant = await get_restaurant(pool, id);
  if (!restaurant) {
    return NOT_FOUND;
  }
  const menu = await get_active_menu(pool, id);
  const items = menu ? await list_menu_items(pool, menu.id) : [];
  const versions = await list_menu_versions(pool, id, 10);

  return {
    status: 200,
    body: {
      ok: true,
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        aliases: restaurant.aliases,
        phone: restaurant.phone,
        address: restaurant.address,
        note: restaurant.note,
      },
      menu: menu
        ? {
            id: menu.id,
            version: menu.version,
            source: menu.source,
            activated_at: menu.activated_at,
            items: items.map((item) => ({
              id: item.id,
              category: item.category,
              name: item.name,
              price: cents_to_dollars(item.price_cents),
              unit: item.unit,
              note: item.note,
              is_available: item.is_available,
            })),
          }
        : null,
      versions: versions.map((version) => ({
        id: version.id,
        version: version.version,
        status: version.status,
        source: version.source,
        created_at: version.created_at,
      })),
    },
  };
}

export async function api_sessions(pool: Db, guild_id: string | undefined): Promise<ApiResult> {
  const sessions = await list_sessions(pool, guild_id, 30);
  return {
    status: 200,
    body: {
      ok: true,
      count: sessions.length,
      sessions: sessions.map((session) => ({
        id: session.id,
        title: session.title,
        status: session.status,
        restaurant_id: session.restaurant_id,
        guild_id: session.guild_id,
        channel_id: session.channel_id,
        created_at: session.created_at,
        deadline_at: session.deadline_at,
      })),
    },
  };
}

export async function api_session_detail(pool: Db, id: number): Promise<ApiResult> {
  const session = await get_session(pool, id);
  if (!session) {
    return NOT_FOUND;
  }
  const restaurant = await get_restaurant(pool, session.restaurant_id);
  const summary = summarise_orders(await list_order_lines(pool, session.id));

  return {
    status: 200,
    body: {
      ok: true,
      session: {
        id: session.id,
        title: session.title,
        status: session.status,
        restaurant: restaurant?.name ?? null,
        created_at: session.created_at,
        deadline_at: session.deadline_at,
      },
      totals: {
        amount: cents_to_dollars(summary.total_cents),
        quantity: summary.total_quantity,
        headcount: summary.headcount,
      },
      people: summary.people.map((person) => ({
        display_name: person.display_name,
        quantity: person.quantity,
        amount: cents_to_dollars(person.total_cents),
      })),
      items: summary.items.map((item) => ({
        name: item.item_name,
        note: item.note,
        quantity: item.quantity,
        amount: cents_to_dollars(item.total_cents),
      })),
    },
  };
}

export async function api_ledger(pool: Db, guild_id: string): Promise<ApiResult> {
  const balances = await list_balances(pool, guild_id);
  return {
    status: 200,
    body: {
      ok: true,
      guild_id,
      balances: balances.map((balance) => ({
        display_name: balance.display_name,
        charged: cents_to_dollars(balance.charged_cents),
        paid: cents_to_dollars(balance.paid_cents),
        balance: cents_to_dollars(balance.balance_cents),
      })),
    },
  };
}

/** 誰欠誰：互相抵銷後的實際欠款，加上壓到最少筆數的轉帳建議。 */
export async function api_debts(pool: Db, guild_id: string): Promise<ApiResult> {
  const edges = await list_debt_edges(pool, guild_id);
  return {
    status: 200,
    body: {
      ok: true,
      guild_id,
      debts: net_debts(edges).map(to_debt_json),
      suggested_transfers: simplify_debts(edges).map(to_debt_json),
    },
  };
}

/** 儀表板用的彙總；金額同樣以元為單位。 */
export async function api_overview(pool: Db): Promise<ApiResult> {
  const counts = await overview_counts(pool);
  return {
    status: 200,
    body: {
      ok: true,
      restaurants: counts.restaurants,
      active_menus: counts.active_menus,
      sessions: counts.sessions,
      open_sessions: counts.open_sessions,
      order_lines: counts.order_lines,
      spend: cents_to_dollars(counts.spend_cents),
      llm_calls_24h: counts.llm_calls_24h,
    },
  };
}

export async function api_llm_usage(pool: Db, hours: number): Promise<ApiResult> {
  return { status: 200, body: { ok: true, hours, usage: await summarise_llm_usage(pool, hours) } };
}

function to_debt_json(edge: DebtEdge): { from: string; to: string; amount: number } {
  return {
    from: edge.from_user_id,
    to: edge.to_user_id,
    amount: cents_to_dollars(edge.amount_cents),
  };
}
