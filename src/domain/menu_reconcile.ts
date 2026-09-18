// 菜單對帳：拿 OCR 的辨識結果，回頭核對視覺模型給出的草稿。
//
// 兩條紅線之一是「寧可少一筆，也不要把幻覺價格寫進資料庫」。模型看圖會編價格，
// OCR 不會——它只會讀錯，而讀錯和編造在版面上留下的痕跡不一樣：
// 編出來的價格在圖上「根本不存在」，讀錯的價格則會在附近出現。
// 所以這裡只做一件事：標出「草稿上有、但 OCR 在圖上找不到」的品名與價格，
// 讓按下「確認寫入」的人知道該盯哪幾行，而不是自動改資料。

import type { DraftItem } from "../db/types.ts";
import { normalise_key } from "../shared/text.ts";
import { parse_menu_line } from "./menu_draft.ts";
import { ocr_text_block, type OcrLine, type PageOrientation } from "./ocr_layout.ts";

export type ReconcileVerdict =
  /** 品名與價格都在 OCR 結果裡找得到。 */
  | "verified"
  /** 品名對得上，但這個價格在圖上找不到——最值得人工複查的一種。 */
  | "price-unverified"
  /** 連品名都對不上；可能是模型看錯，也可能是 OCR 漏讀。 */
  | "name-unverified";

export type ReconciledItem = {
  item: DraftItem;
  verdict: ReconcileVerdict;
};

export type ReconcileReport = {
  items: ReconciledItem[];
  verified_count: number;
  flagged_count: number;
  /** OCR 看起來讀到、但草稿裡沒有的品項，提示人補。最多五筆。 */
  missing_hints: string[];
  orientation: PageOrientation;
  /** 用來對帳的 OCR 行數（已過濾低信心）。 */
  line_count: number;
};

const MAX_HINTS = 5;

/** 在 OCR 文字裡找得到的價格數字（以元為單位）。 */
function price_tokens(text: string): Set<number> {
  const tokens = new Set<number>();
  for (const match of text.matchAll(/\d[\d,]*/g)) {
    const value = Number(match[0].replace(/,/g, ""));
    if (Number.isFinite(value) && value > 0 && value <= 1_000_000) {
      tokens.add(value);
    }
  }
  return tokens;
}

/**
 * 對帳。OCR 沒有結果就回一份「全部未驗證」的報告，
 * 呼叫端照樣走原本的人工確認流程，不會因為沒有 OCR 就卡住。
 */
export function reconcile_menu(
  items: DraftItem[],
  lines: OcrLine[],
  options: { min_score?: number; orientation?: PageOrientation } = {},
): ReconcileReport {
  const min_score = options.min_score ?? 0.6;
  const kept = lines.filter((line) => line.score >= min_score);
  const block = ocr_text_block(kept, { min_score, orientation: options.orientation });
  const orientation = options.orientation ?? "unknown";

  if (block.length === 0) {
    return {
      items: items.map((item) => ({ item, verdict: "name-unverified" as const })),
      verified_count: 0,
      flagged_count: items.length,
      missing_hints: [],
      orientation,
      line_count: 0,
    };
  }

  // 整份連成一條再比對：OCR 常把一個品名拆成兩個框，逐行比會對不到。
  const haystack = normalise_key(block.replace(/\n/g, ""));
  const prices = price_tokens(block);

  const reconciled: ReconciledItem[] = items.map((item) => {
    const key = normalise_key(item.name);
    const name_found = key.length > 0 && haystack.includes(key);
    if (!name_found) {
      return { item, verdict: "name-unverified" as const };
    }
    const dollars = item.price_cents / 100;
    const price_found = prices.has(dollars) || prices.has(Math.round(dollars));
    return { item, verdict: price_found ? ("verified" as const) : ("price-unverified" as const) };
  });

  const verified_count = reconciled.filter((entry) => entry.verdict === "verified").length;

  return {
    items: reconciled,
    verified_count,
    flagged_count: reconciled.length - verified_count,
    missing_hints: find_missing(block, items),
    orientation,
    line_count: kept.length,
  };
}

/** OCR 行看起來像「品名 價格」，但草稿裡沒有這個品名。 */
function find_missing(block: string, items: DraftItem[]): string[] {
  const known = new Set(items.map((item) => normalise_key(item.name)));
  const hints: string[] = [];

  for (const raw_line of block.split("\n")) {
    if (hints.length >= MAX_HINTS) {
      break;
    }
    const parsed = parse_menu_line(raw_line.trim());
    if (!parsed) {
      continue;
    }
    const key = normalise_key(parsed.name);
    if (!key || known.has(key)) {
      continue;
    }
    known.add(key);
    hints.push(`${parsed.name} ${parsed.price_cents / 100}`);
  }
  return hints;
}

/** 給 Embed 用的一行摘要。 */
export function reconcile_summary_zh(report: ReconcileReport): string {
  const layout = report.orientation === "vertical" ? "直書" : "橫排";
  return `OCR 對帳：${layout}版面、${report.line_count} 行，已核對 ${report.verified_count}／${report.items.length} 項`;
}

export function reconcile_summary_en(report: ReconcileReport): string {
  const layout = report.orientation === "vertical" ? "vertical" : "horizontal";
  return `OCR cross-check: ${layout} layout, ${report.line_count} lines, ${report.verified_count} of ${report.items.length} items confirmed`;
}
