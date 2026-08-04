// lib/guest-email-placeholder.test.ts
import { describe, expect, it } from "vitest";
import {
  NO_EMAIL_PLACEHOLDER_DOMAIN,
  generatePlaceholderGuestEmail,
  isPlaceholderGuestEmail,
  displayGuestEmail,
} from "./guest-email-placeholder";

describe("generatePlaceholderGuestEmail", () => {
  it("returns a syntactically valid, unique address on the placeholder domain", () => {
    const a = generatePlaceholderGuestEmail();
    const b = generatePlaceholderGuestEmail();
    expect(a).toMatch(/^guest-[0-9a-f-]{36}@no-email\.invalid$/);
    expect(a).not.toBe(b);
    expect(a.endsWith(`@${NO_EMAIL_PLACEHOLDER_DOMAIN}`)).toBe(true);
  });
});

describe("isPlaceholderGuestEmail", () => {
  it("returns true for a generated placeholder", () => {
    expect(isPlaceholderGuestEmail(generatePlaceholderGuestEmail())).toBe(true);
  });

  it("is case-insensitive on the domain", () => {
    expect(isPlaceholderGuestEmail("guest-abc@NO-EMAIL.INVALID")).toBe(true);
  });

  it("returns false for a real email", () => {
    expect(isPlaceholderGuestEmail("a@example.com")).toBe(false);
  });

  it("returns false for null/undefined/empty", () => {
    expect(isPlaceholderGuestEmail(null)).toBe(false);
    expect(isPlaceholderGuestEmail(undefined)).toBe(false);
    expect(isPlaceholderGuestEmail("")).toBe(false);
  });
});

describe("displayGuestEmail", () => {
  it("returns the trimmed email when real", () => {
    expect(displayGuestEmail("  a@example.com  ")).toBe("a@example.com");
  });

  it("returns null for a placeholder", () => {
    expect(displayGuestEmail(generatePlaceholderGuestEmail())).toBeNull();
  });

  it("returns null for null/undefined/empty", () => {
    expect(displayGuestEmail(null)).toBeNull();
    expect(displayGuestEmail(undefined)).toBeNull();
    expect(displayGuestEmail("")).toBeNull();
  });
});
