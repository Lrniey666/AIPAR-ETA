<p align="center">
  <a href="#readme"><img alt="繁體中文" src="https://img.shields.io/badge/%E7%B9%81%E9%AB%94%E4%B8%AD%E6%96%87-eabf29?style=for-the-badge&labelColor=231815"></a>
  <a href="docs/README.en.md"><img alt="English" src="https://img.shields.io/badge/English-259fc8?style=for-the-badge&labelColor=231815"></a>
</p>

<p align="center">
  <img src="docs/assets/hero.svg" alt="AIPAR ETA" width="760">
</p>

<h1 align="center">AIPAR ETA</h1>

<p align="center">
  <strong>實驗室伙食系統</strong><br>
  Discord 建檔、揪團、點餐、結算；校內網站只負責查閱。<br>
  金額由程式依庫內價格計算，模型不得自行定價。
</p>

<p align="center">
  <img alt="release" src="https://img.shields.io/badge/release-0.2.0-eabf29?style=flat-square&labelColor=231815">
  <img alt="unreleased" src="https://img.shields.io/badge/unreleased-revise-259fc8?style=flat-square&labelColor=231815">
  <img alt="node" src="https://img.shields.io/badge/node-%E2%89%A524.12-339933?style=flat-square&logo=nodedotjs&logoColor=white">
  <img alt="postgres" src="https://img.shields.io/badge/postgres-18.6-4169E1?style=flat-square&logo=postgresql&logoColor=white">
  <img alt="discord.js" src="https://img.shields.io/badge/discord.js-14.27-5865F2?style=flat-square&logo=discord&logoColor=white">
  <img alt="locale" src="https://img.shields.io/badge/locale-zh--Hant%20%2F%20en--GB-eabf29?style=flat-square&labelColor=231815">
  <img alt="licence" src="https://img.shields.io/badge/licence-private-6b6b6b?style=flat-square">
</p>

<p align="center">
  <a href="#功能">功能</a> ·
  <a href="#示範">示範</a> ·
  <a href="#架構">架構</a> ·
  <a href="#安裝">安裝</a> ·
  <a href="#專案結構">結構</a> ·
  <a href="#貢獻">貢獻</a> ·
  <a href="DEPLOY.md">校內部屬</a> ·
  <a href="docs/README.md">文件索引</a> ·
  <a href="docs/presentations/README.md">介紹簡報</a>
</p>

---

實驗室中午要點什麼、誰點了什麼、最後誰該付多少——這件事不該再散落在十則訊息裡。
AIPAR ETA 把餐廳菜單、論壇揪團與帳本收進同一套系統：寫入走 Discord bot，查閱走校內網站，資料放 PostgreSQL。自然語言與菜單辨識只用**免費 LLM API**。菜單對帳 OCR（PP-OCRv6 small）是本 Repository `ocr/` sidecar，Compose 會一起啟動；沒設 `OCR_BASE_URL`（且不走 Compose）才略過。沒有金鑰時按鈕與下拉仍可點餐。

> **現況（0.2.0 ＋ Unreleased）**　三個產品功能已落地；這一輪再依 `PLAN/AEPARC_EAT_Revise_1.md` 補上直書菜單對帳（本 Repository OCR 容器）、自然語言取消／查帳／推薦、誰欠誰、對話記憶、防幻覺，以及網站儀表板與深淺色。
> 離線測試 **77** 項、`npm run smoke`、`npm run route:check` 與本機網站頁面已通過。**Discord 端的真人操作尚未驗收**（含 `/記憶`）；指令表有增減，部署後請跑 `npm run register`。

## 功能

<table>
<tr>
<td width="33%" valign="top">

### 菜單建檔與查詢

`/餐廳 新增` 建檔，`/菜單 上傳` 丟照片或 `/菜單 輸入` 貼文字。辨識結果只會變成**草稿**，有人按下「確認寫入」才上線。查詢可用指令，也可以 @ bot 問「聞香來有什麼」。

</td>
<td width="33%" valign="top">

### 揪團點餐

`/揪團` 在論壇開一則貼文（可 ping 指定身分組），bot 自動貼菜單與彙總。成員按「點餐」選數量與品項，或直接打「我要兩個雞腿飯跟一杯紅茶」；要改就說「取消紅茶」。全體清單與每人應付會持續更新，截止後顯示「截止」而不是繼續倒數。

</td>
<td width="33%" valign="top">

### 記帳與分攤

