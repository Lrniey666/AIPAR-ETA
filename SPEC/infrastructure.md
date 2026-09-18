# 基礎設施

最後更新：2026-09-18（台北時間）

## 執行拓樸

Compose 專案名稱：`aiparc-eta`（舊名 `aipar-eta`；既有資料卷遷移見 `DEPLOY.md`）

| 服務 | 映像／建置 | 對外埠 | 職責 |
| --- | --- | --- | --- |
| `postgres` | `postgres:18.6-alpine` | `127.0.0.1:${POSTGRES_PORT:-5432}` | 主資料庫。只綁本機，不對校園網開放。容器內仍聽 `5432`。 |
| `ocr` | `aiparc-eta:ocr`（本倉 `ocr/Dockerfile`） | `127.0.0.1:${OCR_HOST_PORT:-8868}` | 菜單對帳 OCR（PP-OCRv6 small ONNX）。權重在 `ocr/models/`。容器內仍聽 `8868`。 |
| `web` | `aiparc-eta:app`（本倉 `Dockerfile`） | `${APP_PORT:-3000}` | 網站／API。校內裝置可連這一個埠。啟動 `src/web.ts`。 |
| `bot` | 同上；啟動 `src/bot.ts` | 無對外埠 | Discord bot。只對內做健康檢查。 |

`web` 與 `bot` 必須寫同一個 `image:`（`aiparc-eta:app`）。Compose 沒指定名稱時會依服務編成 `aiparc-eta-web`／`aiparc-eta-bot` 兩筆，內容幾乎相同、映像 ID 不同。`pull_policy: build` 避免誤去 Docker Hub 拉同名公開映像。

網路：`aiparc-eta-net`
資料卷：`postgres_data` → 容器內 `/var/lib/postgresql`（PostgreSQL 18+ 官方映像的新預設路徑）

`web` 與 `bot` 進入容器後，`POSTGRES_HOST` 一律覆寫成 `postgres`、`POSTGRES_PORT` 一律覆寫成 `5432`，避免誤用本機迴環位址或把主機對映埠拿去打容器內的 postgres。
`bot` 的 `OCR_BASE_URL` 一律覆寫成 `http://ocr:8868`（同 Compose 網路），**不要填 127.0.0.1**——那會指到 bot 容器自己。本機直接跑 `npm run start:bot` 才用 `http://127.0.0.1:${OCR_HOST_PORT:-8868}`。

兩個服務啟動時都會自己跑一次資料庫遷移（`src/db/migrate.ts`），不需要額外的遷移步驟。

## 執行時期

- Node.js 24 Active LTS（Krypton），直接執行可抹除型別語法的 `.ts`（type stripping，v24.12.0 起穩定）。
- 映像基底：`node:24-bookworm-slim`，以映像內建的非 root 使用者 `node` 執行。
- 時區：`Asia/Taipei`。
- 編排檔：`compose.yaml`（Compose Specification，不含過時的 `version` 欄）。
- 應用映像相依只有 `pg` 與 `discord.js`；LLM 與 OCR 客戶端一律用內建 `fetch` 打 HTTP，不引 SDK。
- OCR sidecar（`ocr/`）另用 `onnxruntime-node` 1.30.0 與 `sharp` 0.35.4 跑 PP-OCRv6 small；**不要把這兩個套件裝進 bot 映像**。
- 映像會 `COPY logo ./logo`：網站的 `/assets/` 與 Discord Embed 的縮圖都從那裡讀。

## 環境變數

所有機敏值只放 `.env`，範本見 `.env.example`。
容器啟動時若缺少 `POSTGRES_DB`／`POSTGRES_USER`／`POSTGRES_PASSWORD`，Compose 會直接失敗並提示要補設定。
應用程式另會檢查同一組資料庫變數；缺值時行程結束並印出變數名稱。

