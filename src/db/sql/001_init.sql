-- 實驗室伙食系統 AIPARC ETA — 初始資料結構
-- 金額一律以「分」為整數單位（TWD 的 1/100），避免浮點誤差。
-- 時間一律 TIMESTAMPTZ，顯示時才轉台北時間。

CREATE TABLE IF NOT EXISTS restaurants (
    id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          TEXT        NOT NULL,
    name_key      TEXT        NOT NULL UNIQUE,
    aliases       TEXT[]      NOT NULL DEFAULT '{}',
    phone         TEXT        NOT NULL DEFAULT '',
    address       TEXT        NOT NULL DEFAULT '',
    note          TEXT        NOT NULL DEFAULT '',
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_by    TEXT        NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 一間餐廳可以有多版菜單；同一時間只有一版是 active。
CREATE TABLE IF NOT EXISTS menus (
    id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    restaurant_id BIGINT      NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
    version       INTEGER     NOT NULL,
    source        TEXT        NOT NULL CHECK (source IN ('manual', 'vision', 'import')),
    status        TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'active', 'archived')),
    note          TEXT        NOT NULL DEFAULT '',
    created_by    TEXT        NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at  TIMESTAMPTZ,
    UNIQUE (restaurant_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS menus_single_active
    ON menus (restaurant_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS menu_items (
    id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    menu_id       BIGINT      NOT NULL REFERENCES menus (id) ON DELETE CASCADE,
    category      TEXT        NOT NULL DEFAULT '',
    name          TEXT        NOT NULL,
    name_key      TEXT        NOT NULL,
    price_cents   INTEGER     NOT NULL CHECK (price_cents >= 0),
    unit          TEXT        NOT NULL DEFAULT '',
    note          TEXT        NOT NULL DEFAULT '',
    position      INTEGER     NOT NULL DEFAULT 0,
    is_available  BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS menu_items_menu_idx ON menu_items (menu_id, position);
CREATE INDEX IF NOT EXISTS menu_items_name_key_idx ON menu_items (name_key);

-- Discord 使用者的顯示名稱與語言偏好；沒有這張表就沒法在網站端顯示人名。
CREATE TABLE IF NOT EXISTS app_users (
    discord_user_id TEXT        PRIMARY KEY,
    display_name    TEXT        NOT NULL,
    locale          TEXT        NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 一則論壇貼文＝一場揪團。channel_id 存的是該貼文（thread）的 ID。
CREATE TABLE IF NOT EXISTS order_sessions (
    id             BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    guild_id       TEXT        NOT NULL,
    channel_id     TEXT        NOT NULL UNIQUE,
    summary_msg_id TEXT        NOT NULL DEFAULT '',
    restaurant_id  BIGINT      NOT NULL REFERENCES restaurants (id) ON DELETE RESTRICT,
    menu_id        BIGINT      REFERENCES menus (id) ON DELETE SET NULL,
    title          TEXT        NOT NULL,
    status         TEXT        NOT NULL DEFAULT 'open'
                               CHECK (status IN ('open', 'locked', 'settled', 'cancelled')),
    host_user_id   TEXT        NOT NULL,
    deadline_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS order_sessions_guild_idx ON order_sessions (guild_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS order_lines (
    id               BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id       BIGINT      NOT NULL REFERENCES order_sessions (id) ON DELETE CASCADE,
    discord_user_id  TEXT        NOT NULL,
    display_name     TEXT        NOT NULL,
    menu_item_id     BIGINT      REFERENCES menu_items (id) ON DELETE SET NULL,
    item_name        TEXT        NOT NULL,
    unit_price_cents INTEGER     NOT NULL CHECK (unit_price_cents >= 0),
    quantity         INTEGER     NOT NULL CHECK (quantity > 0 AND quantity <= 99),
    note             TEXT        NOT NULL DEFAULT '',
    source           TEXT        NOT NULL DEFAULT 'component'
                                 CHECK (source IN ('natural-language', 'component', 'manual')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_lines_session_idx ON order_lines (session_id, discord_user_id);

-- 記帳：charge＝這場該付、payment＝已付、adjustment＝手動修正。
-- 餘額 = SUM(payment + adjustment) - SUM(charge)，負數代表還欠錢。
CREATE TABLE IF NOT EXISTS ledger_entries (
    id              BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id      BIGINT      REFERENCES order_sessions (id) ON DELETE SET NULL,
    guild_id        TEXT        NOT NULL,
    discord_user_id TEXT        NOT NULL,
    kind            TEXT        NOT NULL CHECK (kind IN ('charge', 'payment', 'adjustment')),
    amount_cents    INTEGER     NOT NULL,
    note            TEXT        NOT NULL DEFAULT '',
    created_by      TEXT        NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ledger_entries_user_idx
    ON ledger_entries (guild_id, discord_user_id, created_at DESC);

-- 同一場揪團對同一個人只記一次 charge，重跑結算不會重複計費。
CREATE UNIQUE INDEX IF NOT EXISTS ledger_charge_once
    ON ledger_entries (session_id, discord_user_id) WHERE kind = 'charge';

-- 菜單圖片辨識紀錄：留原始回應才追得出「為什麼辨識錯」。
CREATE TABLE IF NOT EXISTS menu_uploads (
    id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    restaurant_id BIGINT      REFERENCES restaurants (id) ON DELETE CASCADE,
    menu_id       BIGINT      REFERENCES menus (id) ON DELETE SET NULL,
    source_url    TEXT        NOT NULL,
    provider      TEXT        NOT NULL DEFAULT '',
    model         TEXT        NOT NULL DEFAULT '',
    status        TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'parsed', 'failed', 'applied')),
    raw_response  JSONB,
    error         TEXT        NOT NULL DEFAULT '',
    created_by    TEXT        NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- LLM 呼叫紀錄：免費層配額是最會出事的地方，要看得到打了幾次、誰擋下來。
CREATE TABLE IF NOT EXISTS llm_calls (
    id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task        TEXT        NOT NULL,
    provider    TEXT        NOT NULL,
    model       TEXT        NOT NULL,
    ok          BOOLEAN     NOT NULL,
    latency_ms  INTEGER     NOT NULL DEFAULT 0,
    status_code INTEGER,
    error       TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS llm_calls_created_idx ON llm_calls (created_at DESC);
