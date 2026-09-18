// 離線測試：不需要資料庫、不需要網路、不需要金鑰。
// 這裡驗的是「錢算得對不對、菜單讀得出來、點餐對得到品項」這幾件會直接影響使用者的事。

import assert from "node:assert/strict";
import { test } from "node:test";

import { dedupe_items, normalise_llm_menu, parse_menu_line, parse_menu_text } from "../src/domain/menu_draft.ts";
import { summarise_orders } from "../src/domain/ordering.ts";
import { extract_json } from "../src/llm/json.ts";
import { parse_order_by_rules } from "../src/llm/tasks/order_parse.ts";
import { classify_by_rules, guess_restaurant } from "../src/llm/tasks/intent.ts";
import { format_cents, parse_price_to_cents, split_evenly } from "../src/shared/money.ts";
import { names_match, normalise_key, similarity } from "../src/shared/text.ts";
import { format_date, format_time, parse_duration_to_date } from "../src/shared/time.ts";
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

function make_line(user: string, name: string, price_cents: number, quantity: number): OrderLine {
  return {
    id: Math.random(),
    session_id: 1,
    discord_user_id: user,
    display_name: user,
    menu_item_id: null,
    item_name: name,
    unit_price_cents: price_cents,
    quantity,
    note: "",
    source: "component",
    created_at: new Date(),
    updated_at: new Date(),
  };
}

test("金額：分攤後總和必須完全等於原金額", () => {
  for (const [total, people] of [
    [10000, 3],
    [9999, 7],
    [1, 4],
    [0, 3],
  ] as const) {
    const shares = split_evenly(total, people);
    assert.equal(shares.length, people);
    assert.equal(
      shares.reduce((sum, value) => sum + value, 0),
      total,
      `${total} 分給 ${people} 人後總和不符`,
    );
    assert.ok(Math.max(...shares) - Math.min(...shares) <= 1, "分攤差距不應超過 1 分");
  }
});

test("金額：解析與顯示", () => {
  assert.equal(parse_price_to_cents("90"), 9000);
  assert.equal(parse_price_to_cents("NT$1,200"), 120000);
  assert.equal(parse_price_to_cents("８０元"), 8000);
  assert.equal(parse_price_to_cents("不是價格"), undefined);
  assert.equal(format_cents(9000), "NT$ 90");
  assert.equal(format_cents(-4550), "-NT$ 45.5");
});

test("文字：正規化與比對", () => {
  assert.equal(normalise_key("臺式 炒 麺"), "台式炒麵");
  assert.ok(names_match("雞腿飯", "招牌雞腿飯"));
  assert.ok(!names_match("紅茶", "奶綠"));
  assert.ok(similarity("珍珠奶茶", "珍奶") > 0);
});

test("時間：台北時間格式與相對時間", () => {
  const fixed = new Date("2026-09-18T05:06:07Z"); // 台北時間 13:06:07
  assert.equal(format_date(fixed), "2026-09-18");
  assert.equal(format_time(fixed), "13:06:07");

  const base = new Date("2026-09-18T00:00:00Z");
  assert.equal(parse_duration_to_date("30m", base)?.toISOString(), "2026-09-18T00:30:00.000Z");
  assert.equal(parse_duration_to_date("1h30m", base)?.toISOString(), "2026-09-18T01:30:00.000Z");
  assert.equal(parse_duration_to_date("45", base)?.toISOString(), "2026-09-18T00:45:00.000Z");
  assert.equal(parse_duration_to_date("不知道", base), undefined);
});

test("菜單：純文字解析", () => {
  const { items, skipped } = parse_menu_text(
    ["【飯類】", "雞腿飯 90", "排骨飯｜85｜不辣", "1. 滷肉飯  60", "【飲料】", "紅茶 20", "今日公休"].join("\n"),
  );

  assert.equal(items.length, 4);
  assert.deepEqual(
    items.map((item) => [item.category, item.name, item.price_cents]),
    [
      ["飯類", "雞腿飯", 9000],
      ["飯類", "排骨飯", 8500],
      ["飯類", "滷肉飯", 6000],
      ["飲料", "紅茶", 2000],
    ],
  );
  assert.deepEqual(skipped, ["今日公休"]);
  assert.equal(items[1]?.note, "不辣");
});

