// 端到端煙霧測試：不經 Discord，直接把「建檔 → 菜單 → 揪團 → 點餐 → 結算 → 帳務」跑一遍。
//
// 用途是驗收與部署後自我檢查：`npm run smoke`。
// 會在資料庫留下前綴為 [煙霧測試] 的資料，結束前自行清掉。

import { load_config } from "../config.ts";
import { list_balances, list_debt_edges, record_entry } from "../db/ledger.ts";
import {
  clear_turns,
  count_turns,
  forget_all,
  list_context_facts,
  record_turn,
  remember_fact,
} from "../db/memory.ts";
import { run_migrations } from "../db/migrate.ts";
import { activate_menu, create_menu_version, list_menu_items } from "../db/menus.ts";
import { add_order_line, create_session, list_order_lines } from "../db/orders.ts";
import { create_pool } from "../db/pool.ts";
import { create_restaurant } from "../db/restaurants.ts";
import { upsert_user } from "../db/users.ts";
import { net_debts, simplify_debts } from "../domain/debts.ts";
import { find_mentioned_restaurants } from "../domain/grounding.ts";
import { capture_memory } from "../domain/memory_capture.ts";
import { parse_menu_text } from "../domain/menu_draft.ts";
import { summarise_orders } from "../domain/ordering.ts";
import { settle_session } from "../domain/settlement.ts";
import { parse_order_by_rules } from "../llm/tasks/order_parse.ts";
import { format_cents } from "../shared/money.ts";
import { format_datetime } from "../shared/time.ts";

const PREFIX = "[煙霧測試]";
const GUILD_ID = `smoke-${Date.now()}`;

const SAMPLE_MENU = [
  "【飯類】",
  "雞腿飯 90",
  "排骨飯｜85｜不辣",
  "滷肉飯 60",
  "【湯品】",
  "貢丸湯 30",
  "【飲料】",
  "紅茶 20",
  "珍珠奶茶 55",
].join("\n");

const config = load_config();
const pool = create_pool(config);

function step(label: string, detail: string): void {
  console.log(`  ✓ ${label}：${detail}`);
}

