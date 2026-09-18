// 顯示字串表：[繁體中文, 英式英文]。
// 新增字串請兩種語言一起補，缺一邊會在型別檢查時就被抓出來。

const TABLE = {
  "common.confirm": ["確認寫入", "Confirm"],
  "common.cancel": ["取消", "Cancel"],
  "common.cancelled": ["已取消。", "Cancelled."],
  "common.total": ["合計", "Total"],
  "common.headcount": ["人數", "People"],
  "common.quantity": ["份數", "Items"],
  "common.deadline": ["截止", "Deadline"],
  "common.none": ["（無）", "(none)"],
  "common.page": ["第 {page}／{pages} 頁", "Page {page} of {pages}"],
  "common.updated": ["更新於 {time}", "Updated {time}"],

  "error.generic": ["出了點狀況：{detail}", "Something went wrong: {detail}"],
  "error.guild_only": ["這個指令只能在伺服器頻道使用。", "This command only works inside a server."],
  "error.restaurant_missing": [
    "找不到「{name}」這間餐廳。先用 /餐廳 新增 建檔。",
    "No restaurant matches “{name}”. Add it with /restaurant add first.",
  ],
  "error.menu_missing": [
    "「{name}」還沒有上線的菜單。用 /菜單 上傳 或 /菜單 輸入 建立。",
    "“{name}” has no active menu yet. Use /menu upload or /menu input.",
  ],
  "error.session_missing": [
    "這裡不是揪團貼文。請到揪團的貼文裡操作。",
    "This is not a group-order post. Use the command inside the order post.",
  ],
  "error.session_closed": ["這場揪團已經{status}，不能再改點餐。", "This order is already {status}."],
  "error.permission": ["你沒有權限做這件事。", "You do not have permission to do that."],
  "error.host_only": [
    "只有開團的人或管理員可以這樣做。",
    "Only the host or a server manager can do that.",
  ],
  "error.llm_unavailable": [
    "目前沒有可用的免費 LLM 供應商，自然語言功能暫停；仍可用按鈕與下拉點餐。",
    "No free LLM provider is available, so natural-language features are paused. Buttons and menus still work.",
  ],
  "error.vision_unavailable": [
    "目前沒有可用的視覺模型，請改用 /菜單 輸入 人工建檔。",
    "No vision model is available. Please use /menu input to enter the menu by hand.",
  ],
  "error.parse_failed": [
    "看不懂這段內容：{detail}。可以換句話說，或用下拉選單點餐。",
    "I could not read that: {detail}. Try rephrasing, or use the dropdown.",
  ],

  "restaurant.added": ["已建檔：**{name}**", "Saved: **{name}**"],
  "restaurant.list_title": ["餐廳清單", "Restaurants"],
  "restaurant.list_empty": [
    "還沒有任何餐廳。用 /餐廳 新增 建立第一間。",
    "No restaurants yet. Add the first one with /restaurant add.",
  ],
  "restaurant.field_alias": ["別名", "Aliases"],
  "restaurant.field_phone": ["電話", "Phone"],
  "restaurant.field_address": ["地址", "Address"],
  "restaurant.field_menu": ["菜單", "Menu"],
  "restaurant.menu_state": ["第 {version} 版，共 {count} 項", "Version {version}, {count} items"],

  "menu.title": ["{name}．菜單 v{version}", "{name} — menu v{version}"],
  "menu.empty": ["這份菜單沒有品項。", "This menu has no items."],
  "menu.source": ["來源", "Source"],
  "menu.source_manual": ["人工輸入", "Entered by hand"],
  "menu.source_vision": ["圖片辨識（{model}）", "Image recognition ({model})"],
  "menu.source_import": ["匯入", "Imported"],
  "menu.reading_image": [
    "正在讀菜單圖片，交給免費視覺模型處理，可能要幾秒⋯⋯",
    "Reading the menu image with a free vision model, this may take a few seconds…",
  ],
  "menu.draft_preview": [
    "辨識出 {count} 項。**請先核對**，確認無誤再寫入資料庫。",
    "Found {count} items. **Please check them** before saving.",
  ],
  "menu.draft_skipped": [
    "有 {count} 行看不懂，已略過：{sample}",
    "Skipped {count} unreadable lines: {sample}",
  ],
  "menu.draft_saved": [
    "已存成 **{name}** 第 {version} 版並設為使用中，共 {count} 項。",
    "Saved as **{name}** version {version} and made active, {count} items.",
  ],
  "menu.capture_prompt": [
    "請把菜單直接貼成**一則訊息**（一行一項，例如 `雞腿飯 90`），我會解析後給你確認。10 分鐘內有效。",
    "Paste the menu as **one message** (one item per line, e.g. `Chicken rice 90`). I will parse it for you. Valid for 10 minutes.",
  ],
  "menu.versions_title": ["{name}．菜單版本", "{name} — menu versions"],
  "menu.version_row": [
    "v{version}（{status}，{count} 項，{date}）",
    "v{version} ({status}, {count} items, {date})",
  ],
  "menu.activated": ["已切換到第 {version} 版。", "Switched to version {version}."],
  "menu.pick_restaurant": ["選一間餐廳看菜單", "Pick a restaurant"],
  "menu.status_draft": ["草稿", "draft"],
  "menu.status_active": ["使用中", "active"],
  "menu.status_archived": ["已封存", "archived"],

  "session.created": ["已開團：**{title}**\n貼文：{link}", "Group order opened: **{title}**\nPost: {link}"],
  "session.post_title": ["{date} {name}", "{date} {name}"],
  "session.summary_title": ["{name}．點餐彙總", "{name} — order summary"],
  "session.no_orders": ["還沒有人點餐。", "Nobody has ordered yet."],
  "session.field_people": ["每人應付", "Per person"],
  "session.field_items": ["全體清單", "Combined order"],
  "session.added": ["已記下 {summary}，你目前共 {amount}。", "Added {summary}. Your total is now {amount}."],
  "session.unmatched": ["這幾句對不到菜單：{detail}", "I could not match: {detail}"],
  "session.mine_title": ["你的點餐", "Your order"],
  "session.mine_empty": ["你還沒點東西。", "You have not ordered anything yet."],
  "session.cleared": ["已清掉你的 {count} 筆點餐。", "Removed your {count} order lines."],
  "session.locked": ["已封單，不能再加點。", "Orders are now locked."],
  "session.settled": [
    "已結算：{count} 人、合計 {amount}，已記入帳本。",
    "Settled: {count} people, {amount} in total, written to the ledger.",
  ],
  "session.already_settled": [
    "其中 {count} 人先前已入帳，這次沒有重複計。",
    "{count} people were already charged; no double billing.",
  ],
  "session.deadline_auto_locked": [
    "已到截止時間，自動封單。",
    "Deadline reached; orders locked automatically.",
  ],
  "session.button_order": ["點餐", "Order"],
  "session.button_mine": ["我的點餐", "My order"],
  "session.button_clear": ["清除我的", "Clear mine"],
  "session.button_refresh": ["重新整理", "Refresh"],
  "session.button_lock": ["封單", "Lock"],
  "session.button_settle": ["結算", "Settle"],
  "session.pick_placeholder": ["選要點的品項（可複選）", "Pick your items (multiple allowed)"],
  "session.status_open": ["開放中", "open"],
  "session.status_locked": ["已封單", "locked"],
  "session.status_settled": ["已結算", "settled"],
  "session.status_cancelled": ["已取消", "cancelled"],
  "session.host": ["開團者", "Host"],
  "session.menu_posted": ["這場的菜單如下，按「點餐」或直接打字都可以。", "Here is the menu. Press *Order* or just type what you want."],

  "ledger.mine_title": ["你的帳務", "Your ledger"],
  "ledger.all_title": ["伺服器帳務總覽", "Server ledger"],
  "ledger.empty": ["目前沒有任何帳務紀錄。", "No ledger entries yet."],
  "ledger.owe": ["還欠 {amount}", "Owes {amount}"],
  "ledger.credit": ["多付 {amount}", "In credit {amount}"],
  "ledger.clear": ["結清", "Settled up"],
  "ledger.charged": ["累計應付", "Charged"],
  "ledger.paid": ["累計已付", "Paid"],
  "ledger.recorded_payment": [
    "已記下 {name} 付款 {amount}。",
    "Recorded a payment of {amount} from {name}.",
  ],
  "ledger.history_title": ["最近紀錄", "Recent entries"],
  "ledger.kind_charge": ["應付", "charge"],
  "ledger.kind_payment": ["已付", "payment"],
  "ledger.kind_adjustment": ["調整", "adjustment"],
  "ledger.outstanding": ["未結金額合計 {amount}", "Outstanding total {amount}"],

  "setup.done": ["已設定揪團論壇頻道：{channel}", "Group orders will be posted in {channel}."],
  "setup.missing_forum": [
    "還沒設定揪團論壇頻道。請管理員先執行 /設定 論壇。",
    "No forum channel is configured. A server manager should run /setup forum first.",
  ],
  "setup.not_forum": ["{channel} 不是論壇頻道。", "{channel} is not a forum channel."],

  "help.title": ["AIPAR ETA 使用說明", "AIPAR ETA — how to use"],
  "help.body": [
    "**建檔**　`/餐廳 新增` 建立餐廳；`/菜單 上傳` 丟菜單照片辨識，或 `/菜單 輸入` 人工貼上。\n**揪團**　`/揪團` 選餐廳開一則論壇貼文，Bot 會自動貼菜單與彙總。\n**點餐**　在貼文裡按「點餐」用下拉選，或直接打「我要一個雞腿飯加紅茶」。\n**結算**　`/結算` 產生每人應付並寫入帳本；`/帳務 我的` 看自己欠多少。\n\n直接 @ 我也可以用自然語言問「聞香來有什麼」這類問題。",
    "**Set up** `/restaurant add` registers a place; `/menu upload` reads a photo, `/menu input` takes typed text.\n**Group order** `/groupbuy` opens a forum post; the bot posts the menu and keeps the summary updated.\n**Ordering** Press *Order* in the post to pick from a dropdown, or just type “one chicken rice and a tea”.\n**Settling** `/settle` works out who owes what and writes it to the ledger; `/ledger mine` shows your balance.\n\nYou can also mention me and ask in plain language.",
  ],
  "help.footer": [
    "指令會依你的 Discord 語言顯示中文或英文。",
    "Commands follow your Discord language setting.",
  ],
} as const satisfies Record<string, readonly [string, string]>;

export type StringKey = keyof typeof TABLE;

export const STRINGS: Record<StringKey, readonly [string, string]> = TABLE;
