// 背景排程：到了截止時間自動封單。
//
// 每分鐘掃一次即可——揪團的時間尺度是十幾分鐘，不需要更密。
// 掃描本身包在 try 裡，單次失敗不會讓計時器停掉（驗收要求連跑一週）。
//
// 自動封單與手動封單共用 `lock_session()`：兩條路曾經只有資料庫狀態一致，
// 貼文標題與彙總訊息卻不一樣，使用者看到的是「有時候有鎖頭、有時候沒有」。

import type { Client } from "discord.js";

import { list_expired_open_sessions } from "../db/orders.ts";
import type { Db } from "../db/pool.ts";
import { create_logger } from "../shared/logger.ts";
import { t, type Locale } from "./i18n.ts";
import { lock_session } from "./session_flow.ts";

const log = create_logger("scheduler");
const TICK_MS = 60_000;

export function start_deadline_watcher(client: Client, pool: Db, locale: Locale = "zh-TW"): () => void {
  const timer = setInterval(() => {
    void sweep_deadlines(client, pool, locale);
  }, TICK_MS);
  // 排程不該擋住行程結束。
  timer.unref?.();
  log.info("截止時間排程已啟動", { interval_ms: TICK_MS });
  return () => clearInterval(timer);
}

export async function sweep_deadlines(client: Client, pool: Db, locale: Locale): Promise<number> {
  let closed = 0;
  try {
    const expired = await list_expired_open_sessions(pool);
    for (const session of expired) {
      // 走和「有人按下封單」完全相同的那條路：改狀態、加鎖頭前綴、貼通知、重畫彙總。
      await lock_session(client, pool, session, locale, t(locale, "session.deadline_auto_locked"));
      closed += 1;
      log.info("已自動封單", { session: session.id, channel: session.channel_id });
    }
  } catch (error) {
    log.error("掃描截止時間失敗", { error: error instanceof Error ? error.message : String(error) });
  }
  return closed;
}