test("菜單：單行沒有價格就不收", () => {
  assert.equal(parse_menu_line("本日公休"), undefined);
  assert.equal(parse_menu_line("招牌套餐 附湯"), undefined);
  assert.equal(parse_menu_line("招牌套餐 120")?.price_cents, 12000);
});

test("菜單：LLM 輸出正規化會丟掉沒有價格的品項", () => {
  const { items, title } = normalise_llm_menu({
    title: "聞香來簡餐",
    categories: [
      {
        name: "主餐",
        items: [
          { name: "宮保雞丁飯", price: 100 },
          { name: "看不清的品項", note: "看不清" },
          { name: "魚香肉絲飯", price: "110" },
        ],
      },
    ],
  });

  assert.equal(title, "聞香來簡餐");
  assert.deepEqual(
    items.map((item) => [item.name, item.price_cents]),
    [
      ["宮保雞丁飯", 10000],
      ["魚香肉絲飯", 11000],
    ],
  );
});

test("菜單：同名同價會去重，同名不同價保留", () => {
  const items = dedupe_items([
    { category: "", name: "紅茶", price_cents: 2000, unit: "", note: "" },
    { category: "", name: "紅茶", price_cents: 2000, unit: "", note: "" },
    { category: "", name: "紅茶", price_cents: 3000, unit: "", note: "大杯" },
  ]);
  assert.equal(items.length, 2);
});

test("點餐：規則解析對得到品項與數量", () => {
  const menu = [make_item(1, "雞腿飯", 9000), make_item(2, "紅茶", 2000), make_item(3, "貢丸湯", 3000)];
  const outcome = parse_order_by_rules("我要兩個雞腿飯跟一杯紅茶", menu);

  assert.equal(outcome.used_llm, false);
  assert.deepEqual(
    outcome.picks.map((pick) => [pick.item.name, pick.quantity]),
    [
      ["雞腿飯", 2],
      ["紅茶", 1],
    ],
  );
});

test("點餐：對不到的字句要照實回報，不能硬湊", () => {
  const menu = [make_item(1, "雞腿飯", 9000)];
  const outcome = parse_order_by_rules("給我一份牛排", menu);
  assert.equal(outcome.picks.length, 0);
  assert.equal(outcome.unmatched.length, 1);
});

test("彙總：每人應付與全體清單", () => {
  const summary = summarise_orders([
    make_line("A", "雞腿飯", 9000, 1),
    make_line("A", "紅茶", 2000, 2),
    make_line("B", "雞腿飯", 9000, 1),
  ]);

  assert.equal(summary.headcount, 2);
  assert.equal(summary.total_quantity, 4);
  assert.equal(summary.total_cents, 9000 + 4000 + 9000);
  assert.equal(summary.people[0]?.discord_user_id, "A");
  assert.equal(summary.people[0]?.total_cents, 13000);
  assert.equal(summary.items[0]?.item_name, "雞腿飯");
  assert.equal(summary.items[0]?.quantity, 2);
});

test("LLM：從髒輸出裡挖 JSON", () => {
  assert.deepEqual(extract_json('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extract_json('先說明一下：{"a":[1,2]} 以上'), { a: [1, 2] });
  assert.equal(extract_json("完全沒有 JSON"), undefined);
  assert.equal(extract_json(""), undefined);
});

test("意圖：常見說法用規則就判得出來", () => {
  assert.equal(classify_by_rules("聞香來有什麼").name, "menu-query");
  assert.equal(classify_by_rules("來開團訂便當").name, "create-session");
  assert.equal(classify_by_rules("我還欠多少錢").name, "ledger-query");
  assert.equal(classify_by_rules("這個怎麼用").name, "help");
  assert.equal(guess_restaurant("我想看聞香來的菜單"), "聞香來");
});
