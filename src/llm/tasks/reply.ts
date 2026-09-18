// 一般對話回覆。給 Discord 的 streaming preview 用：邊生成邊更新訊息。
// 回答一律被綁在我們自己的資料上（可用餐廳、指令清單），避免模型憑空發明功能。

import type { LlmGateway } from "../gateway.ts";

export type ReplyContext = {
  /** 目前資料庫裡有的餐廳名稱，讓模型只在已知範圍內回答。 */
  restaurants: string[];
  /** 使用者語言：zh-TW 或 en-GB。 */
  locale: string;
  /** 指令速查，避免模型自己編指令名稱。 */
  commands: string[];
};

const SYSTEM_ZH = `你是實驗室伙食系統 AIPAR ETA 的助理。
規則：
- 只根據提供的資料回答，沒有的資料就說目前查不到，不要編造餐廳或品項。
- 回答用繁體中文，簡潔、口語，兩三句話以內。
- 需要操作時，引導使用者用下面列出的指令，不要自創指令名稱。`;

const SYSTEM_EN = `You are the assistant for AIPAR ETA, a laboratory meal-ordering system.
Rules:
- Answer only from the supplied data. If it is not there, say you cannot find it; never invent restaurants or dishes.
- Reply in British English, plainly, in two or three sentences at most.
- When an action is needed, point to the listed commands; do not invent command names.`;

export async function generate_reply(
  gateway: LlmGateway,
  question: string,
  context: ReplyContext,
  on_delta?: (chunk: string) => void,
): Promise<string> {
  const is_chinese = context.locale.startsWith("zh");
  const facts = [
    is_chinese ? "目前登錄的餐廳：" : "Restaurants on file: ",
    context.restaurants.length > 0 ? context.restaurants.join("、") : is_chinese ? "（尚無）" : "(none)",
    "\n",
    is_chinese ? "可用指令：" : "Available commands: ",
    context.commands.join("、"),
  ].join("");

  const result = await gateway.complete({
    task: "reply",
    mode: "text",
    messages: [
      { role: "system", content: is_chinese ? SYSTEM_ZH : SYSTEM_EN },
      { role: "user", content: `${facts}\n\n---\n${question}` },
    ],
    temperature: 0.3,
    max_tokens: 400,
    on_delta,
  });

  return result.text.trim();
}
