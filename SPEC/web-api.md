# 網站與 API

最後更新：2026-09-18（台北時間）

校內沒有公有網域，網站只靠伺服器內網 IP ＋ 埠連線：`http://<伺服器內網IP>:3000/`。
頁面是伺服器端渲染、樣式與腳本內嵌，沒有前端建置步驟，也不依賴外部 CDN。

**定位**：輔助 Discord bot 的管理與查閱——儀表板、資料瀏覽、系統狀態。
**這一層唯讀。** 所有寫入都經由 Discord bot，避免出現第二套授權模型。

## 頁面

| 路徑 | 內容 |
| --- | --- |
| `/` | 儀表板：餐廳／揪團／點餐／LLM 用量四張數字卡，加最近揪團與餐廳 |
| `/restaurants` | 餐廳清單 |
| `/restaurants/:id` | 該餐廳目前上線的菜單與版本歷史 |
| `/sessions` | 最近 60 場揪團 |
| `/sessions/:id` | 該場揪團的全體清單、每人應付與收款人 |
| `/ledger` | 有帳務紀錄的伺服器清單 |
| `/ledger/:guild-id` | 誰欠誰、最少轉帳建議、個人結餘 |
| `/status` | 資料庫狀態、LLM 24 小時用量、各伺服器使用情形 |

導覽列（`src/web/render.ts` 的 `NAV_ITEMS`）固定五項：儀表板、餐廳與菜單、揪團紀錄、帳務、系統狀態。
子路徑會讓對應的項目帶上 `aria-current="page"`（`/restaurants/12` → 「餐廳與菜單」）。

## 靜態檔

| 路徑 | 來源 | 用途 |
| --- | --- | --- |
| `/assets/logo.svg` | `logo/logo-02.svg` | 網站導覽列與 favicon |
| `/assets/logo.png` | `logo/logo.png` | Discord Embed 的縮圖（Embed 不吃 SVG） |
| `/assets/logo-wide.png` | `logo/logo橫-02.png` | Embed footer 的小圖示 |
| `/assets/logo-wide.svg` | `logo/logo橫1.svg` | 橫式標誌備用 |

只服務白名單裡的檔案，**路徑不是由請求拼出來的**（`src/web/assets.ts` 是對照表）。
校內網站前面沒有反向代理，靜態檔是最容易寫出目錄穿越的地方，用對照表就沒有這個問題。
SVG 原稿是 A4 版面、圖形置中，讀檔時會把 `viewBox` 換成貼齊圖形的框，原稿不動。

## 外觀與無障礙

| 項目 | 作法 |
| --- | --- |
| 深／淺色 | 預設跟隨 `prefers-color-scheme`；按過切換鈕後改以使用者選擇為準，存 `localStorage` 鍵 `aiparc-eta-theme` |
| 閃白 | `<head>` 裡一小段同步腳本先把 `data-theme` 補上 |
| 切換轉場 | View Transitions API，從按鈕為圓心向外擴散的圓形遮罩（`clip-path: circle()`，520ms） |
| 沒有 View Transitions | 直接換色，不做退化動畫——半套的動畫比沒有更難看 |
| `prefers-reduced-motion` | **完全關閉**轉場與所有動畫，直接切換，避免大面積擴散引發暈眩 |
| 圓角 | 一般圓角；支援 `corner-shape` 的瀏覽器改用超橢圓（Smooth Rounded Corners） |
| 響應式 | `--measure` 隨視窗放大（≥1800px 給 1680px），手機（≤640px）導覽列改成可橫向捲動的一列 |
| 鍵盤 | `:focus-visible` 有明顯外框；切換鈕是真的 `<button>`，帶 `aria-pressed` |

配色與 Discord Embed 共用同一組品牌色（金 `#eabf29`、藍 `#259fc8`，取自標誌）。

## API

路徑一律 kebab-case，回應一律 `application/json; charset=utf-8`，金額欄位以**元**為單位（不是分）。

| 方法與路徑 | 查詢參數 | 回應 |
| --- | --- | --- |
| `GET /health` | — | 服務與資料庫狀態 |
| `GET /api/overview` | — | 儀表板的彙總數字 |
| `GET /api/restaurants` | `keyword` | 餐廳清單 |
| `GET /api/restaurants/:id` | — | 餐廳、目前菜單與品項、版本歷史 |
| `GET /api/sessions` | `guild` | 最近 30 場揪團 |
| `GET /api/sessions/:id` | — | 單場揪團的彙總與每人金額 |
| `GET /api/ledger/:guild-id` | — | 該伺服器每個人的結餘 |
| `GET /api/debts/:guild-id` | — | 誰欠誰（互抵後）與最少轉帳建議 |
| `GET /api/llm-usage` | `hours`（預設 24，上限 720） | LLM 呼叫統計 |

非 GET 一律 405。找不到的路徑回 404 JSON（`/api/*`）或 404 頁面（其他）。

路由比對抽在 `src/web/routes/match.ts`，是純函式並有離線測試——
這裡曾經因為少跳過一個路徑片段而讓所有 `/api/*` 都回 404，而健康檢查還是綠的。

## 程式碼分佈

| 檔案 | 職責 |
| --- | --- |
| `src/web/server.ts` | HTTP 入口、方法檢查、靜態檔、API 與頁面分派 |
| `src/web/routes/match.ts` | 純函式路由比對（API、頁面、靜態檔） |
| `src/web/render.ts` | 外框、導覽列、表格／面板／數字卡等小元件 |
| `src/web/theme.ts` | 內嵌 CSS 與主題切換腳本 |
| `src/web/assets.ts` | 標誌白名單與 viewBox 調整 |
| `src/web/routes/pages.ts` | 儀表板、系統狀態、404 |
| `src/web/routes/pages_catalogue.ts` | 餐廳清單與菜單 |
| `src/web/routes/pages_orders.ts` | 揪團與帳務 |
| `src/web/routes/api.ts` | JSON API |

## 健康檢查

| 服務 | 位址 | 內容 |
| --- | --- | --- |
| `web` | `http://<host>:3000/health` | 服務名稱、時區、資料庫 `NOW()` |
| `bot` | 容器內 `http://127.0.0.1:3001/health` | 另含 `discord_ready`、LLM 供應商清單（含被略過的原因）與 `ocr` 狀態 |

兩支都是 Compose healthcheck 直接打的端點。
