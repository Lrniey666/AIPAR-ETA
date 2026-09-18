// 按鈕與下拉的互動總路由。custom id 格式見 `components.ts`。
// 揪團的動作在 `session_components.ts`，菜單與餐廳的在 `menu_components.ts`。

import type { MessageComponentInteraction } from "discord.js";

import { decode_id } from "../components.ts";
import type { BotContext } from "../context.ts";
import { locale_of } from "../reply.ts";
import {
  handle_draft_component,
  handle_menu_component,
  handle_restaurant_component,
} from "./menu_components.ts";
import { handle_session_component } from "./session_components.ts";

export async function handle_component(
  ctx: BotContext,
  interaction: MessageComponentInteraction,
): Promise<void> {
  const { scope, action, args } = decode_id(interaction.customId);
  const locale = locale_of(interaction);

  // 停用的翻頁指示鈕按不動，但 Discord 仍要一個回應。
  if (action === "noop") {
    await interaction.deferUpdate();
    return;
  }

  switch (scope) {
    case "session":
      await handle_session_component(ctx, interaction, action, args, locale);
      return;
    case "draft":
      await handle_draft_component(ctx, interaction, action, args, locale);
      return;
    case "menu":
      await handle_menu_component(ctx, interaction, action, args, locale);
      return;
    case "restaurant":
      await handle_restaurant_component(ctx, interaction, locale);
      return;
    default:
      await interaction.deferUpdate();
  }
}
