/**
 * Pure booking-window math. No DB, no network.
 * Reference: 2026-08-08 is a Saturday; 2026-08-10 is a Monday.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_ADVANCE_DAYS,
  bookableUntil,
  opensOn,
} from "./booking-window";

const TZ = "Asia/Ho_Chi_Minh";

describe("bookableUntil", () => {
  it("adds calendar days straight through weekends", () => {
    expect(
      bookableUntil({ type: "calendarDays", value: 60, rolling: true }, "2026-08-08", TZ),
    ).toBe("2026-10-07");
  });

  it("skips weekends for business days", () => {
    // 10 business days from Mon 2026-08-10 lands on Mon 2026-08-24.
    expect(
      bookableUntil({ type: "businessDays", value: 10, rolling: true }, "2026-08-10", TZ),
    ).toBe("2026-08-24");
  });

  it("returns endDate for a fixed range", () => {
    expect(
      bookableUntil(
        { type: "range", startDate: "2026-09-01", endDate: "2026-09-30" },
        "2026-08-08",
        TZ,
      ),
    ).toBe("2026-09-30");
  });

  it("falls back to the Eve-side cap when the window is unlimited", () => {
    expect(bookableUntil(null, "2026-08-08", TZ)).toBe("2026-10-07");
    expect(DEFAULT_MAX_ADVANCE_DAYS).toBe(60);
  });
});

describe("opensOn", () => {
  it("returns the day a calendar-day window first reaches the target", () => {
    // 2026-10-10 + 60 calendar days = 2026-12-09.
    expect(
      opensOn({ type: "calendarDays", value: 60, rolling: true }, "2026-12-09", TZ),
    ).toBe("2026-10-10");
  });

  it("round-trips with bookableUntil for business days", () => {
    const window = { type: "businessDays", value: 20, rolling: true } as const;
    const open = opensOn(window, "2026-12-09", TZ)!;
    expect(compare(bookableUntil(window, open, TZ), "2026-12-09")).toBeGreaterThanOrEqual(0);
    // One day earlier must NOT reach the target — proves it is the earliest.
    const dayBefore = shiftYmd(open, -1);
    expect(compare(bookableUntil(window, dayBefore, TZ), "2026-12-09")).toBeLessThan(0);
  });

  it("returns null for a fixed range (nothing rolls open)", () => {
    expect(
      opensOn(
        { type: "range", startDate: "2026-09-01", endDate: "2026-09-30" },
        "2026-12-09",
        TZ,
      ),
    ).toBeNull();
  });

  it("returns null when the window is unlimited", () => {
    expect(opensOn(null, "2026-12-09", TZ)).toBeNull();
  });
});

function compare(a: string, b: string): number {
  return a.localeCompare(b);
}

function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
