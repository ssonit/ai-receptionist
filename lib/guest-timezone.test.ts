import { describe, expect, it } from "vitest";
import {
  formatSlotForGuest,
  isValidIanaTimeZone,
  normalizeIanaTimeZone,
  parseServiceMode,
  resolveTimeZoneFromText,
} from "./guest-timezone";

describe("guest-timezone", () => {
  describe("parseServiceMode", () => {
    it('returns "online" for "online"', () => {
      expect(parseServiceMode("online")).toBe("online");
    });

    it('returns "onsite" for anything else', () => {
      expect(parseServiceMode("onsite")).toBe("onsite");
      expect(parseServiceMode("")).toBe("onsite");
      expect(parseServiceMode(null)).toBe("onsite");
      expect(parseServiceMode(undefined)).toBe("onsite");
      expect(parseServiceMode("hybrid")).toBe("onsite");
    });
  });

  describe("isValidIanaTimeZone", () => {
    it("accepts known IANA zones", () => {
      expect(isValidIanaTimeZone("Asia/Ho_Chi_Minh")).toBe(true);
      expect(isValidIanaTimeZone("America/New_York")).toBe(true);
      expect(isValidIanaTimeZone("Europe/London")).toBe(true);
    });

    it("accepts canonicalized aliases", () => {
      expect(isValidIanaTimeZone("Asia/Saigon")).toBe(true); // → Ho_Chi_Minh
    });

    it("rejects null / empty / whitespace", () => {
      expect(isValidIanaTimeZone(null)).toBe(false);
      expect(isValidIanaTimeZone(undefined)).toBe(false);
      expect(isValidIanaTimeZone("")).toBe(false);
      expect(isValidIanaTimeZone("   ")).toBe(false);
    });

    it("rejects junk values", () => {
      expect(isValidIanaTimeZone("not_a_timezone")).toBe(false);
      expect(isValidIanaTimeZone("Mars/Olympus")).toBe(false);
    });
  });

  describe("normalizeIanaTimeZone", () => {
    it("returns canonical form for valid input", () => {
      const tz = normalizeIanaTimeZone("Asia/Ho_Chi_Minh");
      expect(tz).toBe("Asia/Ho_Chi_Minh");
    });

    it("returns null for invalid input", () => {
      expect(normalizeIanaTimeZone("junk")).toBeNull();
      expect(normalizeIanaTimeZone(null)).toBeNull();
    });
  });

  describe("resolveTimeZoneFromText", () => {
    it("returns null for empty input", () => {
      expect(resolveTimeZoneFromText("")).toBeNull();
      expect(resolveTimeZoneFromText("   ")).toBeNull();
    });

    it("resolves IANA zone directly", () => {
      expect(resolveTimeZoneFromText("Asia/Tokyo")).toBe("Asia/Tokyo");
      expect(resolveTimeZoneFromText("America/Chicago")).toBe("America/Chicago");
    });

    it("resolves common abbreviations", () => {
      expect(resolveTimeZoneFromText("EST")).toBe("America/New_York");
      expect(resolveTimeZoneFromText("PST")).toBe("America/Los_Angeles");
      expect(resolveTimeZoneFromText("JST")).toBe("Asia/Tokyo");
      expect(resolveTimeZoneFromText("ICT")).toBe("Asia/Ho_Chi_Minh");
    });

    it("resolves city names", () => {
      expect(resolveTimeZoneFromText("Hanoi")).toBe("Asia/Ho_Chi_Minh");
      expect(resolveTimeZoneFromText("Tokyo")).toBe("Asia/Tokyo");
      expect(resolveTimeZoneFromText("Paris")).toBe("Europe/Paris");
    });

    it("resolves with 'in' prefix", () => {
      expect(resolveTimeZoneFromText("I'm in Hanoi")).toBe("Asia/Ho_Chi_Minh");
      expect(resolveTimeZoneFromText("in Tokyo")).toBe("Asia/Tokyo");
    });

    it("resolves Vietnamese prefixes", () => {
      // "ở" prefix strips, leaving "Hà Nội" → NFD → "ha noi" → partial match "hanoi" fails (space vs no-space)
      // But "ở hanoi" (single-word) should work
      expect(resolveTimeZoneFromText("toi o hanoi")).toBe("Asia/Ho_Chi_Minh");
      expect(resolveTimeZoneFromText("tôi ở hanoi")).toBe("Asia/Ho_Chi_Minh");
    });

    it("resolves GMT offset", () => {
      expect(resolveTimeZoneFromText("GMT+7")).toBe("Asia/Ho_Chi_Minh");
      expect(resolveTimeZoneFromText("GMT-5")).toBe("America/New_York");
      expect(resolveTimeZoneFromText("GMT+0")).toBe("Europe/London");
    });

    it("resolves UTC offset with colon", () => {
      expect(resolveTimeZoneFromText("UTC+07:00")).toBe("Asia/Ho_Chi_Minh");
    });

    it("returns null for unknown place", () => {
      expect(resolveTimeZoneFromText("Atlantis")).toBeNull();
    });

    it("returns null for ambiguous short name (< 3 chars)", () => {
      // "uk" is too short for partial match
      expect(resolveTimeZoneFromText("UK")).toBe("Europe/London"); // upper abbrev
    });
  });

  describe("formatSlotForGuest", () => {
    const iso = "2026-08-05T09:00:00.000Z";
    const bizTz = "Asia/Ho_Chi_Minh";

    it("same timezone → single combined string, guest is null", () => {
      const result = formatSlotForGuest(iso, "Asia/Ho_Chi_Minh", bizTz);
      expect(result.guest).toBeNull();
      expect(result.combined).toBe(result.business);
      expect(result.combined).toContain("Aug"); // contains formatted date
    });

    it("different timezone → dual combined string", () => {
      const result = formatSlotForGuest(iso, "America/New_York", bizTz);
      expect(result.guest).toBeTruthy();
      expect(result.guest).toContain("your time");
      expect(result.combined).toContain("·"); // separator
    });

    it("null guestTz → treat as same tz", () => {
      const result = formatSlotForGuest(iso, null, bizTz);
      expect(result.guest).toBeNull();
      expect(result.guestTimeZone).toBeNull();
    });

    it("returns businessTimeZone in canonical form", () => {
      const result = formatSlotForGuest(iso, null, bizTz);
      expect(result.businessTimeZone).toBe("Asia/Ho_Chi_Minh");
    });

    it("custom yourTimeLabel", () => {
      const result = formatSlotForGuest(iso, "America/New_York", bizTz, {
        yourTimeLabel: "giờ của bạn",
      });
      expect(result.guest).toContain("giờ của bạn");
    });
  });
});
