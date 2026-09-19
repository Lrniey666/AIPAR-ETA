# 技術專有名詞

對照 [`slides.md`](./slides.md)／[`AIPARC-ETA-intro.pptx`](./AIPARC-ETA-intro.pptx)。  
只收簡報裡出現、且具**技術意義**的詞。每條先給**白話**，再寫概念、定義與本專案用途。  
依**頁數**與該頁**首次出現順序**排列；後頁再出現的同一詞不重複。

---

## 第 1 頁｜封面

### AIPARC ETA（`aiparc-eta`）

- **白話**：這套系統的正式名字，程式與 Docker 也用同一組英文。
- **概念**：本 Repository 的產品識別字。
- **定義**：npm 套件名、Compose 專案名與對外標題。與規劃別名「AIPARC EAT」同一實驗室識別。
- **本專案用途**：`package.json` 的 `name`、容器網路 `aiparc-eta-net`、網站 `<title>` 與 Discord Embed 作者名。

### Discord（寫入通道）

- **白話**：大家平常聊天的那個 App；在這裡點餐、建檔、結帳才算數。
- **概念**：Gateway 連線的操作面，不是資料庫。
- **定義**：discord.js 14 的 bot 行程；指令、元件、論壇 thread、訊息內容都從這裡進來。
- **本專案用途**：唯一寫入授權路徑。`bot` 呼叫 `db/` 與 `domain/`，不直接組 SQL。

### 校內網站（`web`，埠 3000）

- **白話**：實驗室網路才打得開的看板，用來查，不能在上面改點餐。
- **概念**：內網 HTTP 查閱面。
- **定義**：`node:http` 自寫路由，伺服器端渲染 HTML 與唯讀 JSON。無公有網域、無前端建置。
- **本專案用途**：`GET /`、`/restaurants`、`/sessions`、`/ledger`、`/status` 與對應 `/api/*`。非 GET 回 405。

---

## 第 4 頁｜一句話

### Discord bot（`bot` 容器）

- **白話**：掛在伺服器裡會回話、會貼按鈕的那個機器人。
- **概念**：單一 Gateway 實例。
- **定義**：Compose 服務 `bot`。Intents：`Guilds`、`GuildMessages`、`MessageContent`、`GuildMessageReactions`。
- **本專案用途**：斜線指令、元件、論壇開團、自然語言、截止排程。健康檢查在容器內 `:3001/health`。

### PostgreSQL 18.6

- **白話**：所有餐廳、菜單、點餐、帳本真正存放的地方。
- **概念**：唯一持久層。
- **定義**：映像 `postgres:18.6-alpine`；時間欄 `TIMESTAMPTZ`（庫內 UTC）；Discord 雪花 ID 存 `TEXT`。
- **本專案用途**：`bot` 與 `web` 共用連線池。遷移在 `src/db/sql/`，啟動時由 `migrate.ts` 套用。

### LLM（大型語言模型）

- **白話**：幫忙認菜單照片、聽懂「我要一份豆腐鍋」的 AI；錢不歸它算。
- **概念**：文字／影像 → 結構化意圖的函式，不是帳務引擎。
- **定義**：經自寫閘道打 OpenAI 相容 `chat/completions`。輸出經任務模組驗證後才用。
- **本專案用途**：菜單視覺、自然語言點餐／取消／查帳。**不得**產出 `*_cents` 或改 `ledger_entries`。

### `*_cents`

- **白話**：資料庫裡的錢用「分」存，顯示時再換成「元」，避免小數算錯。
- **概念**：金額的唯一儲存單位。
- **定義**：TWD 的 1/100，整數。顯示走 `format_cents()`；網站 JSON 對外才換成元。
- **本專案用途**：`menu_items.price_cents`、`order_lines.unit_price_cents`、`ledger_entries.amount_cents`。禁止浮點運算金額。

---

## 第 5 頁｜功能總覽

### 斜線指令（Application Commands）

- **白話**：在 Discord 打 `/` 之後跳出的那排指令。
- **概念**：Discord 全域註冊的 slash command。
- **定義**：定義在 `src/bot/commands/`；英文預設名 ≤ 10 字母，中文 ≤ 6 字；`zh-TW`／`zh-CN` 都對到繁中。改完需 `npm run register`。
- **本專案用途**：八支：`restaurant`、`menu`、`groupbuy`、`settle`、`ledger`、`help`、`website`、`setup`。

