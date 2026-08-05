import { AUTH_ERROR_CODE, type AuthErrorCode } from "@/lib/errors/auth-codes";

/** User-facing Auth copy — never leak raw Supabase / provider strings. */

export const AUTH_ERROR_MESSAGE = {
  [AUTH_ERROR_CODE.EMAIL_PASSWORD_REQUIRED]:
    "Email and password are required.",
  [AUTH_ERROR_CODE.WEAK_PASSWORD]:
    "Password must be at least 6 characters.",
  [AUTH_ERROR_CODE.INVALID_CREDENTIALS]:
    "Email or password is incorrect. Check both and try again.",
  [AUTH_ERROR_CODE.EMAIL_NOT_CONFIRMED]:
    "Confirm your email before signing in. Check your inbox for the link.",
  [AUTH_ERROR_CODE.USER_ALREADY_EXISTS]:
    "An account with this email already exists. Sign in instead.",
  [AUTH_ERROR_CODE.RATE_LIMITED]:
    "Too many attempts. Wait a moment and try again.",
  [AUTH_ERROR_CODE.NETWORK]:
    "Could not reach the server. Check your connection and try again.",
  [AUTH_ERROR_CODE.SIGN_IN_FAILED]:
    "Could not sign in. Check your email and password, then try again.",
  [AUTH_ERROR_CODE.SIGN_UP_FAILED]:
    "Could not create your account. Check the details and try again.",
  [AUTH_ERROR_CODE.PASSWORD_RESET_SENT]:
    "If an account with that email exists, we've sent a reset link. Check your inbox.",
  [AUTH_ERROR_CODE.PASSWORD_RESET_FAILED]:
    "Could not send the reset link. Try again in a moment.",
  [AUTH_ERROR_CODE.INVALID_RESET_TOKEN]:
    "This reset link is expired or invalid. Request a new one.",
  [AUTH_ERROR_CODE.NAME_REQUIRED]:
    "Full name is required.",
  [AUTH_ERROR_CODE.OAUTH_FAILED]:
    "Could not sign in with Google. Try again.",
  [AUTH_ERROR_CODE.OAUTH_INVITE_INVALID]:
    "That invite link is no longer valid, but you're signed in — check your dashboard or ask the workspace owner for a new invite.",
} as const satisfies Record<AuthErrorCode, string>;

export function authErrorMessage(code: AuthErrorCode): string {
  return AUTH_ERROR_MESSAGE[code];
}
