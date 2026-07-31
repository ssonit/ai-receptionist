import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  DASHBOARD_LOCALE_COOKIE,
  GUEST_LOCALE_COOKIE,
  isAppLocale,
  localeCookieOptions,
  parseAppLocale,
} from "./locale";

describe("locale", () => {
  describe("isAppLocale", () => {
    it("accepts en and vi", () => {
      expect(isAppLocale("en")).toBe(true);
      expect(isAppLocale("vi")).toBe(true);
    });

    it("rejects other values", () => {
      expect(isAppLocale("fr")).toBe(false);
      expect(isAppLocale("ja")).toBe(false);
      expect(isAppLocale("")).toBe(false);
      expect(isAppLocale(null)).toBe(false);
      expect(isAppLocale(undefined)).toBe(false);
    });
  });

  describe("parseAppLocale", () => {
    it("returns valid locale as-is", () => {
      expect(parseAppLocale("en")).toBe("en");
      expect(parseAppLocale("vi")).toBe("vi");
    });

    it("falls back to default for invalid", () => {
      expect(parseAppLocale("fr")).toBe("en");
      expect(parseAppLocale(null)).toBe("en");
    });

    it("accepts custom fallback", () => {
      expect(parseAppLocale("fr", "vi")).toBe("vi");
      expect(parseAppLocale(null, "vi")).toBe("vi");
    });

    it("trims and lowercases", () => {
      expect(parseAppLocale("  EN  ")).toBe("en");
      expect(parseAppLocale("  VI  ")).toBe("vi");
    });
  });

  describe("constants", () => {
    it("guest and dashboard cookies are different", () => {
      expect(GUEST_LOCALE_COOKIE).not.toBe(DASHBOARD_LOCALE_COOKIE);
    });

    it("default locale is en", () => {
      expect(DEFAULT_LOCALE).toBe("en");
    });
  });

  describe("localeCookieOptions", () => {
    it("has path / and long maxAge", () => {
      const opts = localeCookieOptions();
      expect(opts.path).toBe("/");
      expect(opts.maxAge).toBe(60 * 60 * 24 * 365);
      expect(opts.sameSite).toBe("lax");
    });
  });
});
