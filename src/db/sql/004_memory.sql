-- 0.3.0：自然語言互動的記憶與身分。
--
-- 分兩張表是因為兩種記憶的生命週期完全不同：
--
--   conversation_turns  短期。最近幾句對話，讓 bot 接得住「那家呢」「剛剛那個」。
--                       依頻道保留固定筆數，舊的定期刪掉，不需要永久保存。
--   memory_facts        長期。關於某個人／頻道／伺服器的事實（不吃牛、習慣訂哪家）。
--                       由使用者明講才寫入，隨時查得到也刪得掉。
--
-- 兩張表都帶 guild_id：帳是以伺服器為單位記的，記憶也一樣，
-- 不能讓 A 伺服器的對話內容出現在 B 伺服器。

CREATE TABLE IF NOT EXISTS conversation_turns (
    id              BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    guild_id        TEXT        NOT NULL,
    channel_id      TEXT        NOT NULL,
    discord_user_id TEXT        NOT NULL DEFAULT '',
    display_name    TEXT        NOT NULL DEFAULT '',
    role            TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT        NOT NULL,
    -- 判定出來的意圖，事後要回答「為什麼那句話被當成點餐」時看得到。
    intent          TEXT        NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 取最近 N 筆一定是 (channel_id, created_at DESC)，索引照這個形狀建。
CREATE INDEX IF NOT EXISTS conversation_turns_channel_idx
    ON conversation_turns (channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS conversation_turns_guild_idx
    ON conversation_turns (guild_id, created_at DESC);

CREATE TABLE IF NOT EXISTS memory_facts (
    id              BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    guild_id        TEXT        NOT NULL,
    -- 這條事實是關於誰：某個人、某個頻道，還是整個伺服器。
    scope           TEXT        NOT NULL CHECK (scope IN ('user', 'channel', 'guild')),
    subject_id      TEXT        NOT NULL,
    -- 正規化過的主題鍵（例如「不吃」「過敏」），同一個主題再講一次是更新不是新增。
    fact_key        TEXT        NOT NULL,
    fact_value      TEXT        NOT NULL,
    created_by      TEXT        NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (guild_id, scope, subject_id, fact_key)
);

CREATE INDEX IF NOT EXISTS memory_facts_subject_idx
    ON memory_facts (guild_id, scope, subject_id);
