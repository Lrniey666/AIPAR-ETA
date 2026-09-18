// 斜線指令總表。
//
// 命名規則（PLAN §Discord bot互動設計）：
//   預設名稱用英文（≤10 字母、小寫），繁簡中文都掛同一份繁體名稱，
//   說明也同步提供 description_localizations。
// 指令長度刻意壓短，指令列才不會被截斷。
//
// 各指令的實際定義分在 catalogue.ts（建檔類）與 ordering.ts（使用類）。

import { menu_command, restaurant_command } from "./catalogue.ts";
import { memory_command } from "./memory.ts";
import type { Definition } from "./options.ts";
import {
  groupbuy_command,
  help_command,
  ledger_command,
  settle_command,
  setup_command,
  website_command,
} from "./ordering.ts";

export type { Definition } from "./options.ts";

export const COMMAND_DEFINITIONS: Definition[] = [
  restaurant_command,
  menu_command,
  groupbuy_command,
  settle_command,
  ledger_command,
  memory_command,
  help_command,
  website_command,
  setup_command,
];

/** 說明文與自然語言回覆引用指令名稱時，都從這裡取，避免各處寫死。 */
export const COMMAND_NAMES = {
  "zh-TW": ["/餐廳", "/菜單", "/揪團", "/結算", "/帳務", "/記憶", "/說明", "/網站", "/設定"],
  "en-GB": [
    "/restaurant",
    "/menu",
    "/groupbuy",
    "/settle",
    "/ledger",
    "/memory",
    "/help",
    "/website",
    "/setup",
  ],
} as const;