`/結算` 把每人小計寫進帳本並記下要把錢拿給誰；同場同人不會重複計費。`/帳務 誰欠誰` 給互抵後的欠款與最少轉帳建議，`/帳務 我的`／`總覽`／`付款` 查餘額與記錄付款。餘額永遠由紀錄算出來，不另存欄位。

</td>
</tr>
</table>

| 還有這些 | 為什麼這樣做 |
| --- | --- |
| **直書菜單也讀得出來** | 本 Repository `ocr/`（PP-OCRv6 small ONNX）先算出版面方向與閱讀順序，再交給視覺模型，最後回頭對帳標出沒核對上的行。權重在 `ocr/models/`。 |
| **不會編菜單給你** | 判準是「資料庫答得了嗎」：答得了就用資料庫回（菜單、品項、推薦都來自 `menu_items`），答不了才交給模型，而且回完還要過一次守門。 |
| **記得住** | 短期記得這個頻道最近的對話，長期記得你明講要它記的事（`/記憶`），也認得出伺服器、頻道與是誰在問。 |
| **校內網站唯讀** | 沒有公有網域；寫入只留一條授權路徑（Discord）。 |
| **深淺色與無障礙** | 主題切換走 View Transitions 的圓形遮罩；系統設為減少動態時完全不做動畫。 |
| **規則優先、模型墊底** | 對得到就不打 LLM，省免費層配額，結果也比較可預測。 |
| **價格只來自 `menu_items`** | 模型負責「指到哪一項、要幾份」，不得改帳。 |
| **繁中／英式英文** | Discord 語言為中文（繁／簡）時畫面用繁體中文，其餘用英式英文。 |

## 示範

網站畫面為 2026-09-18 本機實拍（儀表板、品牌標誌、導覽列）。Discord 為 2026-09-19 論壇貼文實拍。

<p align="center">
  <img src="docs/assets/demo-discord.png" alt="Discord 揪團彙總：老余麵店全體清單、每人應付、點餐／封單／結算按鈕" width="720">
</p>
<p align="center"><sub>論壇貼文裡的彙總 Embed（金色邊條）。已結算後顯示截止時刻；點餐面板可選數量 1–10，也可以打「取消紅茶」。</sub></p>

<p align="center">
  <img src="docs/assets/demo-web.png" alt="校內網站儀表板：數字卡、最近揪團與餐廳" width="720">
</p>
<p align="center"><sub>校內瀏覽器開 <code>http://&lt;伺服器內網IP&gt;:3000/</code>。樣式內嵌；深淺色切換存在本機，系統設為減少動態時不做動畫。</sub></p>

### 一條完整路徑

```text
/設定 論壇 頻道:#訂餐
/設定 通知 身分組:@訂餐
        ↓
/餐廳 新增　四海豆漿大王
        ↓
/菜單 上傳　（或 /菜單 輸入）→ 核對草稿（含 OCR 標記，若有）→ 確認寫入
        ↓
/揪團　餐廳 ＋ 截止分鐘 ＋ 可選收款人 → 論壇貼文（可 ping 身分組）
        ↓
按「點餐」選數量與品項，或打字　「我要兩個蛋餅跟一杯豆漿」
        ↓
「取消豆漿」／截止後顯示「截止」
        ↓
/結算　→　/帳務 誰欠誰　·　/帳務 我的　·　/記憶 我的　·　/網站
```

網站對應頁面：`/` 儀表板、`/restaurants/:id` 菜單、`/sessions/:id` 該場彙總、`/ledger/:guild-id` 誰欠誰。

### 直接跟它說話

@ 一下就可以用自然語言問事情。**能從資料庫查到的，一律不交給模型**：

```text
「四海豆漿大王有甚麼好吃的」   → 那家還沒建菜單 → 照實說不知道（不會編菜給你）
「有沒有豆腐鍋可以吃」         → 查 menu_items → 列出真的有的店家與價格
「推薦吃甚麼」「幫我挑」       → 從菜單抽幾樣真的存在的給你選
「給我麵店」                   → 先問「你是說老余麵店嗎？」再給菜單
「我還欠多少」「誰欠我錢」     → 查帳本 → 帳務 Embed
「記住我不吃牛」               → 寫進長期記憶，之後都記得
「你有記憶功能嗎」             → 程式照實回答記得多少，不讓模型自己說
「你喜歡賽馬娘嗎」「今天天氣真好」 → 資料庫答不了，交給模型接話；回完還要過一次守門
```

