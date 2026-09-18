# AIPAR ETA（實驗室伙食系統）

規劃中的實驗室點餐系統：Discord bot、校內網站、PostgreSQL。目前先備妥 Git 與 Docker 執行環境，以及可驗證資料庫連線的健康檢查服務。

## 技術選擇（2026-09-18 查證）

- Node.js 24 Active LTS（Krypton），本機映像用 `node:24-bookworm-slim`
- PostgreSQL 18.6（官方映像 `postgres:18.6-alpine`；19 仍為 beta）
- Docker Compose v2／v5，編排檔為 `compose.yaml`

## 快速啟動

1. 複製環境變數並填入資料庫密碼與（可選）Discord／LLM 金鑰：

```powershell
Copy-Item .env.example .env
```

2. 啟動容器：

```powershell
docker compose up --build -d
docker compose ps
```

3. 檢查網站健康：瀏覽器或 `curl` 開啟 `http://127.0.0.1:3000/health`，應看到 `ok: true` 與資料庫時間。

停止：

```powershell
docker compose down
```

資料卷會保留。若要連資料一併刪除：`docker compose down -v`（會清掉資料庫，先確認）。

本機不經容器、直接跑健康檢查：

```powershell
npm install
npm run start:web
```

此時 `.env` 的 `POSTGRES_HOST` 應為 `127.0.0.1`，並已先把 `postgres` 服務拉起來。

## 目錄

- `src/` — 健康檢查與設定讀取（網站／bot 本體尚未實作）
- `SPEC/` — 架構與資料契約
- `PLAN/` — 規劃草稿
- `DEPLOY.md` — 校內伺服器部署
- `CHANGELOG.md` — 變更紀錄
