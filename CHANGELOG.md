# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

依 `PLAN/AEPARC_EAT_Revise_1.md` 的修訂清單，處理菜單辨識、自然語言、Discord 互動、帳務與網站五個面向，
並補上對話記憶與防幻覺。本機已跑 `npm run typecheck` 與 77 項離線測試（全綠）、`npm run smoke`、
`npm run route:check`（拿真實資料庫驗路由），網站的八個頁面與四個靜態檔位址也以實際資料驗過。
**Discord 端的互動（開團 ping、點餐面板、自然語言取消、`/網站`、`/記憶`）尚未以真人操作驗收**——
指令表有增減，部署後要跑一次 `npm run register`。

### Added

- Compose 新增 `OCR_HOST_PORT`（預設 8868）：只改主機對映，容器內 OCR 仍聽 8868、bot 仍打 `http://ocr:8868`。本機 8868 被舊堆疊占用時可改 `.env`。確認：改埠後 `GET http://127.0.0.1:<OCR_HOST_PORT>/health` 回 `ok: true`。
- 本倉 OCR sidecar（PP-OCRv6 small ONNX）：`ocr/` 獨立映像 `aiparc-eta:ocr`，權重在 `ocr/models/`，Compose 與 bot、web、postgres 一起啟動。bot 的 `OCR_BASE_URL` 覆寫成 `http://ocr:8868`，執行期不讀研究倉路徑。確認：`docker compose up --build -d` 後四個服務 `healthy`；`GET http://127.0.0.1:8868/health` 回 `ok: true`；bot 啟動日誌不再寫「未設定 OCR_BASE_URL」。
- 自然語言取消點餐：「取消紅茶」「全部取消」；講不清楚要取消哪一項時反問，不讓模型猜要刪什麼。規則在 `src/llm/tasks/order_cancel.ts`，意圖多一種 `cancel-order`。
- 自然語言查帳：@ bot 問「我還欠多少」「誰欠我錢」會用帳務 Embed 回覆，金額一律取自資料庫。
- 帳務記錄「誰欠誰」：`ledger_entries.counterparty_user_id` 與 `order_sessions.payer_user_id`（遷移 `003_debts_and_roles.sql`）。新增 `/帳務 誰欠誰` 顯示互抵後的欠款與最少轉帳建議；`/帳務 我的` 多一欄「你要拿 X 給某某」；`/帳務 付款` 可指定「付給」誰。收斂邏輯在 `src/domain/debts.ts`。
- 開團通知身分組：`/設定 通知`（`guild_settings.notify_role_id`），開團時在論壇貼文的第一則訊息 ping。
- `/網站` 指令與 Embed 的標誌：網站新增 `/assets/` 白名單靜態檔，`PUBLIC_BASE_URL` 有設定時 Embed 會帶標誌與網站連結按鈕。
- 網站新增 `/restaurants`、`/sessions`、`/ledger`、`/ledger/:guild-id`、`/status` 五個頁面，以及 `GET /api/overview`、`GET /api/debts/:guild-id` 兩支 API。
- 24 項離線測試：OCR 版面判定與對帳、點餐數量、取消、債務收斂、截止分鐘數、靜態檔白名單、導覽列與主題切換。

### Changed

