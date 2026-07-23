/**
 * Runtime config from env. Read at call time so tests can set process.env
 * before exercising a path.
 */

/** Parse comma-separated numeric Telegram user/chat ids from env. */
function parseIdList(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n !== 0);
}

/** Admin user ids allowed to export CSV and open owner controls. */
export function adminUserIdsFromEnv(): number[] {
  const env =
    typeof process === "undefined"
      ? {}
      : (process.env as { ADMIN_IDS?: string; ADMIN_USER_IDS?: string });
  return parseIdList(env.ADMIN_IDS ?? env.ADMIN_USER_IDS);
}

/**
 * Chat id that receives new-registration notifications.
 * Falls back to the first ADMIN_IDS entry when ADMIN_CHAT_ID is unset.
 */
export function adminNotifyChatIdFromEnv(): number | null {
  const env =
    typeof process === "undefined"
      ? {}
      : (process.env as { ADMIN_CHAT_ID?: string; ADMIN_IDS?: string });
  if (env.ADMIN_CHAT_ID) {
    const n = Number(env.ADMIN_CHAT_ID);
    return Number.isFinite(n) && n !== 0 ? n : null;
  }
  const ids = parseIdList(env.ADMIN_IDS);
  return ids[0] ?? null;
}

/** Soft cap for CSV export (spec: 10,000). */
export const CSV_EXPORT_LIMIT = 10_000;

/** Default webinar capacity when unset. */
export const DEFAULT_CAPACITY = 500;

/** Default retention in days when owner hasn't configured one. */
export const DEFAULT_RETENTION_DAYS = 365;
