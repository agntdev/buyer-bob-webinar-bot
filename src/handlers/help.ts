import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

const HELP =
  "This bot signs you up for Buyer Bob's free training webinar.\n\n" +
  "Tap /start, then Register — we'll ask for your name, email, and phone.\n" +
  "You can review or change your details anytime from My registration.\n\n" +
  "Need to stop mid-signup? Tap Cancel or send /cancel.";

const backToMenu = inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]);

composer.command("help", async (ctx) => {
  await ctx.reply(HELP);
});

composer.callbackQuery("menu:help", async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    await ctx.editMessageText(HELP, { reply_markup: backToMenu });
  } catch {
    await ctx.reply(HELP, { reply_markup: backToMenu });
  }
});

export default composer;
