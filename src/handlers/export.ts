import { Composer, InputFile } from "grammy";
import type { Ctx } from "../bot.js";
import {
  inlineButton,
  inlineKeyboard,
  registerMainMenuItem,
} from "../toolkit/index.js";
import { buildRegistrantsCsv } from "../lib/csv.js";
import { CSV_EXPORT_LIMIT } from "../lib/config.js";
import { isAdmin, listRegistrants } from "../lib/store.js";

// Admin CSV export — menu button (admins only) + /export_csv power shortcut.
registerMainMenuItem({ label: "Export CSV", data: "admin:export", order: 80 });

const composer = new Composer<Ctx>();

async function deny(ctx: Ctx, edit: boolean): Promise<void> {
  const text = "That's an admin tool — only configured admins can export registrations.";
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
}

async function runExport(ctx: Ctx): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId || !(await isAdmin(userId))) {
    await deny(ctx, !!ctx.callbackQuery);
    return;
  }

  const all = await listRegistrants();
  const confirmed = all.filter((r) => r.confirmation_status === "confirmed");

  if (confirmed.length === 0) {
    await ctx.reply("No registrations yet — nothing to export.", {
      reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
    });
    return;
  }

  // Brief list of recent signups (last 5) before the file.
  const recent = confirmed.slice(-5).reverse();
  const recentLines = recent
    .map((r) => `• ${r.name} — ${r.email}`)
    .join("\n");
  const listIntro =
    `Recent registrations (${Math.min(5, confirmed.length)} of ${confirmed.length}):\n` +
    recentLines;

  await ctx.reply(listIntro);

  const { csv, truncated, count } = buildRegistrantsCsv(confirmed);
  const caption = truncated
    ? `Export ready — showing the first ${CSV_EXPORT_LIMIT.toLocaleString()} of ${confirmed.length.toLocaleString()} registrations.`
    : `Export ready — ${count.toLocaleString()} registration${count === 1 ? "" : "s"}.`;

  const bytes = new TextEncoder().encode(csv);
  await ctx.api.sendDocument(
    ctx.chat!.id,
    new InputFile(bytes, "webinar-registrations.csv"),
    { caption },
  );

  await ctx.reply("CSV export complete.", {
    reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
  });
}

composer.command("export_csv", async (ctx) => {
  await runExport(ctx);
});

composer.callbackQuery("admin:export", async (ctx) => {
  await ctx.answerCallbackQuery();
  await runExport(ctx);
});

export default composer;
