// `/說明` 與 `/網站` 的 Embed。
//
// 舊版的說明是一整塊 description，四行擠在一起、看起來像沒人整理過的預設值。
// 改成五個編號欄位，照「建檔 → 揪團 → 結算 → 對話 → 管理」的順序排，
// 每一段都給得出下一步該做什麼；標誌與網站連結也在這裡掛上。

import { EmbedBuilder, type ActionRowBuilder, type ButtonBuilder } from "discord.js";

import { branding, brand_author, brand_footer, COLOUR } from "./branding.ts";
import { link_row } from "./components.ts";
import { t, type Locale } from "./i18n.ts";

const HELP_FIELDS = [
  ["help.field_setup", "help.field_setup_body"],
  ["help.field_order", "help.field_order_body"],
  ["help.field_money", "help.field_money_body"],
  ["help.field_chat", "help.field_chat_body"],
  ["help.field_admin", "help.field_admin_body"],
] as const;

export function help_embed(locale: Locale): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLOUR.primary)
    .setAuthor(brand_author(t(locale, "help.title")))
    .setDescription(t(locale, "help.body"))
    .setFooter(brand_footer(t(locale, "help.footer")));

  const { icon_url } = branding();
  if (icon_url) {
    embed.setThumbnail(icon_url);
  }

  for (const [name_key, body_key] of HELP_FIELDS) {
    embed.addFields({ name: t(locale, name_key), value: t(locale, body_key) });
  }
  return embed;
}

export function website_embed(locale: Locale, url: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLOUR.info)
    .setAuthor(brand_author(t(locale, "website.title")))
    .setDescription(`${t(locale, "website.body")}\n\n${url}`);

  const { icon_url } = branding();
  if (icon_url) {
    embed.setThumbnail(icon_url);
  }
  return embed;
}

/** 有設定網站位址才給連結按鈕；沒有就不要放一顆連不到的鈕。 */
export function website_rows(locale: Locale): ActionRowBuilder<ButtonBuilder>[] {
  const { site_url } = branding();
  return site_url ? [link_row(site_url, t(locale, "common.website"))] : [];
}