### `menus.status = draft`

- **白話**：辨識完的菜單先當草稿，有人按「確認寫入」才真正上線。
- **概念**：菜單狀態機的入口態。
- **定義**：`draft` →（確認寫入）`active`；同餐廳舊 `active` 改 `archived`。部分唯一索引保證同時只有一版 `active`。
- **本專案用途**：視覺／文字解析只寫草稿。`activate_menu()` 才讓點餐看得到品項。

### 彙總訊息（`summary_msg_id`）

- **白話**：貼文裡那張會一直更新的「點了什麼、誰該付多少」卡片。
- **概念**：一場揪團唯一會被反覆 `edit` 的 Embed。
- **定義**：`order_sessions.summary_msg_id`。欄位：全體清單、每人應付、人數、合計。
- **本專案用途**：加點、取消、封單、結算都重畫同一則，避免清單分岔。

### `ledger_charge_once`

- **白話**：同一場午餐，同一個人只會被記一次該付多少，按兩次結算也不會收兩次。
- **概念**：結算冪等。
- **定義**：部分唯一索引 `(session_id, discord_user_id) WHERE kind = 'charge'`。
- **本專案用途**：同場同一 Discord 使用者只會有一筆應付。`/結算` 重跑不會加倍扣款。

---

## 第 6 頁｜菜單建檔與查詢

### `/餐廳`（`/restaurant`）

- **白話**：把店名登記進系統，之後開團、查菜單都用這份名單。
- **概念**：餐廳主檔指令。
- **定義**：子指令 `add`／`list`／`info`。選項開自動完成，回傳值是資料庫 `id`。
- **本專案用途**：寫入 `restaurants`。`name_key` 唯一；`aliases TEXT[]` 供別名查詢。

### `/菜單`（`/menu`）

- **白話**：上傳照片或貼文字，把價目表變成系統可以點、可以算錢的清單。
- **概念**：菜單版本指令。
- **定義**：`show`／`upload`／`input`／`version`。上傳走視覺（可加 OCR）；輸入先規則解析，不成再 LLM。
- **本專案用途**：寫 `menus` + `menu_items`。點餐價格只讀 `active` 版的品項。

### `menus.source = vision`

- **白話**：這份菜單是看照片認出來的，不是人逐字打的。
- **概念**：菜單來源列舉之一。
- **定義**：`manual`｜`vision`｜`import`。視覺任務在 `src/llm/tasks/menu_extract.ts`。
- **本專案用途**：網站菜單頁「來源」欄。辨識結果仍是 `draft`，與人工輸入同一關卡。

### 直書版面（`ocr_layout`）

- **白話**：直排、從右往左讀的菜單，系統會先轉成正確閱讀順序再認。
- **概念**：閱讀順序不是橫排 LTR 的菜單。
- **定義**：`src/domain/ocr_layout.ts` 判定直書（上→下、右→左）或整張旋轉，再重排文字行。
- **本專案用途**：視覺提示詞要求先判方向；有 OCR 時把排好的字當對照。

### OCR 對帳（PP-OCRv6 small）

- **白話**：再用另一套「讀圖上的字」去核對 AI 認的菜單，只標可疑行、不擅自改價。
- **概念**：可選的第二路文字抽取。
- **定義**：`OCR_BASE_URL` 有值才打 `src/llm/ocr.ts`；對帳在 `menu_reconcile.ts`。對帳**只標記、不改草稿**。
- **本專案用途**：預覽標 ⚠️（品名對上但圖上無此價）與 ❓（品名對不上）。留空則略過整段。

### `activate_menu()`

- **白話**：按下「確認寫入」時真正讓新菜單上路的那一步。
- **概念**：草稿上線的唯一函式。
- **定義**：新版 `active`、同餐廳其他 `active` → `archived`。對應按鈕 custom id `draft:confirm`。
- **本專案用途**：沒走這支函式，`order_lines` 就還對不到新品項。

### 菜單版本（`menus.version`）

- **白話**：改價是出新一版，舊場點餐仍照當時的價格，不會事後被改掉。
- **概念**：不可變價目快照的序號。
- **定義**：改菜單是出新版，不 UPDATE 舊 `menu_items`。歷史 `order_lines.unit_price_cents` 是下單當下快照。
- **本專案用途**：換季改價不回溯已結場次。`/菜單 版本` 可切回某一版為 `active`。

