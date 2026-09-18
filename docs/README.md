# 說明文件

對外介紹與操作說明分兩種語言維護，契約細節仍只寫在 `SPEC/`。

| 檔案 | 語言 | 內容 |
| --- | --- | --- |
| [../README.md](../README.md) | 繁體中文 | 專案介紹、功能、示範、架構、安裝、結構 |
| [README.en-GB.md](./README.en-GB.md) | English (UK) | 同上的英式英文對照 |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | 繁體中文 | 怎麼改這個倉庫 |
| [CONTRIBUTING.en-GB.md](./CONTRIBUTING.en-GB.md) | English (UK) | Contributing |
| [../DEPLOY.md](../DEPLOY.md) | 繁體中文 | 校內 24/7 伺服器、備份、連跑一週 |
| [../SPEC/README.md](../SPEC/README.md) | 繁體中文 | 架構與資料契約索引 |
| [../CHANGELOG.md](../CHANGELOG.md) | 繁體中文 | 版本紀錄 |
| [../PLAN/plan_initial.md](../PLAN/plan_initial.md) | 繁體中文 | 產品意圖（未落地需求也在這裡） |
| [../AGENTS.md](../AGENTS.md) | 繁體中文 | 維護者／Agent 找路，不是給使用者的入門 |

## 圖檔

| 檔案 | 用途 |
| --- | --- |
| [assets/logo.svg](./assets/logo.svg) | 方形標誌（淺／深色皆可） |
| [assets/hero.svg](./assets/hero.svg) | README 橫幅 |
| [assets/demo-discord.png](./assets/demo-discord.png) | Discord 揪團示意 |
| [assets/demo-web.png](./assets/demo-web.png) | 校內網站示意 |
| [assets/mocks/](./assets/mocks/) | 產生上述 PNG 的靜態 HTML（非正式執行頁） |

重新截圖時，在 `assets/mocks/` 開一個本機靜態伺服器即可，不必把示意頁掛進 `src/web/`。
