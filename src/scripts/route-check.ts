// 一次性檢查：拿真實資料庫跑一遍自然語言的路由決策，不經 Discord。
// 用途是確認「提到已建檔的店」與「沒有菜單」這兩條路真的擋在模型前面。

import { load_config } from "../config.ts";
import { create_pool } from "../db/pool.ts";
import { list_restaurants_with_menu } from "../db/restaurants.ts";
import { find_mentions, type RestaurantFact } from "../domain/grounding.ts";
import { extract_dish_query } from "../domain/dish_query.ts";
import { capture_memory, is_memory_question } from "../domain/memory_capture.ts";
import { classify_by_rules } from "../llm/tasks/intent.ts";

const QUESTIONS = [
  "四海豆漿大王有甚麼好吃的",
  "四海豆漿大王的菜單",
  "有沒有豆腐鍋可以吃",
  "有沒有牛排可以吃",
  "我想吃滷肉飯",
  "給我看看菜單",
  "你有記憶功能嗎",
  "記住我不吃牛",
  "我還欠多少錢",
  "推薦吃甚麼",
  "幫我挑",
  "給我麵店",
  "隨便都可以",
  "你喜歡賽馬娘嗎",
  "今天天氣真好",
];

const pool = create_pool(load_config());
try {
  const facts: RestaurantFact[] = (await list_restaurants_with_menu(pool, 40)).map((row) => ({
    restaurant: row,
    menu_version: row.menu_version ?? undefined,
    item_count: row.item_count,
  }));

  console.log("資料庫餐廳：");
  for (const fact of facts) {
    console.log(`  ${fact.restaurant.name} → ${fact.menu_version === undefined ? "尚無菜單" : `v${fact.menu_version} (${fact.item_count} 項)`}`);
  }
  console.log("");

  for (const question of QUESTIONS) {
    const intent = classify_by_rules(question);
    const mentions = find_mentions(question, facts);
    const named = mentions.find((mention) => mention.kind === "exact");
    const guessed = mentions.find((mention) => mention.kind === "partial");
    const route = is_memory_question(question)
      ? "記憶（程式回答）"
      : capture_memory(question)
        ? "寫入長期記憶"
        : named && intent.name !== "ledger-query"
          ? named.fact.menu_version === undefined
            ? `確定性：「${named.fact.restaurant.name} 還沒建菜單」`
            : `確定性：${named.fact.restaurant.name} 菜單 Embed`
          : extract_dish_query(question)
            ? `確定性：查 menu_items「${extract_dish_query(question)}」`
            : guessed && intent.name !== "ledger-query"
              ? `先問「你是說 ${guessed.fact.restaurant.name} 嗎」＋菜單`
            : intent.name === "recommend"
              ? "確定性：從 menu_items 抽幾樣推薦"
              : intent.name === "ledger-query"
            ? "確定性：帳務 Embed"
            : intent.name === "menu-query"
              ? "確定性：餐廳清單（含菜單狀態）"
              : intent.name === "help"
                ? "確定性：說明 Embed"
                : "交給模型（含事實區塊＋守門）";
    console.log(`「${question}」\n    意圖=${intent.name}  → ${route}`);
  }
} finally {
  await pool.end();
}