---

## 第 7 頁｜揪團點餐

### `/揪團`（`/groupbuy`）

- **白話**：選一家店、設幾分鐘後截止，Bot 就在論壇開一則貼文開始收單。
- **概念**：建立 `order_sessions` 的指令。
- **定義**：必填 `restaurant`（自動完成 id）、`minutes`（1–10080 整數）。選填 `payer`、`title`。
- **本專案用途**：在 `guild_settings.forum_channel_id` 開 Forum thread，寫 `channel_id`＝thread id（唯一）。

### Forum thread

- **白話**：Discord 論壇裡的一則討論串；這一場午餐的點餐都發生在這裡。
- **概念**：Discord 論壇貼文，一場揪團一則。
- **定義**：不是一般文字頻道。點餐訊息與彙總都綁這則 `channel_id`。
- **本專案用途**：貼文內自然語言才當點餐；對不到菜單的閒聊略過。被 @ 才轉問答。

### 通知身分組（`notify_role_id`）

- **白話**：開團時自動 @ 某一群人，例如午餐組。
- **概念**：開團時的 role mention。
- **定義**：`guild_settings.notify_role_id`；`/設定 通知` 寫入。
- **本專案用途**：thread 第一則訊息 ping `<@&id>`。未設則不 ping。

### Embed

- **白話**：左邊有色條的卡片訊息，菜單、帳、說明都長這樣，不是一長串純文字。
- **概念**：Discord 結構化訊息物件。
- **定義**：配色與標誌在 `src/bot/branding.ts`（金 `#eabf29`、藍 `#259fc8`）。縮圖取網站 `/assets/`，需 `PUBLIC_BASE_URL`。
- **本專案用途**：菜單、彙總、帳務、說明一律 Embed。點餐／帳務結果禁止純文字當最終答。

### 點餐面板（Message Components）

- **白話**：按「點餐」之後出現的數量與品項下拉，不必會下指令也能點。
- **概念**：按鈕＋String Select。
- **定義**：custom id 格式 `scope:action:參數…`，上限 100 字元。數量編在品項下拉的 id 裡（Discord 多下拉不共享 state）。
- **本專案用途**：`session:pick|qty|add|page|mine|clear|remove|clearall|refresh|lock|settle`。數量 1–10；每頁 25 品項。

### 自然語言點餐（`order_parse`）

- **白話**：直接打「我要一個豆腐鍋」；系統去對菜單，不會拿你嘴上講的價格入帳。
- **概念**：規則優先的品名／數量對應。
- **定義**：`src/llm/tasks/order_parse.ts`。先對 `menu_items`，殘字再讀份數。意圖另有 `cancel-order`。
- **本專案用途**：`order_lines.source = natural-language`。`unit_price_cents` 只查庫，不吃句子裡的數字當價格。

### Ack Reaction

- **白話**：Bot 先貼一個 👀，表示「有看到，正在處理」。
- **概念**：非斜線互動的同步回饋。
- **定義**：對使用者訊息加 👀（`src/bot/ack.ts`）。斜線指令改 `deferReply()`。
- **本專案用途**：LLM 尚未回時頻道已有「收到」訊號。

### Streaming Preview

- **白話**：等 AI 時，同一則訊息會一段一段把內容長出來，不是乾等。
- **概念**：把模型生成內容編輯進同一則 bot 訊息。
- **定義**：先送一則訊息，約每 1.2 秒 `edit` 已生成內容。
- **本專案用途**：免費層延遲高時，避免空白等待。空回覆視為該供應商失敗並換手。

---

## 第 8 頁｜記帳與分攤

### `/結算`（`/settle`）→ `settle_session()`

- **白話**：這場點完了，把每個人該付的錢寫進帳本，並說清楚錢拿給誰。
- **概念**：揪團 → 帳本的寫入點。
- **定義**：每人小計 INSERT `ledger_entries.kind = charge`，對象＝`order_sessions.payer_user_id`。場次改 `settled`。
- **本專案用途**：收款人自己的 charge 不寫 counterparty（避免自環）。與按鈕「結算」同一函式。

### `/帳務`（`/ledger`）

