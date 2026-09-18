// 從環境變數讀取執行設定；缺必要值時立刻失敗並給可判讀訊息

export type AppConfig = {
  app_host: string;
  app_port: number;
  bot_health_port: number;
  postgres_host: string;
  postgres_port: number;
  postgres_db: string;
  postgres_user: string;
  postgres_password: string;
  timezone: string;
  discord_bot_token: string | undefined;
};

function read_required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`缺少必要環境變數 ${name}。請複製 .env.example 為 .env 後填入。`);
  }
  return value;
}

function read_port(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`環境變數 ${name} 必須是 1–65535 的整數，實際值：${raw}`);
  }
  return parsed;
}

export function load_config(): AppConfig {
  return {
    app_host: process.env.APP_HOST?.trim() || "0.0.0.0",
    app_port: read_port("APP_PORT", 3000),
    bot_health_port: read_port("BOT_HEALTH_PORT", 3001),
    postgres_host: process.env.POSTGRES_HOST?.trim() || "127.0.0.1",
    postgres_port: read_port("POSTGRES_PORT", 5432),
    postgres_db: read_required("POSTGRES_DB"),
    postgres_user: read_required("POSTGRES_USER"),
    postgres_password: read_required("POSTGRES_PASSWORD"),
    timezone: process.env.TZ?.trim() || "Asia/Taipei",
    discord_bot_token: process.env.DISCORD_BOT_TOKEN?.trim() || undefined,
  };
}
