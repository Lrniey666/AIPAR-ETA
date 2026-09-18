# 變更紀錄

## 0.1.0 — 2026-09-18

### 變更目的

規劃中的專案還沒有版本控制，也沒有可重現的執行環境。先建立 Git 倉庫與 Docker Compose，讓後續網站、Discord bot、PostgreSQL 能在同一套容器上開發與部署。

### 主要影響範圍

- Git：`main` 分支、忽略規則、`.gitattributes`
- Docker：`Dockerfile`、`compose.yaml`（`web`、`bot`、`postgres`）
- 應用：`src/` 健康檢查與環境變數讀取
- 文件：`README.md`、`DEPLOY.md`、`SPEC/infrastructure.md`

### 驗收方式

1. `git status` 工作區乾淨，且 `.env` 不被追蹤
2. `docker compose up --build -d` 後三個服務皆為 `healthy`
3. `GET /health` 回傳 `ok: true`，內容含資料庫 `NOW()`