- iAI（高科大）改列為免費層：有金鑰與模型 ID 即納入，不必 `LLM_ALLOW_METERED`。該旗標保留給之後若接入真正計費的供應商。確認：離線測試「iAI 有金鑰就進文字／視覺佇列」。
- **Breaking:** 產品識別由 AIPAR ETA／`aipar-eta` 更名為 AIPARC ETA／`aiparc-eta`（npm 套件、Compose 專案／映像／網路、`.env.example` 的 `POSTGRES_DB`／`POSTGRES_USER`、網站主題鍵 `aiparc-eta-theme`）。已有資料卷若仍叫 `aipar-eta_postgres_data`，請改掛到新專案名或遷移，**不要** `compose down -v`。GitHub 比對連結與隔壁 `AIPAR-ordering-system` 維持原名。確認：本倉產品字串不再出現 `AIPAR ETA`／`aipar-eta`。
- `docs/presentations/glossary.md` 維持技術專有名詞（資料契約、狀態機、模組、協定），每條補 **白話** 一句，再接概念／定義／本專案用途。依投影片首次出現頁排序。
- `web` 與 `bot` 共用映像名稱 `aiparc-eta:app`，不再讓 Compose 預設編成兩份 `aiparc-eta-web`／`aiparc-eta-bot`。兩個容器仍分開跑，Dockerfile 只建一次。確認：`docker compose up --build -d` 後 `docker images aiparc-eta` 只有一筆應用映像。
- **Breaking:** `/揪團` 的截止時間從字串（`30m`／`1h30m`）改成整數分鐘（1–10080），選項名稱也改成 `minutes`／`截止分鐘`。改完要跑 `npm run register`。
- 菜單辨識的提示詞改寫：明講版面可能是**直書**（由上而下、由右至左）或整張旋轉 90 度，要求先判斷方向再讀；並逐條說明勾選框「□」、編號、大小杯雙價、電話與加價說明的處理方式。有 OCR 時附上依閱讀順序排好的文字當對照。
- 自然語言問答改成先自然接一句話再把話題帶回點餐或帳務，而不是一律回「查不到」。模型拿得到目前餐廳、這個頻道的揪團、發問者的結餘與債務，所有數字仍只能來自這些事實。
- 按鈕點餐可以選數量（1–10）：點餐面板變成「每項數量 ▾ ＋ 品項 ▾ ＋ 翻頁」，數量編在品項下拉的 custom id 裡。
- 「清除我的」改成先開面板逐項選要清掉哪幾筆，要全清再按「全部清除」。
- 彙總訊息在已封單或截止時間已過時顯示「截止」＋實際時刻，不再繼續倒數。
- 自動封單改走與手動封單相同的 `lock_session()`：改狀態、貼文標題加 🔒、貼通知、重畫彙總四件事一次做完。先前排程只改了資料庫狀態。
- `/說明` 改成五個編號欄位（建檔／揪團／結算／對話／管理）加標誌與網站連結按鈕，取代原本擠成一塊的說明文字。
- 自然語言問答的系統提示重寫：明列「文字回覆不得出現菜名或價格」「標示尚無菜單的店要照實說不知道」「不確定就說不知道」，並把最近對話當成真正的 chat messages 傳入。
- `search_restaurants()` 的相關說明更新；餐廳查詢新增 `list_restaurants_with_menu()`，一次帶回菜單狀態，呼叫端不必逐間補查。
- 網站改版：導覽列、儀表板、深淺色切換（View Transitions 的圓形遮罩轉場，從按鈕為圓心擴散）、響應式版面（手機到曲面寬螢幕）、Smooth Rounded Corners。`prefers-reduced-motion` 時**完全關閉**轉場與動畫直接切換。配色與 Embed 共用標誌的金與藍。
- 對外 README 對齊現況：77 項離線測試、本倉 `ocr/` sidecar 與 `aiparc-eta:app` 共用映像、`/記憶`、`npm run route:check`、防幻覺與對話記憶；Hero／儀表板實拍維持金藍品牌。
- 映像多 `COPY logo ./logo`，網站的 `/assets/` 與 Embed 縮圖從那裡讀。
- `CHANGELOG.md` 改為 [Keep a Changelog 2.0.0](https://keepachangelog.com/en/2.0.0/)：版本標題用 `## [x.y.z] - YYYY-MM-DD`、僅使用六種變更類型，並在檔尾加上版本比對連結。既有 0.1.0–0.2.1 的事實未改，只重寫結構與用詞。
- 維護約定（`.cursorrules`、`AGENTS.md`、`CONTRIBUTING.md`）改為把未發布變更寫進 `Unreleased`；發版時再改成帶日期的版本號。變更目的寫在該版本摘要或各條目用詞裡，不再另開「變更目的／影響範圍／驗收」標題。
- `SPEC/` 五份文件與 `.env.example` 同步到本版：指令表、custom id、三條流程、資料模型的新欄位、OCR 對帳、網站頁面與外觀無障礙約定。

### Fixed

- Compose 的 `web`／`bot` 不再沿用 `.env` 的 `POSTGRES_PORT` 去連容器內的 postgres。先前若為避開主機 `5432` 衝突改成 `5434`，行程會打 `postgres:5434` 而連不上（容器內永遠聽 5432）。現在容器內固定 `POSTGRES_PORT=5432`，主機對映仍用 `.env`。確認：改 `POSTGRES_PORT` 後 `GET /health` 仍帶得到資料庫時間。
- **防幻覺做過頭，反而變得難溝通。** 「推薦吃甚麼」「幫我挑」「給我麵店」三句話收到一模一樣的餐廳清單 Embed——沒有一句是假的，但也沒有一句在回答問題。三處一起修：
  - 意圖多一種 `recommend`，和 `menu-query` 分開。「要一個答案」走推薦（抽真實品項），「要一份清單」才給清單；原本「推薦」「好吃的」「吃什麼」都被歸進 `menu-query`。
  - 店名比對加上**部分命中**：「給我麵店」對得到「老余麵店」，回答前先問一句「你是說⋯⋯嗎？」。片段要 ≥2 字而且只屬於一家才算，「那家店」這種四家都中的就不猜。
  - 輸出守門原本把**所有**兩行以上的條列都當成編造，連「要不要看看這兩家」都會被換成罐頭句。改成只擋「不認得的東西」——金額一律擋（事實區塊裡從來沒有價格），條列則放行帶 `/` 的指令行與列出已知店名的行。
- 菜名查詢排到部分店名比對之前：「有沒有豆腐鍋可以吃」原本會被「雷荷豆腐鍋專賣店」的部分命中攔走，回一整份菜單；問的人要的是「哪裡吃得到」。
- 菜單圖片辨識：Gemini 回了字但不是合法 JSON 時，不再當成成功；閘道改換下一家（實測四海豆漿大王直書價目表，兩次都在 Gemini 停住）。`menu-vision`／`menu-text` 開 `require_json`。確認：離線測試「要 JSON 卻挖不出來時換成下一家」；`docker compose up --build -d bot` 後再傳一次菜單圖，`llm_calls` 若 Gemini 失敗應接著出現另一家。
- **自然語言問答會編造菜單。** 實際發生：使用者問「四海豆漿大王有甚麼好吃的」，那間店在資料庫裡但**還沒建菜單**，bot 卻列出四道不存在的菜。三個破口一起修：
  - `search_restaurants()` 是拿**整句**去比對店名，方向反了（店名是句子的一部分，不是句子是店名的一部分），所以查無餐廳。改用 `find_mentioned_restaurants()` 拿店名比句子。
  - 「有甚麼」沒被正規化成「有什麼」，意圖判成閒聊。`normalise_key()` 補上這組異體字，並抽出 `fold_variants()` 給意圖分類共用。
  - 查不到就掉進模型，而模型只拿到一張店名清單、沒有「這家沒有菜單」這件事。現在句子提到已建檔的店一律走確定性回覆，不進模型。
- 防幻覺補上第四道防線 `looks_like_invented_menu()`：模型回覆出現兩行以上條列或金額就整段丟掉，改用安全回覆並記進日誌。刻意抓得窄（帶 `/` 的行不算），寧可漏抓也不要誤殺正常回答。
- 「你有記憶功能嗎」原本由模型回答，於是答出「我目前沒有記憶功能」這種錯話；改由程式照實回答記得多少。
- 自然語言點餐的數量算錯：先比對品名，再從「品名沒吃掉的殘字」讀份數。舊版反過來做，於是「三杯雞飯」被算成三份「雞飯」，「牛三寶麵」「四季豆」也一起遭殃。提示詞補上同一條規則。
- 切句不再切在「和」「與」上，免得切斷「和風沙拉」這類品名。

### Removed

- **Breaking:** `/點餐`（`/order`）指令。貼文裡已經有「點餐」按鈕與自然語言兩條路，再留一支只能在貼文裡用的斜線指令只是多一個入口要解釋。

## [0.2.1] - 2026-09-18

0.2.0 的根目錄 `README.md` 只夠本機啟動。本版把對外說明改成繁中／英文兩份對照，安裝與契約細節收到可折疊區塊與既有 `SPEC/`、`DEPLOY.md`。未改應用程式行為、路由或資料契約。

### Added

- 繁體中文專案介紹 `README.md`：Hero、徽章、語言切換、功能、示範、架構、安裝、結構、貢獻與授權。
- 同一份內容的英文 `docs/README.en.md`。
- 貢獻指南 `CONTRIBUTING.md` 與 `docs/CONTRIBUTING.en.md`，以及說明文件索引 `docs/README.md`。
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
