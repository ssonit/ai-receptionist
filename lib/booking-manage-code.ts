/**
 * 6-char manage codes / OTP hashes for guest booking change.
 * Alphabet avoids ambiguous chars (0/O, 1/I).
 */
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN = 6;

function pepper(): string {
  return (
    process.env.BOOKING_MANAGE_CODE_PEPPER?.trim() ||
    process.env.WORKSPACE_SECRETS_KEY?.trim() ||
    "eve-dev-manage-code-pepper"
  );
}

export function generateManageCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)]!;
  }
  return out;
}

export function generateOtpDigits(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashBookingCode(plaintext: string): string {
  return createHash("sha256")
    .update(`${pepper()}:${plaintext.trim().toUpperCase()}`)
    .digest("hex");
}

export function bookingCodesEqual(aHash: string, plaintext: string): boolean {
  const b = Buffer.from(hashBookingCode(plaintext), "utf8");
  const a = Buffer.from(aHash.trim(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Normalize user-entered manage code / OTP. */
export function normalizeBookingCodeInput(raw: string): string {
  return raw.replace(/\s+/g, "").trim().toUpperCase();
}

export const MANAGE_CODE_TTL_MS = 365 * 24 * 60 * 60 * 1000; // stored on booking permanently until used conceptually
export const OTP_TTL_MS = 10 * 60 * 1000;
export const PHONE_LAST4_TTL_MS = 30 * 60 * 1000;
export const VERIFIED_UNTIL_MS = 30 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
/** Lockout window for manage_code / phone_last4 brute-force attempts (no pre-issued row to attach attempts to). */
export const CODE_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const OTP_PER_SESSION_PER_HOUR = 3;
export const OTP_PER_EMAIL_PER_HOUR = 5;
/** Shared sender reputation: max OTP sends per workspace per UTC day. */
export const OTP_PER_WORKSPACE_PER_DAY = 100;
