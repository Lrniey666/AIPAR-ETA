// 離線測試：自然語言點餐、取消，以及「誰欠誰」的債務收斂。
// 這幾條都是 0.3.0 修掉的實際缺陷，留成測試才不會改回去。

import assert from "node:assert/strict";
import { test } from "node:test";

import { net_debts, simplify_debts, debts_for_user } from "../src/domain/debts.ts";
import { classify_by_rules } from "../src/llm/tasks/intent.ts";
import { is_cancel_request, plan_cancellation } from "../src/llm/tasks/order_cancel.ts";
import {
  chinese_to_number,
  parse_order_by_rules,
  read_quantity,
} from "../src/llm/tasks/order_parse.ts";
import { normalise_key } from "../src/shared/text.ts";
import { is_past, minutes_from_now } from "../src/shared/time.ts";
import type { MenuItem, OrderLine } from "../src/db/types.ts";

function make_item(id: number, name: string, price_cents: number): MenuItem {
  return {
    id,
    menu_id: 1,
    category: "",
    name,
    name_key: normalise_key(name),
    price_cents,
    unit: "",
    note: "",
    position: id,
    is_available: true,
  };
}

function make_line(id: number, name: string, quantity: number): OrderLine {
  return {
    id,
    session_id: 1,
    discord_user_id: "user-a",
    display_name: "阿明",
    menu_item_id: id,
    item_name: name,
    unit_price_cents: 9000,
    quantity,
    note: "",
    source: "component",
    created_at: new Date(),
    updated_at: new Date(),
  };
}

const MENU = [
  make_item(1, "雞腿飯", 9000),
  make_item(2, "紅茶", 2000),
  make_item(3, "三杯雞飯", 11000),
  make_item(4, "牛三寶麵", 25900),
  make_item(5, "四季豆", 4500),
];

test("點餐：品名裡的數字不能被當成份數", () => {
  // 舊版會把「三杯」讀成三份、再把它從句子裡刪掉，於是變成三份「雞飯」。
  for (const [sentence, name, quantity] of [
    ["我要三杯雞飯", "三杯雞飯", 1],
    ["來一份牛三寶麵", "牛三寶麵", 1],
    ["四季豆", "四季豆", 1],
  ] as const) {
    const outcome = parse_order_by_rules(sentence, MENU);
    assert.deepEqual(
      outcome.picks.map((pick) => [pick.item.name, pick.quantity]),
      [[name, quantity]],
      sentence,
    );
  }
});

test("點餐：明確講份數時要算對", () => {
  for (const [sentence, expected] of [
    ["我要兩個雞腿飯", 2],
    ["雞腿飯 x3", 3],
    ["雞腿飯3份", 3],
    ["十個雞腿飯", 10],
    ["雞腿飯", 1],
  ] as const) {
    const outcome = parse_order_by_rules(sentence, MENU);
    assert.equal(outcome.picks[0]?.item.name, "雞腿飯", sentence);
    assert.equal(outcome.picks[0]?.quantity, expected, sentence);
  }
});

test("點餐：一句話點兩樣東西", () => {
  const outcome = parse_order_by_rules("我要兩個雞腿飯跟一杯紅茶", MENU);
  assert.deepEqual(
    outcome.picks.map((pick) => [pick.item.name, pick.quantity]),
    [
      ["雞腿飯", 2],
      ["紅茶", 1],
    ],
  );
});

test("點餐：同一品項分兩次講要合併數量", () => {
  const outcome = parse_order_by_rules("雞腿飯兩份，還有雞腿飯一份", MENU);
  assert.equal(outcome.picks.length, 1);
  assert.equal(outcome.picks[0]?.quantity, 3);
});

test("數量：中文數字與殘字解析", () => {
  assert.equal(chinese_to_number("兩"), 2);
  assert.equal(chinese_to_number("十"), 10);
  assert.equal(chinese_to_number("十五"), 15);
  assert.equal(chinese_to_number("二十"), 20);
  assert.equal(chinese_to_number("雞腿"), undefined);

  assert.equal(read_quantity("兩個"), 2);
  assert.equal(read_quantity("x4"), 4);
  assert.equal(read_quantity("我要"), 1);
  assert.equal(read_quantity(""), 1);
  // 上限是 20，寫 999 也不會一次點出九百多份。
  assert.equal(read_quantity("999份"), 20);
});

