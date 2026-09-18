# AGENTS.md — 維護／擴充導覽

> 給 AI Agent 與維護者：**先讀本檔 §1–2，再只開任務需要的檔案**。
> 完整規格索引：`SPEC/README.md`。本檔不重複契約細節，只縮短找路成本。
>
> 最後更新：2026-09-18（對齊 `CHANGELOG.md` **Unreleased**；格式為 Keep a Changelog 2.0.0）

---

## 1. 這個專案是什麼

**AIPAR ETA**（實驗室伙食系統）：實驗室內部用的 Discord bot＋校內網站＋PostgreSQL。規劃別名曾寫成「AIPARC EAT」；倉庫、Compose、套件名稱一律是 `aipar-eta`／AIPAR ETA。

**現況**：`PLAN/plan_initial.md` 的三個功能在 0.2.0 全部落地——餐廳菜單建檔與查詢（含圖片辨識與人工輸入）、
論壇貼文揪團點餐（按鈕／下拉與自然語言兩條路）、記帳與分攤結算；免費 LLM 閘道、schema 遷移、校內網站、離線測試都已就緒。

`Unreleased` 再依 `PLAN/AEPARC_EAT_Revise_1.md` 修訂：菜單辨識加了 OCR 版面分析與對帳（為了讀直書菜單）、
自然語言能取消點餐與查帳也能閒聊、按鈕點餐可選數量與逐項清除、帳務記得住「誰欠誰」、
網站改版成儀表板加深淺色切換。之後再補上對話記憶（短期／長期）、身分辨識，
以及四道防幻覺（路由 → 事實區塊 → 系統提示 → 輸出守門）。

**尚未驗證**：Discord 端的實際互動（需要把 bot 接上伺服器）。其餘皆已在本機實測，見 `CHANGELOG.md`。
**指令表有增減（移除 `/點餐`、新增 `/網站` 與 `/記憶`、`/揪團` 截止改整數分鐘），部署後要跑 `npm run register`。**

**技術棧（以程式碼為準，2026-09-18 查證）**：

| 層 | 現況 |
| --- | --- |
| 執行期 | Node.js ≥ 24.12（type stripping 直接跑 `.ts`，無建置步驟） |
| 語言 | TypeScript（`src/**/*.ts`，ESM，`import` 帶 `.ts` 副檔名） |
| 資料庫 | PostgreSQL 18.6（`postgres:18.6-alpine`），遷移在 `src/db/sql/` |
| 編排 | `compose.yaml`：`postgres`、`ocr`、`web`、`bot` |
| HTTP | `node:http` 自寫路由＋伺服器端渲染（刻意不引網頁框架） |
| Discord | discord.js 14.27 |
| LLM | 自寫閘道，OpenAI 相容 wire format＋內建 `fetch`，**不引任何 LLM SDK** |
| OCR | 本倉 `ocr/` sidecar（PP-OCRv6 small ONNX）；Compose 預設接上，沒設 `OCR_BASE_URL` 才略過 |
| 測試 | `node:test`（`test/*.test.ts`），77 項離線測試 |

這不是 Python 專案。根目錄 `requirements.txt` 依現況不列 pip 套件，**執行相依以 `package.json` 為準**。`.cursorrules` 仍寫「Python 用 snake_case」——**變數／函式在本倉 TypeScript 同樣用 snake_case**（見 `load_config`、`summarise_orders`），類別與型別用 PascalCase。

**與隔壁專案的界線**：`AIPAR-ordering-system` 名稱相近但**互不隸屬**。未經允許不要抄它的程式、套件切分、或架構。研究數據可看 `AIPAR-ordering-system-sesearch`（見 §6），那是實驗倉不是產品倉。

---

## 2. 三步查閱（強制）

禁止一上來 Glob 全庫或整份讀多份文件。

```
① 本檔 §3（領域 → 檔案）
    ↓ 需要契約／拓樸時
② SPEC/README.md → 鎖定恰好一份 SPEC
    ↓ 功能尚未落地、要對產品意圖時
③ PLAN/plan_initial.md（原始需求）或 PLAN/AEPARC_EAT_Revise_1.md（這一輪的修訂）
    ↓
④ Grep 符號／路徑 → 只 Read 命中區段
```

### 2.1 一份真相

| 問題類型 | 權威來源 |
| --- | --- |
| 現行行為 | 程式碼（`src/`、`compose.yaml`、`Dockerfile`） |
| 契約／拓樸 | `SPEC/`（五份：infrastructure、data-model、bot-interactions、llm-gateway、web-api） |
| 產品意圖／未落地需求 | `PLAN/plan_initial.md`、`PLAN/AEPARC_EAT_Revise_1.md` |
| 版本歷史 | `CHANGELOG.md` |
| 怎麼跑／怎麼部署 | `README.md`（繁中介紹＋安裝）、`docs/README.en-GB.md`、`DEPLOY.md` |
| 撰碼硬性慣例 | `.cursorrules` |

