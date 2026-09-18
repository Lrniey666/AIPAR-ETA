# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

依 `PLAN/AEPARC_EAT_Revise_1.md` 的修訂清單，處理菜單辨識、自然語言、Discord 互動、帳務與網站五個面向。
本機已跑 `npm run typecheck` 與 53 項離線測試（全綠），網站的八個頁面與四個靜態檔位址以實際資料庫驗過。
**Discord 端的互動（開團 ping、點餐面板、自然語言取消、`/網站`）尚未以真人操作驗收**——
指令表有增減，部署後要跑一次 `npm run register`。

### Added

- 通用介紹簡報：`docs/presentations/AIPAR-ETA-intro.pptx`（15 頁）與講稿 `slides.md`、專有名詞 `glossary.md`。網站畫面為 2026-09-18 本機實機截圖；Discord 畫面依實際字串表、按鈕名稱與標誌繪製。用 PowerPoint 或 Google 簡報開啟即可核對頁序與講者備註。
- 菜單對帳 OCR（PP-OCRv6 small，選用）：`src/llm/ocr.ts` 的 HTTP 客戶端、`src/domain/ocr_layout.ts` 的版面分析、`src/domain/menu_reconcile.ts` 的對帳。設定 `OCR_BASE_URL` 才啟用，留空整段略過，流程與先前相同。對帳只標記不改資料，草稿預覽會標出「品名對不上」（❓）與「價格在圖上找不到」（⚠️），並提示 OCR 讀到、草稿漏掉的品項。
- 自然語言取消點餐：「取消紅茶」「全部取消」；講不清楚要取消哪一項時反問，不讓模型猜要刪什麼。規則在 `src/llm/tasks/order_cancel.ts`，意圖多一種 `cancel-order`。
- 自然語言查帳：@ bot 問「我還欠多少」「誰欠我錢」會用帳務 Embed 回覆，金額一律取自資料庫。
- 帳務記錄「誰欠誰」：`ledger_entries.counterparty_user_id` 與 `order_sessions.payer_user_id`（遷移 `003_debts_and_roles.sql`）。新增 `/帳務 誰欠誰` 顯示互抵後的欠款與最少轉帳建議；`/帳務 我的` 多一欄「你要拿 X 給某某」；`/帳務 付款` 可指定「付給」誰。收斂邏輯在 `src/domain/debts.ts`。
- 開團通知身分組：`/設定 通知`（`guild_settings.notify_role_id`），開團時在論壇貼文的第一則訊息 ping。
- `/網站` 指令與 Embed 的標誌：網站新增 `/assets/` 白名單靜態檔，`PUBLIC_BASE_URL` 有設定時 Embed 會帶標誌與網站連結按鈕。
- 網站新增 `/restaurants`、`/sessions`、`/ledger`、`/ledger/:guild-id`、`/status` 五個頁面，以及 `GET /api/overview`、`GET /api/debts/:guild-id` 兩支 API。
- 24 項離線測試：OCR 版面判定與對帳、點餐數量、取消、債務收斂、截止分鐘數、靜態檔白名單、導覽列與主題切換。

### Changed