test("取消：只有明確的取消動詞才算取消", () => {
  assert.ok(is_cancel_request("取消我的紅茶"));
  assert.ok(is_cancel_request("那個雞腿飯不要了"));
  assert.ok(!is_cancel_request("不要香菜"));
  assert.ok(!is_cancel_request("我要一個雞腿飯"));
});

test("取消：指名品項、全部取消、以及講不清楚時要問", () => {
  const lines = [make_line(11, "雞腿飯", 1), make_line(12, "紅茶", 2)];

  const one = plan_cancellation("取消我的紅茶", lines);
  assert.equal(one.mode, "lines");
  assert.deepEqual(one.mode === "lines" ? one.lines.map((line) => line.id) : [], [12]);

  assert.equal(plan_cancellation("全部取消", lines).mode, "all");
  assert.equal(plan_cancellation("取消", lines).mode, "ambiguous");
  assert.equal(plan_cancellation("取消牛排", lines).mode, "ambiguous");
  assert.equal(plan_cancellation("我要一個雞腿飯", lines).mode, "none");

  // 只有一列時「取消」沒有歧義，可以直接刪。
  const only = plan_cancellation("取消", [lines[0]!]);
  assert.equal(only.mode, "lines");
});

test("意圖：取消要排在點餐之前", () => {
  assert.equal(classify_by_rules("取消我要的雞腿飯").name, "cancel-order");
  assert.equal(classify_by_rules("我要一個雞腿飯").name, "order");
  assert.equal(classify_by_rules("誰欠我錢").name, "ledger-query");
});

test("債務：雙向互抵成一條單向的欠款", () => {
  const netted = net_debts([
    { from_user_id: "a", to_user_id: "b", amount_cents: 30000 },
    { from_user_id: "b", to_user_id: "a", amount_cents: 10000 },
  ]);
  assert.deepEqual(netted, [{ from_user_id: "a", to_user_id: "b", amount_cents: 20000 }]);

  // 抵平就不該留下任何一條邊。
  assert.deepEqual(
    net_debts([
      { from_user_id: "a", to_user_id: "b", amount_cents: 5000 },
      { from_user_id: "b", to_user_id: "a", amount_cents: 5000 },
    ]),
    [],
  );
});

test("債務：轉一圈的欠款可以壓到更少筆", () => {
  const edges = [
    { from_user_id: "a", to_user_id: "b", amount_cents: 10000 },
    { from_user_id: "b", to_user_id: "c", amount_cents: 10000 },
  ];
  const simplified = simplify_debts(edges);

  assert.deepEqual(simplified, [{ from_user_id: "a", to_user_id: "c", amount_cents: 10000 }]);
  // 壓縮之後每個人的淨額不能變。
  assert.equal(total_for(simplified, "a"), -10000);
  assert.equal(total_for(simplified, "c"), 10000);
  assert.equal(total_for(simplified, "b"), 0);
});

test("債務：個人視角分成「要付出去」與「該收回來」", () => {
  const edges = [
    { from_user_id: "a", to_user_id: "b", amount_cents: 12000 },
    { from_user_id: "c", to_user_id: "a", amount_cents: 3000 },
  ];
  const view = debts_for_user(edges, "a");
  assert.equal(view.owes.length, 1);
  assert.equal(view.owes[0]?.to_user_id, "b");
  assert.equal(view.owed.length, 1);
  assert.equal(view.owed[0]?.from_user_id, "c");
});

test("時間：截止分鐘數與是否已過", () => {
  const base = new Date("2026-09-18T00:00:00Z");
  assert.equal(minutes_from_now(30, base)?.toISOString(), "2026-09-18T00:30:00.000Z");
  assert.equal(minutes_from_now(0, base), undefined);
  assert.equal(minutes_from_now(-5, base), undefined);
  assert.equal(minutes_from_now(60 * 24 * 7 + 1, base), undefined);

  assert.ok(is_past(new Date("2026-09-17T23:59:00Z"), base));
  assert.ok(!is_past(new Date("2026-09-18T00:01:00Z"), base));
  assert.ok(!is_past(null, base));
});

function total_for(edges: Array<{ from_user_id: string; to_user_id: string; amount_cents: number }>, user: string) {
  return edges.reduce((sum, edge) => {
    if (edge.from_user_id === user) {
      return sum - edge.amount_cents;
    }
    return edge.to_user_id === user ? sum + edge.amount_cents : sum;
  }, 0);
}
