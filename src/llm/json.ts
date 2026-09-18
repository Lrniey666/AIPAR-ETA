// 從模型輸出裡挖 JSON。容忍 markdown 圍欄與前後廢話——這是實測最常見的兩種汙染。

export function extract_json(text: string): unknown | undefined {
  let raw = (text ?? "").trim();
  if (!raw) {
    return undefined;
  }

  if (raw.startsWith("```")) {
    raw = raw.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
  }

  const direct = try_parse(raw);
  if (direct !== undefined) {
    return direct;
  }

  // 退而求其次：抓第一個 { 到最後一個 }（或 [ … ]）之間的片段。
  for (const [open, close] of [
    ["{", "}"],
    ["[", "]"],
  ] as const) {
    const start = raw.indexOf(open);
    const end = raw.lastIndexOf(close);
    if (start >= 0 && end > start) {
      const parsed = try_parse(raw.slice(start, end + 1));
      if (parsed !== undefined) {
        return parsed;
      }
    }
  }
  return undefined;
}

function try_parse(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