衝突時：**程式碼 > SPEC > PLAN**。以程式碼為準時，必須回頭修正 SPEC。

### 2.2 預設不讀

- `node_modules/`、`package-lock.json` 全文
- `.env`（機敏；需要變數名時讀 `.env.example`）
- 隔壁 `AIPAR-ordering-system` 的原始碼

### 2.3 動工前

1. 讀 `.cursorrules`
2. 用 §3 對上這次要改的檔
3. 動到架構、流程、資料契約、路由時，先確認對應那份 `SPEC/` 的內容，改完回頭同步

### 2.4 變更後必做

1. 同步 `SPEC/`（動到架構、流程、資料契約、路由）
2. 更新 `CHANGELOG.md` 的 `## [Unreleased]`（Keep a Changelog 2.0.0；發版才給新版號，**不得重複**）
3. `npm run check`（型別檢查＋離線測試）要全綠
4. 動到資料流：`npm run smoke`（需要資料庫）
5. 動到 LLM 設定：`npm run llm:check`（需要金鑰）
6. 基礎設施改動：`docker compose up --build -d` 後四服務 `healthy`；`GET /health` 含資料庫時間；`GET http://127.0.0.1:8868/health` 為 OCR

---

## 3. 領域 → 檔案地圖

| 你要改什麼 | 主 SPEC | 主要程式／設定 | 備註 |
| --- | --- | --- | --- |
| 環境變數／啟動失敗訊息 | `infrastructure.md` | `src/config.ts`、`.env.example`、`compose.yaml` | 必要值缺漏要立刻失敗並印變數名 |
| 資料表／遷移 | `data-model.md` | `src/db/sql/*.sql`、`src/db/migrate.ts` | 只新增遷移檔，不改已套用的 |
| 資料存取 | `data-model.md` | `src/db/*.ts`（一張表一個模組） | 金額欄位一律 `*_cents` |
| 菜單查詢／圖片辨識 | `bot-interactions.md`、`llm-gateway.md` | `src/bot/handlers/menu.ts`、`menu_upload.ts`、`src/bot/menu_flow.ts`、`src/llm/tasks/menu_extract.ts`、`src/domain/menu_draft.ts` | 草稿一定要人工確認才上線 |
| 菜單 OCR 對帳 | `llm-gateway.md` | `ocr/`（sidecar）、`src/llm/ocr.ts`、`src/domain/ocr_layout.ts`、`src/domain/menu_reconcile.ts` | Compose 預設 `OCR_BASE_URL=http://ocr:8868`；只標記不改資料 |
| 揪團點餐／論壇貼文 | `bot-interactions.md` | `src/bot/handlers/session.ts`、`src/bot/session_flow.ts`、`src/domain/ordering.ts` | 價格永遠取自 `menu_items`；封單只走 `lock_session()` |
| 自然語言點餐／取消 | `llm-gateway.md` | `src/llm/tasks/order_parse.ts`、`order_cancel.ts`、`src/bot/handlers/message_order.ts` | 規則優先、模型墊底；數量只從品名以外的殘字讀 |
| 自然語言問答／防幻覺 | `llm-gateway.md` | `src/domain/grounding.ts`、`dish_query.ts`、`recommend.ts`、`src/bot/chat_context.ts`、`handlers/message_chat.ts` | 判準是「資料庫答得了嗎」，不是「跟吃有關就攔」；改完跑 `npm run route:check` |
| 記憶（短期／長期） | `data-model.md` | `src/db/memory.ts`、`src/domain/memory_capture.ts`、`src/bot/handlers/memory.ts` | 長期記憶只記使用者明講的；模型不得寫入 |
| 記帳／分攤／誰欠誰 | `data-model.md` | `src/bot/handlers/ledger.ts`、`src/domain/settlement.ts`、`src/domain/debts.ts`、`src/db/ledger.ts` | charge 對同場同人唯一；結餘與債務是兩件事 |
| Discord 指令定義 | `bot-interactions.md` | `src/bot/commands/`（`options`／`catalogue`／`ordering`／`definitions`） | 改完跑 `npm run register` |
| 按鈕／下拉互動 | `bot-interactions.md` | `src/bot/components.ts`、`components_order.ts`、`handlers/components.ts`、`session_components.ts`、`menu_components.ts` | custom id 上限 100 字元；點餐數量編在 id 裡 |
| 訊息／自然語言入口 | `bot-interactions.md` | `src/bot/handlers/message.ts`、`message_order.ts`、`message_chat.ts`、`src/bot/ack.ts` | Ack Reaction＋Streaming Preview |
| Embed 版面／標誌 | `bot-interactions.md` | `src/bot/embeds.ts`、`embeds_ledger.ts`、`embeds_help.ts`、`branding.ts` | 沒設 `PUBLIC_BASE_URL` 就不放圖，不要出現破圖 |
| 顯示字串／在地化 | `bot-interactions.md` | `src/bot/strings.ts`、`strings_extra.ts`、`src/bot/i18n.ts` | 兩種語言要一起補，少一邊型別就會錯 |
| 免費 LLM／視覺閘道 | `llm-gateway.md` | `src/llm/providers.ts`、`gateway.ts`、`transport.ts` | 見 §6；不要猜模型 ID |
| 網站頁面／API | `web-api.md` | `src/web/server.ts`、`routes/`、`render.ts`、`theme.ts`、`assets.ts` | 路由比對在 `routes/match.ts`，是純函式且有測試 |
| 網站外觀／主題切換 | `web-api.md` | `src/web/theme.ts` | `prefers-reduced-motion` 要完全關掉動畫，不是縮短 |
| Docker／映像 | `infrastructure.md` | `Dockerfile`、`ocr/Dockerfile`、`compose.yaml` | 非 root `node`；時區 `Asia/Taipei`；OCR 用獨立映像，勿塞進 bot |
| 本機／校內部署說明 | — | `README.md`、`docs/README.en-GB.md`、`DEPLOY.md` | postgres 埠只綁 `127.0.0.1` |
| 專案介紹文案 | — | `README.md`、`docs/README.en-GB.md`、`docs/assets/` | 繁中與英式英文對照；示意圖改完兩份 README 都要看 |