try {
  console.log(`AIPARC ETA 煙霧測試　${format_datetime()}`);

  await run_migrations(pool);
  step("資料結構", "遷移已套用");

  const restaurant = await create_restaurant(pool, {
    name: `${PREFIX} 聞香來簡餐`,
    aliases: ["聞香來"],
    phone: "07-0000000",
    created_by: "smoke",
  });
  step("餐廳建檔", `${restaurant.name}（id=${restaurant.id}）`);

  const parsed = parse_menu_text(SAMPLE_MENU);
  if (parsed.items.length !== 6) {
    throw new Error(`菜單解析出 ${parsed.items.length} 項，預期 6 項`);
  }
  const menu = await create_menu_version(pool, {
    restaurant_id: restaurant.id,
    source: "manual",
    items: parsed.items,
    created_by: "smoke",
  });
  await activate_menu(pool, menu.id);
  const items = await list_menu_items(pool, menu.id);
  step("菜單上線", `第 ${menu.version} 版，共 ${items.length} 項`);

  const session = await create_session(pool, {
    guild_id: GUILD_ID,
    channel_id: `smoke-channel-${Date.now()}`,
    restaurant_id: restaurant.id,
    menu_id: menu.id,
    title: `${PREFIX} 今日午餐`,
    host_user_id: "user-host",
    deadline_at: null,
  });
  step("開團", session.title);

  // 自然語言點餐（規則路徑，不需要金鑰）
  const diners: Array<[string, string, string]> = [
    ["user-a", "阿明", "我要兩個雞腿飯跟一杯紅茶"],
    ["user-b", "小華", "排骨飯一份，加貢丸湯"],
    ["user-c", "阿美", "珍奶一杯"],
  ];

  for (const [user_id, display_name, sentence] of diners) {
    await upsert_user(pool, user_id, display_name);
    const outcome = parse_order_by_rules(sentence, items);
    if (outcome.picks.length === 0) {
      throw new Error(`「${sentence}」沒有對到任何品項`);
    }
    for (const pick of outcome.picks) {
      await add_order_line(pool, {
        session_id: session.id,
        discord_user_id: user_id,
        display_name,
        menu_item_id: pick.item.id,
        item_name: pick.item.name,
        unit_price_cents: pick.item.price_cents,
        quantity: pick.quantity,
        source: "natural-language",
      });
    }
    step(
      `點餐（${display_name}）`,
      outcome.picks.map((pick) => `${pick.item.name}×${pick.quantity}`).join("、"),
    );
  }

  const summary = summarise_orders(await list_order_lines(pool, session.id));
  const expected = 9000 * 2 + 2000 + 8500 + 3000 + 5500;
  if (summary.total_cents !== expected) {
    throw new Error(`合計 ${summary.total_cents} 與預期 ${expected} 不符`);
  }
  step("彙總", `${summary.headcount} 人、${summary.total_quantity} 份、${format_cents(summary.total_cents)}`);

  const first = await settle_session(pool, session, summary, "user-host");
  const again = await settle_session(pool, session, summary, "user-host");
  if (first.charged.length !== 3 || again.charged.length !== 0) {
    throw new Error(`結算不具冪等性：第一次 ${first.charged.length} 筆、第二次 ${again.charged.length} 筆`);
  }
  step("結算", `${first.charged.length} 人入帳，重跑不會重複計費`);

  // 誰欠誰：結算時每筆 charge 都記了對象（這場的收款人＝開團者）。
  const edges = await list_debt_edges(pool, GUILD_ID);
  const owed_to_host = net_debts(edges).filter((edge) => edge.to_user_id === "user-host");
  if (owed_to_host.length !== 3) {
    throw new Error(`應有 3 個人欠收款人，實際 ${owed_to_host.length}`);
  }
  step(
    "誰欠誰",
    owed_to_host.map((edge) => `${edge.from_user_id} → ${format_cents(edge.amount_cents)}`).join("、"),
  );

  // 阿明把錢拿給收款人之後，這條邊就該消失。
  await record_entry(pool, {
    session_id: null,
    guild_id: GUILD_ID,
    discord_user_id: "user-a",
    kind: "payment",
    amount_cents: 20000,
    counterparty_user_id: "user-host",
    note: `${PREFIX} 付款`,
    created_by: "smoke",
  });

  const after = await list_debt_edges(pool, GUILD_ID);
  if (net_debts(after).some((edge) => edge.from_user_id === "user-a")) {
    throw new Error("阿明付清之後不該還有欠款");
  }
  step("抵銷", `付清後剩 ${simplify_debts(after).length} 筆待轉帳`);

  const balances = await list_balances(pool, GUILD_ID);
  const alice = balances.find((balance) => balance.discord_user_id === "user-a");
  if (!alice || alice.balance_cents !== 20000 - 20000) {
    throw new Error(`阿明的結餘應為 0，實際 ${alice?.balance_cents}`);
  }
  step(
    "帳務",
    balances.map((balance) => `${balance.display_name} ${format_cents(balance.balance_cents)}`).join("、"),
  );

  // 接地：句子提到已建檔的店就要找得到——查不到才會掉進模型，那正是幻覺的入口。
  const mentioned = find_mentioned_restaurants(`${restaurant.name}有甚麼好吃的`, [
    { restaurant, menu_version: menu.version, item_count: items.length },
  ]);
  if (mentioned[0]?.restaurant.id !== restaurant.id) {
    throw new Error("店名出現在句子裡卻比對不到");
  }
  step("接地", `「${restaurant.name}有甚麼好吃的」對到 ${mentioned[0].restaurant.name}`);

  // 記憶：短期照頻道記，長期只記明講的。
  const channel_id = `smoke-memory-${Date.now()}`;
  await record_turn(pool, {
    guild_id: GUILD_ID,
    channel_id,
    discord_user_id: "user-a",
    display_name: "阿明",
    role: "user",
    content: "記住我不吃牛",
  });
  const captured = capture_memory("記住我不吃牛");
  if (!captured) {
    throw new Error("「記住我不吃牛」沒有被擷取成長期記憶");
  }
  await remember_fact(pool, {
    guild_id: GUILD_ID,
    scope: captured.scope,
    subject_id: "user-a",
    fact_key: captured.fact_key,
    fact_value: captured.fact_value,
    created_by: "smoke",
  });

  const facts = await list_context_facts(pool, GUILD_ID, "user-a", channel_id);
  const turns = await count_turns(pool, channel_id);
  if (facts.length !== 1 || turns !== 1) {
    throw new Error(`記憶不如預期：長期 ${facts.length} 條、短期 ${turns} 句`);
  }
  step("記憶", `短期 ${turns} 句、長期「${facts[0]?.fact_value}」`);

  await forget_all(pool, GUILD_ID, captured.scope, "user-a");
  await clear_turns(pool, channel_id);
  if ((await list_context_facts(pool, GUILD_ID, "user-a", channel_id)).length !== 0) {
    throw new Error("忘記之後不該還留著");
  }
  step("忘記", "長期與短期都清乾淨");

  // 收尾：測試資料不留在庫裡
  await pool.query("DELETE FROM ledger_entries WHERE guild_id = $1", [GUILD_ID]);
  await pool.query("DELETE FROM order_sessions WHERE guild_id = $1", [GUILD_ID]);
  await pool.query("DELETE FROM restaurants WHERE id = $1", [restaurant.id]);
  await pool.query("DELETE FROM app_users WHERE discord_user_id = ANY($1::TEXT[])", [
    diners.map(([id]) => id),
  ]);
  step("清理", "測試資料已刪除");

  console.log("煙霧測試通過。");
} catch (error) {
  console.error(`煙霧測試失敗：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