- **白話**：查自己欠多少、誰欠誰、以及登記「我付錢了」。
- **概念**：帳本讀寫指令。
- **定義**：`mine`／`all`／`who`／`pay`。付款可帶 `to`（付給）。
- **本專案用途**：讀 `ledger_entries` 加總；`pay` 只 INSERT `kind = payment`，不 UPDATE 舊列。

### 結餘（derived balance）

- **白話**：把「吃了多少」減「付了多少」得出來的數字，不是另外存一格會被改掉的餘額。
- **概念**：不落地的計算欄。
- **定義**：`Σ(payment) + Σ(adjustment) − Σ(charge)`。負＝還欠，正＝多付。
- **本專案用途**：`/帳務 我的`、`總覽`、網站 `/ledger/:guild-id`。沒有 `balance` 欄位可被改寫。

### 債務邊（`counterparty_user_id`）

- **白話**：不只說「你欠 200」，還記「這 200 是要給哪一位」。
- **概念**：有向誰欠誰。
- **定義**：有填對象的分錄才成邊。`list_debt_edges()` 取邊，`src/domain/debts.ts` 互抵。
- **本專案用途**：與結餘分開呈現。沒指定「付給」的付款只動結餘、不消邊。

### 最少轉帳建議

- **白話**：互相欠來欠去抵掉之後，用最少幾筆轉帳就能全部結清。
- **概念**：債務圖的清算。
- **定義**：互抵後的淨額，用盡量少的轉帳邊結清。純函式，有離線測試。
- **本專案用途**：`/帳務 誰欠誰` 與 `GET /api/debts/:guild-id` 的 `suggested_transfers`。

### `payer_user_id`

- **白話**：這場先墊錢、最後收大家錢的那個人，預設是開團者。
- **概念**：該場收款人。
- **定義**：開團選項，預設 `host_user_id`。結算時多數 charge 的 counterparty。
- **本專案用途**：彙總欄「收款人」；網站場次頁也讀這個欄。

---

## 第 9 頁｜使用路徑

### `/設定`（`/setup`）

- **白話**：管理員指定「揪團要開在哪個論壇」、以及開團要 @ 誰。
- **概念**：guild 級設定，需 Manage Server。
- **定義**：`forum` 寫 `guild_settings.forum_channel_id`（必須是 Forum）；`role` 寫 `notify_role_id`。
- **本專案用途**：未設論壇則 `/揪團` 拒絕。設定存在 PostgreSQL，不是 Discord 本機狀態。

### `deadline_at`／截止分鐘

- **白話**：從現在起算幾分鐘後停止收單，最多可以設到一週。
- **概念**：收單窗格。
- **定義**：`minutes` ∈ [1, 10080]，換算成 `order_sessions.deadline_at`（timestamptz）。
- **本專案用途**：仍 `open` 且未到點才顯示相對時間戳；過期或已封則寫死「截止」＋絕對時刻。

### `lock_session()`（封單）

- **白話**：這場不再接受加點；時間到自動封、或有人按「封單」，走同一套動作。
- **概念**：停止改點餐的唯一路徑。
- **定義**：狀態 → `locked`；標題加 🔒；貼通知；重畫彙總。手動按鈕與 `scheduler.ts`（60s 掃描）都呼叫它。
- **本專案用途**：截止與「封單」語意一致，避免排程只改資料庫、訊息仍像開放中。

---

## 第 10 頁｜兩個入口

### 唯讀 HTTP

- **白話**：網站只能看，改任何東西都要回到 Discord。
- **概念**：網站沒有寫入動詞。
- **定義**：頁面與 `/api/*` 僅 GET。授權模型不在 web 重做一份。
- **本專案用途**：校內 IP 暴露的是查閱面；改菜單／點餐／帳必須回 Discord。

### 伺服器端渲染（SSR）

- **白話**：網頁在伺服器就組好再送到瀏覽器，不必另外裝一套前端工程。
- **概念**：HTML 在 Node 組好再送出。
- **定義**：`src/web/render.ts` + 內嵌 `theme.ts` CSS／腳本。無 Vite、無 CDN 字型。
- **本專案用途**：校內單機可開。靜態檔走 `/assets/` 白名單（`assets.ts` 對照表）。

### 儀表板（`GET /`）

