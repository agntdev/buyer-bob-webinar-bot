import { Composer } from "grammy";
import type { Ctx, FlowStep } from "../bot.js";
import {
  inlineButton,
  inlineKeyboard,
  registerMainMenuItem,
} from "../toolkit/index.js";
import { now } from "../lib/clock.js";
import { forceReply, formatRegistrationSummary } from "../lib/format.js";
import { isValidEmail, isValidName, normalizePhone } from "../lib/validation.js";
import { getWebinar, isAtCapacity } from "../lib/store.js";

// Registration wizard — button-first entry from the main menu.
registerMainMenuItem({ label: "Register", data: "reg:start", order: 10 });

const FLOW_TTL_MS = 15 * 60 * 1000;

const composer = new Composer<Ctx>();

function clearDraft(ctx: Ctx): void {
  ctx.session.draftName = undefined;
  ctx.session.draftEmail = undefined;
  ctx.session.draftPhone = undefined;
  ctx.session.flowExpiresAt = undefined;
}

function enter(ctx: Ctx, step: FlowStep): void {
  ctx.session.step = step;
  ctx.session.flowExpiresAt = now() + FLOW_TTL_MS;
}

function flowExpired(ctx: Ctx): boolean {
  return !!(ctx.session.flowExpiresAt && now() > ctx.session.flowExpiresAt);
}

async function beginRegistration(ctx: Ctx): Promise<void> {
  if (await isAtCapacity()) {
    const webinar = await getWebinar();
    await ctx.reply(
      `Sorry — ${webinar.title} is full right now. Check back later in case a spot opens up.`,
      {
        reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
      },
    );
    return;
  }

  clearDraft(ctx);
  enter(ctx, "awaiting_name");
  await ctx.reply("What's your full name?", {
    reply_markup: forceReply("Your full name"),
  });
}

// Menu button
composer.callbackQuery("reg:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await beginRegistration(ctx);
});

// Cancel mid-flow
composer.command("cancel", async (ctx) => {
  if (!ctx.session.step || ctx.session.step === "idle") {
    await ctx.reply("Nothing to cancel — tap /start when you're ready.");
    return;
  }
  ctx.session.step = "idle";
  clearDraft(ctx);
  await ctx.reply("Cancelled. Tap /start anytime to begin again.", {
    reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
  });
});

composer.callbackQuery("reg:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "idle";
  clearDraft(ctx);
  try {
    await ctx.editMessageText("Cancelled. Tap /start anytime to begin again.", {
      reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
    });
  } catch {
    await ctx.reply("Cancelled. Tap /start anytime to begin again.", {
      reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
    });
  }
});

/** Show summary + Confirm Registration button (callback: confirm:registration). */
export async function showConfirmationSummary(ctx: Ctx): Promise<void> {
  const name = ctx.session.draftName ?? "";
  const email = ctx.session.draftEmail ?? "";
  const phone = ctx.session.draftPhone ?? "";
  enter(ctx, "confirming");
  const text =
    `Does this look right?\n\n` +
    formatRegistrationSummary({ name, email, phone }) +
    `\n\nTap Confirm to finish, or Cancel to stop.`;
  await ctx.reply(text, {
    reply_markup: inlineKeyboard([
      [inlineButton("Confirm registration", "confirm:registration")],
      [inlineButton("Cancel", "reg:cancel")],
    ]),
  });
}

// Collect name → email → phone via ForceReply
composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.step;
  if (
    step !== "awaiting_name" &&
    step !== "awaiting_email" &&
    step !== "awaiting_phone"
  ) {
    return next();
  }

  // Ignore slash commands while in a step (other command handlers already ran,
  // but plain text starting with /cancel is handled above as a command).
  if (ctx.message.text.startsWith("/")) return next();

  if (flowExpired(ctx)) {
    ctx.session.step = "idle";
    clearDraft(ctx);
    await ctx.reply("That signup timed out — tap Register to start again.");
    return;
  }

  const text = ctx.message.text.trim();

  if (step === "awaiting_name") {
    if (!isValidName(text)) {
      await ctx.reply("That name looks too short — send your full name (at least 2 characters).", {
        reply_markup: forceReply("Your full name"),
      });
      return;
    }
    ctx.session.draftName = text;
    enter(ctx, "awaiting_email");
    await ctx.reply(`Thanks, ${text}. What's your email?`, {
      reply_markup: forceReply("you@example.com"),
    });
    return;
  }

  if (step === "awaiting_email") {
    if (!isValidEmail(text)) {
      await ctx.reply("That doesn't look like an email — try again (like you@example.com).", {
        reply_markup: forceReply("you@example.com"),
      });
      return;
    }
    ctx.session.draftEmail = text.toLowerCase();
    enter(ctx, "awaiting_phone");
    await ctx.reply("Got it. What's the best phone number to reach you?", {
      reply_markup: forceReply("+1 555 123 4567"),
    });
    return;
  }

  // awaiting_phone
  const phone = normalizePhone(text);
  if (!phone) {
    await ctx.reply(
      "I couldn't read that phone number — send digits (with optional + country code).",
      { reply_markup: forceReply("+1 555 123 4567") },
    );
    return;
  }
  ctx.session.draftPhone = phone;
  await showConfirmationSummary(ctx);
});

export default composer;
