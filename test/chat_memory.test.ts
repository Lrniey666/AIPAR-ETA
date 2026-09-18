// 離線測試：自然語言接地（防幻覺）與記憶擷取。
//
// 這一組是照著一次真實的幻覺寫的：使用者問「四海豆漿大王有甚麼好吃的」，
// 那間店在資料庫裡但**還沒建菜單**，bot 卻列出四道菜。
// 下面把當時的每一個破口都釘住。

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  build_facts_block,
  find_mentioned_restaurants,
  find_mentions,
  looks_like_invented_menu,
  type RestaurantFact,
} from "../src/domain/grounding.ts";
import { is_recommendable, pick_recommendations, seed_from } from "../src/domain/recommend.ts";
import { extract_dish_query } from "../src/domain/dish_query.ts";
import { capture_memory, is_memory_question } from "../src/domain/memory_capture.ts";
import { classify_by_rules } from "../src/llm/tasks/intent.ts";
import { fold_variants, normalise_key } from "../src/shared/text.ts";
import type { Restaurant } from "../src/db/types.ts";

function make_restaurant(id: number, name: string, aliases: string[] = []): Restaurant {
  return {
    id,
    name,
    name_key: normalise_key(name),
    aliases,
    phone: "",
    address: "",
    note: "",
    is_active: true,
    created_by: "",
    created_at: new Date(),
    updated_at: new Date(),
  };
}

const WITH_MENU: RestaurantFact = {
  restaurant: make_restaurant(7, "雷荷豆腐鍋專賣店"),
  menu_version: 1,
  item_count: 12,
};

const WITHOUT_MENU: RestaurantFact = {
  restaurant: make_restaurant(8, "四海豆漿大王", ["四海"]),
  item_count: 0,
};

const FACTS = [WITH_MENU, WITHOUT_MENU];

test("接地：店名出現在句子裡就要找得到（舊版比對方向反了）", () => {
  const hits = find_mentioned_restaurants("四海豆漿大王有甚麼好吃的", FACTS);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.restaurant.name, "四海豆漿大王");
});

test("接地：別名也算，而且最長的店名優先", () => {
  assert.equal(find_mentioned_restaurants("四海今天開嗎", FACTS)[0]?.restaurant.name, "四海豆漿大王");

  const both = find_mentioned_restaurants("四海豆漿大王跟雷荷豆腐鍋專賣店哪家近", FACTS);
  assert.deepEqual(
    both.map((hit) => hit.restaurant.name),
    ["雷荷豆腐鍋專賣店", "四海豆漿大王"],
  );
});

test("接地：沒提到任何已建檔的店就回空，不要硬湊", () => {
  assert.deepEqual(find_mentioned_restaurants("今天天氣真好", FACTS), []);
  assert.deepEqual(find_mentioned_restaurants("", FACTS), []);
});

test("接地：事實區塊一定要講出「尚無菜單」", () => {
  const block = build_facts_block(
    {
      identity: { guild_name: "路路實驗中心", channel_name: "綜合聊天室", user_display_name: "阿明" },
      restaurants: FACTS,
      debts: [],
      memories: [],
      commands: ["/菜單"],
    },
    "zh-TW",
  );

  assert.ok(block.includes("四海豆漿大王"));
  assert.ok(block.includes("尚無菜單"), "沒有菜單的店必須明確標示，否則模型會自己補菜色");
  assert.ok(block.includes("菜單 v1，12 項"));
  // 身分要進得去：多人頻道裡模型得知道現在是誰在問。
  assert.ok(block.includes("路路實驗中心"));
  assert.ok(block.includes("綜合聊天室"));
  assert.ok(block.includes("阿明"));
});

