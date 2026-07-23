import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { now } from "../lib/clock.js";
import {
  getRegistrant,
  getWebinar,
  isAtCapacity,
  saveRegistrant,
  type Registrant,
} from "../lib/store.js";
import { notifyAdminsOfRegistration } from "../lib/notify.js";

// Finalize registration after the summary Confirm button.
const composer = new Composer<Ctx>();

composer.callbackQuery("confirm:registration", async (ctx) => {
  await ctx.answerCallbackQuery();

  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply("Couldn't identify your account — open the bot from your private chat.");
    return;
  }

  const name = ctx.session.draftName?.trim();
  const email = ctx.session.draftEmail?.trim();
  const phone = ctx.session.draftPhone?.trim();

  if (!name || !email || !phone) {
    await ctx.reply(
      "I don't have your details yet — tap Register to walk through signup first.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("Register", "reg:start")],
          [inlineButton("Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  // Capacity check at confirm time (race-safe enough for this bot).
  const existing = await getRegistrant(userId);
  const alreadyConfirmed = existing?.confirmation_status === "confirmed";
  if (!alreadyConfirmed && (await isAtCapacity())) {
    const webinar = await getWebinar();
    ctx.session.step = "idle";
    await ctx.reply(
      `Sorry — ${webinar.title} just filled up. We couldn't save your spot.`,
      {
        reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
      },
    );
    return;
  }

  const webinar = await getWebinar();
  const reg: Registrant = {
    telegram_id: userId,
    name,
    email,
    phone,
    registration_timestamp: existing?.registration_timestamp ?? now(),
    confirmation_status: "confirmed",
  };
  await saveRegistrant(reg);

  ctx.session.step = "idle";
  ctx.session.draftName = undefined;
  ctx.session.draftEmail = undefined;
  ctx.session.draftPhone = undefined;
  ctx.session.flowExpiresAt = undefined;

  const confirmText =
    `You're registered for ${webinar.title}!\n\n` +
    `${webinar.date_time}\n\n` +
    `Name: ${reg.name}\n` +
    `Email: ${reg.email}\n` +
    `Phone: ${reg.phone}\n\n` +
    `We'll be in touch with details. You can update your info anytime from My registration.`;

  try {
    await ctx.editMessageText(confirmText, {
      reply_markup: inlineKeyboard([
        [inlineButton("My registration", "reg:mine")],
        [inlineButton("Back to menu", "menu:main")],
      ]),
    });
  } catch {
    await ctx.reply(confirmText, {
      reply_markup: inlineKeyboard([
        [inlineButton("My registration", "reg:mine")],
        [inlineButton("Back to menu", "menu:main")],
      ]),
    });
  }

  // Admin alert (best-effort; 403 never aborts confirmation).
  await notifyAdminsOfRegistration(ctx.api, reg);
});

export default composer;
