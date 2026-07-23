import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard } from "../toolkit/index.js";
import { formatWebinarLine } from "../lib/format.js";
import { getWebinar } from "../lib/store.js";

// /start — hero + main menu. Features register their own buttons via
// registerMainMenuItem; this handler only renders the aggregate keyboard.
const composer = new Composer<Ctx>();

export async function welcomeText(): Promise<string> {
  const webinar = await getWebinar();
  return (
    `Welcome to ${webinar.title}!\n\n` +
    `${formatWebinarLine(webinar)}\n\n` +
    `Tap a button below to register or manage your spot.`
  );
}

composer.command("start", async (ctx) => {
  // Clear any half-finished wizard when the user restarts.
  ctx.session.step = "idle";
  ctx.session.draftName = undefined;
  ctx.session.draftEmail = undefined;
  ctx.session.draftPhone = undefined;
  ctx.session.flowExpiresAt = undefined;
  await ctx.reply(await welcomeText(), { reply_markup: mainMenuKeyboard(1) });
});

// "Back to menu" — re-render the main menu in place from any sub-view.
composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "idle";
  try {
    await ctx.editMessageText(await welcomeText(), {
      reply_markup: mainMenuKeyboard(1),
    });
  } catch {
    // Message may be too old to edit — send a fresh one.
    await ctx.reply(await welcomeText(), { reply_markup: mainMenuKeyboard(1) });
  }
});

export default composer;
