// 靜態檔：標誌。Discord Embed 與網站共用同一組位址（`/assets/...`）。
//
// 只服務白名單裡的檔案，路徑不是由請求拼出來的——校內網站沒有反向代理擋在前面，
// 靜態檔服務是最容易寫出目錄穿越的地方，直接用對照表就沒有這個問題。
//
// SVG 原稿是 A4 版面、標誌置中，直接嵌進頁面會留一大片空白；
// 這裡在讀檔時把 viewBox 改成貼齊圖形的框，原稿不動。

import { readFile } from "node:fs/promises";
import path from "node:path";

import { create_logger } from "../shared/logger.ts";

const log = create_logger("assets");

const LOGO_DIR = path.join(import.meta.dirname, "..", "..", "logo");

/** 貼齊標誌圖形的 viewBox（由 `logo-02.svg` 的路徑座標量出來，四邊各留一點邊）。 */
const TIGHT_VIEWBOX = "93 198 438 367";

type AssetSpec = {
  file: string;
  content_type: string;
  /** 把 A4 版面的 viewBox 換成貼齊圖形的框。 */
  tighten?: boolean;
};

const ASSETS: Record<string, AssetSpec> = {
  // Discord Embed 只吃點陣圖，所以標誌另外給一份 PNG。
  "logo.png": { file: "logo.png", content_type: "image/png" },
  "logo-wide.png": { file: "logo橫-02.png", content_type: "image/png" },
  "logo.svg": { file: "logo-02.svg", content_type: "image/svg+xml", tighten: true },
  "logo-wide.svg": { file: "logo橫1.svg", content_type: "image/svg+xml" },
};

export type Asset = { body: Buffer; content_type: string };

const cache = new Map<string, Asset>();

export function is_asset(name: string): boolean {
  return Object.hasOwn(ASSETS, name);
}

/** 讀不到就回 undefined，由呼叫端回 404——少一張標誌不該讓網站掛掉。 */
export async function read_asset(name: string): Promise<Asset | undefined> {
  const cached = cache.get(name);
  if (cached) {
    return cached;
  }
  const spec = ASSETS[name];
  if (!spec) {
    return undefined;
  }

  try {
    const raw = await readFile(path.join(LOGO_DIR, spec.file));
    const body = spec.tighten
      ? Buffer.from(raw.toString("utf8").replace(/viewBox="[^"]*"/, `viewBox="${TIGHT_VIEWBOX}"`), "utf8")
      : raw;
    const asset: Asset = { body, content_type: spec.content_type };
    cache.set(name, asset);
    return asset;
  } catch (error) {
    log.warn("讀取標誌失敗", {
      name,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}
