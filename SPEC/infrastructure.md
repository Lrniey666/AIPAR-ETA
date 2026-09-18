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

## 執行時期

- Node.js 24 Active LTS（Krypton），直接執行可抹除型別語法的 `.ts`（type stripping，v24.12.0 起穩定）。
- 映像基底：`node:24-bookworm-slim`，以映像內建的非 root 使用者 `node` 執行。
- 時區：`Asia/Taipei`。
- 編排檔：`compose.yaml`（Compose Specification，不含過時的 `version` 欄）。

## 環境變數

所有機敏值只放 `.env`，範本見 `.env.example`。容器啟動時若缺少 `POSTGRES_DB`／`POSTGRES_USER`／`POSTGRES_PASSWORD`，Compose 會直接失敗並提示要補設定。

應用程式另會檢查同一組資料庫變數；缺值時行程結束並印出變數名稱。

## Git

- 預設分支：`main`
- `.env`、憑證、金鑰不進版控
- 文字檔統一 LF（`.gitattributes`）
