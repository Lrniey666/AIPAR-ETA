# LLM 閘道

最後更新：2026-09-18（台北時間）

設計依據是 `AIPAR-ordering-system-sesearch/free-llm-api-test` 的實測結論：
全部走 OpenAI 相容 wire format，換一家只換 `base_url` / `api_key` / `model` 三個字串，
所以整個專案不依賴任何 LLM SDK，只用 Node 內建 `fetch`。

## 供應商

`src/llm/providers.ts` 每次呼叫都重讀環境變數，改 `.env` 重啟容器即生效。

| key | 預設 base_url | 視覺 | 備註 |
| --- | --- | --- | --- |
| `groq` | `https://api.groq.com/openai/v1` | 視模型而定 | 延遲最低，排文字第一棒。預設帶 `reasoning_effort=low`，避免思考吃光 `max_tokens`。 |
| `gemini` | `https://generativelanguage.googleapis.com/v1beta/openai` | ✓ | 免費層裡中文菜單辨識最穩，排視覺第一棒。 |
| `mistral` | `https://api.mistral.ai/v1` | ✓ | 月額度大但約 1 req/s，適合批次不適合高併發。 |
| `iai` | `https://www.iai.nkust.edu.tw/aihub/v1` | ✓ | **按 token 計費，不是免費層**，預設關閉。 |
| `local` | 由 `LOCAL_LLM_BASE_URL` 指定 | ✓ | 本機 Ollama 之類的保底，排最後。 |

### 三條略過規則

1. **沒填金鑰＝略過**，不是錯誤。0 家、1 家、N 家都要能正常啟動。
2. **有金鑰但沒填模型 ID＝略過並記原因**，不拿猜的 ID 去打 404。免費層模型會下架改名，
   `.env.example` 因此刻意不給「保證可用」的預設值。
3. **計費服務預設關閉**。PLAN 要求只用免費 API，`iai` 要 `LLM_ALLOW_METERED=true` 才會被納入。

被略過的供應商與原因會出現在啟動日誌與 `GET /health`。

## 換手策略

`src/llm/gateway.ts`。順序是 `provider1/key1 → provider1/key2 → provider2/key1 → …`

| 狀況 | 動作 |
| --- | --- |
| 429 / 5xx / 連線錯誤 | 同一把重試一次（聽 `Retry-After`，上限 4 秒），再不行換下一把 |
| 401 / 403 | 這把金鑰無效，立刻換下一把 |
| 400 | 請求本身有問題，跳過這家剩下的金鑰，直接換下一家 |
| **回覆為空** | 當成這家失敗，換下一家 |

最後一條是實測踩到的：Gemini 免費層常把 `max_tokens` 花在思考上、正文留空。
當成成功回傳的話，上層只會拿到一個解析不出東西的空字串。

等待上限刻意壓在 4 秒內——Discord 互動不能讓使用者等一分鐘。

每一次呼叫（成功或失敗）都會寫進 `llm_calls`，寫入失敗不影響主流程。

## 任務

| 模組 | 任務名稱 | 用途 |
| --- | --- | --- |
| `tasks/menu_extract.ts` | `menu-vision` / `menu-text` | 菜單圖片或雜亂文字 → 結構化草稿 |
| `tasks/order_parse.ts` | `order-parse` | 自然語言 → 菜單品項 × 數量 |
| `tasks/intent.ts` | `intent` | 判斷這句話是查菜單、開團、查帳還是閒聊 |
| `tasks/reply.ts` | `reply` | 一般問答，支援串流 |

### 兩條紅線

**一、價格永遠來自資料庫。** LLM 只負責「指到哪一項、要幾份」，
`unit_price_cents` 一律從 `menu_items` 取。模型會編價格，資料庫不會。

**二、規則優先、模型墊底。** 點餐、意圖判讀、菜單文字解析都先跑規則；
規則對得到就不打 LLM。免費層配額有限，而且規則比模型穩定可預測。

菜單擷取的正規化（`domain/menu_draft.ts`）刻意嚴格：**價格不是數字就整筆丟掉**，
寧可少一筆，也不要把幻覺價格寫進資料庫。

## 驗證

```bash
npm run llm:check
```

每家送一次極短請求（文字一次、視覺一次），印出延遲與錯誤原因。
「`.env` 填了」不等於「打得到」，上線前與部署後都該跑一次。
計費供應商預設被擋掉，這支不會誤打。
