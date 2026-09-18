// 網站路由比對的離線測試。
// 這組測試的由來：曾經因為少跳過一個路徑片段，所有 /api/* 都回 404，
// 而健康檢查還是綠的——所以路由本身要有自己的測試。

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  match_api_route,
  match_asset_route,
  match_page_route,
  split_path,
} from "../src/web/routes/match.ts";
import { escape_html, layout } from "../src/web/render.ts";
import { is_asset } from "../src/web/assets.ts";

test("路徑切割會去掉頭尾空片段", () => {
  assert.deepEqual(split_path("/api/restaurants/12"), ["api", "restaurants", "12"]);
  assert.deepEqual(split_path("/"), []);
  assert.deepEqual(split_path(""), []);
});

test("API 路由：每一條都要對到正確的處理", () => {
  assert.deepEqual(match_api_route("/api/restaurants"), { kind: "restaurants" });
  assert.deepEqual(match_api_route("/api/restaurants/12"), { kind: "restaurant-detail", id: 12 });
  assert.deepEqual(match_api_route("/api/sessions"), { kind: "sessions" });
  assert.deepEqual(match_api_route("/api/sessions/7"), { kind: "session-detail", id: 7 });
  assert.deepEqual(match_api_route("/api/ledger/123456789"), { kind: "ledger", guild_id: "123456789" });
  assert.deepEqual(match_api_route("/api/debts/123456789"), { kind: "debts", guild_id: "123456789" });
  assert.deepEqual(match_api_route("/api/overview"), { kind: "overview" });
  assert.deepEqual(match_api_route("/api/llm-usage"), { kind: "llm-usage" });
});

test("API 路由：不合法的路徑要回 undefined 而不是硬湊", () => {
  assert.equal(match_api_route("/api"), undefined);
  assert.equal(match_api_route("/api/unknown"), undefined);
  assert.equal(match_api_route("/api/restaurants/abc"), undefined);
  assert.equal(match_api_route("/api/restaurants/12/extra"), undefined);
  assert.equal(match_api_route("/restaurants"), undefined);
});

test("頁面路由", () => {
  assert.deepEqual(match_page_route("/"), { kind: "index" });
  assert.deepEqual(match_page_route("/restaurants"), { kind: "restaurants" });
  assert.deepEqual(match_page_route("/restaurants/3"), { kind: "restaurant", id: 3 });
  assert.deepEqual(match_page_route("/sessions"), { kind: "sessions" });
  assert.deepEqual(match_page_route("/sessions/9"), { kind: "session", id: 9 });
  assert.deepEqual(match_page_route("/ledger"), { kind: "ledger" });
  assert.deepEqual(match_page_route("/ledger/123456789"), { kind: "ledger", guild_id: "123456789" });
  assert.deepEqual(match_page_route("/status"), { kind: "status" });
  assert.equal(match_page_route("/restaurants/abc"), undefined);
  assert.equal(match_page_route("/nope"), undefined);
});

test("靜態檔：只認白名單，路徑不由請求拼出來", () => {
  assert.equal(match_asset_route("/assets/logo.svg"), "logo.svg");
  assert.equal(match_asset_route("/assets/logo.png"), "logo.png");
  assert.equal(match_asset_route("/assets"), undefined);
  assert.equal(match_asset_route("/assets/sub/logo.svg"), undefined);
  // 目錄穿越在比對這一關就被擋下來，根本走不到讀檔。
  assert.equal(match_asset_route("/assets/..%2F..%2F.env"), undefined);
  assert.equal(match_asset_route("/assets/中文.png"), undefined);

  assert.ok(is_asset("logo.svg"));
  assert.ok(!is_asset("secrets.env"));
  assert.ok(!is_asset("../.env"));
});

test("HTML 逸出：使用者輸入的店名不能變成標籤", () => {
  const nasty = `<script>alert("x")</script>`;
  const escaped = escape_html(nasty);
  assert.ok(!escaped.includes("<script>"));
  assert.ok(escaped.includes("&lt;script&gt;"));

  const html = layout({ title: nasty, body: "", generated_at: "2026-09-18 12:00:00" });
  assert.ok(!html.includes("<script>alert"));
});

test("外框：導覽列標出目前頁面，主題切換鈕可以按", () => {
  const html = layout({
    title: "揪團紀錄",
    body: "",
    generated_at: "2026-09-18 12:00:00",
    active: "/sessions",
  });

  assert.ok(html.includes('href="/sessions" aria-current="page"'), "目前頁面要標 aria-current");
  assert.ok(!html.includes('href="/ledger" aria-current'), "其他頁面不該被標成目前頁面");
  assert.ok(html.includes('id="theme-toggle"'), "要有主題切換鈕");
  assert.ok(html.includes("startViewTransition"), "主題切換要走 View Transitions");
  assert.ok(html.includes("prefers-reduced-motion"), "減少動態時必須關掉轉場");
});

test("外框：子路徑也要讓對應的導覽項亮起來", () => {
  const html = layout({
    title: "聞香來",
    body: "",
    generated_at: "2026-09-18 12:00:00",
    active: "/restaurants/12",
  });
  assert.ok(html.includes('href="/restaurants" aria-current="page"'));
});
