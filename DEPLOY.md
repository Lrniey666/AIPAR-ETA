# 部署（校內 24/7 伺服器）

沒有公有網域時，網站只走校內 IP。PostgreSQL 不要對校園網開放。
本機第一次啟動與功能說明見 [`README.md`](README.md)。

## 前置

- Docker Engine 28+（本機驗證時為 29.4.0）與 Compose v2／v5 外掛
- 倉庫內有已填寫的 `.env`（至少包含 `POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD`）
- 主機時區建議 `Asia/Taipei`
- Discord 應用程式：Bot → Privileged Gateway Intents 已打開 **Message Content Intent**

## 啟動

在專案根目錄：

```bash
docker compose up --build -d
docker compose ps
```

四個服務（`postgres`、`ocr`、`web`、`bot`）都應為 `healthy`。資料庫遷移會在 `web` 與 `bot` 啟動時自動套用，不需要另外下指令。OCR 權重在 `ocr/models/`，不讀專案外路徑。

校內裝置連線：`http://<伺服器校內IP>:3000/`

若要改網站埠，改 `.env` 的 `APP_PORT` 後再 `docker compose up -d`。
本機若 `5432`／`8868` 已被其他容器占用，改 `POSTGRES_PORT`／`OCR_HOST_PORT` 即可；容器內 postgres 仍聽 `5432`、OCR 仍聽 `8868`。

## 上線後的第一次檢查

```bash
curl http://127.0.0.1:3000/health          # 網站與資料庫
curl http://127.0.0.1:8868/health          # OCR sidecar
docker compose exec bot node -e "fetch('http://127.0.0.1:3001/health').then(r=>r.text()).then(console.log)"
npm run llm:check                          # 各家 LLM 模型 ID 是否還打得通
npm run route:check                        # 自然語言路由（需要資料庫）
```

`bot` 的健康檢查會列出目前可用的 LLM 供應商，以及被略過的供應商與原因——
「金鑰填了但模型 ID 過期」這類問題在這裡就看得出來，不必等使用者回報。

在 Discord 伺服器裡先設定論壇頻道：

```
/設定 論壇 頻道:#訂餐
```

## 日常

```bash
docker compose logs -f --tail=100
docker compose pull postgres
docker compose up --build -d
```

改了斜線指令定義之後：

```bash
docker compose exec bot node src/scripts/register-commands.ts
```

備份資料卷（在專案根目錄執行，勿把輸出提交到 Git）：

```bash
docker run --rm -v aiparc-eta_postgres_data:/volume -v "${PWD}:/backup" alpine \
  tar czf /backup/postgres-backup.tgz -C /volume .
```

Compose 專案名從 `aipar-eta` 改成 `aiparc-eta` 之後，新的資料卷會叫 `aiparc-eta_postgres_data`。
若主機上還有舊卷 `aipar-eta_postgres_data`，先停服務再改掛，**不要** `docker compose down -v`：

```bash
docker volume create aiparc-eta_postgres_data
docker run --rm \
  -v aipar-eta_postgres_data:/from \
  -v aiparc-eta_postgres_data:/to \
  alpine sh -c "cd /from && tar c . | tar x -C /to"
```

本機 `.env` 若仍寫舊的 `POSTGRES_DB=aipar_eta`／`POSTGRES_USER=aipar` 可繼續用；只有新環境才跟 `.env.example` 用 `aiparc_eta`／`aiparc`。

## 連續運行一週的注意事項

- `restart: unless-stopped` 已設；bot 另外攔下 `unhandledRejection` 與 `uncaughtException`
  只記錄不結束行程，單一則訊息處理失敗不會讓整個 bot 下線。
- 免費 LLM 層的配額是最常見的故障點。定期看 `GET /api/llm-usage?hours=24`，
  失敗次數突然變多通常代表某一家的模型 ID 下架了，改 `.env` 再重啟即可。
- 截止自動封單是行程內的計時器，bot 重啟後會從資料庫重新掃到未封的揪團，不需要補跑。
- 記憶體內的狀態只有「等使用者貼菜單」這一項，重啟後請使用者重下 `/菜單 輸入` 即可。

## 注意

- `.env` 留在主機本機，不要複製進映像，也不要提交。
- `postgres` 埠綁 `127.0.0.1`，只供主機上的管理工具使用。
- 實驗室機器效能普通：先維持官方 slim／alpine 映像，不要在容器內跑本機 LLM。
  真要用本機模型，請在容器外另跑並用 `LOCAL_LLM_BASE_URL` 指過去。
