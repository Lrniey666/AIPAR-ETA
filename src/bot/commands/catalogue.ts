// 建檔類指令：/restaurant（餐廳）與 /menu（菜單）。

import { SlashCommandBuilder } from "discord.js";

import { zh_localizations } from "../i18n.ts";
import { restaurant_option } from "./options.ts";

export const restaurant_command = new SlashCommandBuilder()
  .setName("restaurant")
  .setNameLocalizations(zh_localizations("餐廳"))
  .setDescription("Manage restaurants on file")
  .setDescriptionLocalizations(zh_localizations("管理餐廳資料"))
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setNameLocalizations(zh_localizations("新增"))
      .setDescription("Register a restaurant")
      .setDescriptionLocalizations(zh_localizations("建立一間餐廳"))
      .addStringOption((option) =>
        option
          .setName("name")
          .setNameLocalizations(zh_localizations("名稱"))
          .setDescription("Restaurant name")
          .setDescriptionLocalizations(zh_localizations("餐廳名稱"))
          .setRequired(true)
          .setMaxLength(60),
      )
      .addStringOption((option) =>
        option
          .setName("alias")
          .setNameLocalizations(zh_localizations("別名"))
          .setDescription("Other names, separated by commas")
          .setDescriptionLocalizations(zh_localizations("其他稱呼，用逗號分隔"))
          .setMaxLength(120),
      )
      .addStringOption((option) =>
        option
          .setName("phone")
          .setNameLocalizations(zh_localizations("電話"))
          .setDescription("Telephone number")
          .setDescriptionLocalizations(zh_localizations("訂餐電話"))
          .setMaxLength(40),
      )
      .addStringOption((option) =>
        option
          .setName("address")
          .setNameLocalizations(zh_localizations("地址"))
          .setDescription("Address")
          .setDescriptionLocalizations(zh_localizations("地址"))
          .setMaxLength(120),
      )
      .addStringOption((option) =>
        option
          .setName("note")
          .setNameLocalizations(zh_localizations("備註"))
          .setDescription("Anything worth remembering")
          .setDescriptionLocalizations(zh_localizations("備註"))
          .setMaxLength(200),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setNameLocalizations(zh_localizations("清單"))
      .setDescription("List restaurants")
      .setDescriptionLocalizations(zh_localizations("列出餐廳"))
      .addStringOption((option) =>
        option
          .setName("keyword")
          .setNameLocalizations(zh_localizations("關鍵字"))
          .setDescription("Filter by keyword")
          .setDescriptionLocalizations(zh_localizations("用關鍵字過濾"))
          .setMaxLength(40),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("info")
      .setNameLocalizations(zh_localizations("資訊"))
      .setDescription("Show one restaurant")
      .setDescriptionLocalizations(zh_localizations("顯示單一餐廳"))
      .addStringOption(restaurant_option(true)),
  );

export const menu_command = new SlashCommandBuilder()
  .setName("menu")
  .setNameLocalizations(zh_localizations("菜單"))
  .setDescription("Look up and maintain menus")
  .setDescriptionLocalizations(zh_localizations("查詢與維護菜單"))
  .addSubcommand((sub) =>
    sub
      .setName("show")
      .setNameLocalizations(zh_localizations("查看"))
      .setDescription("Show a restaurant menu")
      .setDescriptionLocalizations(zh_localizations("顯示某間餐廳的菜單"))
      .addStringOption(restaurant_option(false)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("upload")
      .setNameLocalizations(zh_localizations("上傳"))
      .setDescription("Read a menu from a photo")
      .setDescriptionLocalizations(zh_localizations("上傳菜單照片辨識"))
      .addStringOption(restaurant_option(true))
      .addAttachmentOption((option) =>
        option
          .setName("image")
          .setNameLocalizations(zh_localizations("圖片"))
          .setDescription("Menu photo or screenshot")
          .setDescriptionLocalizations(zh_localizations("菜單照片或截圖"))
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("input")
      .setNameLocalizations(zh_localizations("輸入"))
      .setDescription("Type a menu in by hand")
      .setDescriptionLocalizations(zh_localizations("人工輸入菜單"))
      .addStringOption(restaurant_option(true))
      .addStringOption((option) =>
        option
          .setName("text")
          .setNameLocalizations(zh_localizations("內容"))
          .setDescription("Items separated by ; for example: rice 90; tea 20")
          .setDescriptionLocalizations(zh_localizations("用分號分隔，例如：雞腿飯 90；紅茶 20"))
          .setMaxLength(1500),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("version")
      .setNameLocalizations(zh_localizations("版本"))
      .setDescription("List menu versions and switch between them")
      .setDescriptionLocalizations(zh_localizations("列出菜單版本並切換"))
      .addStringOption(restaurant_option(true)),
  );