分層與依賴方向（勿反向依賴）：

```
shared ← db ← domain ← llm ← bot
                  ↖──────────  web
```

- `src/shared/` — 時間、金額、文字正規化、日誌。不依賴任何人。
- `src/db/` — 資料存取與遷移。`pool.ts` 是連線池（舊的 `src/db.ts` 已移除）。
- `src/domain/` — 純業務邏輯，不認識 Discord 也不認識 HTTP。彙總、結算、債務收斂、OCR 版面與對帳都在這裡，也都有離線測試。
- `src/llm/` — 供應商註冊、換手、任務提示詞。
- `src/bot/`、`src/web/` — 兩個入口，都不直接寫 SQL。
- `src/scripts/` — 一次性工具（`smoke`、`llm-check`、`register-commands`）。
- 行程進入點只有 `src/web.ts` 與 `src/bot.ts`。

單檔約 300 行警告、硬上限 500 行，超過就拆（`components.ts` 與指令定義都是因此拆開的）。

---

## 4. 文件地圖

| 文件 | 角色 | 什麼時候開 |
| --- | --- | --- |
| `.cursorrules` | 語言、日期、API 驗收、機密、SPEC／CHANGELOG 紀律 | 每次動工 |
| `AGENTS.md`（本檔） | 找路、現況、禁止事項 | 每次動工 |
| `SPEC/README.md` | SPEC 索引與一頁式架構 | 需要契約時 |
| `SPEC/infrastructure.md` | Git、Compose、環境變數、驗證指令 | 改執行環境 |
| `SPEC/data-model.md` | 資料表、欄位約定、不變條件 | 改資料 |
| `SPEC/bot-interactions.md` | 指令、元件、三大流程、在地化 | 改 Discord 行為 |
| `SPEC/llm-gateway.md` | 供應商、換手策略、任務與紅線 | 改 LLM |
| `SPEC/web-api.md` | 頁面與唯讀 API | 改網站 |
| `PLAN/plan_initial.md` | 產品需求與 Discord UX | 對意圖 |
| `PLAN/AEPARC_EAT_Revise_1.md` | 修訂清單（菜單辨識、自然語言、互動、帳務、網站） | 對這一輪的意圖 |
| `PLAN/example/menu_example/` | 菜單圖片範例 | 做辨識時 |
| `test/` | 離線測試，同時也是行為說明書 | 改邏輯前後 |
| `README.md` | 繁中專案介紹、示範、本機啟動 | 第一次接觸 |
| `docs/README.en-GB.md` | 英式英文介紹 | 英文讀者 |
| `docs/README.md` | 說明文件索引 | 不知道該開哪一份時 |
| `docs/presentations/` | 通用介紹簡報、講稿與技術專有名詞 | 口頭介紹專案時 |
| `CONTRIBUTING.md` | 貢獻約定 | 要改程式或文件時 |
| `DEPLOY.md` | 校內 24/7 伺服器 | 部署／備份 |
| `CHANGELOG.md` | Keep a Changelog 2.0.0；未發布寫 `Unreleased` | 每次改完 |
| `.env.example` | 變數名與註解（無祕密） | 加設定項 |

