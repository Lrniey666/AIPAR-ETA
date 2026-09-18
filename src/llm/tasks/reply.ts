// 一般對話回覆。給 Discord 的 streaming preview 用：邊生成邊更新訊息。
//
// 回答一律被綁在我們自己的資料上（可用餐廳、目前揪團、你的結餘、指令清單），
// 避免模型憑空發明功能或餐廳。
//
// 0.3.0 的調整：原本只要問到點餐帳務以外的事就只會說「查不到」，對話直接斷掉。
// 現在允許先接一句話再把話題帶回點餐或帳務——但「接話」限一句，
// 而且所有數字仍然只能來自下面給的事實，不准自己編。

import type { LlmGateway } from "../gateway.ts";

export type ReplyContext = {
  /** 目前資料庫裡有的餐廳名稱，讓模型只在已知範圍內回答。 */
  restaurants: string[];
  /** 使用者語言：zh-TW 或 en-GB。 */
  locale: string;
  /** 指令速查，避免模型自己編指令名稱。 */
  commands: string[];
  /** 這個頻道正在進行的揪團（有的話），例如「聞香來．開放中．18:30 截止」。 */
  session?: string;
  /** 發問者目前的結餘描述，例如「還欠 NT$ 250」。 */
  balance?: string;
  /** 這個人現在該把錢拿給誰，例如「拿 NT$ 250 給 阿明」。 */
  debts?: string[];
};

const SYSTEM_ZH = `你是實驗室伙食系統 AIPAR ETA 的助理，個性像個好相處的實驗室同學。
規則：
- 所有事實（餐廳、品項、金額、誰欠誰）只能來自下面提供的資料。沒有的就說目前查不到，絕對不要編。
- 使用者聊的是點餐帳務以外的事（天氣、心情、閒聊）時，先自然地回應一句，再順勢把話題帶回吃飯：
  例如問他要不要開團、要不要看菜單、或提醒他還沒結的帳。接話只要一句，不要長篇大論。
- 回答用繁體中文，口語、簡潔，三句話以內。
- 需要操作時，引導使用者用下面列出的指令，不要自創指令名稱。
- 不要用簡體字，也不要用中國大陸用語。`;

const SYSTEM_EN = `You are the assistant for AIPAR ETA, a laboratory meal-ordering system, with the manner of an easy-going lab mate.
Rules:
- Every fact (restaurants, dishes, amounts, who owes whom) must come from the supplied data. If it is not there, say you cannot find it; never invent anything.
- When someone talks about something other than food or money (the weather, their mood, small talk), answer naturally in one sentence, then steer back to eating: offer to open a group order, show a menu, or mention an unsettled balance. Keep the small talk to one sentence.
- Reply in British English, plainly, in three sentences at most.
- When an action is needed, point to the listed commands; do not invent command names.`;

function build_facts(context: ReplyContext, is_chinese: boolean): string {
  const lines: string[] = [];

  lines.push(
    is_chinese
      ? `目前登錄的餐廳：${context.restaurants.length > 0 ? context.restaurants.join("、") : "（尚無）"}`
      : `Restaurants on file: ${context.restaurants.length > 0 ? context.restaurants.join(", ") : "(none)"}`,
  );

  if (context.session) {
    lines.push(is_chinese ? `這個頻道的揪團：${context.session}` : `Group order here: ${context.session}`);
  }
  if (context.balance) {
    lines.push(is_chinese ? `發問者的結餘：${context.balance}` : `Their balance: ${context.balance}`);
  }
  if (context.debts && context.debts.length > 0) {
    lines.push(
      is_chinese ? `發問者的債務：${context.debts.join("；")}` : `Their debts: ${context.debts.join("; ")}`,
    );
  }

  lines.push(
    is_chinese ? `可用指令：${context.commands.join("、")}` : `Available commands: ${context.commands.join(", ")}`,
  );
  return lines.join("\n");
}

export async function generate_reply(
  gateway: LlmGateway,
  question: string,
  context: ReplyContext,
  on_delta?: (chunk: string) => void,
): Promise<string> {
  const is_chinese = context.locale.startsWith("zh");

  const result = await gateway.complete({
    task: "reply",
    mode: "text",
    messages: [
      { role: "system", content: is_chinese ? SYSTEM_ZH : SYSTEM_EN },
      { role: "user", content: `${build_facts(context, is_chinese)}\n\n---\n${question}` },
    ],
    temperature: 0.4,
    max_tokens: 400,
    on_delta,
  });

  return result.text.trim();
}
