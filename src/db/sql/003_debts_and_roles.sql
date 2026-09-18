-- 0.3.0：記帳補上「誰欠誰」，揪團補上收款人與開團通知身分組。
--
-- 為什麼要 counterparty_user_id：原本只記「這個人這場該付多少」，算得出個人結餘，
-- 但答不出「我該把錢拿給誰」。加上對象欄位後，債務才是一條有方向的邊。
-- 舊資料沿用空字串＝沒有指定對象，仍只計入個人結餘，不會憑空長出債務關係。

ALTER TABLE guild_settings
    ADD COLUMN IF NOT EXISTS notify_role_id TEXT NOT NULL DEFAULT '';

-- 收款人（先幫大家墊錢的人）。預設是開團者，可在開團時指定。
ALTER TABLE order_sessions
    ADD COLUMN IF NOT EXISTS payer_user_id TEXT NOT NULL DEFAULT '';

UPDATE order_sessions SET payer_user_id = host_user_id WHERE payer_user_id = '';

ALTER TABLE ledger_entries
    ADD COLUMN IF NOT EXISTS counterparty_user_id TEXT NOT NULL DEFAULT '';

-- 查「我欠誰／誰欠我」會同時從兩個方向問，兩個方向各給一個索引。
CREATE INDEX IF NOT EXISTS ledger_entries_pair_idx
    ON ledger_entries (guild_id, discord_user_id, counterparty_user_id);

CREATE INDEX IF NOT EXISTS ledger_entries_counterparty_idx
    ON ledger_entries (guild_id, counterparty_user_id);
