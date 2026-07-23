import { Composer } from "grammy";
import type { Ctx, FlowStep } from "../bot.js";
import {
  inlineButton,
  inlineKeyboard,
  registerMainMenuItem,
} from "../toolkit/index.js";
import { now } from "../lib/clock.js";
import { forceReply, formatMyRegistration } from "../lib/format.js";
import { isValidEmail, isValidName, normalizePhone } from "../lib/validation.js";
import {
  deleteRegistrant,
  getRegistrant,
  getWebinar,
  saveRegistrant,
} from "../lib/store.js";

// View / update / cancel registration — menu button + /my_registration shortcut.
registerMainMenuItem({ label: "My registration", data: "reg:mine", order: 20 });

const composer = new Composer<Ctx>();

const FLOW_TTL_MS = 15 * 60 * 1000;

function enter(ctx: Ctx, step: FlowStep): void {
  ctx.session.step = step;
  ctx.session.flowExpiresAt = now() + FLOW_TTL_MS;
}

function mineKeyboard() {
  return inlineKeyboard([
    [inlineButton("Update details", "reg:update")],
    [inlineButton("Cancel registration", "reg:drop")],
    [inlineButton("Back to menu", "menu:main")],
  ]);
}

async function showMine(ctx: Ctx, edit: boolean): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply("Couldn't identify your account — open the bot in a private chat.");
    return;
  }

  const reg = await getRegistrant(userId);
  if (!reg || reg.confirmation_status === "cancelled") {
    const empty =
      "No registration yet — tap Register to save your spot for the webinar.";
    const kb = inlineKeyboard([
      [inlineButton("Register", "reg:start")],
      [inlineButton("Back to menu", "menu:main")],
    ]);
    if (edit) {
      try {
        await ctx.editMessageText(empty, { reply_markup: kb });
        return;
      } catch {
        /* fall through */
      }
    }
    await ctx.reply(empty, { reply_markup: kb });
    return;
  }

  const webinar = await getWebinar();
  const text = formatMyRegistration(reg, webinar);
  if (edit) {
    try {
      await ctx.editMessageText(text, { reply_markup: mineKeyboard() });
      return;
    } catch {
      /* fall through */
    }
  }
  await ctx.reply(text, { reply_markup: mineKeyboard() });
}

composer.command("my_registration", async (ctx) => {
  await showMine(ctx, false);
});

composer.callbackQuery("reg:mine", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showMine(ctx, true);
});

// ── Update details ──────────────────────────────────────────────────────────

composer.callbackQuery("reg:update", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;
  const reg = await getRegistrant(userId);
  if (!reg || reg.confirmation_status === "cancelled") {
    await ctx.reply("No registration yet — tap Register to create one first.", {
      reply_markup: inlineKeyboard([[inlineButton("Register", "reg:start")]]),
    });
    return;
  }
  // Seed drafts from existing so partial updates work.
  ctx.session.draftName = reg.name;
  ctx.session.draftEmail = reg.email;
  ctx.session.draftPhone = reg.phone;
  enter(ctx, "updating_name");
  await ctx.reply("Send your updated full name (or the same one to keep it).", {
    reply_markup: forceReply("Your full name"),
  });
});

composer.callbackQuery("reg:drop", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;
  const reg = await getRegistrant(userId);
  if (!reg || reg.confirmation_status === "cancelled") {
    await ctx.reply("No registration to cancel.", {
      reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
    });
    return;
  }
  await deleteRegistrant(userId);
  ctx.session.step = "idle";
  ctx.session.draftName = undefined;
  ctx.session.draftEmail = undefined;
  ctx.session.draftPhone = undefined;
  try {
    await ctx.editMessageText(
      "Your registration is cancelled. You're welcome back anytime — tap Register to sign up again.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("Register", "reg:start")],
          [inlineButton("Back to menu", "menu:main")],
        ]),
      },
    );
  } catch {
    await ctx.reply(
      "Your registration is cancelled. You're welcome back anytime — tap Register to sign up again.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("Register", "reg:start")],
          [inlineButton("Back to menu", "menu:main")],
        ]),
      },
    );
  }
});

// Collect update fields
composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.step;
  if (
    step !== "updating_name" &&
    step !== "updating_email" &&
    step !== "updating_phone"
  ) {
    return next();
  }
  if (ctx.message.text.startsWith("/")) return next();

  if (ctx.session.flowExpiresAt && now() > ctx.session.flowExpiresAt) {
    ctx.session.step = "idle";
    await ctx.reply("That update timed out — open My registration to try again.");
    return;
  }

  const text = ctx.message.text.trim();
  const userId = ctx.from?.id;
  if (!userId) return;

  if (step === "updating_name") {
    if (!isValidName(text)) {
      await ctx.reply("That name looks too short — send your full name.", {
        reply_markup: forceReply("Your full name"),
      });
      return;
    }
    ctx.session.draftName = text;
    enter(ctx, "updating_email");
    await ctx.reply("What's the email we should use?", {
      reply_markup: forceReply("you@example.com"),
    });
    return;
  }

  if (step === "updating_email") {
    if (!isValidEmail(text)) {
      await ctx.reply("That doesn't look like an email — try again.", {
        reply_markup: forceReply("you@example.com"),
      });
      return;
    }
    ctx.session.draftEmail = text.toLowerCase();
    enter(ctx, "updating_phone");
    await ctx.reply("And the best phone number?", {
      reply_markup: forceReply("+1 555 123 4567"),
    });
    return;
  }

  // updating_phone → save
  const phone = normalizePhone(text);
  if (!phone) {
    await ctx.reply("I couldn't read that phone number — send digits (optional +).", {
      reply_markup: forceReply("+1 555 123 4567"),
    });
    return;
  }
  ctx.session.draftPhone = phone;

  const existing = await getRegistrant(userId);
  if (!existing || existing.confirmation_status === "cancelled") {
    ctx.session.step = "idle";
    await ctx.reply("No registration yet — tap Register to create one first.", {
      reply_markup: inlineKeyboard([[inlineButton("Register", "reg:start")]]),
    });
    return;
  }

  const updated = {
    ...existing,
    name: ctx.session.draftName ?? existing.name,
    email: ctx.session.draftEmail ?? existing.email,
    phone,
    confirmation_status: "confirmed" as const,
  };
  await saveRegistrant(updated);
  ctx.session.step = "idle";
  ctx.session.draftName = undefined;
  ctx.session.draftEmail = undefined;
  ctx.session.draftPhone = undefined;

  const webinar = await getWebinar();
  await ctx.reply(
    `Updated. Here's what we have on file:\n\n${formatMyRegistration(updated, webinar)}`,
    { reply_markup: mineKeyboard() },
  );
});

export default composer;
