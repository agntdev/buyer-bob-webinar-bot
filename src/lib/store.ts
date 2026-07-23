/**
 * Durable domain store for webinar registrations + owner settings.
 *
 * Uses the toolkit's StorageAdapter surface (Redis when REDIS_URL is set,
 * in-memory otherwise) — never a raw module-level Map as the database.
 * Collections are read through explicit index keys (no keyspace scans).
 */

import type { StorageAdapter } from "grammy";
import { MemorySessionStorage } from "../toolkit/session/memory.js";
import {
  adminNotifyChatIdFromEnv,
  adminUserIdsFromEnv,
  DEFAULT_CAPACITY,
  DEFAULT_RETENTION_DAYS,
} from "./config.js";
import { now } from "./clock.js";

// ─── Domain types ───────────────────────────────────────────────────────────

export type ConfirmationStatus = "pending" | "confirmed" | "cancelled";

export interface Registrant {
  telegram_id: number;
  name: string;
  email: string;
  phone: string;
  registration_timestamp: number;
  confirmation_status: ConfirmationStatus;
}

export interface WebinarEvent {
  title: string;
  date_time: string; // human-readable, owner-configured
  capacity: number;
}

export interface OwnerSettings {
  /** Chat id that receives new-registration notifications. */
  adminNotifyChatId: number | null;
  /** Extra admin user ids (in addition to ADMIN_IDS env). */
  adminUserIds: number[];
  /** Days to keep confirmed registrations; 0 = keep forever. */
  retentionDays: number;
}

// ─── Keys (explicit — no SCAN / KEYS / prefix enumeration) ──────────────────

const K = {
  webinar: "webinar:event",
  settings: "owner:settings",
  /** Sorted list of all registrant telegram ids (the export index). */
  index: "registrants:index",
  registrant: (id: number) => `registrant:${id}`,
} as const;

const DEFAULT_WEBINAR: WebinarEvent = {
  title: "Buyer Bob Free Training Webinar",
  date_time: "Date & time coming soon",
  capacity: DEFAULT_CAPACITY,
};

const DEFAULT_SETTINGS: OwnerSettings = {
  adminNotifyChatId: null,
  adminUserIds: [],
  retentionDays: DEFAULT_RETENTION_DAYS,
};

// ─── Adapter bootstrap (Redis in prod, memory in dev/tests) ─────────────────

type JsonStore = StorageAdapter<string>;

let adapter: JsonStore | null = null;

function memoryAdapter(): JsonStore {
  const inner = new MemorySessionStorage<string>();
  return {
    read: (key) => inner.read(key),
    write: (key, value) => {
      inner.write(key, value);
    },
    delete: (key) => {
      inner.delete(key);
    },
  };
}

/**
 * Resolve the durable adapter once. Mirrors toolkit session selection:
 * REDIS_URL → Redis (dynamic import, Node-only path); else memory.
 */
async function getAdapter(): Promise<JsonStore> {
  if (adapter) return adapter;
  const env =
    typeof process === "undefined" ? {} : (process.env as { REDIS_URL?: string });
  if (env.REDIS_URL) {
    try {
      const { createRequire } = await import("node:module");
      const require = createRequire(import.meta.url);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ioredis: any = require("ioredis");
      const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
      const client = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        lazyConnect: false,
        keyPrefix: "bbot:kv:",
      });
      adapter = {
        read: async (key) => {
          const raw = await client.get(key);
          return raw == null ? undefined : (raw as string);
        },
        write: async (key, value) => {
          await client.set(key, value);
        },
        delete: async (key) => {
          await client.del(key);
        },
      };
      return adapter;
    } catch {
      // Fall through to memory if Redis can't be loaded (e.g. Workers).
    }
  }
  adapter = memoryAdapter();
  return adapter;
}

