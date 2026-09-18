# 從 RapidOCR 的 PyPI 套件抽出 PP-OCRv6 small ONNX（不依賴研究倉路徑）。
# 本倉 `ocr/models/` 已帶權重；只有權重遺失或要更新時才跑這個腳本。

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const models_dir = path.join(here, "..", "models");
const names = ["PP-OCRv6_det_small.onnx", "PP-OCRv6_rec_small.onnx"] as const;

mkdirSync(models_dir, { recursive: true });

function python(): string {
  for (const cmd of ["python", "python3", "py"]) {
    const probe = spawnSync(cmd, ["--version"], { encoding: "utf8" });
    if (probe.status === 0) {
      return cmd;
    }
  }
  throw new Error("找不到 python，無法從 RapidOCR 抽出模型。");
}

const py = python();
const install = spawnSync(py, ["-m", "pip", "install", "--quiet", "rapidocr"], { stdio: "inherit" });
if (install.status !== 0) {
  throw new Error("pip install rapidocr 失敗");
}

const locate = spawnSync(
  py,
  ["-c", "import os, rapidocr; print(os.path.join(os.path.dirname(rapidocr.__file__), 'models'))"],
  { encoding: "utf8" },
);
if (locate.status !== 0 || !locate.stdout.trim()) {
  throw new Error("找不到 RapidOCR 的 models 目錄");
}

const src_dir = locate.stdout.trim();
for (const name of names) {
  const from = path.join(src_dir, name);
  if (!existsSync(from)) {
    throw new Error(`RapidOCR 套件裡沒有 ${name}`);
  }
  copyFileSync(from, path.join(models_dir, name));
  console.log(`已寫入 ${path.join(models_dir, name)}`);
}
