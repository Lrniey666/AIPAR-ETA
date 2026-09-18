// 網站路由比對的離線測試。
// 這組測試的由來：曾經因為少跳過一個路徑片段，所有 /api/* 都回 404，
// 而健康檢查還是綠的——所以路由本身要有自己的測試。

import assert from "node:assert/strict";
import { test } from "node:test";

import { match_api_route, match_page_route, split_path } from "../src/web/routes/match.ts";
import { escape_html, layout } from "../src/web/render.ts";

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
  assert.deepEqual(match_page_route("/restaurants/3"), { kind: "restaurant", id: 3 });
  assert.deepEqual(match_page_route("/sessions/9"), { kind: "session", id: 9 });
  assert.equal(match_page_route("/restaurants/abc"), undefined);
  assert.equal(match_page_route("/nope"), undefined);
});

test("HTML 逸出：使用者輸入的店名不能變成標籤", () => {
  const nasty = `<script>alert("x")</script>`;
  const escaped = escape_html(nasty);
  assert.ok(!escaped.includes("<script>"));
  assert.ok(escaped.includes("&lt;script&gt;"));

  const html = layout({ title: nasty, body: "", generated_at: "2026-09-18 12:00:00" });
  assert.ok(!html.includes("<script>alert"));
});
