// 單行結構化日誌。7×24 跑一週要靠 docker compose logs 追問題，所以格式固定、可 grep。

import { format_datetime } from "./time.ts";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let threshold: number = LEVEL_WEIGHT.info;

export function set_log_level(level: string): void {
  const weight = LEVEL_WEIGHT[level as LogLevel];
  threshold = weight ?? LEVEL_WEIGHT.info;
}

function serialise(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function write(level: LogLevel, scope: string, message: string, fields?: Record<string, unknown>): void {
  if (LEVEL_WEIGHT[level] < threshold) {
    return;
  }
  const parts = [`${format_datetime()} [${level.toUpperCase()}] [${scope}] ${message}`];
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (value !== undefined) {
      parts.push(`${key}=${serialise(value)}`);
    }
  }
  const line = parts.join(" ");
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export type Logger = {
  debug: (message: string, fields?: Record<string, unknown>) => void;
  info: (message: string, fields?: Record<string, unknown>) => void;
  warn: (message: string, fields?: Record<string, unknown>) => void;
  error: (message: string, fields?: Record<string, unknown>) => void;
};

export function create_logger(scope: string): Logger {
  return {
    debug: (message, fields) => write("debug", scope, message, fields),
    info: (message, fields) => write("info", scope, message, fields),
    warn: (message, fields) => write("warn", scope, message, fields),
    error: (message, fields) => write("error", scope, message, fields),
  };
}
