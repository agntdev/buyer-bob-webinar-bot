/**
 * Best-effort Telegram notifications. A 403 (user never started / blocked the
 * bot) must NOT abort the surrounding loop or registration confirmation.
 */

import type { Api } from "grammy";
import type { Registrant } from "./store.js";
import { getWebinar, resolveAdminNotifyChatId } from "./store.js";
import { now } from "./clock.js";

function isForbidden(err: unknown): boolean {
  const e = err as { error_code?: number; message?: string };
  if (e?.error_code === 403) return true;
  if (typeof e?.message === "string" && /forbidden|bot was blocked|chat not found/i.test(e.message)) {
    return true;
  }
  return false;
}

/** Send a message; swallow 403 so one blocked recipient can't break the flow. */
export async function safeSendMessage(
  api: Api,
  chatId: number,
  text: string,
): Promise<boolean> {
  try {
    await api.sendMessage(chatId, text);
    return true;
  } catch (err) {
    if (isForbidden(err)) return false;
    // Other errors: log and continue — confirmation to the user still matters.
    console.error("[notify] sendMessage failed:", err);
    return false;
  }
}

/** Instant admin alert for a new (or updated) confirmed registration. */
export async function notifyAdminsOfRegistration(
  api: Api,
  reg: Registrant,
): Promise<void> {
  const chatId = await resolveAdminNotifyChatId();
  if (chatId == null) return;

  const webinar = await getWebinar();
  const when = new Date(reg.registration_timestamp || now()).toISOString();
  const text =
    `New webinar registration\n\n` +
    `Event: ${webinar.title}\n` +
    `Name: ${reg.name}\n` +
    `Email: ${reg.email}\n` +
    `Phone: ${reg.phone}\n` +
    `Telegram id: ${reg.telegram_id}\n` +
    `Registered: ${when}`;

  await safeSendMessage(api, chatId, text);
}
