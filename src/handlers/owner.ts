import { Composer } from "grammy";
import type { Ctx, FlowStep } from "../bot.js";
import {
  inlineButton,
  inlineKeyboard,
  registerMainMenuItem,
} from "../toolkit/index.js";
import { now } from "../lib/clock.js";
import { forceReply } from "../lib/format.js";
import {
  getSettings,
  getWebinar,
  isAdmin,
  setSettings,
  setWebinar,
  type OwnerSettings,
  type WebinarEvent,
} from "../lib/store.js";

// Owner controls — webinar details, admin notify target, retention.
registerMainMenuItem({ label: "Owner settings", data: "owner:menu", order: 90 });

const composer = new Composer<Ctx>();

const FLOW_TTL_MS = 15 * 60 * 1000;

function enter(ctx: Ctx, step: FlowStep): void {
  ctx.session.step = step;
  ctx.session.flowExpiresAt = now() + FLOW_TTL_MS;
}

function ownerKeyboard() {
  return inlineKeyboard([
    [inlineButton("Set title", "owner:title")],
    [inlineButton("Set date & time", "owner:datetime")],
    [inlineButton("Set capacity", "owner:capacity")],
    [inlineButton("Notify chat id", "owner:admin_chat")],
    [inlineButton("Add admin user", "owner:admin_user")],
    [inlineButton("Retention days", "owner:retention")],
    [inlineButton("Back to menu", "menu:main")],
  ]);
}

async function showOwnerMenu(ctx: Ctx, edit: boolean): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId || !(await isAdmin(userId))) {
    const text = "Owner settings are only available to configured admins.";
    const kb = inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]);
    if (edit) {
      try {
        await ctx.editMessageText(text, { reply_markup: kb });
        return;
      } catch {
        /* fall through */
      }
    }
    await ctx.reply(text, { reply_markup: kb });
    return;
  }

  const webinar = await getWebinar();
  const settings = await getSettings();
  const text =
    `Owner settings\n\n` +
    `Title: ${webinar.title}\n` +
    `When: ${webinar.date_time}\n` +
    `Capacity: ${webinar.capacity}\n` +
    `Notify chat: ${settings.adminNotifyChatId ?? "not set (uses env)"}\n` +
    `Extra admins: ${settings.adminUserIds.length ? settings.adminUserIds.join(", ") : "none"}\n` +
    `Retention: ${settings.retentionDays > 0 ? `${settings.retentionDays} days` : "keep forever"}`;

  if (edit) {
    try {
      await ctx.editMessageText(text, { reply_markup: ownerKeyboard() });
      return;
    } catch {
      /* fall through */
    }
  }
  await ctx.reply(text, { reply_markup: ownerKeyboard() });
}

composer.callbackQuery("owner:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showOwnerMenu(ctx, true);
});

async function requireAdmin(ctx: Ctx): Promise<boolean> {
  const userId = ctx.from?.id;
  if (!userId || !(await isAdmin(userId))) {
    await ctx.reply("Owner settings are only available to configured admins.");
    return false;
  }
  return true;
}

composer.callbackQuery("owner:title", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireAdmin(ctx))) return;
  enter(ctx, "owner_title");
  await ctx.reply("Send the webinar title.", {
    reply_markup: forceReply("Webinar title"),
  });
});

composer.callbackQuery("owner:datetime", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireAdmin(ctx))) return;
  enter(ctx, "owner_datetime");
  await ctx.reply("Send the date and time as you'd like it shown (e.g. Sat 12 Jul, 6pm GMT).", {
    reply_markup: forceReply("Date & time"),
  });
});

composer.callbackQuery("owner:capacity", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireAdmin(ctx))) return;
  enter(ctx, "owner_capacity");
  await ctx.reply("Send the max number of registrations (a whole number).", {
    reply_markup: forceReply("e.g. 200"),
  });
});

composer.callbackQuery("owner:admin_chat", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireAdmin(ctx))) return;
  enter(ctx, "owner_admin_chat");
  await ctx.reply(
    "Send the Telegram chat id that should get new-registration alerts (a group or your user id). Send 0 to clear.",
    { reply_markup: forceReply("Chat id") },
  );
});

composer.callbackQuery("owner:admin_user", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireAdmin(ctx))) return;
  enter(ctx, "owner_admin_user");
  await ctx.reply(
    "Send the Telegram user id of someone who should get admin access. They must already have started this bot.",
    { reply_markup: forceReply("User id") },
  );
});

composer.callbackQuery("owner:retention", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireAdmin(ctx))) return;
  enter(ctx, "owner_retention");
  await ctx.reply(
    "How many days should we keep registration data? Send 0 to keep forever.",
    { reply_markup: forceReply("Days") },
  );
});

composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.step;
  if (
    step !== "owner_title" &&
    step !== "owner_datetime" &&
    step !== "owner_capacity" &&
    step !== "owner_admin_chat" &&
    step !== "owner_admin_user" &&
    step !== "owner_retention"
  ) {
    return next();
  }
  if (ctx.message.text.startsWith("/")) return next();

  if (!(await requireAdmin(ctx))) {
    ctx.session.step = "idle";
    return;
  }

  if (ctx.session.flowExpiresAt && now() > ctx.session.flowExpiresAt) {
    ctx.session.step = "idle";
    await ctx.reply("That timed out — open Owner settings to try again.");
    return;
  }

  const text = ctx.message.text.trim();

  if (step === "owner_title") {
    if (text.length < 2 || text.length > 120) {
      await ctx.reply("Title should be 2–120 characters. Try again.", {
        reply_markup: forceReply("Webinar title"),
      });
      return;
    }
    const webinar = await getWebinar();
    const nextEvent: WebinarEvent = { ...webinar, title: text };
    await setWebinar(nextEvent);
    ctx.session.step = "idle";
    await ctx.reply(`Title updated to “${text}”.`, {
      reply_markup: ownerKeyboard(),
    });
    return;
  }

  if (step === "owner_datetime") {
    if (text.length < 2 || text.length > 120) {
      await ctx.reply("Keep the date/time text under 120 characters.", {
        reply_markup: forceReply("Date & time"),
      });
      return;
    }
    const webinar = await getWebinar();
    await setWebinar({ ...webinar, date_time: text });
    ctx.session.step = "idle";
    await ctx.reply(`Date & time set to “${text}”.`, {
      reply_markup: ownerKeyboard(),
    });
    return;
  }

  if (step === "owner_capacity") {
    const n = Number(text.replace(/[,\s]/g, ""));
    if (!Number.isInteger(n) || n < 1 || n > 1_000_000) {
      await ctx.reply("Send a whole number between 1 and 1,000,000.", {
        reply_markup: forceReply("e.g. 200"),
      });
      return;
    }
    const webinar = await getWebinar();
    await setWebinar({ ...webinar, capacity: n });
    ctx.session.step = "idle";
    await ctx.reply(`Capacity set to ${n}.`, { reply_markup: ownerKeyboard() });
    return;
  }

  if (step === "owner_admin_chat") {
    const n = Number(text.replace(/\s/g, ""));
    if (!Number.isFinite(n) || (!Number.isInteger(n) && n !== 0)) {
      await ctx.reply("Send a numeric chat id, or 0 to clear.", {
        reply_markup: forceReply("Chat id"),
      });
      return;
    }
    const settings = await getSettings();
    const nextSettings: OwnerSettings = {
      ...settings,
      adminNotifyChatId: n === 0 ? null : n,
    };
    await setSettings(nextSettings);
    ctx.session.step = "idle";
    await ctx.reply(
      n === 0
        ? "Notify chat cleared — we'll use the env default if set."
        : `New registrations will notify chat ${n}.`,
      { reply_markup: ownerKeyboard() },
    );
    return;
  }

  if (step === "owner_admin_user") {
    const n = Number(text.replace(/\s/g, ""));
    if (!Number.isInteger(n) || n === 0) {
      await ctx.reply("Send a numeric Telegram user id.", {
        reply_markup: forceReply("User id"),
      });
      return;
    }
    const settings = await getSettings();
    const ids = settings.adminUserIds.includes(n)
      ? settings.adminUserIds
      : [...settings.adminUserIds, n];
    await setSettings({ ...settings, adminUserIds: ids });
    ctx.session.step = "idle";
    await ctx.reply(
      `User ${n} can use admin tools. Make sure they've started this bot so we can reach them.`,
      { reply_markup: ownerKeyboard() },
    );
    return;
  }

  // owner_retention
  const days = Number(text.replace(/[,\s]/g, ""));
  if (!Number.isInteger(days) || days < 0 || days > 3650) {
    await ctx.reply("Send a whole number of days (0–3650), or 0 to keep forever.", {
      reply_markup: forceReply("Days"),
    });
    return;
  }
  const settings = await getSettings();
  await setSettings({ ...settings, retentionDays: days });
  ctx.session.step = "idle";
  await ctx.reply(
    days === 0
      ? "Retention cleared — we'll keep registrations until you delete them."
      : `We'll keep registration data for ${days} day${days === 1 ? "" : "s"}.`,
    { reply_markup: ownerKeyboard() },
  );
});

export default composer;
