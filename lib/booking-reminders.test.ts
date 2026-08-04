import { describe, expect, it } from "vitest";
import { resolveReminderEmail } from "./booking-reminders";
import { generatePlaceholderGuestEmail } from "./guest-email-placeholder";

describe("resolveReminderEmail", () => {
  it("prefers the explicit destination over the booking's guest_email", () => {
    expect(resolveReminderEmail("a@example.com", "b@example.com")).toBe(
      "a@example.com",
    );
  });

  it("falls back to guest_email when destination is null", () => {
    expect(resolveReminderEmail(null, "b@example.com")).toBe(
      "b@example.com",
    );
  });

  it("returns null when both are empty", () => {
    expect(resolveReminderEmail(null, null)).toBeNull();
    expect(resolveReminderEmail("", "")).toBeNull();
  });

  it("returns null for a placeholder guest_email", () => {
    expect(resolveReminderEmail(null, generatePlaceholderGuestEmail())).toBeNull();
  });

  it("returns null for a placeholder destination", () => {
    expect(
      resolveReminderEmail(generatePlaceholderGuestEmail(), "b@example.com"),
    ).toBeNull();
  });
});
