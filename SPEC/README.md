# SPEC

本目錄記錄實驗室伙食系統 **AIPARC ETA** 的架構與資料契約。
給人看的專案介紹在根目錄 [`README.md`](../README.md)（[English (UK)](../docs/README.en-GB.md)）；本目錄不重複入門教學。

若規格與程式碼衝突，以程式碼為準，並回頭修正這裡的文件。

| 文件 | 說明 |
| --- | --- |
| [infrastructure.md](./infrastructure.md) | Git、Docker、服務拓樸、環境變數、驗證指令 |
| [data-model.md](./data-model.md) | 資料表、欄位約定與不變條件 |
| [bot-interactions.md](./bot-interactions.md) | 指令、元件、三大功能流程、在地化規則 |
| [llm-gateway.md](./llm-gateway.md) | 免費 LLM 供應商、換手策略、任務與紅線 |
| [web-api.md](./web-api.md) | 網站頁面與唯讀 JSON API |

## 一頁式架構

```
                    ┌──────────────┐
  Discord 使用者 ──►│  bot（容器）  │──┐
                    └──────────────┘  │   ┌──────────────┐
                                      ├──►│  PostgreSQL  │
                    ┌──────────────┐  │   └──────────────┘
  校內瀏覽器 ──────►│  web（容器）  │──┘
                    └──────────────┘
                            │
                            ▼
              免費 LLM 供應商（Groq／Gemini／Mistral／本機）
              OpenAI 相容 wire format，換一家只換三個字串
```

程式碼分層：

| 目錄 | 職責 | 可以依賴 |
| --- | --- | --- |
| `src/shared/` | 時間、金額、文字、日誌 | 無 |
| `src/db/` | 資料存取，一張表一個模組 | `shared` |
| `src/domain/` | 純業務邏輯（菜單正規化、彙總、結算） | `shared`、`db` 型別 |
| `src/llm/` | 供應商註冊、換手、任務提示詞 | `shared`、`domain` |
| `src/bot/` | Discord 指令、元件、訊息處理 | 以上皆可 |
| `src/web/` | HTTP 路由、頁面、API | `shared`、`db`、`domain` |

`domain` 與 `llm` 不認識 Discord，`bot` 與 `web` 不直接寫 SQL。
單檔警戒 300 行、硬上限 500 行（`.cursorrules`）。