- **白話**：網站首頁：幾間餐廳、幾場揪團、最近開了什麼團。
- **概念**：聚合讀模型。
- **定義**：數字卡來自 `overview_counts`；列表來自 `list_sessions`／`list_restaurants`。JSON 對應 `GET /api/overview`。
- **本專案用途**：簡報截圖來源。寫入仍全部在 bot。

### 主題（`data-theme` / View Transitions）

- **白話**：淺色／深色可切；系統若要求減少動態，就直接換色不做動畫。
- **概念**：CSS 變數切深淺色。
- **定義**：預設 `prefers-color-scheme`；使用者選擇存 `localStorage` 鍵 `aiparc-eta-theme`。切換用 View Transitions 圓形 `clip-path`。
- **本專案用途**：`prefers-reduced-motion` 時關閉全部轉場與動畫，直接換色。

---

## 第 11 頁｜技術棧

### Node.js ≥ 24.12（type stripping）

- **白話**：用的執行環境夠新，TypeScript 檔可以直接跑，不必先編譯成另一份。
- **概念**：執行期直接跑 TypeScript。
- **定義**：無 `tsc` 產出步驟即可 `node src/web.ts`。`engines.node` 釘此下限。
- **本專案用途**：`web`／`bot` 容器與本機 `npm run start:*`。

### TypeScript ESM

- **白話**：程式用有型別的 JavaScript 寫，模組用現代的 `import`。
- **概念**：原始碼語言與模組格式。
- **定義**：`src/**/*.ts`，`import` 帶 `.ts` 副檔名。識別字 snake_case；型別 PascalCase。
- **本專案用途**：`STRINGS` 雙語 tuple 缺一邊會在型別檢查失敗。

### Docker Compose

- **白話**：一條指令同時啟動資料庫、網站、機器人三個容器。
- **概念**：三服務編排。
- **定義**：`postgres`、`web`、`bot`。時區 `Asia/Taipei`。映像非 root `node`。
- **本專案用途**：本機與校內部屬同一份 `compose.yaml`。Postgres 埠綁 `127.0.0.1`。

### discord.js 14.27

- **白話**：跟 Discord 溝通用的現成程式庫；只有 bot 能用，算錢的邏輯故意不碰它。
- **概念**：Discord API 用戶端。
- **定義**：僅 `src/bot/` 可 import。`domain`／`llm` 禁止依賴。
- **本專案用途**：指令註冊、元件、Forum、Embed、Reaction。

### `node:http`（無網頁框架）

- **白話**：網站自己用 Node 內建的 HTTP，不另外裝 Express 這類框架。
- **概念**：網站 HTTP 棧。
- **定義**：路由純函式在 `src/web/routes/match.ts`，有離線測試。
- **本專案用途**：刻意不引 Express／Fastify，減少校內機器相依。

### LLM 閘道（OpenAI 相容 wire format）

- **白話**：對不同 AI 商家用同一種打電話方式，換一家只改網址和金鑰。
- **概念**：供應商無關的 HTTP 用戶端。
- **定義**：`src/llm/transport.ts` 用內建 `fetch`。不引 OpenAI／Google SDK。換手只換 `base_url`、金鑰清單、模型 ID。
- **本專案用途**：Groq／Gemini／Mistral／iAI 註冊於 `providers.ts`。金鑰逗號分隔；空＝跳過該家。標成計費的供應商預設關閉；iAI 為免費層。

### Groq／Gemini／Mistral

- **白話**：目前接上的三家免費 AI；某一家沒金鑰就跳過，不會害系統開不起來。
- **概念**：免費層 OpenAI 相容供應商。
- **定義**：模型 ID 必須設定；不拿價目表猜 ID。視覺佇列與文字佇列分開。
- **本專案用途**：文字對應與菜單圖。空字串回覆當失敗並換下一家。

### PP-OCRv6 small

- **白話**：專門把圖片上的字讀出來的引擎，可選，用來跟 AI 認的菜單對一下。
- **概念**：可選 OCR 引擎。
- **定義**：HTTP 客戶端，不在應用容器內跑模型權重。
- **本專案用途**：版面順序 + 與視覺草稿對帳。見第 6 頁。

### 台北時間（`Asia/Taipei`）