| 變數 | 必要 | 說明 |
| --- | --- | --- |
| `POSTGRES_*` | ✓ | 資料庫連線 |
| `APP_HOST` / `APP_PORT` | | 網站監聽位址，預設 `0.0.0.0:3000`。主機與容器用同一個埠。 |
| `BOT_HEALTH_PORT` | | bot 健康檢查埠，預設 `3001`（Compose 不對主機公開） |
| `POSTGRES_PORT` | | 主機對映 postgres 的埠，預設 `5432`。容器內固定連 `5432`。 |
| `OCR_HOST_PORT` | | 主機對映 OCR 的埠，預設 `8868`。容器內固定聽 `8868`。 |
| `TZ` | | 預設 `Asia/Taipei` |
| `LOG_LEVEL` | | `debug` / `info` / `warn` / `error`，預設 `info` |
| `PUBLIC_BASE_URL` | | 網站對外位址（校內 IP＋埠）。Embed 標誌與 `/網站` 的連結按鈕用它；留空＝不放圖、`/網站` 回「還沒設定」 |
| `DISCORD_BOT_TOKEN` | bot 需要 | 沒填時 bot 只維持健康檢查，不連 Discord |
| `DISCORD_CLIENT_ID` | bot 需要 | 沒填就略過斜線指令註冊 |
| `DISCORD_GUILD_ID` | | 只註冊到單一伺服器（立即生效，開發用）；留空＝全域註冊 |
| `*_API_KEYS` | | 逗號分隔的多把金鑰，留空＝略過該供應商 |
| `*_MODEL` / `*_VISION_MODEL` | | 模型 ID；有金鑰但沒填模型就略過該供應商 |
| `LLM_ALLOW_METERED` | | `true` 才啟用標成計費的供應商。iAI 為免費層，不需開此旗標 |
| `LLM_TEXT_ORDER` / `LLM_VISION_ORDER` | | 覆寫供應商嘗試順序 |
| `LOCAL_LLM_BASE_URL` / `LOCAL_LLM_MODEL` | | 本機模型保底（Ollama 等），留空＝不啟用 |
| `OCR_BASE_URL` | | 菜單對帳 OCR（PP-OCRv6 small）的服務位址，留空＝整段略過。Compose 內的 bot 會被覆寫；本機直跑 bot 請填 `http://127.0.0.1:${OCR_HOST_PORT:-8868}` |
| `OCR_PATH` / `OCR_API_KEY` / `OCR_MODEL` | | 端點路徑（預設 `/ocr`）、金鑰、模型名稱 |
| `OCR_TIMEOUT_MS` / `OCR_MIN_SCORE` | | 逾時（程式預設 20000，Compose 覆寫 60000）與信心門檻（預設 0.6） |

**OCR 不要跑在 `bot` 容器裡**，但本倉已提供獨立的 `ocr` 服務（`ocr/`，權重在 `ocr/models/`）。
`docker compose up` 會一起啟動。線上格式見 `SPEC/llm-gateway.md` §菜單 OCR 對帳。
權重遺失時在 `ocr/` 執行 `node scripts/fetch-models.ts`（用 RapidOCR 的 PyPI 套件抽出 ONNX，不讀研究倉路徑）。

## 驗證

| 指令 | 內容 | 需要什麼 |
| --- | --- | --- |
| `npm run typecheck` | 型別檢查 | — |
| `npm test` | 77 項離線測試（金額、菜單解析、OCR 版面與對帳、OCR sidecar 契約、點餐與取消、債務收斂、接地防幻覺、記憶擷取、LLM 換手、路由與外框） | — |
| `npm run smoke` | 端到端：建檔→菜單→揪團→點餐→結算→帳務，跑完自行清資料 | 資料庫 |
| `npm run route:check` | 拿真實資料庫跑一遍自然語言路由決策，確認該擋在模型前面的還擋著 | 資料庫 |
| `npm run llm:check` | 每家 LLM 供應商實際打一次 | 金鑰、外網 |
| `npm run register` | 重新註冊斜線指令 | Discord 權杖 |

## Discord 應用程式設定

1. 開發者後台 → Bot → **Privileged Gateway Intents** 打開 **Message Content Intent**。
   沒打開的話 bot 收到的訊息內容會是空字串，自然語言點餐與貼菜單都會失效。
2. 邀請權限至少要有：檢視頻道、發送訊息、在討論串發送訊息、**建立貼文**（論壇）、
   嵌入連結、加上反應、管理訊息（編輯自己的彙總訊息不需要，但清理時方便）。
3. 伺服器內先用 `/設定 論壇` 指定一個論壇頻道，`/揪團` 才有地方開貼文。
4. 想讓開團自動通知的話，再跑一次 `/設定 通知` 指定身分組；bot 需要「提及所有身分組」或該身分組允許被提及。

## Git

- 預設分支：`main`
- `.env`、憑證、金鑰不進版控
- 文字檔統一 LF（`.gitattributes`）
