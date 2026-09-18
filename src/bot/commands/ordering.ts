// 使用類指令：/groupbuy（揪團）、/order（點餐）、/settle（結算）、
// /ledger（帳務）、/help（說明）、/setup（設定）。

import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

import { zh_localizations } from "../i18n.ts";
import { restaurant_option } from "./options.ts";

export const groupbuy_command = new SlashCommandBuilder()
  .setName("groupbuy")
  .setNameLocalizations(zh_localizations("揪團"))
  .setDescription("Open a group order post")
  .setDescriptionLocalizations(zh_localizations("開一場揪團點餐"))
  .addStringOption(restaurant_option(true))
  .addStringOption((option) =>
    option
      .setName("deadline")
      .setNameLocalizations(zh_localizations("截止"))
      .setDescription("Time from now, for example 30m or 1h30m")
      .setDescriptionLocalizations(zh_localizations("距現在多久，例如 30m 或 1h30m"))
      .setMaxLength(10),
  )
  .addStringOption((option) =>
    option
      .setName("title")
      .setNameLocalizations(zh_localizations("標題"))
      .setDescription("Post title")
      .setDescriptionLocalizations(zh_localizations("貼文標題"))
      .setMaxLength(80),
  );

export const order_command = new SlashCommandBuilder()
  .setName("order")
  .setNameLocalizations(zh_localizations("點餐"))
  .setDescription("Add to your order in this post")
  .setDescriptionLocalizations(zh_localizations("在這場揪團裡點餐"))
  .addStringOption((option) =>
    option
      .setName("text")
      .setNameLocalizations(zh_localizations("內容"))
      .setDescription("Say it plainly, for example: one chicken rice and a tea")
      .setDescriptionLocalizations(zh_localizations("直接說，例如：一個雞腿飯加紅茶"))
      .setMaxLength(200),
  );

export const settle_command = new SlashCommandBuilder()
  .setName("settle")
  .setNameLocalizations(zh_localizations("結算"))
  .setDescription("Work out who owes what and write it to the ledger")
  .setDescriptionLocalizations(zh_localizations("結算每人應付並寫入帳本"));

export const ledger_command = new SlashCommandBuilder()
  .setName("ledger")
  .setNameLocalizations(zh_localizations("帳務"))
  .setDescription("Spending history and balances")
  .setDescriptionLocalizations(zh_localizations("消費紀錄與分攤結算"))
  .addSubcommand((sub) =>
    sub
      .setName("mine")
      .setNameLocalizations(zh_localizations("我的"))
      .setDescription("Your own balance and recent entries")
      .setDescriptionLocalizations(zh_localizations("你的結餘與最近紀錄")),
  )
  .addSubcommand((sub) =>
    sub
      .setName("all")
      .setNameLocalizations(zh_localizations("總覽"))
      .setDescription("Everyone's balance in this server")
      .setDescriptionLocalizations(zh_localizations("全伺服器的結餘")),
  )
  .addSubcommand((sub) =>
    sub
      .setName("pay")
      .setNameLocalizations(zh_localizations("付款"))
      .setDescription("Record a payment")
      .setDescriptionLocalizations(zh_localizations("記錄一筆付款"))
      .addNumberOption((option) =>
        option
          .setName("amount")
          .setNameLocalizations(zh_localizations("金額"))
          .setDescription("Amount in NT dollars")
          .setDescriptionLocalizations(zh_localizations("新台幣金額"))
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(100000),
      )
      .addUserOption((option) =>
        option
          .setName("user")
          .setNameLocalizations(zh_localizations("對象"))
          .setDescription("Whose payment this is; defaults to you")
          .setDescriptionLocalizations(zh_localizations("誰付的，預設是你自己")),
      )
      .addStringOption((option) =>
        option
          .setName("note")
          .setNameLocalizations(zh_localizations("備註"))
          .setDescription("Note")
          .setDescriptionLocalizations(zh_localizations("備註"))
          .setMaxLength(100),
      ),
  );

export const help_command = new SlashCommandBuilder()
  .setName("help")
  .setNameLocalizations(zh_localizations("說明"))
  .setDescription("How to use this bot")
  .setDescriptionLocalizations(zh_localizations("怎麼使用這個機器人"));

export const setup_command = new SlashCommandBuilder()
  .setName("setup")
  .setNameLocalizations(zh_localizations("設定"))
  .setDescription("Server settings")
  .setDescriptionLocalizations(zh_localizations("伺服器設定"))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("forum")
      .setNameLocalizations(zh_localizations("論壇"))
      .setDescription("Choose the forum channel for group orders")
      .setDescriptionLocalizations(zh_localizations("指定揪團要用的論壇頻道"))
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setNameLocalizations(zh_localizations("頻道"))
          .setDescription("Forum channel")
          .setDescriptionLocalizations(zh_localizations("論壇頻道"))
          .addChannelTypes(ChannelType.GuildForum)
          .setRequired(true),
      ),
  );
