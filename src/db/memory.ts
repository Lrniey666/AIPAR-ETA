// 對話記憶的資料存取：短期的對話輪次與長期的事實。
//
// 短期記憶寫入失敗不該讓回覆失敗——記不住比不回話輕微得多，所以這裡自己吞例外，
// 和 `observability.ts` 的 `record_llm_call()` 同一個取捨。
// 長期記憶反過來：那是使用者明講要記的，寫不進去要讓他知道。

import { normalise_key } from "../shared/text.ts";
import type { Db } from "./pool.ts";

const TURN_COLUMNS = `id, guild_id, channel_id, discord_user_id, display_name,
                      role, content, intent, created_at`;
const FACT_COLUMNS = `id, guild_id, scope, subject_id, fact_key, fact_value,
                      created_by, created_at, updated_at`;

export type TurnRole = "user" | "assistant";
export type MemoryScope = "user" | "channel" | "guild";

export type ConversationTurn = {
  id: number;
  guild_id: string;
  channel_id: string;
  discord_user_id: string;
  display_name: string;
  role: TurnRole;
  content: string;
  intent: string;
  created_at: Date;
};

export type MemoryFact = {
  id: number;
  guild_id: string;
  scope: MemoryScope;
  subject_id: string;
  fact_key: string;
  fact_value: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
};

export type NewTurn = {
  guild_id: string;
  channel_id: string;
  discord_user_id?: string;
  display_name?: string;
  role: TurnRole;
  content: string;
  intent?: string;
};

/** 一句話最多留這麼長；記憶是給模型看的摘要，不是逐字稿。 */
const MAX_TURN_LENGTH = 600;
/** 每個頻道保留幾輪。超過的在寫入時順手刪掉，不另外排程。 */
const KEEP_TURNS_PER_CHANNEL = 40;

export async function record_turn(pool: Db, input: NewTurn): Promise<void> {
  const content = input.content.trim().slice(0, MAX_TURN_LENGTH);
  if (!content) {
    return;
  }
  try {
    await pool.query(
      `INSERT INTO conversation_turns
         (guild_id, channel_id, discord_user_id, display_name, role, content, intent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.guild_id,
        input.channel_id,
        input.discord_user_id ?? "",
        (input.display_name ?? "").slice(0, 100),
        input.role,
        content,
        (input.intent ?? "").slice(0, 40),
      ],
    );
    await prune_turns(pool, input.channel_id);
  } catch {
    // 記不住比不回話輕微；短期記憶寫失敗就算了。
  }
}

/** 只留最近 N 筆。用子查詢挑出要保留的 id，其餘刪掉。 */
async function prune_turns(pool: Db, channel_id: string): Promise<void> {
  await pool.query(
    `DELETE FROM conversation_turns
      WHERE channel_id = $1
        AND id NOT IN (
          SELECT id FROM conversation_turns
           WHERE channel_id = $1
           ORDER BY created_at DESC, id DESC
           LIMIT $2
        )`,
    [channel_id, KEEP_TURNS_PER_CHANNEL],
  );
}

/** 最近幾輪，依時間由舊到新回傳——模型吃的對話是順著讀的。 */
export async function recent_turns(
  pool: Db,
  channel_id: string,
  limit = 10,
): Promise<ConversationTurn[]> {
  const result = await pool.query<ConversationTurn>(
    `SELECT ${TURN_COLUMNS} FROM conversation_turns
      WHERE channel_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [channel_id, limit],
  );
  return result.rows.reverse();
}

export async function count_turns(pool: Db, channel_id: string): Promise<number> {
  const result = await pool.query<{ total: string }>(
    "SELECT COUNT(*) AS total FROM conversation_turns WHERE channel_id = $1",
    [channel_id],
  );
  return Number(result.rows[0]?.total ?? 0);
}

export type NewFact = {
  guild_id: string;
  scope: MemoryScope;
  subject_id: string;
  fact_key: string;
  fact_value: string;
  created_by?: string;
};

/** 同一個主題再講一次是更新不是新增——「我不吃牛」講三次不該變成三條。 */
export async function remember_fact(pool: Db, input: NewFact): Promise<MemoryFact | undefined> {
  const key = normalise_key(input.fact_key).slice(0, 60);
  const value = input.fact_value.trim().slice(0, 200);
  if (!key || !value) {
    return undefined;
  }
  const result = await pool.query<MemoryFact>(
    `INSERT INTO memory_facts (guild_id, scope, subject_id, fact_key, fact_value, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (guild_id, scope, subject_id, fact_key) DO UPDATE
        SET fact_value = EXCLUDED.fact_value,
            updated_at = NOW()
     RETURNING ${FACT_COLUMNS}`,
    [input.guild_id, input.scope, input.subject_id, key, value, input.created_by ?? ""],
  );
  return result.rows[0];
}

export async function list_facts(
  pool: Db,
  guild_id: string,
  scope: MemoryScope,
  subject_id: string,
  limit = 25,
): Promise<MemoryFact[]> {
  const result = await pool.query<MemoryFact>(
    `SELECT ${FACT_COLUMNS} FROM memory_facts
      WHERE guild_id = $1 AND scope = $2 AND subject_id = $3
      ORDER BY updated_at DESC
      LIMIT $4`,
    [guild_id, scope, subject_id, limit],
  );
  return result.rows;
}

/** 一次取這次對話用得到的三種範圍。 */
export async function list_context_facts(
  pool: Db,
  guild_id: string,
  user_id: string,
  channel_id: string,
): Promise<MemoryFact[]> {
  const result = await pool.query<MemoryFact>(
    `SELECT ${FACT_COLUMNS} FROM memory_facts
      WHERE guild_id = $1
        AND ((scope = 'user' AND subject_id = $2)
             OR (scope = 'channel' AND subject_id = $3)
             OR (scope = 'guild' AND subject_id = $1))
      ORDER BY scope, updated_at DESC
      LIMIT 40`,
    [guild_id, user_id, channel_id],
  );
  return result.rows;
}

/** 忘記一條。回傳有沒有真的刪掉，好照實回報。 */
export async function forget_fact(
  pool: Db,
  guild_id: string,
  scope: MemoryScope,
  subject_id: string,
  fact_key: string,
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM memory_facts
      WHERE guild_id = $1 AND scope = $2 AND subject_id = $3 AND fact_key = $4`,
    [guild_id, scope, subject_id, normalise_key(fact_key).slice(0, 60)],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function forget_all(
  pool: Db,
  guild_id: string,
  scope: MemoryScope,
  subject_id: string,
): Promise<number> {
  const result = await pool.query(
    "DELETE FROM memory_facts WHERE guild_id = $1 AND scope = $2 AND subject_id = $3",
    [guild_id, scope, subject_id],
  );
  return result.rowCount ?? 0;
}

/** 清掉某個頻道的短期記憶（`/記憶 忘記` 會一併清）。 */
export async function clear_turns(pool: Db, channel_id: string): Promise<number> {
  const result = await pool.query("DELETE FROM conversation_turns WHERE channel_id = $1", [
    channel_id,
  ]);
  return result.rowCount ?? 0;
}
