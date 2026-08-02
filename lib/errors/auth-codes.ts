/** Stable Auth error codes (product + Supabase-aligned). */

export const AUTH_ERROR_CODE = {
  EMAIL_PASSWORD_REQUIRED: "email_password_required",
  WEAK_PASSWORD: "weak_password",
  INVALID_CREDENTIALS: "invalid_credentials",
  EMAIL_NOT_CONFIRMED: "email_not_confirmed",
  USER_ALREADY_EXISTS: "user_already_exists",
  RATE_LIMITED: "over_request_rate_limit",
  NETWORK: "network_error",
  SIGN_IN_FAILED: "sign_in_failed",
  SIGN_UP_FAILED: "sign_up_failed",
  PASSWORD_RESET_SENT: "password_reset_sent",
  PASSWORD_RESET_FAILED: "password_reset_failed",
  INVALID_RESET_TOKEN: "invalid_reset_token",
  NAME_REQUIRED: "name_required",
} as const;

export type AuthErrorCode =
  (typeof AUTH_ERROR_CODE)[keyof typeof AUTH_ERROR_CODE];

export type AuthErrorContext = "signIn" | "signUp";