test("守門：當時那段編造的菜單要被攔下來", () => {
  const hallucination = [
    "四海豆漿大王的招牌有：",
    "• 豆漿大王（原味、香草、巧克力）",
    "• 甜不辣捲",
    "• 豆腐乳燒肉",
    "• 蔥油餅",
  ].join("\n");

  assert.equal(looks_like_invented_menu(hallucination), true);
  assert.equal(looks_like_invented_menu("雞腿飯一份 90 元喔"), true);
  assert.equal(looks_like_invented_menu("大概 NT$ 120 左右"), true);
});

test("守門：正常回答不能被誤殺", () => {
  assert.equal(
    looks_like_invented_menu("四海豆漿大王有建檔，但還沒有菜單，所以我不知道它賣什麼。"),
    false,
  );
  // 條列指令是正常的，那幾行都帶 /，不算菜單。
  assert.equal(looks_like_invented_menu("可以用：\n- /菜單 查看\n- /帳務 我的"), false);
  assert.equal(looks_like_invented_menu("天氣真好！要不要開團？"), false);
});

test("意圖：「有甚麼」和「有什麼」不能判成兩件事", () => {
  assert.equal(fold_variants("有甚麼好吃的"), "有什麼好吃的");
  // 兩種寫法要走同一條路；有沒有提到店名由 find_mentions 決定，不是意圖決定。
  assert.equal(
    classify_by_rules("四海豆漿大王有甚麼好吃的").name,
    classify_by_rules("四海豆漿大王有什麼好吃的").name,
  );
  assert.equal(classify_by_rules("老余麵店的菜單").name, "menu-query");
});

test("意圖：要建議和要清單是兩件事", () => {
  // 第一版把這兩種混在一起，於是「推薦」「幫我挑」「給我麵店」都回同一塊餐廳清單。
  for (const text of ["推薦吃甚麼", "幫我挑", "隨便都可以", "不知道吃什麼", "肚子餓"]) {
    assert.equal(classify_by_rules(text).name, "recommend", text);
  }
  for (const text of ["有哪些店的菜單", "菜單"]) {
    assert.equal(classify_by_rules(text).name, "menu-query", text);
  }
});

test("接地：只對到店名的一部分時要標成 partial，好回問一句", () => {
  const partial = find_mentions("給我麵店", [
    WITH_MENU,
    WITHOUT_MENU,
    { restaurant: make_restaurant(9, "老余麵店", ["老余"]), menu_version: 1, item_count: 33 },
  ]);
  assert.equal(partial.length, 1);
  assert.equal(partial[0]?.kind, "partial");
  assert.equal(partial[0]?.fact.restaurant.name, "老余麵店");

  // 完整命中就不是 partial，也不該回問。
  const exact = find_mentions("老余麵店有什麼", [WITH_MENU, WITHOUT_MENU]);
  assert.deepEqual(exact, []);
});

test("接地：片段不只屬於一家就不猜", () => {
  const ambiguous = find_mentions("那家店", [
    { restaurant: make_restaurant(9, "老余麵店"), menu_version: 1, item_count: 33 },
    { restaurant: make_restaurant(10, "夜梟楠梓店"), item_count: 0 },
  ]);
  assert.deepEqual(ambiguous, []);
});

test("推薦：同一組種子永遠給同一組結果，而且盡量一家一樣", () => {
  const candidates = [
    { restaurant_id: 1, restaurant_name: "老余麵店", item_name: "牛肉麵", price_cents: 12000, note: "" },
    { restaurant_id: 1, restaurant_name: "老余麵店", item_name: "乾麵", price_cents: 5000, note: "" },
    { restaurant_id: 2, restaurant_name: "雷荷", item_name: "豆腐鍋", price_cents: 10000, note: "" },
  ];

  const seed = seed_from("user-a", "2026-09-18", "0");
  const first = pick_recommendations(candidates, seed, 2);
  const again = pick_recommendations(candidates, seed, 2);

  assert.deepEqual(first, again, "同一個種子要給同一組，不然每問一次都在跳");
  assert.equal(first.length, 2);
  assert.equal(new Set(first.map((pick) => pick.restaurant_id)).size, 2, "兩樣應該來自不同店家");

  // 候選不夠時就給得出幾樣算幾樣，不要硬湊。
  assert.equal(pick_recommendations(candidates, seed, 10).length, 3);
  assert.deepEqual(pick_recommendations([], seed, 3), []);
});

