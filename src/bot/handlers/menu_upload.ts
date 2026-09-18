// /菜單 上傳：菜單照片 → OCR 版面分析 → 視覺模型 → 草稿 → 人工確認。
//
// 為什麼多一道 OCR：直書菜單（由上而下、由右至左）與躺著拍的照片，
// 視覺模型會把同一欄的字拆散、或把相鄰兩欄的品名與價格配錯對。
// OCR 給得出每個文字框的座標，「哪些字同一欄、欄的順序」因此算得出來；
// 排好順序的文字附在提示詞裡當對照，模型就不必自己猜版面。
//
// OCR 之後還會回頭對帳（`domain/menu_reconcile.ts`）：草稿上有、但圖上找不到的
// 品名或價格會被標出來，讓按下「確認寫入」的人知道該盯哪幾行。
// 沒設定 OCR 服務時整段跳過，流程和 0.2.x 完全相同。

import type { ChatInputCommandInteraction } from "discord.js";

import { record_menu_upload } from "../../db/observability.ts";
import type { Restaurant } from "../../db/types.ts";
import { reconcile_menu, reconcile_summary_en, reconcile_summary_zh } from "../../domain/menu_reconcile.ts";
import { detect_orientation, ocr_text_block, type OcrLine } from "../../domain/ocr_layout.ts";
import { extract_menu_from_image, fetch_image_as_data_url } from "../../llm/tasks/menu_extract.ts";
import { create_logger } from "../../shared/logger.ts";
import type { BotContext } from "../context.ts";
import { notice_embed } from "../embeds.ts";
import { t, type Locale } from "../i18n.ts";
import { present_draft } from "../menu_flow.ts";
import { locale_of, reply_error, resolve_restaurant, respond } from "../reply.ts";

const log = create_logger("menu-upload");

export async function upload_menu(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const locale = locale_of(interaction);
  const raw = interaction.options.getString("restaurant", true);
  const attachment = interaction.options.getAttachment("image", true);

  const restaurant = await resolve_restaurant(ctx.pool, raw);
  if (!restaurant) {
    await reply_error(interaction, t(locale, "error.restaurant_missing", { name: raw }));
    return;
  }
  if (!ctx.gateway.has_vision()) {
    await reply_error(interaction, t(locale, "error.vision_unavailable"));
    return;
  }

  // 辨識要好幾秒，先 defer 佔住互動，這就是斜線指令版的 ack。
  await interaction.deferReply();
  await interaction.editReply({ embeds: [notice_embed(t(locale, "menu.reading_image"))] });

  try {
    await read_and_present(ctx, interaction, restaurant, attachment.url, locale);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await record_menu_upload(ctx.pool, {
      restaurant_id: restaurant.id,
      source_url: attachment.url,
      status: "failed",
      error: detail,
      created_by: interaction.user.id,
    });
    await reply_error(interaction, t(locale, "error.parse_failed", { detail: detail.slice(0, 200) }));
  }
}

async function read_and_present(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
  restaurant: Restaurant,
  image_url: string,
  locale: Locale,
): Promise<void> {
  // 圖片只下載一次，OCR 與視覺模型共用同一份 data URL。
  const data_url = await fetch_image_as_data_url(image_url);
  const lines = await run_ocr(ctx, data_url);
  const orientation = lines.length > 0 ? detect_orientation(lines) : undefined;
  const ocr_text = lines.length > 0 ? ocr_text_block(lines, { min_score: ctx.ocr.min_score, orientation }) : "";

  const extraction = await extract_menu_from_image(ctx.gateway, data_url, { ocr_text, orientation });

  const report =
    lines.length > 0
      ? reconcile_menu(extraction.items, lines, { min_score: ctx.ocr.min_score, orientation })
      : undefined;

  const model_note = t(locale, "menu.source_vision", {
    model: `${extraction.provider}/${extraction.model}`,
  });
  const source_note = report
    ? `${model_note} · ${locale === "zh-TW" ? reconcile_summary_zh(report) : reconcile_summary_en(report)}`
    : `${model_note} · ${t(locale, "menu.ocr_skipped")}`;

  const upload_id = await record_menu_upload(ctx.pool, {
    restaurant_id: restaurant.id,
    source_url: image_url,
    provider: extraction.provider,
    model: extraction.model,
    status: "parsed",
    // 原始回應要留得住「模型當時到底看到什麼」，對帳結果一起留才追得出誰錯。
    raw_response: {
      title: extraction.title,
      notes: extraction.notes,
      items: extraction.items,
      ocr: report
        ? {
            orientation: report.orientation,
            line_count: report.line_count,
            verified: report.verified_count,
            flagged: report.flagged_count,
            missing_hints: report.missing_hints,
          }
        : null,
    },
    created_by: interaction.user.id,
  });

  const draft = await present_draft(ctx.pool, {
    restaurant_id: restaurant.id,
    restaurant_name: restaurant.name,
    items: extraction.items,
    source: "vision",
    source_note,
    created_by: interaction.user.id,
    locale,
    upload_id,
    report,
  });

  const warnings: string[] = [];
  if (report && report.flagged_count > 0) {
    warnings.push(t(locale, "menu.ocr_flagged", { count: report.flagged_count }));
  }
  if (report && report.missing_hints.length > 0) {
    warnings.push(t(locale, "menu.ocr_missing", { sample: report.missing_hints.join("、") }));
  }

  await respond(interaction, {
    content: warnings.join("\n") || undefined,
    embeds: [draft.embed],
    components: draft.components,
  });
}

/**
 * 跑 OCR。失敗只記錄不拋出——OCR 是對帳用的加分項，
 * 掛掉時應該退回純視覺流程，而不是讓整支 `/菜單 上傳` 失敗。
 */
async function run_ocr(ctx: BotContext, data_url: string): Promise<OcrLine[]> {
  if (!ctx.ocr.available()) {
    return [];
  }
  try {
    return (await ctx.ocr.recognise(data_url)).lines;
  } catch (error) {
    log.warn("OCR 辨識失敗，改用純視覺流程", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