改過自然語言流程之後，用 `npm run route:check` 拿真實資料庫確認每句話會走到哪一條路。

## 架構

```mermaid
flowchart LR
  D[Discord 使用者] --> B[bot 容器]
  C[校內瀏覽器] --> W[web 容器]
  B --> P[(PostgreSQL 18.6)]
  W --> P
  B --> L[免費 LLM API<br/>Groq / Gemini / Mistral]
  B --> O[ocr 容器<br/>PP-OCRv6 small]
  L -.-> B
```

兩個入口共用資料庫，**都不直接寫 SQL**：`bot` 與 `web` 只呼叫 `db/` 與 `domain/`。LLM 閘道走 OpenAI 相容 wire format，換一家只換 `base_url`、金鑰、模型 ID，不引任何 LLM SDK。OCR 是本 Repository `ocr/` 的獨立容器（映像 `aipar-eta:ocr`），**不要跑在 bot 行程裡**；`web` 與 `bot` 共用映像 `aipar-eta:app`。

| 層 | 目錄 | 可以依賴 |
| --- | --- | --- |
| 共用 | `src/shared/` | 無 |
| 資料 | `src/db/` | `shared` |
| 業務 | `src/domain/` | `shared`、`db` 型別 |
| 模型 | `src/llm/` | `shared`、`domain` |
| 入口 | `src/bot/`、`src/web/` | 以上皆可；彼此不互相 import |

契約與拓樸寫在 [`SPEC/`](SPEC/README.md)。產品意圖在 [`PLAN/plan_initial.md`](PLAN/plan_initial.md)，這一輪修訂在 [`PLAN/AEPARC_EAT_Revise_1.md`](PLAN/AEPARC_EAT_Revise_1.md)。衝突時：**程式碼 > SPEC > PLAN**。

## 安裝

需要 Docker Engine 28+（Compose v2／v5）與已填寫的 `.env`。本機開發另需 Node.js ≥ 24.12。

### 1. 環境變數

```powershell
Copy-Item .env.example .env
```

```bash
cp .env.example .env
```

至少填 `POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD`。Discord 權杖與 LLM 金鑰可稍後再補：沒填時 bot 只維持健康檢查，網站與資料庫仍可啟動。
校內要讓 Embed 與 `/網站` 帶得出連結，再填 `PUBLIC_BASE_URL`（例如 `http://10.0.0.12:3000`）。Compose 會把 bot 的 `OCR_BASE_URL` 覆寫成 `http://ocr:8868`，不必在 `.env` 填；本機直接跑 `npm run start:bot` 才指 `http://127.0.0.1:8868`。權重若遺失，在 `ocr/` 執行 `node scripts/fetch-models.ts`。

### 2. 啟動容器

遷移會在 `web`／`bot` 啟動時自動套用，不必另下指令。

```powershell
docker compose up --build -d
docker compose ps
```

四個服務（`postgres`、`ocr`、`web`、`bot`）都應為 `healthy`。瀏覽器或 `curl` 開 <http://127.0.0.1:3000/health>，應看到 `ok: true` 與資料庫時間；OCR 探針在 <http://127.0.0.1:8868/health>。

### 3. Discord（要用 bot 時）

1. 開發者後台 → Bot → Privileged Gateway Intents → 打開 **Message Content Intent**。沒開的話自然語言點餐與貼菜單都會拿到空字串。
2. 邀請時至少要有：檢視頻道、發送訊息、在討論串發送訊息、**建立貼文**、嵌入連結、加上反應。
3. 在伺服器裡指定論壇頻道，`/揪團` 才有地方開貼文；要開團時 ping 身分組再設通知：

```text
/設定 論壇 頻道:#訂餐
/設定 通知 身分組:@訂餐
```

**這一輪指令表有增減**（拿掉 `/點餐`、新增 `/網站` 與 `/記憶`、截止改成整數分鐘）。部署後請跑 `npm run register`（或 `docker compose exec bot node src/scripts/register-commands.ts`）。

### 4. 常用指令

| 指令 | 用途 | 需要 |
| --- | --- | --- |
| `npm run check` | 型別檢查 ＋ 77 項離線測試 | — |
| `npm test` | 只跑測試 | — |
| `npm run smoke` | 建檔→菜單→揪團→點餐→結算→帳務，跑完自清 | 資料庫 |
| `npm run route:check` | 拿真實資料庫驗自然語言路由（該擋在模型前的還擋著） | 資料庫 |
| `npm run llm:check` | 每家供應商實際打一次 | 金鑰、外網 |
| `npm run register` | 重新註冊斜線指令 | Discord 權杖 |

