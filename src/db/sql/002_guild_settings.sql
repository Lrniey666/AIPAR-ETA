-- 每個 Discord 伺服器的設定。目前只有揪團要用的論壇頻道，之後要加設定就往這張表加欄位。

CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id         TEXT        PRIMARY KEY,
    forum_channel_id TEXT        NOT NULL DEFAULT '',
    updated_by       TEXT        NOT NULL DEFAULT '',
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
