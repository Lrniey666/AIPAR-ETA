// Embed 產生器。所有面向使用者的結構化回覆都從這裡出去，版面才會一致。
// 帳務與債務的 Embed 在 `embeds_ledger.ts`，說明與網站在 `embeds_help.ts`。

import { EmbedBuilder } from "discord.js";

import { format_cents } from "../shared/money.ts";
import { discord_timestamp, format_datetime, is_past } from "../shared/time.ts";
import type { DraftItem, Menu, MenuItem, OrderSession, Restaurant, SessionStatus } from "../db/types.ts";
import type { ReconcileReport } from "../domain/menu_reconcile.ts";
import type { OrderSummary } from "../domain/ordering.ts";
import { brand_author, brand_footer, COLOUR } from "./branding.ts";
import { t, type Locale } from "./i18n.ts";

export { COLOUR } from "./branding.ts";

export const MENU_PAGE_SIZE = 20;

const STATUS_KEY = {
  open: "session.status_open",
  locked: "session.status_locked",
  settled: "session.status_settled",
  cancelled: "session.status_cancelled",
} as const;

/** 對帳結果的標記。看得懂就好，不要讓人去猜顏色代表什麼。 */
const VERDICT_MARK = {
  verified: "",
  "price-unverified": "⚠️ ",
  "name-unverified": "❓ ",
} as const;

export function status_label(status: SessionStatus, locale: Locale): string {
  return t(locale, STATUS_KEY[status]);
}

export function error_embed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(COLOUR.danger).setDescription(`⚠️ ${message}`);
}

export function notice_embed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(COLOUR.info).setDescription(message);
}

export function restaurant_list_embed(restaurants: Restaurant[], locale: Locale): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLOUR.primary)
    .setAuthor(brand_author(t(locale, "restaurant.list_title")));

  if (restaurants.length === 0) {
    return embed.setDescription(t(locale, "restaurant.list_empty"));
  }

  return embed.setDescription(
    restaurants
      .map((restaurant) => {
        const alias = restaurant.aliases.length > 0 ? `（${restaurant.aliases.join("、")}）` : "";
        return `• **${restaurant.name}**${alias}`;
      })
      .join("\n"),
  );
}

export function restaurant_embed(
  restaurant: Restaurant,
  menu: Menu | undefined,
  item_count: number,
  locale: Locale,
): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(COLOUR.primary).setTitle(restaurant.name);
  if (restaurant.note) {
    embed.setDescription(restaurant.note);
  }
  if (restaurant.aliases.length > 0) {
    embed.addFields({
      name: t(locale, "restaurant.field_alias"),
      value: restaurant.aliases.join("、"),
      inline: true,
    });
  }
  if (restaurant.phone) {
    embed.addFields({ name: t(locale, "restaurant.field_phone"), value: restaurant.phone, inline: true });
  }
  if (restaurant.address) {
    embed.addFields({ name: t(locale, "restaurant.field_address"), value: restaurant.address });
  }
  embed.addFields({
    name: t(locale, "restaurant.field_menu"),
    value: menu
      ? t(locale, "restaurant.menu_state", { version: menu.version, count: item_count })
      : t(locale, "common.none"),
  });
  return embed;
}

/** 菜單。品項多時分頁，一頁 20 項。 */
export function menu_embed(
  restaurant: Restaurant,
  menu: Menu,
  items: MenuItem[],
  locale: Locale,
  page = 0,
): { embed: EmbedBuilder; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / MENU_PAGE_SIZE));
  const current = Math.min(Math.max(page, 0), pages - 1);
  const slice = items.slice(current * MENU_PAGE_SIZE, (current + 1) * MENU_PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setColor(COLOUR.primary)
    .setAuthor(brand_author(t(locale, "menu.title", { name: restaurant.name, version: menu.version })));

  if (slice.length === 0) {
    embed.setDescription(t(locale, "menu.empty"));
    return { embed, pages };
  }

  embed.setDescription(group_items(slice.map(to_draft)));
  embed.setFooter(
    brand_footer(
      pages > 1
        ? `${t(locale, "common.page", { page: current + 1, pages })} · ${item_count_text(items.length, locale)}`
        : item_count_text(items.length, locale),
    ),
  );
  return { embed, pages };
}

/**
 * 尚未寫入資料庫的草稿預覽。
 * 有 OCR 對帳結果時，沒核對上的品項會標 ⚠️ 或 ❓——
 * 人工關卡的重點就是讓人知道該盯哪幾行，而不是把整份重看一次。
 */
