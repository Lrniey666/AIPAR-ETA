# 介紹簡報

給通用聽眾的 AIPAR ETA 介紹，不含系統缺陷或未完成項目。

| 檔案 | 內容 |
| --- | --- |
| [AIPAR-ETA-intro.pptx](./AIPAR-ETA-intro.pptx) | 15 頁投影片（PowerPoint／Google 簡報可開） |
| [slides.md](./slides.md) | 依頁數寫的講稿與畫面說明 |
| [glossary.md](./glossary.md) | 技術專有名詞（每條含白話、概念、定義、本專案用途），依投影片首次出現頁排序 |
| [build_pptx.py](./build_pptx.py) | 重新產出 pptx |
| [assets/](./assets/) | 截圖與標誌 PNG |
| [mocks/](./mocks/) | Discord／架構／流程的 HTML 示意（非正式執行頁） |

重新產生投影片：

```powershell
python docs/presentations/build_pptx.py
```

網站截圖需本機 `web` 容器在 `http://127.0.0.1:3000/`。Discord 示意需先在 `docs/presentations` 開靜態伺服器，再用瀏覽器無頭模式截 `mocks/`。
