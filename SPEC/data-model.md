# 資料模型

最後更新：2026-09-18（台北時間）

遷移檔在 `src/db/sql/`，由 `src/db/migrate.ts` 依檔名順序套用，套過的記在 `schema_migrations`。
服務啟動時會自動跑遷移，不需要另外下指令。

## 共通約定

| 約定 | 說明 |
| --- | --- |
| 金額 | 一律 `*_cents` 整數，單位是 TWD 的 1/100。顯示時才用 `format_cents()` 換回元。 |
| 時間 | 一律 `TIMESTAMPTZ`，資料庫存 UTC，顯示時轉台北時間。 |
| 主鍵 | `BIGINT GENERATED ALWAYS AS IDENTITY`。`pg` 的 int8 parser 已設成 `Number`。 |
| Discord ID | 一律 `TEXT`。雪花 ID 超過 `Number.MAX_SAFE_INTEGER`，不能當數字存。 |
| 正規化鍵 | `name_key` 是 `normalise_key()` 的輸出（全形轉半形、異體字統一、去標點），供比對用。 |

## 表

### `restaurants`

餐廳主檔。`name_key` 唯一，所以同名餐廳重複建檔會變成更新而不是新增一筆。
`aliases TEXT[]` 讓「聞香來」也查得到「聞香來簡餐」。

### `menus` / `menu_items`

菜單以**版本**為單位，改菜單是出新版而不是就地改舊版——歷史訂單引用的品項價格因此不會被後來的修改污染。

| 欄位 | 值 | 意義 |
| --- | --- | --- |
| `menus.source` | `manual` / `vision` / `import` | 人工輸入／圖片辨識／匯入 |
| `menus.status` | `draft` / `active` / `archived` | 草稿／使用中／已封存 |

`menus_single_active` 是部分唯一索引，保證**一間餐廳同時只有一版 `active`**。
新菜單一律先進 `draft`，要有人在 Discord 按下「確認寫入」才會 `activate_menu()` 上線。

### `order_sessions` / `order_lines`

一則論壇貼文 = 一場揪團，`channel_id`（貼文 thread ID）唯一。
`summary_msg_id` 是那則會被反覆編輯的彙總訊息。

| 欄位 | 值 |
| --- | --- |
| `order_sessions.status` | `open` / `locked` / `settled` / `cancelled` |
| `order_sessions.payer_user_id` | 先墊錢、之後要收錢的人；預設是 `host_user_id` |
| `order_lines.source` | `natural-language` / `component` / `manual` |

`order_lines.unit_price_cents` 是**下單當下的價格快照**。菜單之後改價，舊訂單金額不會跟著變。
`menu_item_id` 用 `ON DELETE SET NULL`，品項被刪掉時訂單仍保有品名與價格。

### `ledger_entries`

記帳。一筆一個動作，不存餘額欄位——餘額永遠由紀錄算出來。

| `kind` | 正數代表 |
| --- | --- |
| `charge` | 這個人這場該付多少 |
| `payment` | 這個人付了多少 |
| `adjustment` | 人工修正 |

```
餘額 = Σ(payment) + Σ(adjustment) − Σ(charge)
負數＝還欠錢，正數＝多付
```

`ledger_charge_once` 是部分唯一索引 `(session_id, discord_user_id) WHERE kind = 'charge'`：
**同一場揪團對同一個人只會計費一次**，`/結算` 重跑不會重複扣款。

#### `counterparty_user_id`：誰欠誰

`counterparty_user_id` 是這筆帳的對象。空字串＝沒有指定對象，只影響個人結餘。

| 情境 | 寫法 |
| --- | --- |
| 結算時的一般成員 | `charge`，對象＝這場的 `payer_user_id` |
| 結算時的收款人自己 | `charge`，對象留空（不然會長出「自己欠自己」的邊） |
| `/帳務 付款` 指定「付給」 | `payment`，對象＝收款人，抵銷該方向的欠款 |

有向邊由 `list_debt_edges()` 取出（charge 為正、payment／adjustment 為負），
互抵與最少轉帳建議在 `src/domain/debts.ts`，是純函式並有離線測試。

**結餘與債務是兩件事**：結餘答「我這段時間吃了多少、付了多少」，
債務答「我該把錢拿給誰」。兩者各自成立，顯示時也分開講。

### `app_users`

Discord 使用者的顯示名稱與語言偏好。網站端要靠它把 ID 換成人名。

### `guild_settings`

每個伺服器的設定：

| 欄位 | 說明 |
| --- | --- |
| `forum_channel_id` | 揪團要開在哪個論壇頻道 |
| `notify_role_id` | 開團時要 ping 的身分組；空字串＝不通知 |

### `menu_uploads`

菜單圖片辨識紀錄：來源網址、供應商、模型、狀態與**原始回應**（`raw_response JSONB`）。
留原始回應的理由是辨識錯的時候要答得出「模型當時到底看到什麼」。

| `status` | 意義 |
| --- | --- |
| `pending` | 已收圖，還沒辨識完 |
| `parsed` | 辨識出草稿，等人確認 |
| `failed` | 辨識失敗，`error` 有原因 |
| `applied` | 已確認並上線 |

### `llm_calls`

每一次 LLM 呼叫的結果（供應商、模型、成功與否、延遲、狀態碼、錯誤）。
免費層配額是最會出事的地方，`GET /api/llm-usage` 就是讀這張表。

## 不變條件

1. 一間餐廳最多一版 `active` 菜單。
2. 同一場揪團的同一個人最多一筆 `charge`。
3. `order_lines.quantity` 介於 1–99，`*_cents` 不得為負。
4. 草稿菜單只有在 `status = 'draft'` 時刪得掉（`delete_menu()` 帶條件）。
5. 債務邊不會指向自己：`counterparty_user_id = discord_user_id` 的紀錄不進 `list_debt_edges()`。
6. 使用者只刪得掉自己的點餐：`delete_user_lines()` 與 `delete_order_line()` 都帶 `discord_user_id` 條件。
