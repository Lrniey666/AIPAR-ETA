// /memory（記憶）：看我記得什麼、明確要我記住、以及忘記。
//
// 自然語言也做得到同樣的事（「記住我不吃牛」），但記憶是會被寫進資料庫、
// 之後每次對話都拿出來用的東西，得有一個看得到也刪得掉的正式入口。

import { SlashCommandBuilder } from "discord.js";

import { zh_localizations } from "../i18n.ts";

export const memory_command = new SlashCommandBuilder()
  .setName("memory")
  .setNameLocalizations(zh_localizations("記憶"))
  .setDescription("What I remember about you, and how to change it")
  .setDescriptionLocalizations(zh_localizations("我記得你的哪些事，以及怎麼改"))
  .addSubcommand((sub) =>
    sub
      .setName("mine")
      .setNameLocalizations(zh_localizations("我的"))
      .setDescription("Show what I remember")
      .setDescriptionLocalizations(zh_localizations("看我記得什麼")),
  )
  .addSubcommand((sub) =>
    sub
      .setName("save")
      .setNameLocalizations(zh_localizations("記住"))
      .setDescription("Remember something, for example: I do not eat beef")
      .setDescriptionLocalizations(zh_localizations("記住一件事，例如：我不吃牛"))
      .addStringOption((option) =>
        option
          .setName("text")
          .setNameLocalizations(zh_localizations("內容"))
          .setDescription("What to remember")
          .setDescriptionLocalizations(zh_localizations("要記住的內容"))
          .setRequired(true)
          .setMaxLength(200),
      )
      .addBooleanOption((option) =>
        option
          .setName("shared")
          .setNameLocalizations(zh_localizations("共用"))
          .setDescription("Remember it for this channel rather than just you")
          .setDescriptionLocalizations(zh_localizations("記成整個頻道共用，而不是只有你")),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("forget")
      .setNameLocalizations(zh_localizations("忘記"))
      .setDescription("Forget one thing, or everything if left empty")
      .setDescriptionLocalizations(zh_localizations("忘記某一件事；留空＝全部忘掉"))
      .addStringOption((option) =>
        option
          .setName("text")
          .setNameLocalizations(zh_localizations("內容"))
          .setDescription("Which one to forget")
          .setDescriptionLocalizations(zh_localizations("要忘掉哪一件"))
          .setAutocomplete(true)
          .setMaxLength(200),
      ),
  );