停止容器：`docker compose down`（資料卷會保留）。連資料一併刪除是 `docker compose down -v`，**先確認**。

校內 24/7 伺服器、備份與連續運行注意事項見 [`DEPLOY.md`](DEPLOY.md)。

## 專案結構

```text
AIPAR-ETA/
├── src/
│   ├── web.ts / bot.ts     行程進入點
│   ├── config.ts           環境變數（缺必要值就失敗並印變數名）
│   ├── shared/             時間、金額、文字正規化、日誌
│   ├── db/                 一張表一個模組；遷移在 db/sql/
│   ├── domain/             菜單正規化、點餐彙總、結算、債務、OCR 對帳
│   ├── llm/                供應商、換手、任務提示詞、OCR 客戶端
│   ├── bot/                指令、元件、訊息、在地化字串
│   ├── web/                頁面與唯讀 JSON API
│   └── scripts/            smoke、llm-check、register-commands、route-check
├── logo/                   標誌原稿；網站 `/assets/` 與 Embed 縮圖從這裡讀
├── test/                   node:test 離線測試（也是行為說明書）
├── SPEC/                   架構與資料契約
├── PLAN/                   規劃草稿、修訂清單與菜單範例圖
├── docs/                   英文 README、貢獻指南、Hero／Demo 圖
├── compose.yaml            postgres / ocr / web / bot
├── ocr/                    PP-OCRv6 small sidecar（權重在 models/）
├── DEPLOY.md               校內部屬
└── CHANGELOG.md            變更紀錄
```

根目錄 `requirements.txt` 依現況不列 pip 套件——這不是 Python 專案。應用相依以根目錄 `package.json` 為準；OCR sidecar 另有 `ocr/package.json`（`onnxruntime-node`、`sharp`），不要裝進 bot 映像。

## 技術細節

<details>
<summary>斜線指令（中文 ≤ 6 字，英文 ≤ 10 字母）</summary>

| 英文（預設） | 中文 | 作用 |
| --- | --- | --- |
| `/restaurant` | `/餐廳` | 新增／清單／資訊 |
| `/menu` | `/菜單` | 查看、上傳、輸入、版本 |
| `/groupbuy` | `/揪團` | 開論壇貼文；截止時間填分鐘數 |
| `/settle` | `/結算` | 結算並寫入帳本 |
| `/ledger` | `/帳務` | 我的／總覽／誰欠誰／付款 |
| `/memory` | `/記憶` | 我的／記住／忘記 |
| `/help` | `/說明` | 使用說明 |
| `/website` | `/網站` | 網站連結按鈕 |
| `/setup` | `/設定` | 指定揪團論壇與通知身分組（需管理伺服器權限） |

貼文裡點餐用按鈕或直接打字，不需要另一支斜線指令；`/點餐` 已在 `Unreleased` 移除。

`restaurant` 選項開自動完成，回傳值是資料庫 id。完整流程見 [`SPEC/bot-interactions.md`](SPEC/bot-interactions.md)。

</details>

<details>
<summary>網站頁面與唯讀 API</summary>

| 路徑 | 內容 |
| --- | --- |
| `GET /` | 儀表板：數字卡、最近揪團與餐廳 |
| `GET /restaurants` · `/restaurants/:id` | 餐廳清單與上線中的菜單 |
| `GET /sessions` · `/sessions/:id` | 揪團清單與該場全體清單、每人應付 |
| `GET /ledger` · `/ledger/:guild-id` | 誰欠誰、最少轉帳建議、個人結餘 |
| `GET /status` | 資料庫、LLM 用量與各伺服器使用情形 |
| `GET /assets/logo.svg` | 標誌（白名單靜態檔，Embed 也用同一組位址） |
| `GET /health` | 服務與資料庫時間 |
| `GET /api/overview` | 儀表板彙總 |
| `GET /api/restaurants` | `keyword` 可篩選 |
| `GET /api/sessions` | `guild` 可篩選，最近 30 場 |
| `GET /api/ledger/:guild-id` | 每個人的結餘 |
| `GET /api/debts/:guild-id` | 誰欠誰與最少轉帳建議 |
| `GET /api/llm-usage` | `hours` 預設 24 |

金額在 JSON 裡以**元**為單位。非 GET 回 405。契約見 [`SPEC/web-api.md`](SPEC/web-api.md)。

