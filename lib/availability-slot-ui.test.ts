import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_SLOT_UI,
  buildSlotPickerModel,
  buildSlotSelectMessage,
  formatDayLabel,
  formatSlotTimeLabel,
  hourInTimeZone,
  periodForHour,
  SLOT_PERIOD,
} from "./availability-slot-ui";

describe("availability-slot-ui", () => {
  describe("periodForHour", () => {
    it("maps morning / afternoon / evening", () => {
      expect(periodForHour(0)).toBe(SLOT_PERIOD.MORNING);
      expect(periodForHour(11)).toBe(SLOT_PERIOD.MORNING);
      expect(periodForHour(12)).toBe(SLOT_PERIOD.AFTERNOON);
      expect(periodForHour(16)).toBe(SLOT_PERIOD.AFTERNOON);
      expect(periodForHour(17)).toBe(SLOT_PERIOD.EVENING);
      expect(periodForHour(23)).toBe(SLOT_PERIOD.EVENING);
    });
  });

  describe("hourInTimeZone", () => {
    it("reads hour in Asia/Ho_Chi_Minh", () => {
      // 2026-07-31T06:00:00Z = 13:00 in +07
      expect(hourInTimeZone("2026-07-31T06:00:00.000Z", "Asia/Ho_Chi_Minh")).toBe(
        13,
      );
    });
  });

  describe("formatSlotTimeLabel", () => {
    it("formats a short time label", () => {
      const label = formatSlotTimeLabel(
        "2026-07-31T07:00:00.000Z",
        "Asia/Ho_Chi_Minh",
        "en-US",
      );
      expect(label).toMatch(/2:00\s*PM/i);
    });
  });

  describe("formatDayLabel", () => {
    it("formats YYYY-MM-DD", () => {
      expect(formatDayLabel("2026-07-31", "en-US")).toMatch(/Jul/);
      expect(formatDayLabel("2026-07-31", "en-US")).toMatch(/31/);
    });
  });

  describe("buildSlotSelectMessage", () => {
    it("includes display and ISO start", () => {
      expect(
        buildSlotSelectMessage({
          display: "Fri 2:00 PM ICT",
          start: "2026-07-31T07:00:00.000Z",
        }),
      ).toBe("I'd like Fri 2:00 PM ICT (start=2026-07-31T07:00:00.000Z)");
    });
  });

  describe("buildSlotPickerModel", () => {
    it("returns null for failed or empty output", () => {
      expect(buildSlotPickerModel(null)).toBeNull();
      expect(buildSlotPickerModel({ ok: false, error: "x" })).toBeNull();
      expect(buildSlotPickerModel({ ok: true, slots: [] })).toBeNull();
    });

    it("shows one day only and reports other days with openings", () => {
      const slotsByDay: Record<
        string,
        Array<{
          start: string;
          display: string;
          guestDisplay: string | null;
          businessDisplay: string;
        }>
      > = {};

      // Day 1: afternoon slots in +07 (UTC = local - 7)
      slotsByDay["2026-07-31"] = Array.from({ length: 14 }, (_, i) => {
        const hourLocal = 13 + Math.floor(i / 2); // 13:00, 13:30, ...
        const minute = i % 2 === 0 ? "00" : "30";
        const utcHour = hourLocal - 7;
        return {
          start: `2026-07-31T${String(utcHour).padStart(2, "0")}:${minute}:00.000Z`,
          display: `${hourLocal}:${minute} PM`,
          guestDisplay: null,
          businessDisplay: `${hourLocal}:${minute}`,
        };
      });

      slotsByDay["2026-08-01"] = [
        {
          start: "2026-08-01T02:00:00.000Z", // 09:00 +07 morning
          display: "Sat 9:00 AM",
          guestDisplay: null,
          businessDisplay: "Sat 9:00 AM",
        },
      ];
      slotsByDay["2026-08-02"] = [
        {
          start: "2026-08-02T03:00:00.000Z",
          display: "Sun 10:00 AM",
          guestDisplay: null,
          businessDisplay: "Sun 10:00 AM",
        },
      ];
      slotsByDay["2026-08-03"] = [
        {
          start: "2026-08-03T03:00:00.000Z",
          display: "Mon 10:00 AM",
          guestDisplay: null,
          businessDisplay: "Mon 10:00 AM",
        },
      ];

      const model = buildSlotPickerModel({
        ok: true,
        businessTimeZone: "Asia/Ho_Chi_Minh",
        truncated: true,
        slotsByDay,
      });

      expect(model).not.toBeNull();
      expect(model!.truncated).toBe(true);
      expect(model!.days).toHaveLength(AVAILABILITY_SLOT_UI.MAX_DAYS);
      expect(model!.days).toHaveLength(1);
      expect(model!.days[0]!.day).toBe("2026-07-31");
      expect(model!.otherDaysWithSlots).toBe(3);
      expect(model!.days[0]!.hiddenCount).toBe(2);
      const visibleCount = model!.days[0]!.periods.reduce(
        (n, p) => n + p.slots.length,
        0,
      );
      expect(visibleCount).toBe(AVAILABILITY_SLOT_UI.MAX_SLOTS_PER_DAY);
      expect(model!.days[0]!.periods[0]!.period).toBe(SLOT_PERIOD.AFTERNOON);
    });

    it("falls back to flat slots when slotsByDay missing", () => {
      const model = buildSlotPickerModel({
        ok: true,
        timezone: "UTC",
        slots: [
          {
            start: "2026-07-31T14:00:00.000Z",
            display: "2:00 PM UTC",
            guestDisplay: null,
            businessDisplay: "2:00 PM UTC",
          },
        ],
      });
      expect(model?.days).toHaveLength(1);
      expect(model?.days[0]?.periods[0]?.slots[0]?.start).toBe(
        "2026-07-31T14:00:00.000Z",
      );
    });
  });
});