async function getJson<T>(key: string): Promise<T | undefined> {
  const a = await getAdapter();
  const raw = await a.read(key);
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

async function setJson(key: string, value: unknown): Promise<void> {
  const a = await getAdapter();
  await a.write(key, JSON.stringify(value));
}

async function delKey(key: string): Promise<void> {
  const a = await getAdapter();
  await a.delete(key);
}

// ─── Webinar event ──────────────────────────────────────────────────────────

export async function getWebinar(): Promise<WebinarEvent> {
  return (await getJson<WebinarEvent>(K.webinar)) ?? { ...DEFAULT_WEBINAR };
}

export async function setWebinar(event: WebinarEvent): Promise<void> {
  await setJson(K.webinar, event);
}

// ─── Owner settings ─────────────────────────────────────────────────────────

export async function getSettings(): Promise<OwnerSettings> {
  const stored = await getJson<OwnerSettings>(K.settings);
  return stored ? { ...DEFAULT_SETTINGS, ...stored } : { ...DEFAULT_SETTINGS };
}

export async function setSettings(settings: OwnerSettings): Promise<void> {
  await setJson(K.settings, settings);
}

/** True if this Telegram user may use admin/owner features. */
export async function isAdmin(userId: number): Promise<boolean> {
  const fromEnv = adminUserIdsFromEnv();
  if (fromEnv.includes(userId)) return true;
  const settings = await getSettings();
  return settings.adminUserIds.includes(userId);
}

/**
 * Chat id for new-registration alerts: stored setting, else env, else null.
 */
export async function resolveAdminNotifyChatId(): Promise<number | null> {
  const settings = await getSettings();
  if (settings.adminNotifyChatId != null) return settings.adminNotifyChatId;
  return adminNotifyChatIdFromEnv();
}

// ─── Registrants (index-backed — no keyspace scan) ──────────────────────────

async function readIndex(): Promise<number[]> {
  return (await getJson<number[]>(K.index)) ?? [];
}

async function writeIndex(ids: number[]): Promise<void> {
  await setJson(K.index, ids);
}

export async function getRegistrant(telegramId: number): Promise<Registrant | undefined> {
  return getJson<Registrant>(K.registrant(telegramId));
}

export async function saveRegistrant(reg: Registrant): Promise<void> {
  const index = await readIndex();
  if (!index.includes(reg.telegram_id)) {
    index.push(reg.telegram_id);
    await writeIndex(index);
  }
  await setJson(K.registrant(reg.telegram_id), reg);
}

export async function deleteRegistrant(telegramId: number): Promise<void> {
  const index = await readIndex();
  const next = index.filter((id) => id !== telegramId);
  if (next.length !== index.length) await writeIndex(next);
  await delKey(K.registrant(telegramId));
}

/**
 * Drop registrants past the retention window. Returns how many were removed.
 * Call before list/export so retention is enforced without a background job.
 */
export async function enforceRetention(): Promise<number> {
  const settings = await getSettings();
  if (!settings.retentionDays || settings.retentionDays <= 0) return 0;
  const cutoff = now() - settings.retentionDays * 24 * 60 * 60 * 1000;
  const index = await readIndex();
  let removed = 0;
  const kept: number[] = [];
  for (const id of index) {
    const reg = await getJson<Registrant>(K.registrant(id));
    if (!reg) continue;
    if (reg.registration_timestamp < cutoff) {
      await delKey(K.registrant(id));
      removed++;
    } else {
      kept.push(id);
    }
  }
  if (removed > 0) await writeIndex(kept);
  return removed;
}

/** All non-cancelled registrants (after retention), oldest first. */
export async function listRegistrants(): Promise<Registrant[]> {
  await enforceRetention();
  const index = await readIndex();
  const out: Registrant[] = [];
  for (const id of index) {
    const reg = await getJson<Registrant>(K.registrant(id));
    if (reg && reg.confirmation_status !== "cancelled") out.push(reg);
  }
  out.sort((a, b) => a.registration_timestamp - b.registration_timestamp);
  return out;
}

/** Confirmed seats used toward capacity. */
export async function confirmedCount(): Promise<number> {
  const all = await listRegistrants();
  return all.filter((r) => r.confirmation_status === "confirmed").length;
}

export async function isAtCapacity(): Promise<boolean> {
  const webinar = await getWebinar();
  const count = await confirmedCount();
  return count >= webinar.capacity;
}

// ─── Test helpers ───────────────────────────────────────────────────────────

/** Wipe durable data (memory adapter only — used by tests). */
export async function _resetStoreForTests(): Promise<void> {
  adapter = memoryAdapter();
  // Ensure defaults are clean for the next read.
  await setJson(K.index, []);
  await delKey(K.webinar);
  await delKey(K.settings);
}
