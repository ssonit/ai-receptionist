// lib/guest-email-placeholder.ts
/**
 * Pure — no server-only imports. Safe to use from "use client" components
 * (dashboard tables) as well as server code (lib/booking-create.ts).
 */
export const NO_EMAIL_PLACEHOLDER_DOMAIN = "no-email.invalid";

/**
 * Per-booking placeholder for Cal.com's required attendee.email when the
 * guest declined to give a real one. `.invalid` (RFC 2606) never resolves,
 * so any confirmation email Cal.com sends there just bounces silently.
 */
export function generatePlaceholderGuestEmail(): string {
  return `guest-${crypto.randomUUID()}@${NO_EMAIL_PLACEHOLDER_DOMAIN}`;
}

export function isPlaceholderGuestEmail(
  email: string | null | undefined,
): boolean {
  const trimmed = email?.trim().toLowerCase();
  if (!trimmed) return false;
  return trimmed.endsWith(`@${NO_EMAIL_PLACEHOLDER_DOMAIN}`);
}

/** For UI: real email (trimmed) or null — never show a placeholder to staff. */
export function displayGuestEmail(
  email: string | null | undefined,
): string | null {
  const trimmed = email?.trim();
  if (!trimmed || isPlaceholderGuestEmail(trimmed)) return null;
  return trimmed;
}
