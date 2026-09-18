# 網站與 API

最後更新：2026-09-18（台北時間）

校內沒有公有網域，網站只靠伺服器內網 IP ＋ 埠連線：`http://<伺服器內網IP>:3000/`。
頁面是伺服器端渲染、樣式內嵌，沒有前端建置步驟，也不依賴外部 CDN。

**這一層唯讀。** 所有寫入都經由 Discord bot，避免出現第二套授權模型。

## 頁面

| 路徑 | 內容 |
| --- | --- |
| `/` | 餐廳清單與最近揪團 |
| `/restaurants/:id` | 該餐廳目前上線的菜單 |
| `/sessions/:id` | 該場揪團的全體清單與每人應付 |

## API

路徑一律 kebab-case，回應一律 `application/json; charset=utf-8`，金額欄位以**元**為單位（不是分）。

| 方法與路徑 | 查詢參數 | 回應 |
| --- | --- | --- |
| `GET /health` | — | 服務與資料庫狀態 |
| `GET /api/restaurants` | `keyword` | 餐廳清單 |
| `GET /api/restaurants/:id` | — | 餐廳、目前菜單與品項、版本歷史 |
| `GET /api/sessions` | `guild` | 最近 30 場揪團 |
| `GET /api/sessions/:id` | — | 單場揪團的彙總與每人金額 |
| `GET /api/ledger/:guild-id` | — | 該伺服器每個人的結餘 |
| `GET /api/llm-usage` | `hours`（預設 24，上限 720） | LLM 呼叫統計 |

非 GET 一律 405。找不到的路徑回 404 JSON（`/api/*`）或 404 頁面（其他）。

路由比對抽在 `src/web/routes/match.ts`，是純函式並有離線測試——
這裡曾經因為少跳過一個路徑片段而讓所有 `/api/*` 都回 404，而健康檢查還是綠的。

## 健康檢查

| 服務 | 位址 | 內容 |
| --- | --- | --- |
| `web` | `http://<host>:3000/health` | 服務名稱、時區、資料庫 `NOW()` |
| `bot` | 容器內 `http://127.0.0.1:3001/health` | 另含 `discord_ready` 與 LLM 供應商清單（含被略過的原因） |

兩支都是 Compose healthcheck 直接打的端點。
