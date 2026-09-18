// 「等使用者貼菜單」的暫存狀態。
//
// 刻意放記憶體不落資料庫：這是一次性的對話狀態，重啟後讓使用者重下指令即可，
// 存進資料庫反而要處理清理與過期。有效期 10 分鐘。

export type PendingCapture = {
  kind: "menu-text";
  restaurant_id: number;
  restaurant_name: string;
  user_id: string;
  channel_id: string;
  expires_at: number;
};

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 200;

export class PendingStore {
  #entries = new Map<string, PendingCapture>();

  static key(channel_id: string, user_id: string): string {
    return `${channel_id}:${user_id}`;
  }

  set(capture: Omit<PendingCapture, "expires_at">): void {
    this.#sweep();
    if (this.#entries.size >= MAX_ENTRIES) {
      const oldest = this.#entries.keys().next().value;
      if (oldest) {
        this.#entries.delete(oldest);
      }
    }
    this.#entries.set(PendingStore.key(capture.channel_id, capture.user_id), {
      ...capture,
      expires_at: Date.now() + TTL_MS,
    });
  }

  take(channel_id: string, user_id: string): PendingCapture | undefined {
    const key = PendingStore.key(channel_id, user_id);
    const entry = this.#entries.get(key);
    if (!entry) {
      return undefined;
    }
    this.#entries.delete(key);
    return entry.expires_at >= Date.now() ? entry : undefined;
  }

  get size(): number {
    this.#sweep();
    return this.#entries.size;
  }

  #sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.#entries) {
      if (entry.expires_at < now) {
        this.#entries.delete(key);
      }
    }
  }
}
