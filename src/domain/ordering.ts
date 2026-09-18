// 點餐彙總：把一場揪團的所有點餐列，整理成「全體清單」與「每人應付」。
// 這裡是純函式，不碰資料庫也不碰 Discord，方便單獨驗算。

import type { OrderLine } from "../db/types.ts";

export type PersonTotal = {
  discord_user_id: string;
  display_name: string;
  lines: OrderLine[];
  quantity: number;
  total_cents: number;
};

export type ItemTotal = {
  item_name: string;
  unit_price_cents: number;
  note: string;
  quantity: number;
  total_cents: number;
};

export type OrderSummary = {
  people: PersonTotal[];
  items: ItemTotal[];
  total_cents: number;
  total_quantity: number;
  headcount: number;
};

export function line_total_cents(line: OrderLine): number {
  return line.unit_price_cents * line.quantity;
}

export function summarise_orders(lines: OrderLine[]): OrderSummary {
  const people = new Map<string, PersonTotal>();
  const items = new Map<string, ItemTotal>();
  let total_cents = 0;
  let total_quantity = 0;

  for (const line of lines) {
    const amount = line_total_cents(line);
    total_cents += amount;
    total_quantity += line.quantity;

    const person = people.get(line.discord_user_id) ?? {
      discord_user_id: line.discord_user_id,
      display_name: line.display_name,
      lines: [],
      quantity: 0,
      total_cents: 0,
    };
    person.display_name = line.display_name || person.display_name;
    person.lines.push(line);
    person.quantity += line.quantity;
    person.total_cents += amount;
    people.set(line.discord_user_id, person);

    // 品名＋單價＋備註相同才算同一列，否則「大杯／小杯」會被併在一起。
    const item_key = `${line.item_name}::${line.unit_price_cents}::${line.note}`;
    const item = items.get(item_key) ?? {
      item_name: line.item_name,
      unit_price_cents: line.unit_price_cents,
      note: line.note,
      quantity: 0,
      total_cents: 0,
    };
    item.quantity += line.quantity;
    item.total_cents += amount;
    items.set(item_key, item);
  }

  return {
    people: [...people.values()].sort((a, b) => b.total_cents - a.total_cents),
    items: [...items.values()].sort((a, b) => b.quantity - a.quantity || b.total_cents - a.total_cents),
    total_cents,
    total_quantity,
    headcount: people.size,
  };
}

/** 給店家看的訂單：品名 × 數量，一行一項。 */
export function format_kitchen_list(summary: OrderSummary, format_money: (cents: number) => string): string[] {
  return summary.items.map((item) => {
    const note = item.note ? `（${item.note}）` : "";
    return `${item.item_name}${note} × ${item.quantity} = ${format_money(item.total_cents)}`;
  });
}
