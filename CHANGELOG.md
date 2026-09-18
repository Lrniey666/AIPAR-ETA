# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- `CHANGELOG.md` 改為 [Keep a Changelog 2.0.0](https://keepachangelog.com/en/2.0.0/)：版本標題用 `## [x.y.z] - YYYY-MM-DD`、僅使用六種變更類型，並在檔尾加上版本比對連結。既有 0.1.0–0.2.1 的事實未改，只重寫結構與用詞。
- 維護約定（`.cursorrules`、`AGENTS.md`、`CONTRIBUTING.md`）改為把未發布變更寫進 `Unreleased`；發版時再改成帶日期的版本號。變更目的寫在該版本摘要或各條目用詞裡，不再另開「變更目的／影響範圍／驗收」標題。

## [0.2.1] - 2026-09-18

0.2.0 的根目錄 `README.md` 只夠本機啟動。本版把對外說明改成繁中／英式英文兩份對照，安裝與契約細節收到可折疊區塊與既有 `SPEC/`、`DEPLOY.md`。未改應用程式行為、路由或資料契約。

### Added

- 繁體中文專案介紹 `README.md`：Hero、徽章、語言切換、功能、示範、架構、安裝、結構、貢獻與授權。
- 同一份內容的英式英文 `docs/README.en-GB.md`。
- 貢獻指南 `CONTRIBUTING.md` 與 `docs/CONTRIBUTING.en-GB.md`，以及說明文件索引 `docs/README.md`。
- `docs/assets/`：標誌 SVG，以及 Discord／網站示意 PNG。

### Changed

- `AGENTS.md` 與 `SPEC/README.md` 的文件地圖補上上述入口。

## [0.2.0] - 2026-09-18

0.1.0 只有容器與健康檢查。本版落地 PLAN 的三個功能：餐廳菜單、揪團點餐、記帳與分攤；並補上免費 LLM 閘道、校內網站、測試與規格。本機已用 `npm run check`（29 項離線測試）、`npm run smoke`、`npm run llm:check` 與三容器健康檢查驗過。Discord 伺服器內的開團、按鈕與自然語言點餐尚未以真人操作驗收；本版確認 bot 可連線、八支斜線指令已全域註冊。

### Added

- 資料庫遷移 `001_init.sql`、`002_guild_settings.sql` 與啟動時自動套用的遷移器。十張表：`restaurants`、`menus`、`menu_items`、`app_users`、`order_sessions`、`order_lines`、`ledger_entries`、`menu_uploads`、`llm_calls`、`guild_settings`。
- 免費 LLM 閘道（`src/llm/`）：OpenAI 相容 wire format、不引 SDK；多把金鑰輪替、跨供應商換手、串流。計費型供應商（iAI）預設關閉。
- Discord bot：八支斜線指令（英文預設名稱加繁簡中文在地化）、Embed 加按鈕／下拉、自然語言點餐、Ack Reaction 與 Streaming Preview、論壇貼文揪團、截止自動封單。
- 校內網站：伺服器端渲染三個頁面與六支唯讀 JSON API。
- 離線測試 29 項，以及 `npm run smoke`、`npm run llm:check`。
- 規格文件：`SPEC/data-model.md`、`bot-interactions.md`、`llm-gateway.md`、`web-api.md`；改寫 infrastructure 與 README；`.env.example` 補上新變數。

### Fixed

- LLM 供應商回覆為空時不再當成成功；改為該家失敗並換下一家。Gemini 免費層常把 token 花在思考上、正文留空。
- 菜單品名比對改為字元 bigram 與單字涵蓋率取大值，讓「珍奶」對得到「珍珠奶茶」。
- 網站 `/api/*` 路徑比對少跳一格導致全部 404；抽出 `src/web/routes/match.ts` 並補測試。

## [0.1.0] - 2026-09-18

規劃中的專案還沒有版本控制與可重現執行環境。本版建立 Git 倉庫與 Docker Compose，讓網站、Discord bot、PostgreSQL 能在同一套容器上開發與部署。`GET /health` 回 `ok: true` 且含資料庫時間；`.env` 不被追蹤。

### Added

- Git：`main` 分支、忽略規則、`.gitattributes`。
- Docker：`Dockerfile`、`compose.yaml`（`web`、`bot`、`postgres`）。
- 應用：健康檢查與環境變數讀取。
- 文件：`README.md`、`DEPLOY.md`、`SPEC/infrastructure.md`。

[unreleased]: https://github.com/Lrniey666/AIPAR-ETA/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/Lrniey666/AIPAR-ETA/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Lrniey666/AIPAR-ETA/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Lrniey666/AIPAR-ETA/releases/tag/v0.1.0
