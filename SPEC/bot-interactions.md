# Discord 互動設計

最後更新：2026-09-18（台北時間）

## 原則

取自 PLAN §Discord bot互動設計，這幾條是驗收會看的：

1. **Embed ＋ 按鈕／下拉為主，不用 Modal。** 需要多行輸入的場合（貼菜單）改成「請貼一則訊息」，
   由 `PendingStore` 記住誰在等著貼，10 分鐘內有效。
2. **自然語言也能操作**，但碰到點餐與帳務一定用 Embed 回覆，不用純文字。
3. **等待時要有回饋**：訊息類互動先加 Ack Reaction（👀），需要等 LLM 生成的再加 Streaming Preview
   （先回一則訊息，每 1.2 秒把已生成內容編輯進去）。斜線指令則用 `deferReply()`。
4. **指令名稱**中文不超過 6 字、英文不超過 10 字母。
5. **在地化**：預設名稱與說明為英文（英式拼法），`zh-TW` 與 `zh-CN` 都對應到同一份繁體中文。

## 指令

定義在 `src/bot/commands/definitions.ts`，改完跑 `npm run register`。

| 英文（預設） | 中文 | 子指令 | 作用 |
| --- | --- | --- | --- |
| `/restaurant` | `/餐廳` | `add`／`新增`、`list`／`清單`、`info`／`資訊` | 餐廳建檔與查詢 |
| `/menu` | `/菜單` | `show`／`查看`、`upload`／`上傳`、`input`／`輸入`、`version`／`版本` | 菜單查詢與維護 |
| `/groupbuy` | `/揪團` | — | 在論壇開一場揪團 |
| `/order` | `/點餐` | — | 在揪團貼文裡點餐 |
| `/settle` | `/結算` | — | 結算並寫入帳本 |
| `/ledger` | `/帳務` | `mine`／`我的`、`all`／`總覽`、`pay`／`付款` | 帳務查詢與記錄付款 |
| `/help` | `/說明` | — | 使用說明 |
| `/setup` | `/設定` | `forum`／`論壇` | 指定揪團論壇頻道（需「管理伺服器」權限） |

`restaurant` 選項一律開自動完成，回傳值是資料庫 id，處理器不用再猜使用者指的是哪一間。

## 元件 custom id

格式 `scope:action:參數…`（Discord 上限 100 字元），編解碼在 `src/bot/components.ts`。

| scope | action | 說明 |
| --- | --- | --- |
| `session` | `pick` / `page` / `add` / `mine` / `clear` / `refresh` / `lock` / `settle` | 揪團操作 |
| `draft` | `confirm` / `cancel` | 菜單草稿寫入或丟棄 |
| `menu` | `page` / `activate` | 菜單翻頁、切換版本 |
| `restaurant` | `show` | 沒指定餐廳時的下拉選擇 |

`lock` 與 `settle` 只有開團者或具「管理伺服器」權限的人能按。

## 三條主要流程

### 功能一：菜單建檔與查詢

```
/菜單 上傳 ──► 下載圖片 → 轉 data URL → 視覺模型 → 草稿（status=draft）
                                                    │
/菜單 輸入 ──► 規則解析；解析不出來才交給 LLM ──────┤
                                                    ▼
                                            Embed 預覽 ＋［確認寫入］［取消］
                                                    │ 確認
                                                    ▼
                                      activate_menu()：新版上線、舊版封存
```

沒有人按下「確認寫入」就不會有 `active` 菜單——辨識實驗的結論是自動化天花板不高，人工關卡不能省。

### 功能二：揪團點餐

```
/揪團 ──► 讀 guild_settings.forum_channel_id
       ──► 論壇建立貼文，第一則訊息就是菜單 Embed
       ──► 送出彙總訊息（Embed ＋ 按鈕），記下 summary_msg_id
            │
            ├─ 按［點餐］→ 下拉複選（每頁 25 項）
            └─ 直接打字 →「我要兩個雞腿飯跟一杯紅茶」
                 └─ 規則比對優先，對不到才叫 LLM
            │
            ▼
       每次加點都重畫彙總訊息（全體清單 ＋ 每人應付）
```

貼文裡對不到菜單的閒聊**不會**被回覆，除非有 @ 到 bot。

### 功能三：記帳

```
/結算 或［結算］──► settle_session()：每人小計寫成 ledger charge（同場同人只寫一次）
                 ──► 貼文狀態改 settled
/帳務 付款 ──────► 寫一筆 payment
/帳務 我的／總覽 ► 由紀錄即時算餘額
```

## 語言判定

| 來源 | 判定方式 |
| --- | --- |
| 斜線指令／元件 | `interaction.locale`，`zh*` → 繁體中文，其餘 → 英文 |
| 一般訊息 | Discord 不給使用者語言，改看伺服器 `preferredLocale`，再退回「內容有沒有中文」 |

## 背景排程

`src/bot/scheduler.ts` 每 60 秒掃一次 `deadline_at` 已過但仍 `open` 的揪團，自動封單並在貼文裡通知。
單次掃描失敗只記錄、不讓計時器停掉（驗收要求連跑一週）。

## Intents

`Guilds`、`GuildMessages`、`MessageContent`、`GuildMessageReactions`。

**`MessageContent` 是特權 Intent**，必須先到 Discord 開發者後台打開，否則 bot 收到的訊息內容會是空字串，
自然語言點餐與貼菜單都會失效。