test("推薦：加購項目不拿來推薦", () => {
  assert.ok(is_recommendable("牛肉麵"));
  assert.ok(!is_recommendable("加豬五花"));
  assert.ok(!is_recommendable("換細麵"));
  assert.ok(!is_recommendable("升級大碗"));

  const mixed = [
    { restaurant_id: 1, restaurant_name: "老余麵店", item_name: "加肉片", price_cents: 3500, note: "" },
    { restaurant_id: 1, restaurant_name: "老余麵店", item_name: "牛肉麵", price_cents: 12000, note: "" },
  ];
  const picks = pick_recommendations(mixed, seed_from("user-a", "2026-09-18", "0"), 2);
  assert.deepEqual(
    picks.map((pick) => pick.item_name),
    ["牛肉麵"],
  );

  // 整份菜單都是加購時就不挑剔了，有總比沒有好。
  const only_add_ons = [mixed[0]!];
  assert.equal(pick_recommendations(only_add_ons, 1, 1).length, 1);
});

test("守門：列出已知店名不算編菜單", () => {
  const names = ["老余麵店", "雷荷豆腐鍋專賣店"];
  assert.equal(
    looks_like_invented_menu(["要不要看看：", "• 老余麵店", "• 雷荷豆腐鍋專賣店"].join("\n"), names),
    false,
  );
  // 不認得的東西列兩行以上還是要擋。
  assert.equal(looks_like_invented_menu(["• 甜不辣捲", "• 蔥油餅"].join("\n"), names), true);
});

test("菜名查詢：問「有沒有 X」要抽得出 X", () => {
  assert.equal(extract_dish_query("有沒有豆腐鍋可以吃"), "豆腐鍋");
  assert.equal(extract_dish_query("哪家有滷肉飯"), "滷肉飯");
  assert.equal(extract_dish_query("我想吃雞腿飯"), "雞腿飯");
  assert.equal(extract_dish_query("誰有賣珍珠奶茶"), "珍珠奶茶");
});

test("菜名查詢：抽不到就走一般流程，不要硬湊", () => {
  assert.equal(extract_dish_query("今天天氣真好"), undefined);
  assert.equal(extract_dish_query("有沒有人"), undefined);
  assert.equal(extract_dish_query(""), undefined);
});

test("記憶：明講要記的才記", () => {
  const explicit = capture_memory("記住我週三都不在");
  assert.equal(explicit?.scope, "user");
  assert.equal(explicit?.fact_value, "我週三都不在");

  assert.equal(capture_memory("我不吃牛")?.fact_value, "不吃 牛");
  assert.equal(capture_memory("我對花生過敏")?.fact_value, "對 花生 過敏");
  assert.equal(capture_memory("叫我小明就好")?.fact_value, "希望被叫 小明就好");

  // 沒有交代偏好的句子不該被記成事實。
  assert.equal(capture_memory("這家的牛肉麵不好吃"), undefined);
  assert.equal(capture_memory("今天天氣真好"), undefined);
  assert.equal(capture_memory(""), undefined);
});

test("記憶：「這個頻道」的事記成頻道範圍", () => {
  assert.equal(capture_memory("記住這個頻道都訂素食")?.scope, "channel");
  assert.equal(capture_memory("記住我都訂素食")?.scope, "user");
});

test("記憶：問到記憶功能要由程式回答，不能讓模型自己說", () => {
  assert.ok(is_memory_question("你有記憶功能嗎"));
  assert.ok(is_memory_question("你還記得我說過什麼嗎"));
  assert.ok(is_memory_question("do you remember me"));
  assert.ok(!is_memory_question("我要一個雞腿飯"));
});