- `web` 與 `bot` 共用映像名稱 `aipar-eta:app`，不再讓 Compose 預設編成兩份 `aipar-eta-web`／`aipar-eta-bot`。兩個容器仍分開跑，Dockerfile 只建一次。確認：`docker compose up --build -d` 後 `docker images aipar-eta` 只有一筆應用映像。
- **Breaking:** `/揪團` 的截止時間從字串（`30m`／`1h30m`）改成整數分鐘（1–10080），選項名稱也改成 `minutes`／`截止分鐘`。改完要跑 `npm run register`。
- 菜單辨識的提示詞改寫：明講版面可能是**直書**（由上而下、由右至左）或整張旋轉 90 度，要求先判斷方向再讀；並逐條說明勾選框「□」、編號、大小杯雙價、電話與加價說明的處理方式。有 OCR 時附上依閱讀順序排好的文字當對照。
- 自然語言問答改成先自然接一句話再把話題帶回點餐或帳務，而不是一律回「查不到」。模型拿得到目前餐廳、這個頻道的揪團、發問者的結餘與債務，所有數字仍只能來自這些事實。
- 按鈕點餐可以選數量（1–10）：點餐面板變成「每項數量 ▾ ＋ 品項 ▾ ＋ 翻頁」，數量編在品項下拉的 custom id 裡。
- 「清除我的」改成先開面板逐項選要清掉哪幾筆，要全清再按「全部清除」。
- 彙總訊息在已封單或截止時間已過時顯示「截止」＋實際時刻，不再繼續倒數。
- 自動封單改走與手動封單相同的 `lock_session()`：改狀態、貼文標題加 🔒、貼通知、重畫彙總四件事一次做完。先前排程只改了資料庫狀態。
- `/說明` 改成五個編號欄位（建檔／揪團／結算／對話／管理）加標誌與網站連結按鈕，取代原本擠成一塊的說明文字。
- 網站改版：導覽列、儀表板、深淺色切換（View Transitions 的圓形遮罩轉場，從按鈕為圓心擴散）、響應式版面（手機到曲面寬螢幕）、Smooth Rounded Corners。`prefers-reduced-motion` 時**完全關閉**轉場與動畫直接切換。配色與 Embed 共用標誌的金與藍。
- 對外 README 對齊現況：Hero 與徽章改用標誌金／藍、`logo/` 貼齊圖形的標誌、儀表板實拍、點餐面板示意（數量下拉與自然語言取消）；現況改寫為 0.2.0 ＋ Unreleased。
- 映像多 `COPY logo ./logo`，網站的 `/assets/` 與 Embed 縮圖從那裡讀。
- `CHANGELOG.md` 改為 [Keep a Changelog 2.0.0](https://keepachangelog.com/en/2.0.0/)：版本標題用 `## [x.y.z] - YYYY-MM-DD`、僅使用六種變更類型，並在檔尾加上版本比對連結。既有 0.1.0–0.2.1 的事實未改，只重寫結構與用詞。
- 維護約定（`.cursorrules`、`AGENTS.md`、`CONTRIBUTING.md`）改為把未發布變更寫進 `Unreleased`；發版時再改成帶日期的版本號。變更目的寫在該版本摘要或各條目用詞裡，不再另開「變更目的／影響範圍／驗收」標題。
- `SPEC/` 五份文件與 `.env.example` 同步到本版：指令表、custom id、三條流程、資料模型的新欄位、OCR 對帳、網站頁面與外觀無障礙約定。

### Fixed

- 自然語言點餐的數量算錯：先比對品名，再從「品名沒吃掉的殘字」讀份數。舊版反過來做，於是「三杯雞飯」被算成三份「雞飯」，「牛三寶麵」「四季豆」也一起遭殃。提示詞補上同一條規則。
- 切句不再切在「和」「與」上，免得切斷「和風沙拉」這類品名。

### Removed

- **Breaking:** `/點餐`（`/order`）指令。貼文裡已經有「點餐」按鈕與自然語言兩條路，再留一支只能在貼文裡用的斜線指令只是多一個入口要解釋。

## [0.2.1] - 2026-09-18

0.2.0 的根目錄 `README.md` 只夠本機啟動。本版把對外說明改成繁中／英式英文兩份對照，安裝與契約細節收到可折疊區塊與既有 `SPEC/`、`DEPLOY.md`。未改應用程式行為、路由或資料契約。

### Added

- 繁體中文專案介紹 `README.md`：Hero、徽章、語言切換、功能、示範、架構、安裝、結構、貢獻與授權。
- 同一份內容的英式英文 `docs/README.en-GB.md`。
- 貢獻指南 `CONTRIBUTING.md` 與 `docs/CONTRIBUTING.en-GB.md`，以及說明文件索引 `docs/README.md`。
- `docs/assets/`：標誌 SVG，以及 Discord／網站示意 PNG。

### Changed

- `AGENTS.md` 與 `SPEC/README.md` 的文件地圖補上上述入口。

## [0.2.0] - 2026-09-18

0.1.0 只有容器與健康檢查。本版落地 PLAN 的三個功能：餐廳菜單、揪團點餐、記帳與分攤；並補上免費 LLM 閘道、校內網站、測試與規格。本機已用 `npm run check`（29 項離線測試）、`npm run smoke`、`npm run llm:check` 與三容器健康檢查驗過。Discord 伺服器內的開團、按鈕與自然語言點餐尚未以真人操作驗收；本版確認 bot 可連線、八支斜線指令已全域註冊。

### Added

- 資料庫遷移 `001_init.sql`、`002_guild_settings.sql` 與啟動時自動套用的遷移器。十張表：`restaurants`、`menus`、`menu_items`、`app_users`、`order_sessions`、`order_lines`、`ledger_entries`、`menu_uploads`、`llm_calls`、`guild_settings`。
- 免費 LLM 閘道（`src/llm/`）：OpenAI 相容 wire format、不引 SDK；多把金鑰輪替、跨供應商換手、串流。計費型供應商（iAI）預設關閉。
- Discord bot：八支斜線指令（英文預設名稱加繁簡中文在地化）、Embed 加按鈕／下拉、自然語言點餐、Ack Reaction 與 Streaming Preview、論壇貼文揪團、截止自動封單。
- 校內網站：伺服器端渲染三個頁面與六支唯讀 JSON API。
- 離線測試 29 項，以及 `npm run smoke`、`npm run llm:check`。
- 規格文件：`SPEC/data-model.md`、`bot-interactions.md`、`llm-gateway.md`、`web-api.md`；改寫 infrastructure 與 README；`.env.example` 補上新變數。

### Fixed

- LLM 供應商回覆為空時不再當成成功；改為該家失敗並換下一家。Gemini 免費層常把 token 花在思考上、正文留空。
- 菜單品名比對改為字元 bigram 與單字涵蓋率取大值，讓「珍奶」對得到「珍珠奶茶」。
- 網站 `/api/*` 路徑比對少跳一格導致全部 404；抽出 `src/web/routes/match.ts` 並補測試。

## [0.1.0] - 2026-09-18

規劃中的專案還沒有版本控制與可重現執行環境。本版建立 Git 倉庫與 Docker Compose，讓網站、Discord bot、PostgreSQL 能在同一套容器上開發與部署。`GET /health` 回 `ok: true` 且含資料庫時間；`.env` 不被追蹤。

### Added

- Git：`main` 分支、忽略規則、`.gitattributes`。
- Docker：`Dockerfile`、`compose.yaml`（`web`、`bot`、`postgres`）。
- 應用：健康檢查與環境變數讀取。
- 文件：`README.md`、`DEPLOY.md`、`SPEC/infrastructure.md`。

[unreleased]: https://github.com/Lrniey666/AIPAR-ETA/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/Lrniey666/AIPAR-ETA/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Lrniey666/AIPAR-ETA/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Lrniey666/AIPAR-ETA/releases/tag/v0.1.0
