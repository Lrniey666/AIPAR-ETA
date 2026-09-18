// PP-OCRv6 small（ONNX）推論。權重在 `ocr/models/`，執行期不讀專案外路徑。
// 偵測後處理是簡化版連通區域＋軸對齊外框（與研究倉實驗同一套），沒有大角度旋轉框。

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as ort from "onnxruntime-node";
import sharp from "sharp";

import type { AxisBox } from "./protocol.ts";
import { charset_from_rec_model } from "./meta.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.join(HERE, "..", "models");
const DET_MODEL = path.join(MODELS_DIR, "PP-OCRv6_det_small.onnx");
const REC_MODEL = path.join(MODELS_DIR, "PP-OCRv6_rec_small.onnx");

const DET = { limit_side: 736, max_side: 2000, thresh: 0.3, box_thresh: 0.5, unclip: 1.6, min_size: 3 };
const REC = { height: 48, base_width: 320, batch: 6, min_score: 0.5 };

export type EngineLine = { text: string; score: number; box: AxisBox };

type RgbImage = { data: Buffer; width: number; height: number };

let det_session: ort.InferenceSession | undefined;
let rec_session: ort.InferenceSession | undefined;
let charset: string[] = [];

export function models_dir(): string {
  return MODELS_DIR;
}

export function models_ready(): boolean {
  return existsSync(DET_MODEL) && existsSync(REC_MODEL);
}

function to_bgr_chw(rgb: Buffer, width: number, height: number): Float32Array {
  const out = new Float32Array(3 * width * height);
  const plane = width * height;
  for (let i = 0; i < plane; i += 1) {
    const j = i * 3;
    out[i] = (rgb[j + 2]! / 255 - 0.5) / 0.5;
    out[plane + i] = (rgb[j + 1]! / 255 - 0.5) / 0.5;
    out[2 * plane + i] = (rgb[j]! / 255 - 0.5) / 0.5;
  }
  return out;
}

async function load_image(input: Buffer): Promise<RgbImage> {
  const { data, info } = await sharp(input).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function detect(session: ort.InferenceSession, img: RgbImage): Promise<AxisBox[]> {
  let ratio = 1;
  const min_side = Math.min(img.width, img.height);
  const max_side = Math.max(img.width, img.height);
  if (min_side < DET.limit_side) {
    ratio = DET.limit_side / min_side;
  }
  if (max_side * ratio > DET.max_side) {
    ratio = DET.max_side / max_side;
  }
  const rw = Math.max(32, Math.round((img.width * ratio) / 32) * 32);
  const rh = Math.max(32, Math.round((img.height * ratio) / 32) * 32);
  const resized = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 3 } })
    .resize(rw, rh, { fit: "fill" })
    .raw()
    .toBuffer();
  const input_name = session.inputNames[0];
  const output_name = session.outputNames[0];
  if (!input_name || !output_name) {
    throw new Error("det 模型缺少輸入或輸出名稱");
  }
  const out = await session.run({
    [input_name]: new ort.Tensor("float32", to_bgr_chw(resized, rw, rh), [1, 3, rh, rw]),
  });
  const prob = out[output_name]?.data as Float32Array;
  return boxes_from_prob(prob, rw, rh, img.width, img.height);
}

