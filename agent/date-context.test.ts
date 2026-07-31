import { describe, expect, it } from "vitest";
import { addDaysYmd, compareYmd, nowHm, todayLabel, todayYmd, toYmd } from "../agent/date-context";

describe("date-context", () => {
  const fixedDate = new Date("2026-08-05T14:30:00.000Z"); // a Wednesday
  const tz = "Asia/Ho_Chi_Minh";

  describe("todayYmd", () => {
    it("returns YYYY-MM-DD in timezone", () => {
      // 2026-08-05 14:30 UTC = 2026-08-05 21:30 ICT → same day
      expect(todayYmd(tz, fixedDate)).toBe("2026-08-05");
    });

    it("handles timezone crossing midnight", () => {
      // 2026-08-05 20:00 UTC = 2026-08-06 03:00 ICT → next day
      const late = new Date("2026-08-05T20:00:00.000Z");
      expect(todayYmd(tz, late)).toBe("2026-08-06");
    });

    it("defaults date to new Date()", () => {
      const result = todayYmd("UTC");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("todayLabel", () => {
    it("returns human-readable date", () => {
      const label = todayLabel(tz, fixedDate);
      expect(label).toContain("2026");
      expect(label).toContain("August");
    });
  });

  describe("nowHm", () => {
    it("returns HH:mm in timezone", () => {
      // 14:30 UTC = 21:30 ICT
      expect(nowHm(tz, fixedDate)).toBe("21:30");
    });

    it("returns padded minutes", () => {
      const onTheHour = new Date("2026-08-05T07:00:00.000Z");
      expect(nowHm(tz, onTheHour)).toBe("14:00");
    });
  });

  describe("addDaysYmd", () => {
    it("adds days crossing month boundary", () => {
      expect(addDaysYmd("2026-01-30", 5, "UTC")).toBe("2026-02-04");
    });

    it("subtracts days", () => {
      expect(addDaysYmd("2026-01-05", -5, "UTC")).toBe("2025-12-31");
    });

    it("adds zero days", () => {
      expect(addDaysYmd("2026-08-05", 0, "UTC")).toBe("2026-08-05");
    });
  });

  describe("compareYmd", () => {
    it("returns negative when a < b", () => {
      expect(compareYmd("2026-01-01", "2026-01-02")).toBeLessThan(0);
    });

    it("returns 0 when equal", () => {
      expect(compareYmd("2026-08-05", "2026-08-05")).toBe(0);
    });

    it("returns positive when a > b", () => {
      expect(compareYmd("2026-12-31", "2026-01-01")).toBeGreaterThan(0);
    });
  });

  describe("toYmd", () => {
    it("extracts YYYY-MM-DD from ISO string", () => {
      expect(toYmd("2026-08-05T09:00:00.000Z")).toBe("2026-08-05");
    });

    it("passes through raw YYYY-MM-DD", () => {
      expect(toYmd("2026-08-05")).toBe("2026-08-05");
    });

    it("parses other date formats via Date.parse", () => {
      const result = toYmd("August 5, 2026");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("falls back to slice when unparseable", () => {
      const result = toYmd("not-a-date-2026-08-05-rest");
      // regex matches first 10 chars as YYYY-MM-DD
      expect(result).toBe("not-a-date");
    });
  });
});
