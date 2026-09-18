# 基礎設施

最後更新：2026-09-18（台北時間）

## 執行拓樸

Compose 專案名稱：`aipar-eta`

| 服務 | 映像／建置 | 對外埠 | 職責 |
| --- | --- | --- | --- |
| `postgres` | `postgres:18.6-alpine` | `127.0.0.1:5432` | 主資料庫。只綁本機，不對校園網開放。 |
| `web` | 本倉 `Dockerfile` | `${APP_PORT:-3000}` | 網站／API。校內裝置可連這一個埠。 |
| `bot` | 同一份映像，啟動 `src/bot.ts` | 無對外埠 | Discord bot。只對內做健康檢查。 |

網路：`aipar-eta-net`
資料卷：`postgres_data` → 容器內 `/var/lib/postgresql`（PostgreSQL 18+ 官方映像的新預設路徑）

`web` 與 `bot` 進入容器後，`POSTGRES_HOST` 一律覆寫成 `postgres`，避免誤用本機迴環位址。

兩個服務啟動時都會自己跑一次資料庫遷移（`src/db/migrate.ts`），不需要額外的遷移步驟。

## 執行時期

- Node.js 24 Active LTS（Krypton），直接執行可抹除型別語法的 `.ts`（type stripping，v24.12.0 起穩定）。
- 映像基底：`node:24-bookworm-slim`，以映像內建的非 root 使用者 `node` 執行。
- 時區：`Asia/Taipei`。
- 編排檔：`compose.yaml`（Compose Specification，不含過時的 `version` 欄）。
- 相依只有 `pg` 與 `discord.js`；LLM 一律用內建 `fetch` 打 OpenAI 相容端點，不引 SDK。

## 環境變數

所有機敏值只放 `.env`，範本見 `.env.example`。
容器啟動時若缺少 `POSTGRES_DB`／`POSTGRES_USER`／`POSTGRES_PASSWORD`，Compose 會直接失敗並提示要補設定。
應用程式另會檢查同一組資料庫變數；缺值時行程結束並印出變數名稱。

| 變數 | 必要 | 說明 |
| --- | --- | --- |
| `POSTGRES_*` | ✓ | 資料庫連線 |
| `APP_HOST` / `APP_PORT` | | 網站監聽位址，預設 `0.0.0.0:3000` |
| `BOT_HEALTH_PORT` | | bot 健康檢查埠，預設 `3001` |
| `TZ` | | 預設 `Asia/Taipei` |
| `LOG_LEVEL` | | `debug` / `info` / `warn` / `error`，預設 `info` |
| `DISCORD_BOT_TOKEN` | bot 需要 | 沒填時 bot 只維持健康檢查，不連 Discord |
| `DISCORD_CLIENT_ID` | bot 需要 | 沒填就略過斜線指令註冊 |
| `DISCORD_GUILD_ID` | | 只註冊到單一伺服器（立即生效，開發用）；留空＝全域註冊 |
| `*_API_KEYS` | | 逗號分隔的多把金鑰，留空＝略過該供應商 |
| `*_MODEL` / `*_VISION_MODEL` | | 模型 ID；有金鑰但沒填模型就略過該供應商 |
| `LLM_ALLOW_METERED` | | `true` 才啟用計費型供應商（iAI），預設關閉 |
| `LLM_TEXT_ORDER` / `LLM_VISION_ORDER` | | 覆寫供應商嘗試順序 |
| `LOCAL_LLM_BASE_URL` / `LOCAL_LLM_MODEL` | | 本機模型保底（Ollama 等），留空＝不啟用 |

## 驗證

| 指令 | 內容 | 需要什麼 |
| --- | --- | --- |
| `npm run typecheck` | 型別檢查 | — |
| `npm test` | 29 項離線測試（金額、菜單解析、點餐比對、LLM 換手、路由） | — |
| `npm run smoke` | 端到端：建檔→菜單→揪團→點餐→結算→帳務，跑完自行清資料 | 資料庫 |
| `npm run llm:check` | 每家 LLM 供應商實際打一次 | 金鑰、外網 |
| `npm run register` | 重新註冊斜線指令 | Discord 權杖 |

## Discord 應用程式設定

1. 開發者後台 → Bot → **Privileged Gateway Intents** 打開 **Message Content Intent**。
   沒打開的話 bot 收到的訊息內容會是空字串，自然語言點餐與貼菜單都會失效。
2. 邀請權限至少要有：檢視頻道、發送訊息、在討論串發送訊息、**建立貼文**（論壇）、
   嵌入連結、加上反應、管理訊息（編輯自己的彙總訊息不需要，但清理時方便）。
3. 伺服器內先用 `/設定 論壇` 指定一個論壇頻道，`/揪團` 才有地方開貼文。

## Git

- 預設分支：`main`
- `.env`、憑證、金鑰不進版控
- 文字檔統一 LF（`.gitattributes`）
