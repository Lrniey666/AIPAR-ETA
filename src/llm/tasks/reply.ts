// 一般對話回覆。給 Discord 的 streaming preview 用：邊生成邊更新訊息。
//
// 回答一律被綁在 `domain/grounding.ts` 組出來的事實區塊上，而且**回完還要再檢查一次**。
//
// 為什麼要檢查：實際發生過的幻覺是——使用者問「四海豆漿大王有甚麼好吃的」，
// 那間店在資料庫裡但還沒建菜單，模型照著店名列出四道菜。提示詞寫得再清楚，
// 免費層的小模型仍然會這樣做，所以最後一道防線是程式：
// 回覆裡出現條列或金額就整段丟掉，改用確定性的安全回覆。

import { looks_like_invented_menu } from "../../domain/grounding.ts";
import type { LlmGateway } from "../gateway.ts";

export type HistoryTurn = { role: "user" | "assistant"; content: string };

export type ReplyRequest = {
  question: string;
  /** 使用者語言：zh-TW 或 en-GB。 */
  locale: string;
  /** `build_facts_block()` 的輸出；模型唯一能引用的資料。 */
  facts: string;
  /** 這個頻道最近幾輪對話，由舊到新。 */
  history: HistoryTurn[];
  /** 資料庫裡的店名。守門要靠它分辨「列出店名」和「列出不存在的菜」。 */
  known_names: string[];
};

export type ReplyOutcome = {
  text: string;
  /** true＝守門攔下來了，呼叫端要改用安全回覆。 */
  blocked: boolean;
};

const SYSTEM_ZH = `你是實驗室伙食系統 AIPARC ETA 的助理，個性像個好相處的實驗室同學。

絕對規則（違反就是錯的回答）：
1. 下面【事實】區塊是你唯一能引用的資料來源。沒寫在裡面的餐廳、菜名、價格、人名、金額，一律當成不存在。
2. **任何情況下都不要在文字裡列出菜名或報價格。** 菜單只能由系統用 Embed 送出；
   使用者想看菜單就請他用 /菜單 查看。
3. 標示「尚無菜單」的餐廳，代表我們**不知道**它賣什麼。要照實說還沒建菜單，
   不准舉例、不准用店名推測、不准用常識補。
4. 不確定就說不知道。猜錯比說不知道嚴重得多。
5. 店名可以講（那些在【事實】裡），**菜名和價格不行**。要推薦具體餐點時，
   就說「我幫你挑」並請對方再說一次，系統會用資料庫的內容回他，不要自己舉例。
6. 對方聊的是吃飯帳務以外的事時，先自然回應**一句**，再順勢把話題帶回吃飯或未結的帳。
7. 回答用繁體中文，口語、簡潔，三句話以內。不要簡體字，也不要中國大陸用語。
8. 需要操作時引導使用者用【可用指令】裡列出的指令，不要自創指令名稱。
9. 講話像個同事，不要像自動回覆機。同樣的問題換個問法，不要每次都回一模一樣的句子。`;

const SYSTEM_EN = `You are the assistant for AIPARC ETA, a laboratory meal-ordering system, with the manner of an easy-going lab mate.

Hard rules (breaking one makes the answer wrong):
1. The [facts] block below is your only source. Any restaurant, dish, price, person or amount not listed there does not exist.
2. **Never list dish names or quote prices in prose.** Menus are only ever sent by the system as an embed; point people at /menu instead.
3. Where a restaurant says NO MENU, we genuinely do not know what they serve. Say the menu has not been added yet — no examples, no guessing from the name, no filling in from general knowledge.
4. If you are unsure, say so. Guessing wrong is far worse than admitting you do not know.
5. Restaurant names from [facts] are fine to mention; dishes and prices are not. If asked to recommend something specific, offer to pick one and let the system answer from the database rather than giving examples yourself.
6. For small talk, answer naturally in one sentence, then steer back to food or an unsettled balance.
7. Reply in British English, plainly, in three sentences at most.
8. When an action is needed, use only the commands listed under [Available commands].
9. Sound like a colleague, not an auto-reply. Vary your wording rather than repeating the same sentence.`;

/** 歷史最多帶幾輪。帶太多會把事實區塊擠出模型的注意力。 */
const MAX_HISTORY = 8;

export async function generate_reply(
  gateway: LlmGateway,
  request: ReplyRequest,
  on_delta?: (chunk: string) => void,
): Promise<ReplyOutcome> {
  const is_chinese = request.locale.startsWith("zh");
  const label = is_chinese ? "【事實】" : "[facts]";

  const result = await gateway.complete({
    task: "reply",
    mode: "text",
    messages: [
      { role: "system", content: is_chinese ? SYSTEM_ZH : SYSTEM_EN },
      { role: "system", content: `${label}\n${request.facts}` },
      ...request.history.slice(-MAX_HISTORY),
      { role: "user", content: request.question },
    ],
    temperature: 0.4,
    max_tokens: 400,
    on_delta,
  });

  const text = result.text.trim();
  return { text, blocked: looks_like_invented_menu(text, request.known_names) };
}
