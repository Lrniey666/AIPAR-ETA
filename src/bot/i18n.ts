// 語言選擇與字串取用。
// 規則（PLAN §Discord bot互動設計）：Discord 語言為中文（繁／簡）一律顯示繁體中文，
// 其餘一律英文，且英文採英式拼法。

import { STRINGS, type StringKey } from "./strings.ts";

export type Locale = "zh-TW" | "en-GB";

/** Discord 送來的 locale 代碼 → 本系統的兩種語言。 */
export function pick_locale(discord_locale: string | null | undefined): Locale {
  return (discord_locale ?? "").toLowerCase().startsWith("zh") ? "zh-TW" : "en-GB";
}

/** 取字串並替換 {參數}。缺參數時原樣保留，方便一眼看出是哪個沒帶到。 */
export function t(locale: Locale, key: StringKey, params: Record<string, string | number> = {}): string {
  const entry = STRINGS[key];
  const template = locale === "zh-TW" ? entry[0] : entry[1];
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * 指令名稱／說明的在地化對照表。
 * 繁簡兩種中文都指到同一份繁體字串；其餘語言用預設（英文）。
 */
export function zh_localizations(value: string): Record<string, string> {
  return { "zh-TW": value, "zh-CN": value };
}
