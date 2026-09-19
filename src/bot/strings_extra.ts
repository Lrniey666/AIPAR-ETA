// 0.3.0 新增的顯示字串：點餐面板、OCR 對帳、債務關係、說明與網站。
// 和 `strings.ts` 分檔只為了不讓單檔越過 300 行警戒線，兩份會在 `strings.ts` 合併。
// 新增字串請兩種語言一起補，缺一邊會在型別檢查時就被抓出來。

export const EXTRA_STRINGS = {
  "common.closed": ["截止", "Closed"],
  "common.website": ["開啟網站", "Open the website"],

  "session.quantity_placeholder": ["每項數量：{quantity} 份", "Quantity for each: {quantity}"],
  "session.quantity_option": ["{quantity} 份", "{quantity} each"],
  "session.quantity_changed": [
    "數量設為 {quantity} 份，接著選品項。",
    "Quantity set to {quantity}. Now pick your items.",
  ],
  "session.clear_placeholder": ["選要清掉的項目（可複選）", "Pick what to remove"],
  "session.button_clear_all": ["全部清除", "Clear everything"],
  "session.removed": ["已清掉 {summary}。", "Removed {summary}."],
  "session.nothing_to_clear": ["你在這場還沒點東西。", "You have not ordered anything here yet."],
  "session.cancel_ambiguous": [
    "要取消哪一項？可以說「取消紅茶」，或按「清除我的」逐項選。",
    "Which one should I cancel? Say “cancel the tea”, or press *Clear mine* to choose.",
  ],
  "session.order_hint": [
    "按「點餐」選數量與品項，或直接打字說「我要一個雞腿飯」。要改就說「取消紅茶」。",
    "Press *Order* to choose quantity and items, or just type “one chicken rice”. Say “cancel the tea” to change it.",
  ],
  "session.open_ping": [
    "{role} 開飯囉！**{name}** 開始收單。",
    "{role} Food run! Orders are open for **{name}**.",
  ],
  "session.field_payer": ["收款人", "Collector"],
  "session.deadline_invalid": [
    "截止時間請填 1 到 10080 之間的分鐘數。",
    "Give the deadline in minutes, between 1 and 10080.",
  ],
  "session.collect": [
    "請大家把錢拿給 <@{payer}>，共 {amount}。",
    "Please hand <@{payer}> the money, {amount} in total.",
  ],

  "menu.ocr_flagged": [
    "⚠️ 其中 {count} 項沒有和 OCR 對上，請特別核對（標 ⚠️ 的那幾行）。",
    "⚠️ {count} items did not match the OCR pass; please check the lines marked ⚠️.",
  ],
  "menu.ocr_missing": [
    "OCR 另外讀到、但草稿裡沒有的：{sample}",
    "Seen by OCR but missing from the draft: {sample}",
  ],
  "menu.ocr_skipped": ["未啟用 OCR 對帳", "OCR cross-check not enabled"],

  "ledger.who_title": ["誰欠誰", "Who owes whom"],
  "ledger.no_debts": ["目前沒有未結的欠款。", "Nobody owes anybody at the moment."],
  "ledger.owe_to": ["你要拿 {amount} 給 <@{user}>", "You owe <@{user}> {amount}"],
  "ledger.owed_by": ["<@{user}> 要還你 {amount}", "<@{user}> owes you {amount}"],
  "ledger.debts_title": ["你的欠款與應收", "What you owe and are owed"],
  "ledger.simplified_title": ["最少轉帳建議", "Fewest transfers"],
  "ledger.simplified_hint": [
    "互相抵銷之後，照這幾筆轉一次就結清。",
    "After netting things off, these transfers settle everyone up.",
  ],
  "ledger.payment_to": [
    "已記下 {name} 付款 {amount} 給 <@{to}>。",
    "Recorded {amount} paid by {name} to <@{to}>.",
  ],

  "setup.role_done": ["開團時會通知 {role}。", "Group orders will ping {role}."],
  "setup.role_cleared": ["已取消開團通知身分組。", "Group orders will no longer ping a role."],

  "help.field_setup": ["① 建檔", "① Set up"],
  "help.field_setup_body": [
    "`/餐廳 新增` 建立餐廳\n`/菜單 上傳` 丟菜單照片辨識（支援直書菜單）\n`/菜單 輸入` 人工貼上\n辨識結果一定要有人按「確認寫入」才會上線。",
    "`/restaurant add` registers a place\n`/menu upload` reads a photo (vertical menus included)\n`/menu input` takes typed text\nNothing goes live until someone presses *Confirm*.",
  ],
  "help.field_order": ["② 揪團與點餐", "② Group orders"],
  "help.field_order_body": [
    "`/揪團` 選餐廳、填截止分鐘數，Bot 會開一則論壇貼文並貼上菜單。\n在貼文裡按「點餐」選數量與品項，或直接打「我要兩個雞腿飯」。\n要改就說「取消紅茶」，或按「清除我的」逐項清。",
    "`/groupbuy` picks the restaurant and a deadline in minutes; the bot opens a forum post with the menu.\nPress *Order* in the post, or type “two chicken rice”.\nSay “cancel the tea”, or press *Clear mine* to pick what to remove.",
  ],
  "help.field_money": ["③ 結算與帳務", "③ Settling up"],
  "help.field_money_body": [
    "`/結算` 算出每人應付並寫進帳本，同時記下要把錢拿給誰。\n`/帳務 我的` 看自己的結餘\n`/帳務 誰欠誰` 看全體債務與最少轉帳建議\n`/帳務 付款` 記一筆付款",
    "`/settle` works out who owes what and records who to pay.\n`/ledger mine` shows your balance\n`/ledger who` shows all debts and the fewest transfers\n`/ledger pay` records a payment",
  ],
  "help.field_chat": ["④ 直接跟我說話", "④ Just talk to me"],
  "help.field_chat_body": [
    "@ 我就可以用自然語言問「聞香來有什麼」「我還欠多少」「誰欠我錢」。\n我記得這個頻道最近的對話，也記得你明講要我記的事（`/記憶`）。\n**菜名與價格一律只從資料庫來**：沒建菜單的店我會直說不知道，不會猜。",
    "Mention me and ask in plain language: “what does Wen Xiang Lai have”, “how much do I owe”, “who owes me”.\nI remember the recent conversation here, and anything you asked me to remember (`/memory`).\n**Dishes and prices only ever come from the database**: if a restaurant has no menu on file I will say so rather than guess.",
  ],
  "help.field_admin": ["⑤ 管理員設定", "⑤ For server managers"],
  "help.field_admin_body": [
    "`/設定 論壇` 指定揪團要開在哪個論壇頻道\n`/設定 通知` 指定開團要 ping 的身分組",
    "`/setup forum` chooses the forum channel for group orders\n`/setup role` chooses the role to ping when one opens",
  ],

  "chat.restaurants_title": ["目前建檔的餐廳", "Restaurants on file"],
  "chat.no_restaurants": [
    "目前一間餐廳都還沒建檔。用 `/餐廳 新增` 建立第一間。",
    "No restaurants on file yet. Add the first one with `/restaurant add`.",
  ],
  "chat.menu_state_have": ["菜單 v{version}．{count} 項", "menu v{version} · {count} items"],
  "chat.menu_state_none": ["尚無菜單", "no menu yet"],
  "chat.no_menu_yet": [
    "**{name}** 有建檔，但**還沒有菜單**——所以我並不知道它賣什麼，不想亂猜給你。\n要建菜單的話：`/菜單 上傳` 丟照片辨識，或 `/菜單 輸入` 直接貼文字。",
    "**{name}** is on file but **has no menu yet**, so I genuinely do not know what they serve and will not guess.\nTo add one: `/menu upload` for a photo, or `/menu input` to paste the text.",
  ],
  "chat.blocked": [
    "這題我不確定，不想猜錯就不猜了。菜單請用 `/菜單 查看`，帳務用 `/帳務 我的`。",
    "I am not sure about that one, and I would rather not guess. Use `/menu show` for menus and `/ledger mine` for money.",
  ],

  "chat.dish_found": ["「{dish}」這幾家有", "Where you can get {dish}"],
  "chat.dish_none": [
    "目前上線的菜單裡找不到「{dish}」。{hint}",
    "Nothing matching “{dish}” in any active menu. {hint}",
  ],
  "chat.dish_hint_no_menu": [
    "另外這幾家還沒建菜單，可能有但我查不到：{names}。",
    "These places have no menu on file yet, so I cannot tell: {names}.",
  ],
  "chat.dish_hint_none": [
    "要我查得到，得先用 `/菜單 上傳` 或 `/菜單 輸入` 把菜單建起來。",
    "Add a menu with `/menu upload` or `/menu input` and I will be able to look it up.",
  ],

  "chat.recommend_title": ["幫你挑了幾樣", "A few picks for you"],
  "chat.recommend_intro": [
    "看了一下目前的菜單，這幾樣如何？",
    "Looking at what is on file, how about these?",
  ],
  "chat.recommend_again": [
    "不合胃口就再說一次「推薦」，我換幾樣。",
    "Say “recommend” again and I will pick different ones.",
  ],
  "chat.recommend_empty": [
    "想推薦也沒得推——目前建檔的店都還沒有菜單。先用 `/菜單 上傳` 或 `/菜單 輸入` 建一份，我就查得到了。",
    "I would recommend something, but none of the restaurants on file have a menu yet. Add one with `/menu upload` or `/menu input` and I can help.",
  ],
  "chat.maybe_restaurant": ["你是說 **{name}** 嗎？", "Do you mean **{name}**?"],

  "memory.title": ["我記得的事", "What I remember"],
  "memory.status": [
    "這個頻道最近 {turns} 句對話我還記得，關於你的長期記憶有 {facts} 條。",
    "I still have the last {turns} messages from this channel, and {facts} long-term notes about you.",
  ],
  "memory.none": [
    "目前沒有關於你的長期記憶。想讓我記住什麼就說「記住⋯⋯」，或用 `/記憶 記住`。",
    "Nothing recorded about you yet. Say “remember …”, or use `/memory save`.",
  ],
  "memory.saved": ["好，我記住了：**{summary}**", "Noted: **{summary}**"],
  "memory.forgotten": ["已經忘掉：**{summary}**", "Forgotten: **{summary}**"],
  "memory.forgot_all": [
    "已清掉 {facts} 條長期記憶，以及這個頻道的 {turns} 句短期對話。",
    "Cleared {facts} long-term notes and {turns} recent messages from this channel.",
  ],
  "memory.not_found": ["我沒有記過這件事。", "I have nothing recorded for that."],
  "memory.scope_user": ["關於你", "About you"],
  "memory.scope_channel": ["關於這個頻道", "About this channel"],
  "memory.scope_guild": ["關於這個伺服器", "About this server"],
  "memory.short_term": ["短期（這個頻道的最近對話）", "Short term (recent messages here)"],
  "memory.privacy": [
    "短期對話只留最近 40 句；長期記憶只記你明講要我記的，隨時可以用 `/記憶 忘記` 刪掉。",
    "Only the last 40 messages are kept, and long-term notes are only what you explicitly asked me to remember. `/memory forget` removes them.",
  ],

  "website.title": ["AIPARC ETA 網站", "AIPARC ETA website"],
  "website.body": [
    "餐廳、菜單、揪團紀錄與帳務都查得到，也有深淺色主題可以切換。",
    "Restaurants, menus, group orders and the ledger — with a light and dark theme.",
  ],
  "website.missing": [
    "還沒設定網站位址。請管理員在 `.env` 填好 `PUBLIC_BASE_URL` 後重啟。",
    "No website address is configured. A server manager should set `PUBLIC_BASE_URL` in `.env` and restart.",
  ],
} as const satisfies Record<string, readonly [string, string]>;
