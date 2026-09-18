# 說明文件

對外介紹與操作說明分兩種語言維護，契約細節仍只寫在 `SPEC/`。

| 檔案 | 語言 | 內容 |
| --- | --- | --- |
| [../README.md](../README.md) | 繁體中文 | 專案介紹、功能、示範、架構、安裝、結構 |
| [README.en-GB.md](./README.en-GB.md) | English (UK) | 同上的英式英文對照 |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | 繁體中文 | 怎麼改這個倉庫 |
| [CONTRIBUTING.en-GB.md](./CONTRIBUTING.en-GB.md) | English (UK) | Contributing |
| [presentations/](./presentations/) | 繁體中文 | 通用介紹簡報與講稿 |
| [../DEPLOY.md](../DEPLOY.md) | 繁體中文 | 校內 24/7 伺服器、備份、連跑一週 |
| [../SPEC/README.md](../SPEC/README.md) | 繁體中文 | 架構與資料契約索引 |
| [../CHANGELOG.md](../CHANGELOG.md) | 繁體中文 | 版本紀錄 |
| [../PLAN/plan_initial.md](../PLAN/plan_initial.md) | 繁體中文 | 原始產品意圖 |
| [../PLAN/AEPARC_EAT_Revise_1.md](../PLAN/AEPARC_EAT_Revise_1.md) | 繁體中文 | 這一輪修訂清單 |
| [../AGENTS.md](../AGENTS.md) | 繁體中文 | 維護者／Agent 找路，不是給使用者的入門 |
| [presentations/](./presentations/README.md) | 繁體中文 | 通用介紹簡報、講稿與專有名詞 |

## 圖檔

| 檔案 | 用途 |
| --- | --- |
| [../logo/logo-02.svg](../logo/logo-02.svg) | 品牌標誌原稿（網站 `/assets/logo.svg`） |
| [assets/logo.svg](./assets/logo.svg) | 同一標誌、貼齊圖形的 viewBox，給 README 用 |
| [assets/hero.svg](./assets/hero.svg) | README 橫幅（金／藍品牌色） |
| [assets/demo-discord.png](./assets/demo-discord.png) | Discord 揪團示意（現行品牌色與點餐面板） |
| [assets/demo-web.png](./assets/demo-web.png) | 校內網站儀表板實拍（2026-09-18） |
| [assets/mocks/](./assets/mocks/) | 產生 Discord PNG 的靜態 HTML（非正式執行頁） |

網站示意改拍正在跑的 `web` 容器即可。Discord 示意在 `assets/mocks/` 開一個本機靜態伺服器重截，不必把示意頁掛進 `src/web/`。
