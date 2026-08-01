/**
 * calendarDayInTimeZone — the day Cal.com's /slots range is interpreted in.
 */
import { describe, expect, it } from "vitest";
import { calendarDayInTimeZone } from "./guest-timezone";

describe("calendarDayInTimeZone", () => {
  it("rolls forward east of UTC", () => {
    // 18:00Z is already the next morning in Vietnam — slicing the ISO string
    // asked Cal.com for the previous day and rejected an open slot.
    expect(calendarDayInTimeZone("2026-08-01T18:00:00.000Z", "Asia/Ho_Chi_Minh")).toBe(
      "2026-08-02",
    );
    expect(calendarDayInTimeZone("2026-08-01T23:30:00.000Z", "Asia/Ho_Chi_Minh")).toBe(
      "2026-08-02",
    );
  });

  it("rolls back west of UTC", () => {
    // 01:00Z is still the previous evening in Los Angeles — business hours.
    expect(calendarDayInTimeZone("2026-08-03T01:00:00.000Z", "America/Los_Angeles")).toBe(
      "2026-08-02",
    );
  });

  it("agrees with the naive slice when the offset does not cross midnight", () => {
    expect(calendarDayInTimeZone("2026-08-02T03:00:00.000Z", "Asia/Ho_Chi_Minh")).toBe(
      "2026-08-02",
    );
    expect(calendarDayInTimeZone("2026-08-02T12:00:00.000Z", "UTC")).toBe("2026-08-02");
  });

  it("handles an offset-bearing ISO string", () => {
    expect(calendarDayInTimeZone("2026-08-02T01:00:00+07:00", "Asia/Ho_Chi_Minh")).toBe(
      "2026-08-02",
    );
  });

  it("falls back instead of throwing on bad input", () => {
    expect(calendarDayInTimeZone("not-a-date", "Asia/Ho_Chi_Minh")).toBe("not-a-date");
    expect(calendarDayInTimeZone("2026-08-02T03:00:00.000Z", "Not/AZone")).toBe(
      "2026-08-02",
    );
  });
});
