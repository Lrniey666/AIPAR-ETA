// 時間一律以台北時間輸出：日期 YYYY-MM-DD、時間 HH:MM:SS（.cursorrules §日期及時間）。

const TAIPEI = "Asia/Taipei";

const date_parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TAIPEI,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const time_parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TAIPEI,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** 2026-09-18 */
export function format_date(value: Date = new Date()): string {
  return date_parts.format(value);
}

/** 13:05:42 */
export function format_time(value: Date = new Date()): string {
  return time_parts.format(value);
}

/** 2026-09-18 13:05:42（台北時間） */
export function format_datetime(value: Date = new Date()): string {
  return `${format_date(value)} ${format_time(value)}`;
}

/** Discord 的動態時間戳記；由用戶端依各自時區顯示。 */
export function discord_timestamp(value: Date, style: "f" | "R" | "t" = "f"): string {
  return `<t:${Math.floor(value.getTime() / 1000)}:${style}>`;
}

/**
 * 解析「30 分鐘後」這類相對時間字串，回傳截止時刻。
 * 支援 `90m`、`2h`、`1h30m`、`90`（視為分鐘）。無法解析回 undefined。
 */
export function parse_duration_to_date(raw: string, from: Date = new Date()): Date | undefined {
  const text = raw.trim().toLowerCase();
  if (!text) {
    return undefined;
  }
  const pattern = /^(?:(\d+(?:\.\d+)?)\s*h)?(?:\s*(\d+(?:\.\d+)?)\s*m)?$/;
  const match = pattern.exec(text.replace(/\s+/g, ""));
  let minutes = 0;
  if (match && (match[1] || match[2])) {
    minutes = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
  } else if (/^\d+(?:\.\d+)?$/.test(text)) {
    minutes = Number(text);
  } else {
    return undefined;
  }
  if (minutes <= 0 || minutes > 60 * 24 * 7) {
    return undefined;
  }
  return new Date(from.getTime() + minutes * 60_000);
}
