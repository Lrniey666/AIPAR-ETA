// 債務關係：把帳本裡有指定對象的紀錄，收斂成「誰該把多少錢拿給誰」。
//
// 為什麼要這一層：個人結餘只答得出「我還欠 250」，答不出「我該拿給誰」。
// 這裡是純函式，不碰資料庫也不碰 Discord，方便單獨驗算。

import type { DebtEdge } from "../db/types.ts";

/** 小於 1 元的零頭不值得叫人轉帳，視為已結清。 */
const DUST_CENTS = 100;

/** 有向圖：from → to → 金額。用巢狀 Map 而不是字串鍵，省得處理分隔字元。 */
type DebtGraph = Map<string, Map<string, number>>;

function build_graph(edges: DebtEdge[]): DebtGraph {
  const graph: DebtGraph = new Map();
  for (const edge of edges) {
    if (!edge.from_user_id || !edge.to_user_id || edge.from_user_id === edge.to_user_id) {
      continue;
    }
    const row = graph.get(edge.from_user_id) ?? new Map<string, number>();
    row.set(edge.to_user_id, (row.get(edge.to_user_id) ?? 0) + edge.amount_cents);
    graph.set(edge.from_user_id, row);
  }
  return graph;
}

/**
 * 把雙向的邊互抵成單向淨額。
 * A 欠 B 300、B 欠 A 100 → A 欠 B 200；抵平或反向的邊直接消失。
 */
export function net_debts(edges: DebtEdge[]): DebtEdge[] {
  const graph = build_graph(edges);
  const netted: DebtEdge[] = [];
  const done = new Set<string>();

  for (const [from_user_id, row] of graph) {
    for (const [to_user_id, amount] of row) {
      if (done.has(`${from_user_id}>${to_user_id}`) || done.has(`${to_user_id}>${from_user_id}`)) {
        continue;
      }
      done.add(`${from_user_id}>${to_user_id}`);
      const net = amount - (graph.get(to_user_id)?.get(from_user_id) ?? 0);

      if (net >= DUST_CENTS) {
        netted.push({ from_user_id, to_user_id, amount_cents: net });
      } else if (net <= -DUST_CENTS) {
        netted.push({ from_user_id: to_user_id, to_user_id: from_user_id, amount_cents: -net });
      }
    }
  }
  return sort_edges(netted);
}

/**
 * 把債務網路壓成最少的轉帳筆數：先算每個人的淨額，再讓欠最多的人付給被欠最多的人。
 * 三個人互相欠來欠去時，`net_debts` 會給三筆，這裡通常壓到兩筆。
 *
 * 貪婪法不保證理論最小，但在實驗室十來個人的規模下和最佳解幾乎一致，
 * 而且排序固定、同樣的輸入永遠得到同樣的建議，看得懂也測得住。
 */
export function simplify_debts(edges: DebtEdge[]): DebtEdge[] {
  const balances = new Map<string, number>();
  for (const edge of net_debts(edges)) {
    balances.set(edge.from_user_id, (balances.get(edge.from_user_id) ?? 0) - edge.amount_cents);
    balances.set(edge.to_user_id, (balances.get(edge.to_user_id) ?? 0) + edge.amount_cents);
  }

  // 負數＝還欠錢（要付出去），正數＝被欠（要收回來）。
  const debtors = [...balances.entries()]
    .filter(([, amount]) => amount <= -DUST_CENTS)
    .map(([user_id, amount]) => ({ user_id, amount: -amount }))
    .sort((a, b) => b.amount - a.amount || a.user_id.localeCompare(b.user_id));
  const creditors = [...balances.entries()]
    .filter(([, amount]) => amount >= DUST_CENTS)
    .map(([user_id, amount]) => ({ user_id, amount }))
    .sort((a, b) => b.amount - a.amount || a.user_id.localeCompare(b.user_id));

  const transfers: DebtEdge[] = [];
  let debtor_index = 0;
  let creditor_index = 0;
  while (debtor_index < debtors.length && creditor_index < creditors.length) {
    const debtor = debtors[debtor_index]!;
    const creditor = creditors[creditor_index]!;
    const amount = Math.min(debtor.amount, creditor.amount);
    if (amount >= DUST_CENTS) {
      transfers.push({
        from_user_id: debtor.user_id,
        to_user_id: creditor.user_id,
        amount_cents: amount,
      });
    }
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount < DUST_CENTS) {
      debtor_index += 1;
    }
    if (creditor.amount < DUST_CENTS) {
      creditor_index += 1;
    }
  }
  return sort_edges(transfers);
}

/** 某個人的兩邊：他要付出去的、以及別人該還他的。 */
export function debts_for_user(
  edges: DebtEdge[],
  user_id: string,
): { owes: DebtEdge[]; owed: DebtEdge[] } {
  const netted = net_debts(edges);
  return {
    owes: netted.filter((edge) => edge.from_user_id === user_id),
    owed: netted.filter((edge) => edge.to_user_id === user_id),
  };
}

/** 金額大的排前面；同額時用 id 排，讓輸出穩定可測。 */
function sort_edges(edges: DebtEdge[]): DebtEdge[] {
  return edges.sort(
    (a, b) =>
      b.amount_cents - a.amount_cents ||
      a.from_user_id.localeCompare(b.from_user_id) ||
      a.to_user_id.localeCompare(b.to_user_id),
  );
}
