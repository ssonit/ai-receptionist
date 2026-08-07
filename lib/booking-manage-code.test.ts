import { describe, expect, it } from "vitest";
import {
  bookingCodesEqual,
  generateManageCode,
  generateOtpDigits,
  hashBookingCode,
  MANAGE_CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
  normalizeBookingCodeInput,
  OTP_TTL_MS,
} from "./booking-manage-code";

describe("booking-manage-code", () => {
  describe("generateManageCode", () => {
    it("returns a 6-character string", () => {
      const code = generateManageCode();
      expect(code.length).toBe(6);
    });

    it("only contains characters from the non-ambiguous alphabet", () => {
      const valid = new Set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
      // Generate 50 codes — all chars should be valid
      for (let i = 0; i < 50; i++) {
        const code = generateManageCode();
        for (const ch of code) {
          expect(valid.has(ch), `invalid char "${ch}" in "${code}"`).toBe(true);
        }
      }
    });

    it("generates different codes (not a fixed return)", () => {
      const codes = new Set<string>();
      for (let i = 0; i < 20; i++) codes.add(generateManageCode());
      // With 32^6 space, probability of collision in 20 draws is essentially zero
      expect(codes.size).toBeGreaterThan(1);
    });
  });

  describe("generateOtpDigits", () => {
    it("returns a 6-digit string", () => {
      const otp = generateOtpDigits();
      expect(otp.length).toBe(6);
      expect(/^\d{6}$/.test(otp)).toBe(true);
    });

    it("returns different values", () => {
      const a = generateOtpDigits();
      const b = generateOtpDigits();
      // Extremely unlikely to collide
      expect(a).not.toBe(b);
    });
  });

  describe("hashBookingCode", () => {
    it("is deterministic", () => {
      const a = hashBookingCode("ABC123");
      const b = hashBookingCode("ABC123");
      expect(a).toBe(b);
      expect(a.length).toBe(64); // sha256 hex
    });

    it("is case-insensitive for input", () => {
      expect(hashBookingCode("abc123")).toBe(hashBookingCode("ABC123"));
      expect(hashBookingCode("  abc123  ")).toBe(hashBookingCode("ABC123"));
    });

    it("produces different hashes for different codes", () => {
      expect(hashBookingCode("AAAAAA")).not.toBe(hashBookingCode("BBBBBB"));
    });
  });

  describe("bookingCodesEqual", () => {
    it("returns true for matching hash and plaintext", () => {
      const plain = "TEST12";
      const hash = hashBookingCode(plain);
      expect(bookingCodesEqual(hash, plain)).toBe(true);
    });

    it("returns false for non-matching code", () => {
      const hash = hashBookingCode("AAAAAA");
      expect(bookingCodesEqual(hash, "BBBBBB")).toBe(false);
    });

    it("is case-insensitive", () => {
      const hash = hashBookingCode("TE-ST12");
      expect(bookingCodesEqual(hash, "te-st12")).toBe(true);
      expect(bookingCodesEqual(hash, "TE-ST12")).toBe(true);
    });

    it("returns false for different-length hashes", () => {
      expect(bookingCodesEqual("short", "ANYCODE")).toBe(false);
    });
  });

  describe("normalizeBookingCodeInput", () => {
    it("trims and uppercases", () => {
      expect(normalizeBookingCodeInput("  abc 123 ")).toBe("ABC123");
    });

    it("removes internal whitespace", () => {
      expect(normalizeBookingCodeInput("AB C 12 3")).toBe("ABC123");
    });
  });

  describe("constants", () => {
    it("MANAGE_CODE_TTL_MS is 365 days in ms", () => {
      expect(MANAGE_CODE_TTL_MS).toBe(365 * 24 * 60 * 60 * 1000);
    });

    it("OTP_TTL_MS is 10 minutes", () => {
      expect(OTP_TTL_MS).toBe(10 * 60 * 1000);
    });

    it("MAX_CODE_ATTEMPTS is 5", () => {
      expect(MAX_CODE_ATTEMPTS).toBe(5);
    });
  });
});
