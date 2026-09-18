# 部署（校內 24/7 伺服器）

沒有公有網域時，網站只走校內 IP。PostgreSQL 不要對校園網開放。

## 前置

- Docker Engine 28+（本機驗證時為 29.4.0）與 Compose v2／v5 外掛
- 倉庫內有已填寫的 `.env`（至少包含 `POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD`）
- 主機時區建議 `Asia/Taipei`

## 啟動

在專案根目錄：

```bash
docker compose up --build -d
docker compose ps
```

三個服務都應為 `healthy`。

校內裝置連線：`http://<伺服器校內IP>:3000/health`

若要改埠，只改 `.env` 的 `APP_PORT` 後再 `docker compose up -d`。

## 日常

```bash
docker compose logs -f --tail=100
docker compose pull postgres
docker compose up --build -d
```

備份資料卷（在專案根目錄執行，勿把輸出提交到 Git）：

```bash
docker run --rm -v aipar-eta_postgres_data:/volume -v "${PWD}:/backup" alpine \
  tar czf /backup/postgres-backup.tgz -C /volume .
```

## 注意

- `.env` 留在主機本機，不要複製進映像，也不要提交。
- `postgres` 埠綁 `127.0.0.1`，只供主機上的管理工具使用。
- 實驗室機器效能普通：先維持官方 slim／alpine 映像，不要在容器內跑本機 LLM。
