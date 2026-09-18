// 帳務相關的 Embed：個人結餘、伺服器總覽、以及「誰欠誰」。
//
// 結餘與債務是兩件不同的事，Embed 也刻意分開講：
//   結餘  這個人吃了多少、付了多少（`ledger_entries` 的加總）
//   債務  這個人該把錢拿給誰（有指定對象的那些紀錄，見 `domain/debts.ts`）
// 只有結餘的時候，使用者知道自己欠 250 卻不知道要給誰——這次補的就是後者。

import { EmbedBuilder } from "discord.js";

import type { DebtEdge, LedgerBalance, LedgerEntry } from "../db/types.ts";
import { format_cents } from "../shared/money.ts";
import { format_datetime } from "../shared/time.ts";
import { brand_author, brand_footer, COLOUR } from "./branding.ts";
import { truncate_field } from "./embeds.ts";
import { t, type Locale } from "./i18n.ts";

const KIND_KEY = {
  charge: "ledger.kind_charge",
  payment: "ledger.kind_payment",
  adjustment: "ledger.kind_adjustment",
} as const;

export function balance_state(balance: LedgerBalance, locale: Locale): string {
  if (balance.balance_cents < 0) {
    return t(locale, "ledger.owe", { amount: format_cents(-balance.balance_cents) });
  }
  if (balance.balance_cents > 0) {
    return t(locale, "ledger.credit", { amount: format_cents(balance.balance_cents) });
  }
  return t(locale, "ledger.clear");
}

export function balance_embed(
  balances: LedgerBalance[],
  entries: LedgerEntry[] | undefined,
  title: string,
  locale: Locale,
): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(COLOUR.info).setAuthor(brand_author(title));

  if (balances.length === 0) {
    return embed.setDescription(t(locale, "ledger.empty"));
  }

  embed.setDescription(
    truncate_field(
      balances
        .map((balance) => `<@${balance.discord_user_id}> — ${balance_state(balance, locale)}`)
        .join("\n"),
      4000,
    ),
  );

  if (entries && entries.length > 0) {
    embed.addFields({
      name: t(locale, "ledger.history_title"),
      value: truncate_field(
        entries
          .slice(0, 10)
          .map((entry) => {
            const kind = t(locale, KIND_KEY[entry.kind]);
            const target = entry.counterparty_user_id ? ` → <@${entry.counterparty_user_id}>` : "";
            const note = entry.note ? ` · ${entry.note}` : "";
            return `\`${format_datetime(entry.created_at)}\` ${kind} ${format_cents(entry.amount_cents)}${target}${note}`;
          })
          .join("\n"),
      ),
    });
  }
  return embed;
}

/** 某個人的兩邊：要付出去的、以及別人該還他的。附在 `/帳務 我的` 後面。 */
export function personal_debts_field(
  owes: DebtEdge[],
  owed: DebtEdge[],
  locale: Locale,
): { name: string; value: string } {
  const lines = [
    ...owes.map((edge) =>
      t(locale, "ledger.owe_to", { user: edge.to_user_id, amount: format_cents(edge.amount_cents) }),
    ),
    ...owed.map((edge) =>
      t(locale, "ledger.owed_by", { user: edge.from_user_id, amount: format_cents(edge.amount_cents) }),
    ),
  ];
  return {
    name: t(locale, "ledger.debts_title"),
    value: truncate_field(lines.join("\n") || t(locale, "ledger.no_debts")),
  };
}

/**
 * 「誰欠誰」：上半是互相抵銷後的實際欠款，下半是壓到最少筆數的轉帳建議。
 * 兩個都給，是因為前者是事實、後者是建議——把建議當成事實會讓人對不上帳。
 */
export function debts_embed(
  netted: DebtEdge[],
  simplified: DebtEdge[],
  locale: Locale,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLOUR.info)
    .setAuthor(brand_author(t(locale, "ledger.who_title")));

  if (netted.length === 0) {
    return embed.setDescription(t(locale, "ledger.no_debts"));
  }

  embed.setDescription(truncate_field(netted.map(format_edge).join("\n"), 4000));

  // 抵銷後和建議一模一樣時就不用多貼一次。
  if (simplified.length > 0 && !same_edges(netted, simplified)) {
    embed.addFields({
      name: t(locale, "ledger.simplified_title"),
      value: truncate_field(simplified.map(format_edge).join("\n")),
    });
    embed.setFooter(brand_footer(t(locale, "ledger.simplified_hint")));
  }
  return embed;
}

function format_edge(edge: DebtEdge): string {
  return `<@${edge.from_user_id}> → <@${edge.to_user_id}>　**${format_cents(edge.amount_cents)}**`;
}

function same_edges(left: DebtEdge[], right: DebtEdge[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const key = (edge: DebtEdge) => `${edge.from_user_id}>${edge.to_user_id}:${edge.amount_cents}`;
  const set = new Set(left.map(key));
  return right.every((edge) => set.has(key(edge)));
}
