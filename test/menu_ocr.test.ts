// 離線測試：OCR 版面分析與菜單對帳。
// 這一組就是「直式中文菜單讀不出來」的修法，不需要真的跑 OCR 服務。

import assert from "node:assert/strict";
import { test } from "node:test";

import { reconcile_menu } from "../src/domain/menu_reconcile.ts";
import {
  bounds_of,
  detect_orientation,
  ocr_text_block,
  parse_ocr_payload,
  reading_order,
  type OcrLine,
} from "../src/domain/ocr_layout.ts";
import type { DraftItem } from "../src/db/types.ts";

/** 橫排的一行字：寬遠大於高。 */
function horizontal(text: string, left: number, top: number): OcrLine {
  const width = [...text].length * 20;
  return {
    text,
    score: 0.95,
    box: [
      [left, top],
      [left + width, top],
      [left + width, top + 22],
      [left, top + 22],
    ],
  };
}

/** 直書的一欄字：高遠大於寬。 */
function vertical(text: string, left: number, top: number): OcrLine {
  const height = [...text].length * 20;
  return {
    text,
    score: 0.95,
    box: [
      [left, top],
      [left + 22, top],
      [left + 22, top + height],
      [left, top + height],
    ],
  };
}

test("版面：外接矩形", () => {
  const bounds = bounds_of(horizontal("雞腿飯", 10, 20));
  assert.deepEqual(
    [bounds.left, bounds.top, bounds.width, bounds.height],
    [10, 20, 60, 22],
  );
});

test("版面：直書與橫排要分得出來", () => {
  assert.equal(
    detect_orientation([vertical("招牌雞腿飯", 400, 40), vertical("宮保雞丁飯", 360, 40)]),
    "vertical",
  );
  assert.equal(
    detect_orientation([horizontal("招牌雞腿飯 90", 40, 40), horizontal("宮保雞丁飯 100", 40, 80)]),
    "horizontal",
  );
  // 單字框判不出方向，不該亂投票。
  assert.equal(detect_orientation([{ text: "飯", score: 1, box: [[0, 0], [20, 20]] }]), "unknown");
});

test("版面：直書由右至左，橫排由上而下", () => {
  const columns = [vertical("左欄", 100, 40), vertical("右欄", 400, 40), vertical("中欄", 250, 40)];
  assert.deepEqual(
    reading_order(columns, "vertical").map((line) => line.text),
    ["右欄", "中欄", "左欄"],
  );

  const rows = [horizontal("第二行", 40, 100), horizontal("第一行", 40, 40)];
  assert.deepEqual(
    reading_order(rows, "horizontal").map((line) => line.text),
    ["第一行", "第二行"],
  );
});

test("版面：低信心的框不進對照文字", () => {
  const lines: OcrLine[] = [
    horizontal("雞腿飯 90", 40, 40),
    { ...horizontal("看不清的字", 40, 80), score: 0.2 },
  ];
  assert.equal(ocr_text_block(lines, { min_score: 0.6 }), "雞腿飯 90");
});

test("版面：兩種常見的 OCR 回應格式都要吃得下", () => {
  const ours = parse_ocr_payload({
    lines: [{ text: "紅茶 20", score: 0.9, box: [[0, 0], [60, 0], [60, 20], [0, 20]] }],
  });
  assert.equal(ours.length, 1);
  assert.equal(ours[0]?.score, 0.9);

  const paddle = parse_ocr_payload({
    results: [[{ text: "紅茶 20", confidence: 0.88, text_region: [[0, 0], [60, 0], [60, 20], [0, 20]] }]],
  });
  assert.equal(paddle.length, 1);
  assert.equal(paddle[0]?.text, "紅茶 20");

  // 認不得的形狀要安靜回空陣列，讓上層退回純視覺流程。
  assert.deepEqual(parse_ocr_payload({ unexpected: true }), []);
  assert.deepEqual(parse_ocr_payload("not json"), []);
});

function draft(name: string, price_cents: number): DraftItem {
  return { category: "", name, price_cents, unit: "", note: "" };
}

test("對帳：圖上找不到的價格要被標出來", () => {
  const lines = [horizontal("雞腿飯 90", 40, 40), horizontal("紅茶 20", 40, 80)];
  const report = reconcile_menu([draft("雞腿飯", 9000), draft("紅茶", 3000)], lines);

  assert.equal(report.items[0]?.verdict, "verified");
  // 模型說紅茶 30 元，但圖上只有 20——這正是最該人工複查的一種。
  assert.equal(report.items[1]?.verdict, "price-unverified");
  assert.equal(report.verified_count, 1);
  assert.equal(report.flagged_count, 1);
});

test("對帳：草稿有、OCR 看不到的品名標成未驗證", () => {
  const report = reconcile_menu([draft("牛排", 25000)], [horizontal("雞腿飯 90", 40, 40)]);
  assert.equal(report.items[0]?.verdict, "name-unverified");
});

test("對帳：OCR 讀到但草稿漏掉的品項要提示", () => {
  const lines = [horizontal("雞腿飯 90", 40, 40), horizontal("滷肉飯 60", 40, 80)];
  const report = reconcile_menu([draft("雞腿飯", 9000)], lines);
  assert.deepEqual(report.missing_hints, ["滷肉飯 60"]);
});

test("對帳：沒有 OCR 結果時不能假裝核對過", () => {
  const report = reconcile_menu([draft("雞腿飯", 9000)], []);
  assert.equal(report.verified_count, 0);
  assert.equal(report.flagged_count, 1);
  assert.equal(report.line_count, 0);
});
