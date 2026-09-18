// 從環境變數讀取執行設定；缺必要值時立刻失敗並給可判讀訊息。
// LLM 供應商設定另見 src/llm/providers.ts，兩邊都只讀 process.env，不硬寫金鑰。

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
  log_level: string;
  public_base_url: string | undefined;
  discord: DiscordConfig;
};

export type DiscordConfig = {
  bot_token: string | undefined;
  client_id: string | undefined;
  /** 只註冊到單一伺服器時填；留空＝註冊為全域指令（生效較慢）。 */
  dev_guild_id: string | undefined;
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

function read_optional(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
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
    log_level: process.env.LOG_LEVEL?.trim().toLowerCase() || "info",
    public_base_url: read_optional("PUBLIC_BASE_URL"),
    discord: {
      bot_token: read_optional("DISCORD_BOT_TOKEN"),
      client_id: read_optional("DISCORD_CLIENT_ID"),
      dev_guild_id: read_optional("DISCORD_GUILD_ID"),
    },
  };
}
