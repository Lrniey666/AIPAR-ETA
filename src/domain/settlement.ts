// 結算：把一場揪團的每人應付金額落成帳本裡的 charge。
// 可重跑——charge 對「同場同人」有唯一索引，第二次呼叫不會重複計費。

import { record_entry } from "../db/ledger.ts";
import type { Db } from "../db/pool.ts";
import type { LedgerBalance, OrderSession } from "../db/types.ts";
import type { OrderSummary, PersonTotal } from "./ordering.ts";

export type SettlementResult = {
  charged: PersonTotal[];
  already_charged: PersonTotal[];
  total_cents: number;
};

export async function settle_session(
  pool: Db,
  session: OrderSession,
  summary: OrderSummary,
  created_by: string,
): Promise<SettlementResult> {
  const charged: PersonTotal[] = [];
  const already_charged: PersonTotal[] = [];

  for (const person of summary.people) {
    if (person.total_cents <= 0) {
      continue;
    }
    const entry = await record_entry(pool, {
      session_id: session.id,
      guild_id: session.guild_id,
      discord_user_id: person.discord_user_id,
      kind: "charge",
      amount_cents: person.total_cents,
      note: session.title,
      created_by,
    });
    if (entry) {
      charged.push(person);
    } else {
      already_charged.push(person);
    }
  }

  return { charged, already_charged, total_cents: summary.total_cents };
}

/** 誰還欠錢（餘額為負）。 */
export function outstanding(balances: LedgerBalance[]): LedgerBalance[] {
  return balances.filter((balance) => balance.balance_cents < 0);
}

/** 整個伺服器的未結金額（正數＝還有多少沒收齊）。 */
export function total_outstanding_cents(balances: LedgerBalance[]): number {
  return outstanding(balances).reduce((sum, balance) => sum - balance.balance_cents, 0);
}
