import { describe, expect, it } from "vitest";
import {
  getCalBookingView,
  getCalBookingViewLabel,
  getCalLifecycleBadgeLabel,
  hasRecurringBooking,
  isCancelledStatus,
  isUnconfirmedStatus,
  normalizeCalApiStatus,
} from "./booking-status";

describe("booking-status", () => {
  describe("normalizeCalApiStatus", () => {
    it("maps confirmed / done → accepted", () => {
      expect(normalizeCalApiStatus("confirmed")).toBe("accepted");
      expect(normalizeCalApiStatus("done")).toBe("accepted");
    });

    it("maps canceled → cancelled (British spelling)", () => {
      expect(normalizeCalApiStatus("canceled")).toBe("cancelled");
    });

    it("maps unconfirmed / awaiting_host → pending", () => {
      expect(normalizeCalApiStatus("unconfirmed")).toBe("pending");
      expect(normalizeCalApiStatus("awaiting_host")).toBe("pending");
    });

    it("passes through known lifecycle statuses", () => {
      expect(normalizeCalApiStatus("accepted")).toBe("accepted");
      expect(normalizeCalApiStatus("pending")).toBe("pending");
      expect(normalizeCalApiStatus("cancelled")).toBe("cancelled");
      expect(normalizeCalApiStatus("rejected")).toBe("rejected");
    });

    it("lowercases and trims", () => {
      expect(normalizeCalApiStatus("  CONFIRMED  ")).toBe("accepted");
    });

    it("returns unrecognized status as-is (lowered)", () => {
      expect(normalizeCalApiStatus("weird_status")).toBe("weird_status");
    });
  });

  describe("isCancelledStatus", () => {
    it("true for cancelled and rejected", () => {
      expect(isCancelledStatus("cancelled")).toBe(true);
      expect(isCancelledStatus("rejected")).toBe(true);
      expect(isCancelledStatus("canceled")).toBe(true); // via normalize
    });

    it("false for other statuses", () => {
      expect(isCancelledStatus("accepted")).toBe(false);
      expect(isCancelledStatus("pending")).toBe(false);
    });
  });

  describe("isUnconfirmedStatus", () => {
    it("true for pending/unconfirmed", () => {
      expect(isUnconfirmedStatus("pending")).toBe(true);
      expect(isUnconfirmedStatus("unconfirmed")).toBe(true);
    });

    it("false for accepted/cancelled", () => {
      expect(isUnconfirmedStatus("accepted")).toBe(false);
      expect(isUnconfirmedStatus("cancelled")).toBe(false);
    });
  });

  describe("hasRecurringBooking", () => {
    it("false for null/undefined/string", () => {
      expect(hasRecurringBooking(null)).toBe(false);
      expect(hasRecurringBooking(undefined)).toBe(false);
      expect(hasRecurringBooking("not an object")).toBe(false);
    });

    it("detects recurringEventId", () => {
      expect(hasRecurringBooking({ recurringEventId: "evt_123" })).toBe(true);
    });

    it("detects recurringBookingUid", () => {
      expect(hasRecurringBooking({ recurringBookingUid: "uid_456" })).toBe(true);
    });

    it("detects fromReschedule === recurring", () => {
      expect(hasRecurringBooking({ fromReschedule: "recurring" })).toBe(true);
    });

    it("false when fromReschedule is not 'recurring'", () => {
      expect(hasRecurringBooking({ fromReschedule: "single" })).toBe(false);
    });

    it("detects nested data.recurringEventId", () => {
      expect(
        hasRecurringBooking({ data: { recurringEventId: "evt_789" } }),
      ).toBe(true);
    });
  });

  describe("getCalBookingView", () => {
    const future = "2026-08-15T10:00:00.000Z";
    const past = "2026-01-01T10:00:00.000Z";
    const fixedNow = new Date("2026-08-01T00:00:00.000Z").getTime();

    it("returns listFilter when provided", () => {
      expect(
        getCalBookingView("accepted", future, {
          nowMs: fixedNow,
          listFilter: "unconfirmed",
        }),
      ).toBe("unconfirmed");
    });

    it("returns cancelled for cancelled status", () => {
      expect(
        getCalBookingView("cancelled", future, { nowMs: fixedNow }),
      ).toBe("cancelled");
    });

    it("returns unconfirmed for pending status", () => {
      expect(
        getCalBookingView("pending", future, { nowMs: fixedNow }),
      ).toBe("unconfirmed");
    });

    it("returns recurring for recurring booking", () => {
      expect(
        getCalBookingView("accepted", future, {
          nowMs: fixedNow,
          raw: { recurringEventId: "evt_1" },
        }),
      ).toBe("recurring");
    });

    it("returns past for past start time", () => {
      expect(
        getCalBookingView("accepted", past, { nowMs: fixedNow }),
      ).toBe("past");
    });

    it("returns upcoming for future accepted booking", () => {
      expect(
        getCalBookingView("accepted", future, { nowMs: fixedNow }),
      ).toBe("upcoming");
    });

    it("defaults nowMs to Date.now() when not provided", () => {
      const view = getCalBookingView("accepted", "2099-01-01T00:00:00.000Z");
      expect(view).toBe("upcoming");
    });
  });

  describe("getCalBookingViewLabel", () => {
    it("returns human label for each view", () => {
      // Use extreme dates so nowMs doesn't matter
      expect(
        getCalBookingViewLabel("accepted", "2099-01-01T00:00:00.000Z"),
      ).toBe("Upcoming");
      expect(
        getCalBookingViewLabel("accepted", "2020-01-01T00:00:00.000Z"),
      ).toBe("Past");
      expect(
        getCalBookingViewLabel("cancelled", "2099-01-01T00:00:00.000Z"),
      ).toBe("Canceled");
      expect(
        getCalBookingViewLabel("pending", "2099-01-01T00:00:00.000Z"),
      ).toBe("Unconfirmed");
    });
  });

  describe("getCalLifecycleBadgeLabel", () => {
    it("returns Confirmed for accepted", () => {
      expect(getCalLifecycleBadgeLabel("accepted")).toBe("Confirmed");
    });

    it("returns Unconfirmed for pending", () => {
      expect(getCalLifecycleBadgeLabel("pending")).toBe("Unconfirmed");
    });

    it("returns Canceled for cancelled", () => {
      expect(getCalLifecycleBadgeLabel("cancelled")).toBe("Canceled");
    });

    it("returns Rejected for rejected", () => {
      expect(getCalLifecycleBadgeLabel("rejected")).toBe("Rejected");
    });

    it("falls back to raw status string for unknown", () => {
      expect(getCalLifecycleBadgeLabel("bogus")).toBe("bogus");
    });
  });
});