function boxes_from_prob(prob: Float32Array, rw: number, rh: number, src_w: number, src_h: number): AxisBox[] {
  const bin = new Uint8Array(rw * rh);
  for (let i = 0; i < prob.length; i += 1) {
    if ((prob[i] ?? 0) > DET.thresh) {
      bin[i] = 1;
    }
  }
  const dil = new Uint8Array(bin);
  for (let y = 0; y < rh - 1; y += 1) {
    for (let x = 0; x < rw - 1; x += 1) {
      if (bin[y * rw + x]) {
        dil[y * rw + x + 1] = 1;
        dil[(y + 1) * rw + x] = 1;
        dil[(y + 1) * rw + x + 1] = 1;
      }
    }
  }
  const seen = new Uint8Array(rw * rh);
  const boxes: AxisBox[] = [];
  const stack: number[] = [];
  const sx = src_w / rw;
  const sy = src_h / rh;
  for (let start = 0; start < dil.length; start += 1) {
    if (!dil[start] || seen[start]) {
      continue;
    }
    let min_x = rw;
    let min_y = rh;
    let max_x = 0;
    let max_y = 0;
    let sum = 0;
    let count = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop() ?? 0;
      const px = p % rw;
      const py = (p - px) / rw;
      if (px < min_x) min_x = px;
      if (px > max_x) max_x = px;
      if (py < min_y) min_y = py;
      if (py > max_y) max_y = py;
      sum += prob[p] ?? 0;
      count += 1;
      const neighbours = [p - 1, p + 1, p - rw, p + rw];
      if (px === 0) neighbours[0] = -1;
      if (px === rw - 1) neighbours[1] = -1;
      for (const next of neighbours) {
        if (next >= 0 && next < dil.length && dil[next] && !seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    const bw = max_x - min_x + 1;
    const bh = max_y - min_y + 1;
    if (Math.min(bw, bh) < DET.min_size || sum / count < DET.box_thresh) {
      continue;
    }
    const pad = (bw * bh * DET.unclip) / (2 * (bw + bh));
    const x0 = Math.max(0, Math.floor((min_x - pad) * sx));
    const y0 = Math.max(0, Math.floor((min_y - pad) * sy));
    const x1 = Math.min(src_w, Math.ceil((max_x + 1 + pad) * sx));
    const y1 = Math.min(src_h, Math.ceil((max_y + 1 + pad) * sy));
    if (x1 - x0 >= 4 && y1 - y0 >= 4) {
      boxes.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  }
  boxes.sort((a, b) => (Math.abs(a.y - b.y) < 10 ? a.x - b.x : a.y - b.y));
  return boxes;
}

async function recognise(
  session: ort.InferenceSession,
  img: RgbImage,
  boxes: AxisBox[],
  labels: string[],
): Promise<EngineLine[]> {
  const base = sharp(img.data, { raw: { width: img.width, height: img.height, channels: 3 } });
  const crops = [];
  for (const box of boxes) {
    const buf = await base.clone().extract({ left: box.x, top: box.y, width: box.w, height: box.h }).raw().toBuffer();
    crops.push({ box, buf, ratio: box.w / box.h });
  }
  const order = crops.map((_, index) => index).sort((a, b) => (crops[a]?.ratio ?? 0) - (crops[b]?.ratio ?? 0));
  const results: Array<EngineLine | undefined> = new Array(crops.length);
  const input_name = session.inputNames[0];
  const output_name = session.outputNames[0];
  if (!input_name || !output_name) {
    throw new Error("rec 模型缺少輸入或輸出名稱");
  }

  for (let start = 0; start < order.length; start += REC.batch) {
    const batch_idx = order.slice(start, start + REC.batch);
    const max_ratio = Math.max(REC.base_width / REC.height, ...batch_idx.map((i) => crops[i]?.ratio ?? 0));
    const width = Math.ceil(REC.height * max_ratio);
    const tensor = new Float32Array(batch_idx.length * 3 * REC.height * width);
    for (let k = 0; k < batch_idx.length; k += 1) {
      const crop = crops[batch_idx[k] ?? 0];
      if (!crop) {
        continue;
      }
      const rw = Math.min(width, Math.max(1, Math.ceil(REC.height * crop.ratio)));
      const pixels = await sharp(crop.buf, { raw: { width: crop.box.w, height: crop.box.h, channels: 3 } })
        .resize(rw, REC.height, { fit: "fill" })
        .raw()
        .toBuffer();
      const off = k * 3 * REC.height * width;
      for (let y = 0; y < REC.height; y += 1) {
        for (let x = 0; x < rw; x += 1) {
          const j = (y * rw + x) * 3;
          const t = y * width + x;
          tensor[off + t] = (pixels[j + 2]! / 255 - 0.5) / 0.5;
          tensor[off + REC.height * width + t] = (pixels[j + 1]! / 255 - 0.5) / 0.5;
          tensor[off + 2 * REC.height * width + t] = (pixels[j]! / 255 - 0.5) / 0.5;
        }
      }
    }
    const out = await session.run({
      [input_name]: new ort.Tensor("float32", tensor, [batch_idx.length, 3, REC.height, width]),
    });
    decode_ctc(out[output_name], batch_idx, crops, labels, results);
  }
  return results.filter((line): line is EngineLine => Boolean(line));
}

function decode_ctc(
  tensor: ort.Tensor,
  batch_idx: number[],
  crops: Array<{ box: AxisBox }>,
  labels: string[],
  results: Array<EngineLine | undefined>,
): void {
  const dims = tensor.dims;
  const time = dims[1] ?? 0;
  const classes = dims[2] ?? 0;
  const data = tensor.data as Float32Array;
  for (let k = 0; k < batch_idx.length; k += 1) {
    let text = "";
    const confs: number[] = [];
    let prev = -1;
    for (let t = 0; t < time; t += 1) {
      const offset = (k * time + t) * classes;
      let best = 0;
      let best_p = data[offset] ?? 0;
      for (let c = 1; c < classes; c += 1) {
        const p = data[offset + c] ?? 0;
        if (p > best_p) {
          best_p = p;
          best = c;
        }
      }
      if (best !== 0 && best !== prev) {
        text += labels[best] ?? "";
        confs.push(best_p);
      }
      prev = best;
    }
    const index = batch_idx[k] ?? 0;
    const box = crops[index]?.box;
    if (!box) {
      continue;
    }
    const score = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;
    results[index] = { text, score, box };
  }
}

export async function init_engine(): Promise<void> {
  if (det_session) {
    return;
  }
  if (!models_ready()) {
    throw new Error(`找不到模型檔，請把 PP-OCRv6_det_small.onnx 與 PP-OCRv6_rec_small.onnx 放到 ${MODELS_DIR}`);
  }
  const opts: ort.InferenceSession.SessionOptions = {
    executionProviders: ["cpu"],
    graphOptimizationLevel: "all",
  };
  [det_session, rec_session] = await Promise.all([
    ort.InferenceSession.create(DET_MODEL, opts),
    ort.InferenceSession.create(REC_MODEL, opts),
  ]);
  charset = charset_from_rec_model(REC_MODEL);
}

export async function run_ocr(image: Buffer): Promise<EngineLine[]> {
  await init_engine();
  if (!det_session || !rec_session) {
    throw new Error("OCR 引擎尚未載入");
  }
  const img = await load_image(image);
  const boxes = await detect(det_session, img);
  const lines = await recognise(rec_session, img, boxes, charset);
  return lines.filter((line) => line.text && line.score >= REC.min_score);
}
