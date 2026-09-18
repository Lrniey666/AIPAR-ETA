// 使用類指令：/groupbuy（揪團）、/settle（結算）、/ledger（帳務）、
// /help（說明）、/website（網站）、/setup（設定）。
//
// 0.3.0 移除了 /order（點餐）：貼文裡已經有「點餐」按鈕與自然語言兩條路，
// 再留一支只能在貼文裡用的斜線指令，只是多一個要解釋的入口。

import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

import { zh_localizations } from "../i18n.ts";
import { restaurant_option } from "./options.ts";

export const groupbuy_command = new SlashCommandBuilder()
  .setName("groupbuy")
  .setNameLocalizations(zh_localizations("揪團"))
  .setDescription("Open a group order post")
  .setDescriptionLocalizations(zh_localizations("開一場揪團點餐"))
  .addStringOption(restaurant_option(true))
  // 截止時間只收分鐘數字：`1h30m` 那種寫法每次都要有人問怎麼打。
  .addIntegerOption((option) =>
    option
      .setName("minutes")
      .setNameLocalizations(zh_localizations("截止分鐘"))
      .setDescription("Minutes from now, for example 30")
      .setDescriptionLocalizations(zh_localizations("距現在幾分鐘截止，例如 30"))
      .setMinValue(1)
      .setMaxValue(10080),
  )
  .addUserOption((option) =>
    option
      .setName("payer")
      .setNameLocalizations(zh_localizations("收款人"))
      .setDescription("Who fronts the money; defaults to you")
      .setDescriptionLocalizations(zh_localizations("誰先墊錢收款，預設是你")),
  )
  .addStringOption((option) =>
    option
      .setName("title")
      .setNameLocalizations(zh_localizations("標題"))
      .setDescription("Post title")
      .setDescriptionLocalizations(zh_localizations("貼文標題"))
      .setMaxLength(80),
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
      .setName("who")
      .setNameLocalizations(zh_localizations("誰欠誰"))
      .setDescription("Who owes whom, and the fewest transfers to settle up")
      .setDescriptionLocalizations(zh_localizations("誰欠誰與最少轉帳建議")),
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
          .setName("to")
          .setNameLocalizations(zh_localizations("付給"))
          .setDescription("Who received the money")
          .setDescriptionLocalizations(zh_localizations("錢付給誰")),
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

export const website_command = new SlashCommandBuilder()
  .setName("website")
  .setNameLocalizations(zh_localizations("網站"))
  .setDescription("Open the AIPAR ETA website")
  .setDescriptionLocalizations(zh_localizations("開啟 AIPAR ETA 網站"));

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
  )
  .addSubcommand((sub) =>
    sub
      .setName("role")
      .setNameLocalizations(zh_localizations("通知"))
      .setDescription("Role to ping when a group order opens; leave empty to stop pinging")
      .setDescriptionLocalizations(zh_localizations("開團要 ping 的身分組，留空＝不通知"))
      .addRoleOption((option) =>
        option
          .setName("role")
          .setNameLocalizations(zh_localizations("身分組"))
          .setDescription("Role to ping")
          .setDescriptionLocalizations(zh_localizations("要通知的身分組")),
      ),
  );
