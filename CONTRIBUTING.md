# 貢獻指南

語言：[繁體中文](CONTRIBUTING.md) · [English (UK)](docs/CONTRIBUTING.en-GB.md)

這是實驗室內部的伙食系統。歡迎修 bug、補測試、改文件；請先對齊現況再動手。

## 動工前

1. 讀 [`.cursorrules`](.cursorrules) 與 [`AGENTS.md`](AGENTS.md) §1–2。
2. 用 `AGENTS.md` §3 對上這次要改的檔，**不要**一上來掃整個倉庫。
3. 動到架構、流程、資料契約、路由時，先打開對應的那一份 [`SPEC/`](SPEC/README.md)。

衝突時以程式碼為準，然後回頭修正 SPEC。產品意圖（尚未落地的需求）在 [`PLAN/plan_initial.md`](PLAN/plan_initial.md)。

## 慣例

| 項目 | 約定 |
| --- | --- |
| 註解、維護者錯誤訊息 | 繁體中文；避免簡體與中國大陸用語 |
| 變數／函式 | `snake_case` |
| 類別／型別 | `PascalCase` |
| 路由 path | kebab-case |
| 日期／時間 | `YYYY-MM-DD`、`HH:MM:SS`，台北時間 |
| 金額 | 資料庫用 `*_cents`；JSON API 用元 |
| 單檔 | 約 300 行該拆、硬上限 500 行 |
| 文字檔 | LF（`.gitattributes`） |

使用者看得到的字串放 `src/bot/strings.ts`：**繁中與英式英文一起補**，少一邊型別檢查會失敗。

## 請不要

- 在程式碼硬寫金鑰、Token、密碼、絕對機器路徑
- 提交 `.env`、憑證、備份檔
- 抄隔壁 `AIPAR-ordering-system` 的程式、套件切分或架構（研究倉 `AIPAR-ordering-system-sesearch` 可以看結論，不是產品倉）
- 拿猜的 LLM 模型 ID 去打 API
- 為了「比較順」拿掉菜單草稿的人工確認，或讓模型自行定價

不可逆的動作（刪資料卷、`compose down -v`、push、註冊全域指令、會花錢的 API）請先問。

## 改完必做

1. 契約有變 → 同步 `SPEC/`
2. 把 notable 變更寫進 `CHANGELOG.md` 的 `## [Unreleased]`（Keep a Changelog 2.0.0：Added／Changed／Deprecated／Removed／Fixed／Security）。發版時再改成帶日期的版本號，**不得重複**
3. `npm run check` 全綠（不需要資料庫或金鑰）
4. 動到資料流 → `npm run smoke`（需要資料庫）
5. 動到 LLM 設定 → `npm run llm:check`（需要金鑰）
6. 斜線指令定義有變 → `npm run register`

對外說明（Hero、安裝、結構）寫在 [`README.md`](README.md)；校內部屬寫在 [`DEPLOY.md`](DEPLOY.md)。