- **白話**：畫面上的日期時間一律台北，截止也用這個時鐘。
- **概念**：顯示與截止的日曆時區。
- **定義**：庫存 timestamptz；`format_datetime()` 轉台北。日期 `YYYY-MM-DD`、時間 `HH:MM:SS`。
- **本專案用途**：deadline、網站頁尾「更新於」、帳本顯示。容器 `TZ` 同步。

---

## 第 12 頁｜架構

### 分層（`shared` → `db` → `domain` → `llm` → 入口）

- **白話**：算錢的規則放中間一層，Discord 和網站都呼叫同一套，避免兩邊各算一次。
- **概念**：依賴方向單向。
- **定義**：`shared` 零依賴（時間、金額、正規化、日誌）。`db` 一表一模組。`domain` 不認識 discord.js／`node:http`。`bot` 與 `web` 互不 import。
- **本專案用途**：計價、彙總、債務收斂只存在 `domain`，兩個入口共用。

### 免費 LLM API

- **白話**：預設只用免費的 AI，不在實驗室機器裡跑大型本機模型。
- **概念**：閘道的預設計費約束。
- **定義**：只用免費層。iAI 為校內免費層。`LLM_ALLOW_METERED` 未開則擋標成計費的供應商。
- **本專案用途**：實驗室機器不在容器內跑本機大模型。0／1／N 把金鑰都要能啟動。

---

## 第 13 頁｜設計原則

### 規則優先、模型墊底

- **白話**：對得到的品名就不問 AI；問不清楚要取消哪一道，就再問人，不讓 AI 猜。
- **概念**：LLM 是 fallback，不是預設路徑。
- **定義**：品名 bigram／涵蓋率對得到就不打 API。取消對不到則反問，不讓模型猜 `order_line` id。
- **本專案用途**：省免費配額；金額路徑保持確定性。

### 價格只來自 `menu_items`

- **白話**：你說「雞腿飯 80」也沒用，系統只認庫裡那一筆的價格。
- **概念**：計價不變條件。
- **定義**：`session_flow` 寫入 `order_lines` 時查當時 `active` 菜單。LLM JSON 裡的價格欄忽略。
- **本專案用途**：自然語言與按鈕兩條路同一函式。簡報所稱「模型不得自行定價」的實作點。

### 在地化（`name_localizations`）

- **白話**：Discord 介面是中文就顯示繁中，其他語言顯示英文。
- **概念**：Discord locale → 字串表。
- **定義**：`zh*` → 繁中；其餘 → en-GB。訊息無 locale 時看 guild `preferredLocale` 再看內容是否含漢字。
- **本專案用途**：`src/bot/strings.ts` + `strings_extra.ts` 每鍵 `[zh, en]`。

### 英式英文（en-GB）

- **白話**：英文介面用英國拼法，例如 cancelled，不是美式 canceled。
- **概念**：非中文介面的用字。
- **定義**：cancelled、colour 等 UK 拼法；文件在 `docs/README.en.md`。
- **本專案用途**：指令預設 description、Embed 英文側、按鈕英文標籤。

---

## 第 14 頁｜八支斜線指令

### `/說明`（`/help`）

- **白話**：新成員第一個可以打的指令，五段講完怎麼用，並可開網站。
- **概念**：靜態說明 Embed。
- **定義**：五個 field：建檔、揪團與點餐、結算與帳務、對話、管理。可附網站 Link button。
- **本專案用途**：`src/bot/embeds_help.ts`。自然語言意圖 `help` 也回同一張。

### `/網站`（`/website`）

- **白話**：在 Discord 丟出校內網站連結，不必去記內網 IP。
- **概念**：把 `PUBLIC_BASE_URL` 送到頻道。
- **定義**：Embed + 「開啟網站」按鈕。未設定位址則回缺失說明，不放破圖。
- **本專案用途**：成員不必手打內網 IP。與 Embed thumbnail 共用同一個 base URL。

### 英文預設名

- **白話**：Discord 後台登記的英文指令名；中文使用者看到的是 `/揪團` 這種對照。
- **概念**：Discord 指令主檔名。
- **定義**：`restaurant` `menu` `groupbuy` `settle` `ledger` `help` `website` `setup`。小寫、無空白、≤10。
- **本專案用途**：開發者後台與非中文客戶端顯示這組；中文客戶端顯示 `/餐廳` 等 localization。
