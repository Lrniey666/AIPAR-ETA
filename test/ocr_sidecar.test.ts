// 離線測試：OCR sidecar 的 HTTP 契約（不載入 ONNX）。

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  axis_box_to_corners,
  parse_ocr_request,
  strip_data_url,
  to_public_line,
} from "../ocr/src/protocol.ts";

test("OCR 契約：data URL 只留 base64 本體", () => {
  assert.equal(strip_data_url("data:image/jpeg;base64,abc"), "abc");
  assert.equal(strip_data_url("abc"), "abc");
});

test("OCR 契約：軸對齊框轉成四個角", () => {
  assert.deepEqual(axis_box_to_corners({ x: 10, y: 20, w: 30, h: 40 }), [
    [10, 20],
    [40, 20],
    [40, 60],
    [10, 60],
  ]);
});

test("OCR 契約：公開列的 box 是四個角", () => {
  const line = to_public_line({ text: "豆漿", score: 0.9, box: { x: 0, y: 0, w: 10, h: 20 } });
  assert.equal(line.text, "豆漿");
  assert.equal(line.box.length, 4);
});

test("OCR 契約：POST body 缺圖或不是 JSON 物件要拒絕", () => {
  assert.throws(() => parse_ocr_request(null), /JSON 物件/);
  assert.throws(() => parse_ocr_request({}), /缺少 image/);
});

test("OCR 契約：合法 base64 可以收成 Buffer", () => {
  const image = Buffer.from("hello").toString("base64");
  const parsed = parse_ocr_request({ image, model: "PP-OCRv6-small" });
  assert.equal(parsed.image.toString(), "hello");
  assert.equal(parsed.model, "PP-OCRv6-small");
});
