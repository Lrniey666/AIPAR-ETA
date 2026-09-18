// 自然語言互動的等待體感設計（PLAN §Discord bot互動設計）：
//   Ack Reaction     收到訊息立刻加一個表情，讓人知道 bot 看到了
//   Streaming Preview 生成中就先送出一則訊息並逐步編輯，不要讓人盯著空白等
//
// Discord 對訊息編輯有速率限制，所以預覽的更新頻率刻意壓到 1.2 秒一次。

import type { Message, OmitPartialGroupDMChannel } from "discord.js";

import { create_logger } from "../shared/logger.ts";

const log = create_logger("ack");

export const ACK_EMOJI = "👀";
const EDIT_INTERVAL_MS = 1200;
const PREVIEW_LIMIT = 1800;

type AnyMessage = OmitPartialGroupDMChannel<Message<boolean>>;

/** 加上「我看到了」的表情，工作結束後把自己的表情收回。 */
export async function with_ack<T>(message: AnyMessage, work: () => Promise<T>): Promise<T> {
  let reacted = false;
  try {
    await message.react(ACK_EMOJI);
    reacted = true;
  } catch {
    // 沒有加表情權限就算了，不影響主要流程。
  }

  try {
    return await work();
  } finally {
    if (reacted) {
      const self_id = message.client.user?.id;
      if (self_id) {
        await message.reactions
          .resolve(ACK_EMOJI)
          ?.users.remove(self_id)
          .catch(() => undefined);
      }
    }
  }
}

/**
 * 串流預覽。先回一則佔位訊息，之後每隔一段時間把已生成的內容編輯進去。
 * 任何一次編輯失敗都只記錄不拋出——預覽壞掉不該讓回答本身失敗。
 */
export class StreamPreview {
  #message: AnyMessage | undefined;
  #source: AnyMessage;
  #placeholder: string;
  #buffer = "";
  #last_edit = 0;
  #pending = false;

  constructor(source: AnyMessage, placeholder: string) {
    this.#source = source;
    this.#placeholder = placeholder;
  }

  async start(): Promise<void> {
    try {
      this.#message = await this.#source.reply({
        content: this.#placeholder,
        allowedMentions: { repliedUser: false },
      });
      this.#last_edit = Date.now();
    } catch (error) {
      log.warn("送出預覽訊息失敗", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /** 收到一段文字。超過間隔才真的送編輯請求。 */
  push(chunk: string): void {
    this.#buffer += chunk;
    if (this.#pending || !this.#message) {
      return;
    }
    if (Date.now() - this.#last_edit < EDIT_INTERVAL_MS) {
      return;
    }
    this.#pending = true;
    const snapshot = this.#buffer.slice(0, PREVIEW_LIMIT);
    void this.#message
      .edit(`${snapshot}⋯`)
      .catch(() => undefined)
      .finally(() => {
        this.#last_edit = Date.now();
        this.#pending = false;
      });
  }

  /** 收尾：把完整內容寫進同一則訊息，沒有訊息就直接回覆一則。 */
  async finish(final_text: string): Promise<void> {
    const text = (final_text || this.#buffer).trim().slice(0, 1900) || "…";
    try {
      if (this.#message) {
        await this.#message.edit(text);
        return;
      }
      await this.#source.reply({ content: text, allowedMentions: { repliedUser: false } });
    } catch (error) {
      log.warn("收尾預覽訊息失敗", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  async fail(message: string): Promise<void> {
    await this.finish(`⚠️ ${message}`);
  }
}
