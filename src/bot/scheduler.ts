// 背景排程：到了截止時間自動封單。
//
// 每分鐘掃一次即可——揪團的時間尺度是十幾分鐘，不需要更密。
// 掃描本身包在 try 裡，單次失敗不會讓計時器停掉（驗收要求連跑一週）。

import type { Client, ThreadChannel } from "discord.js";

import { list_expired_open_sessions, set_session_status } from "../db/orders.ts";
import type { Db } from "../db/pool.ts";
import { create_logger } from "../shared/logger.ts";
import { t, type Locale } from "./i18n.ts";
import { refresh_summary_message } from "./session_flow.ts";

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
      await set_session_status(pool, session.id, "locked");
      closed += 1;
      log.info("已自動封單", { session: session.id, channel: session.channel_id });

      try {
        const channel = await client.channels.fetch(session.channel_id);
        if (channel?.isThread()) {
          await (channel as ThreadChannel).send(t(locale, "session.deadline_auto_locked"));
        }
      } catch (error) {
        log.warn("送出封單通知失敗", {
          session: session.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      await refresh_summary_message(client, pool, session.channel_id, locale);
    }
  } catch (error) {
    log.error("掃描截止時間失敗", { error: error instanceof Error ? error.message : String(error) });
  }
  return closed;
}
