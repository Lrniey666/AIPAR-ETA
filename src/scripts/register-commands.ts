// 只做斜線指令註冊，不啟動 bot。改了指令定義後跑一次即可：`npm run register`。

import { register_commands } from "../bot/register.ts";
import { load_config } from "../config.ts";
import { create_logger, set_log_level } from "../shared/logger.ts";

const config = load_config();
set_log_level(config.log_level);
const log = create_logger("register");

try {
  const count = await register_commands(config.discord);
  log.info("完成", { count });
} catch (error) {
  log.error("註冊失敗", { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
}