export function draft_embed(
  restaurant_name: string,
  items: DraftItem[],
  locale: Locale,
  source_note: string,
  report?: ReconcileReport,
): EmbedBuilder {
  const preview = items.slice(0, 40);
  const omitted = items.length - preview.length;
  const mark = report
    ? (_item: DraftItem, index: number) => VERDICT_MARK[report.items[index]?.verdict ?? "verified"]
    : undefined;

  return new EmbedBuilder()
    .setColor(COLOUR.warn)
    .setAuthor(brand_author(restaurant_name))
    .setDescription(
      `${t(locale, "menu.draft_preview", { count: items.length })}\n\n${group_items(preview, mark)}${
        omitted > 0 ? `\n…（+${omitted}）` : ""
      }`,
    )
    .setFooter(brand_footer(source_note));
}

export function session_embed(
  session: OrderSession,
  restaurant: Restaurant,
  summary: OrderSummary,
  locale: Locale,
): EmbedBuilder {
  const open = session.status === "open";
  const embed = new EmbedBuilder()
    .setColor(open ? COLOUR.primary : COLOUR.info)
    .setAuthor(brand_author(t(locale, "session.summary_title", { name: restaurant.name })))
    .setFooter(brand_footer(t(locale, "common.updated", { time: format_datetime() })));

  const header = [
    `${status_label(session.status, locale)} · ${t(locale, "session.host")}：<@${session.host_user_id}>`,
  ];
  if (session.payer_user_id && session.payer_user_id !== session.host_user_id) {
    header.push(`${t(locale, "session.field_payer")}：<@${session.payer_user_id}>`);
  }
  header.push(`${t(locale, "common.deadline")}：${deadline_text(session, locale)}`);
  embed.setDescription(header.join("\n"));

  if (summary.people.length === 0) {
    embed.addFields({ name: t(locale, "session.field_items"), value: t(locale, "session.no_orders") });
    return embed;
  }

  embed.addFields(
    {
      name: t(locale, "session.field_items"),
      value: truncate_field(
        summary.items
          .map((item) => `${item.item_name}${item.note ? `（${item.note}）` : ""} × ${item.quantity}`)
          .join("\n"),
      ),
    },
    {
      name: t(locale, "session.field_people"),
      value: truncate_field(
        summary.people
          .map((person) => `<@${person.discord_user_id}> ${format_cents(person.total_cents)}`)
          .join("\n"),
      ),
    },
    {
      name: t(locale, "common.total"),
      value:
        `${format_cents(summary.total_cents)} · ` +
        `${t(locale, "common.headcount")} ${summary.headcount} · ` +
        `${t(locale, "common.quantity")} ${summary.total_quantity}`,
    },
  );
  return embed;
}

/**
 * 截止時間的顯示。
 * 只有還開著、而且時間還沒到，才給會自己倒數的相對時間戳記；
 * 已封單或已過時間就寫死「截止」——倒數字樣會讓人以為還能點，
 * 而且每個用戶端都在幫一個早就結束的時間算差值。
 */
function deadline_text(session: OrderSession, locale: Locale): string {
  if (!session.deadline_at) {
    return session.status === "open" ? t(locale, "common.none") : t(locale, "common.closed");
  }
  const counting = session.status === "open" && !is_past(session.deadline_at);
  return counting
    ? discord_timestamp(session.deadline_at, "R")
    : `${t(locale, "common.closed")}（${format_datetime(session.deadline_at)}）`;
}

function to_draft(item: MenuItem): DraftItem {
  return {
    category: item.category,
    name: item.is_available ? item.name : `~~${item.name}~~`,
    price_cents: item.price_cents,
    unit: item.unit,
    note: item.note,
  };
}

/** 依分類分組列出，沒有分類的擺最後。 */
function group_items(
  items: DraftItem[],
  mark?: (item: DraftItem, index: number) => string,
): string {
  const groups = new Map<string, Array<{ item: DraftItem; index: number }>>();
  for (const [index, item] of items.entries()) {
    const bucket = groups.get(item.category) ?? [];
    bucket.push({ item, index });
    groups.set(item.category, bucket);
  }

  const blocks: string[] = [];
  for (const [category, bucket] of groups) {
    const lines = bucket.map(({ item, index }) => {
      const unit = item.unit ? `／${item.unit}` : "";
      const note = item.note ? `　*${item.note}*` : "";
      return `• ${mark?.(item, index) ?? ""}${item.name} — ${format_cents(item.price_cents)}${unit}${note}`;
    });
    blocks.push(category ? `**${category}**\n${lines.join("\n")}` : lines.join("\n"));
  }
  return truncate_field(blocks.join("\n\n"), 4000);
}

function item_count_text(count: number, locale: Locale): string {
  return locale === "zh-TW" ? `共 ${count} 項` : `${count} items`;
}

/** Embed 欄位上限 1024 字元、描述 4096；超過就截斷並標示。 */
export function truncate_field(value: string, max = 1024): string {
  if (!value) {
    return "—";
  }
  return value.length > max ? `${value.slice(0, max - 2)}…` : value;
}
