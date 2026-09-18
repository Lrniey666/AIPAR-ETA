// 菜單建檔流程的共用步驟：草稿預覽 → 人工確認 → 上線。
//
// 三個入口（圖片辨識、指令輸入、貼訊息）最後都走同一條路，
// 而且一定要有人按下「確認寫入」才會進資料庫——辨識實驗的結論是自動化不能沒有人工關卡。

import type { ActionRowBuilder, ButtonBuilder, EmbedBuilder } from "discord.js";

import { activate_menu, create_menu_version, delete_menu, get_menu, list_menu_items } from "../db/menus.ts";
import type { Db } from "../db/pool.ts";
import { get_restaurant } from "../db/restaurants.ts";
import type { DraftItem, MenuSource } from "../db/types.ts";
import type { ReconcileReport } from "../domain/menu_reconcile.ts";
import { link_upload_to_menu } from "../db/observability.ts";
import { draft_rows } from "./components.ts";
import { draft_embed } from "./embeds.ts";
import { t, type Locale } from "./i18n.ts";

export type DraftPresentation = {
  menu_id: number;
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
};

export type DraftInput = {
  restaurant_id: number;
  restaurant_name: string;
  items: DraftItem[];
  source: MenuSource;
  source_note: string;
  created_by: string;
  locale: Locale;
  upload_id?: number;
  /** OCR 對帳結果；有的話草稿預覽會標出沒核對上的品項。 */
  report?: ReconcileReport;
};

/** 建立草稿版本並產生預覽。草稿此時已在資料庫，但 status 還是 draft。 */
export async function present_draft(pool: Db, input: DraftInput): Promise<DraftPresentation> {
  const menu = await create_menu_version(pool, {
    restaurant_id: input.restaurant_id,
    source: input.source,
    items: input.items,
    note: input.source_note,
    created_by: input.created_by,
    status: "draft",
  });

  if (input.upload_id !== undefined) {
    await link_upload_to_menu(pool, input.upload_id, menu.id, "parsed");
  }

  return {
    menu_id: menu.id,
    embed: draft_embed(
      input.restaurant_name,
      input.items,
      input.locale,
      input.source_note,
      input.report,
    ),
    components: draft_rows(menu.id, input.locale),
  };
}

/** 按下「確認寫入」：草稿上線，同餐廳舊版自動封存。 */
export async function confirm_draft(
  pool: Db,
  menu_id: number,
  locale: Locale,
): Promise<{ text: string; menu_id: number } | undefined> {
  const menu = await activate_menu(pool, menu_id);
  if (!menu) {
    return undefined;
  }
  const restaurant = await get_restaurant(pool, menu.restaurant_id);
  const items = await list_menu_items(pool, menu.id);
  return {
    menu_id: menu.id,
    text: t(locale, "menu.draft_saved", {
      name: restaurant?.name ?? String(menu.restaurant_id),
      version: menu.version,
      count: items.length,
    }),
  };
}

/** 按下「取消」：只刪得掉還是草稿的版本，已上線的不會被誤刪。 */
export async function cancel_draft(pool: Db, menu_id: number): Promise<void> {
  const menu = await get_menu(pool, menu_id);
  if (menu?.status === "draft") {
    await delete_menu(pool, menu_id);
  }
}

/** 略過的行數提示；只秀前三行，避免洗版。 */
export function skipped_note(skipped: string[], locale: Locale): string | undefined {
  if (skipped.length === 0) {
    return undefined;
  }
  return t(locale, "menu.draft_skipped", {
    count: skipped.length,
    sample: skipped.slice(0, 3).join(" / ").slice(0, 200),
  });
}
