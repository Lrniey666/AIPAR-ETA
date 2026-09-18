// 指令選項的共用型別與建構子。
// 拆出來是因為「餐廳」這個選項在多支指令裡重複出現，而且一律要開自動完成。

import type {
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandStringOption,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";

import { zh_localizations } from "../i18n.ts";

export type Definition =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder;

/** 餐廳名稱選項：一律開自動完成，使用者不用記完整店名。 */
export function restaurant_option(required: boolean) {
  return (option: SlashCommandStringOption) =>
    option
      .setName("restaurant")
      .setNameLocalizations(zh_localizations("餐廳"))
      .setDescription("Restaurant name")
      .setDescriptionLocalizations(zh_localizations("餐廳名稱"))
      .setAutocomplete(true)
      .setRequired(required);
}