</details>

<details>
<summary>環境變數（名稱，不含祕密）</summary>

| 變數 | 必要 | 說明 |
| --- | --- | --- |
| `POSTGRES_*` | ✓ | 資料庫連線。容器內 `POSTGRES_HOST` 會被覆寫成 `postgres` |
| `APP_HOST` / `APP_PORT` | | 網站，預設 `0.0.0.0:3000` |
| `BOT_HEALTH_PORT` | | bot 健康檢查，預設 `3001` |
| `TZ` | | 預設 `Asia/Taipei` |
| `DISCORD_BOT_TOKEN` / `DISCORD_CLIENT_ID` | bot 要用時 | 沒填就不連 Discord、不註冊指令 |
| `*_API_KEYS` | | 逗號分隔多把；留空＝跳過該供應商 |
| `*_MODEL` / `*_VISION_MODEL` | | 有金鑰沒填模型 ID＝跳過並記原因，不拿猜的 ID 去打 |
| `LLM_ALLOW_METERED` | | `true` 才啟用計費型供應商（iAI），預設關閉 |
| `LOCAL_LLM_BASE_URL` | | 本機模型保底；不要在容器內跑本地 LLM |
| `PUBLIC_BASE_URL` | | 網站對外位址；Embed 標誌與 `/網站` 的連結按鈕用它 |
| `OCR_BASE_URL` | | 菜單對帳 OCR。Compose 覆寫成 `http://ocr:8868`；本機直跑 bot 才填 `http://127.0.0.1:8868` |
| `OCR_TIMEOUT_MS` | | Compose 給 60000；程式預設 20000 |

範本與註解在 [`.env.example`](.env.example)。`.env` 不進 Git、不進映像。

</details>

<details>
<summary>LLM 閘道與兩條紅線</summary>

供應商：Groq（文字第一棒）→ Gemini（視覺第一棒）→ Mistral → 本機。計費的 iAI 預設關閉。

- **空回覆或要 JSON 卻挖不出來**視為該家失敗並換下一家（Gemini 免費層常把 token 花在思考上，或回一段無法解析的字）。
- 429／5xx 同一把重試一次再換手；401／403 立刻換下一把。
- 菜單圖片辨識與文字模型分開排隊。Compose 會先打本 Repository `ocr/` 的 PP-OCRv6 small 對帳；只標記不改草稿。`menu-vision`／`menu-text` 開 `require_json`。

紅線：價格永遠查 `menu_items`；規則對得到就不呼叫模型。細節見 [`SPEC/llm-gateway.md`](SPEC/llm-gateway.md)。採用前請跑 `npm run llm:check`，價目表上有的模型不一定打得到。

</details>

<details>
<summary>執行時期（2026-09-18 查證）</summary>

- Node.js 24 Active LTS（Krypton），≥ 24.12 以 type stripping 直接跑 `.ts`，無建置步驟
- PostgreSQL 18.6（`postgres:18.6-alpine`；19 當時仍為 beta）
- discord.js 14.27、`pg` 8.23
- 映像：`web`／`bot` 共用 `aipar-eta:app`（`node:24-bookworm-slim`，非 root `node`，`COPY logo ./logo`）；OCR 另建 `aipar-eta:ocr`
- 編排檔：`compose.yaml`（Compose Specification，不含過時的 `version` 欄）；`postgres` 與 `ocr` 埠只綁 `127.0.0.1`
- 品牌色取自標誌：金 `#eabf29`、藍 `#259fc8`（網站與 Embed 共用）

</details>

## 貢獻

實驗室內部專案。改程式前請讀 [`CONTRIBUTING.md`](CONTRIBUTING.md)（[English](docs/CONTRIBUTING.en.md)）與 [`.cursorrules`](.cursorrules)。

簡要約定：變數／函式 `snake_case`；註解與維護者錯誤訊息用繁體中文；動到契約要同步 `SPEC/`；每次變更更新 `CHANGELOG.md` 的 `Unreleased`（Keep a Changelog 2.0.0；發版才給新版號）；`npm run check` 要全綠。不要抄隔壁 `AIPAR-ordering-system` 的程式或架構。

## 授權

本 Repository `package.json` 標為 `"private": true`，**尚未指定公開授權條款**。供實驗室內部使用；未經同意請勿散布原始碼、映像或金鑰。

---

<p align="center">
  <sub>AIPAR ETA　·　實驗室伙食系統　·　台北時間</sub>
</p>
