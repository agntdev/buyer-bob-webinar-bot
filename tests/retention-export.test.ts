/**
 * Programmatic coverage for retention enforcement and the 10,000-row CSV cap.
 * Dialog specs cover the happy-path export; these cases need seeded data.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildBot } from "../src/bot.js";
import {
  _resetStoreForTests,
  enforceRetention,
  listRegistrants,
  saveRegistrant,
  setSettings,
  getSettings,
  type Registrant,
} from "../src/lib/store.js";
import { buildRegistrantsCsv } from "../src/lib/csv.js";
import { CSV_EXPORT_LIMIT } from "../src/lib/config.js";
import { setNow, resetNow } from "../src/lib/clock.js";

describe("data retention policy", () => {
  beforeEach(async () => {
    await _resetStoreForTests();
    resetNow();
  });
  afterEach(() => {
    resetNow();
  });

  it("drops registrants older than the retention window", async () => {
    const day = 24 * 60 * 60 * 1000;
    const t0 = 1_700_000_000_000;
    setNow(() => t0);

    await setSettings({
      ...(await getSettings()),
      retentionDays: 30,
    });

    const oldReg: Registrant = {
      telegram_id: 1,
      name: "Old One",
      email: "old@example.com",
      phone: "5550000001",
      registration_timestamp: t0 - 60 * day,
      confirmation_status: "confirmed",
    };
    const freshReg: Registrant = {
      telegram_id: 2,
      name: "Fresh One",
      email: "fresh@example.com",
      phone: "5550000002",
      registration_timestamp: t0 - 5 * day,
      confirmation_status: "confirmed",
    };
    await saveRegistrant(oldReg);
    await saveRegistrant(freshReg);

    const removed = await enforceRetention();
    expect(removed).toBe(1);

    const left = await listRegistrants();
    expect(left).toHaveLength(1);
    expect(left[0]?.telegram_id).toBe(2);
  });

  it("keeps all when retention is 0 (forever)", async () => {
    const t0 = 1_700_000_000_000;
    setNow(() => t0);
    await setSettings({
      ...(await getSettings()),
      retentionDays: 0,
    });
    await saveRegistrant({
      telegram_id: 9,
      name: "Ancient",
      email: "a@example.com",
      phone: "5559",
      registration_timestamp: t0 - 10 * 365 * 24 * 60 * 60 * 1000,
      confirmation_status: "confirmed",
    });
    expect(await enforceRetention()).toBe(0);
    expect(await listRegistrants()).toHaveLength(1);
  });
});

describe("CSV export 10,000 limit", () => {
  it("truncates above CSV_EXPORT_LIMIT", () => {
    const regs: Registrant[] = [];
    for (let i = 0; i < CSV_EXPORT_LIMIT + 25; i++) {
      regs.push({
        telegram_id: i + 1,
        name: `User ${i}`,
        email: `u${i}@example.com`,
        phone: `555${String(i).padStart(7, "0")}`,
        registration_timestamp: 1_700_000_000_000 + i,
        confirmation_status: "confirmed",
      });
    }
    const { count, truncated, csv } = buildRegistrantsCsv(regs);
    expect(truncated).toBe(true);
    expect(count).toBe(CSV_EXPORT_LIMIT);
    // header + 10000 rows + trailing newline → 10001 lines of content split
    const lines = csv.trimEnd().split("\n");
    expect(lines).toHaveLength(CSV_EXPORT_LIMIT + 1);
    expect(lines[0]).toContain("telegram_id");
  });

  it("does not truncate at or under the limit", () => {
    const regs: Registrant[] = Array.from({ length: 3 }, (_, i) => ({
      telegram_id: i + 1,
      name: `U${i}`,
      email: `u${i}@e.com`,
      phone: `555${i}`,
      registration_timestamp: 1,
      confirmation_status: "confirmed" as const,
    }));
    const { count, truncated } = buildRegistrantsCsv(regs);
    expect(truncated).toBe(false);
    expect(count).toBe(3);
  });
});

describe("bot still builds with store reset", () => {
  it("buildBot loads handlers", async () => {
    await _resetStoreForTests();
    const bot = await buildBot("test-token");
    expect(bot).toBeTruthy();
  });
});
