// OCR 版面分析：把辨識引擎吐出來的文字框，排成人讀得懂的順序。
//
// 直式中文菜單讀不出來，是這次要解的主要問題。視覺模型拿到直書版面時，
// 常常把同一欄的字拆散、或整欄漏掉；先用 OCR 把「哪些字在同一欄、欄的順序是右到左」
// 算清楚，再把整理過的文字交給模型對照，正確率就穩得多。
//
// 這裡是純函式，不碰網路也不碰資料庫——換 OCR 引擎只要換 `src/llm/ocr.ts` 的傳輸層。

export type OcrPoint = [number, number];

export type OcrLine = {
  text: string;
  /** 0–1 的信心值；引擎沒給就當 1。 */
  score: number;
  /** 文字框四個角；順序不拘，這裡只取外接矩形。 */
  box: OcrPoint[];
};

export type OcrBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type PageOrientation = "horizontal" | "vertical" | "unknown";

export function bounds_of(line: OcrLine): OcrBounds {
  const xs = line.box.map((point) => point[0]);
  const ys = line.box.map((point) => point[1]);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/**
 * 判斷整頁是橫排還是直書。
 *
 * 判準是「多字的文字框是不是比它高還窄」：橫排的一行字一定橫著長，
 * 直書的一欄字則是直著長。單字的框接近正方形，判不出方向，所以不列入計票。
 */
export function detect_orientation(lines: OcrLine[]): PageOrientation {
  let vertical = 0;
  let horizontal = 0;

  for (const line of lines) {
    const length = [...line.text.trim()].length;
    if (length < 2 || line.box.length < 2) {
      continue;
    }
    const { width, height } = bounds_of(line);
    if (width <= 0 || height <= 0) {
      continue;
    }
    // 單字大小約等於較短邊；框長超過兩個字才算得出方向。
    if (height > width * 1.6) {
      vertical += 1;
    } else if (width > height * 1.6) {
      horizontal += 1;
    }
  }

  if (vertical === 0 && horizontal === 0) {
    return "unknown";
  }
  return vertical > horizontal ? "vertical" : "horizontal";
}

/**
 * 依版面排出閱讀順序。
 *   橫排：由上而下、同一列再由左而右
 *   直書：由右而左一欄一欄，欄內由上而下
 * 同列／同欄的判定用「中心點差距小於半個字框」，容忍照片的輕微傾斜。
 */
export function reading_order(lines: OcrLine[], orientation: PageOrientation): OcrLine[] {
  const usable = lines.filter((line) => line.text.trim() && line.box.length >= 2);
  if (usable.length === 0) {
    return [];
  }

  const decorated = usable.map((line) => ({ line, bounds: bounds_of(line) }));
  const tolerance = median(decorated.map((entry) => Math.min(entry.bounds.width, entry.bounds.height))) / 2;

  if (orientation === "vertical") {
    return decorated
      .sort((a, b) => {
        const gap = b.bounds.right - a.bounds.right;
        if (Math.abs(gap) > tolerance) {
          return gap; // 右邊的欄先讀
        }
        return a.bounds.top - b.bounds.top;
      })
      .map((entry) => entry.line);
  }

  return decorated
    .sort((a, b) => {
      const gap = a.bounds.top - b.bounds.top;
      if (Math.abs(gap) > tolerance) {
        return gap;
      }
      return a.bounds.left - b.bounds.left;
    })
    .map((entry) => entry.line);
}

/**
 * 排好順序後串成純文字，給模型當對照用。
 * 低於信心門檻的框直接丟掉——讀錯的字比沒有字更會誤導模型。
 */
export function ocr_text_block(
  lines: OcrLine[],
  options: { min_score?: number; max_lines?: number; orientation?: PageOrientation } = {},
): string {
  const min_score = options.min_score ?? 0.6;
  const max_lines = options.max_lines ?? 400;
  const kept = lines.filter((line) => line.score >= min_score);
  const orientation = options.orientation ?? detect_orientation(kept);

  return reading_order(kept, orientation)
    .slice(0, max_lines)
    .map((line) => line.text.trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * 把常見的 OCR 服務回應收斂成 `OcrLine[]`。
 *
 * 支援兩種形狀，兩種都在 `SPEC/llm-gateway.md` 寫明：
 *   本專案約定  `{"lines":[{"text","score","box"}]}`
 *   PaddleOCR   `{"results":[[{"text","confidence","text_region"}]]}`（hubserving 預設輸出）
 * 認不得的形狀回空陣列，讓呼叫端安靜退回純視覺流程，而不是讓整支指令失敗。
 */
export function parse_ocr_payload(payload: unknown): OcrLine[] {
  const root = as_record(payload);
  const direct = to_lines(root.lines);
  if (direct.length > 0) {
    return direct;
  }

  const results = root.results;
  if (Array.isArray(results)) {
    const flattened = results.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));
    return to_lines(flattened);
  }
  return [];
}

function to_lines(value: unknown): OcrLine[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const lines: OcrLine[] = [];
  for (const raw of value) {
    const record = as_record(raw);
    const text = typeof record.text === "string" ? record.text : "";
    if (!text.trim()) {
      continue;
    }
    const score = to_score(record.score ?? record.confidence);
    const box = to_box(record.box ?? record.text_region ?? record.poly);
    if (box.length === 0) {
      continue;
    }
    lines.push({ text, score, box });
  }
  return lines;
}

function to_score(value: unknown): number {
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 1 ? score : 1;
}

function to_box(value: unknown): OcrPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const points: OcrPoint[] = [];
  for (const raw of value) {
    if (!Array.isArray(raw) || raw.length < 2) {
      continue;
    }
    const x = Number(raw[0]);
    const y = Number(raw[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push([x, y]);
    }
  }
  return points;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function as_record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