根目錄不要放進行中 PLAN 正文（已在 `PLAN/`）。根目錄不要放 `*_SPEC.md`（已在 `SPEC/`）。

---

## 5. 產品規則（已落地，改動時不得違反）

**範圍**

1. 餐廳與菜單入庫；支援菜單圖片辨識，並保留人工輸入。
2. 關鍵字或自然語言查詢 → 回傳該餐廳菜單。
3. Bot 建論壇貼文揪團，指定餐廳、送菜單、從自然語言辨識點餐，彙總清單與每人應付金額。
4. 歷史消費與個人分攤結算。
5. 未來要能在實驗室伺服器連續跑一週。
6. 架構預留擴充，不要做成無法加網站或第二個入口的死結。

**金額**：LLM 只做文字對應（品名、數量、意圖）。應付金額由確定性程式依庫內價格計算，模型不得自行定價或改帳。這條在 `order_parse.ts` 與 `session_flow.ts` 落實——`unit_price_cents` 一律查 `menu_items`。

**人工關卡**：菜單辨識只產生 `draft`，要有人按下「確認寫入」才 `activate`。不要為了流暢而拿掉這一步。

**Discord UX**（`PLAN/plan_initial.md`）

- 指令互動優先 Embed＋按鈕／下拉，避免 Modal。需要多行輸入時改用「請貼一則訊息」。
- 允許自然語言；點餐或帳務結果仍要用 Embed。
- 思考等待：Ack Reaction＋Streaming Preview（`src/bot/ack.ts`）。
- 指令名稱：中文 ≤ 6 字，英文 ≤ 10 字母。
- 使用 `name_localizations`／`description_localizations`。
- 使用者語言為中文（繁／簡）時畫面用**繁體中文**；其他語言用**英式英文**。
- 註解、錯誤訊息對維護者用繁體中文；避免簡體與中國大陸用語（視頻、軟件、網絡）。

**基礎設施**

- 實驗室機器效能普通：免費 LLM API 優先；不要預設在容器裡跑本地模型。
- 沒有公有網域：網站走校內 IP；PostgreSQL 不對校園網開放。

---

## 6. LLM、視覺、外部研究

- 只用免費 API，禁用付費服務。計費型供應商（iAI）預設被 `providers.ts` 擋下，要 `LLM_ALLOW_METERED=true` 才啟用。
- 金鑰清單式（逗號分隔多把）；某供應商留空＝跳過，不是啟動失敗。0／1／N 把都要能運作，`test/llm.test.ts` 有釘住。
- 模型 ID 會下架、改名，且價目表 ≠ 打得到。有金鑰但沒填模型 ID 就跳過並記錄原因，**不要拿猜的 ID 去打**。採用前跑 `npm run llm:check` 查證。
- 視覺（菜單圖）與文字模型分開設定；不支援視覺的供應商不會被排進視覺佇列。
- **空回覆視為該家失敗**並換下一家（Gemini 免費層常把 token 花在思考上）。
- 允許參考、優化、嵌入這些**研究倉**（不是抄產品倉）：
  - `../AIPAR-ordering-system-sesearch/free-llm-api-test`
  - `../AIPAR-ordering-system-sesearch/ppocrv6-test-project`
- 菜單範例：`PLAN/example/menu_example/`

---

## 7. 安全與執行慣例

- 禁止在程式碼硬寫金鑰、Token、密碼、絕對機器路徑。
- `.env`、憑證不進 Git、不進 Docker 映像。
- 日期 `YYYY-MM-DD`、時間 `HH:MM:SS`、時區台北。
- 路由 path slug：kebab-case。
- 文字檔 LF（`.gitattributes`）。
- 版本、映像、套件建議必須先以當下時間查證穩定資訊，不要沿用過時編號。
- 不確定且不可逆（刪資料卷、`compose down -v`、push、註冊全域指令、花錢的 API）→ 先問。可逆的單檔結構可以自己決定並繼續。

**本機常用指令**

```powershell
Copy-Item .env.example .env
npm run check            # 型別檢查＋77 項離線測試，不需要資料庫或金鑰
docker compose up --build -d
docker compose ps
npm run smoke            # 端到端（需要資料庫）
npm run llm:check        # 供應商連線（需要金鑰）
npm run register         # 重新註冊斜線指令
```
