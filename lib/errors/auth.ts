import {
  AUTH_ERROR_CODE,
  type AuthErrorContext,
} from "@/lib/errors/auth-codes";
import { authErrorMessage } from "@/lib/errors/auth-messages";

type ProviderAuthError = {
  message?: string;
  code?: string;
  status?: number;
} | null | undefined;

/** Match provider `code` or message fragments → product AuthErrorCode. */
const PROVIDER_CODE_MAP: Record<string, keyof typeof AUTH_ERROR_CODE> = {
  invalid_credentials: "INVALID_CREDENTIALS",
  email_not_confirmed: "EMAIL_NOT_CONFIRMED",
  user_already_exists: "USER_ALREADY_EXISTS",
  weak_password: "WEAK_PASSWORD",
  over_request_rate_limit: "RATE_LIMITED",
  unexpected_failure: "NETWORK",
};

const MESSAGE_MATCHERS: ReadonlyArray<{
  includes: readonly string[];
  key: keyof typeof AUTH_ERROR_CODE;
}> = [
  {
    includes: ["invalid login credentials", "invalid credentials"],
    key: "INVALID_CREDENTIALS",
  },
  {
    includes: ["email not confirmed"],
    key: "EMAIL_NOT_CONFIRMED",
  },
  {
    includes: ["already registered", "user already registered"],
    key: "USER_ALREADY_EXISTS",
  },
  {
    includes: ["password should be at least", "password is too short"],
    key: "WEAK_PASSWORD",
  },
  {
    includes: ["rate limit", "too many requests"],
    key: "RATE_LIMITED",
  },
  {
    includes: ["network", "fetch failed"],
    key: "NETWORK",
  },
];

/**
 * Map Supabase (or similar) Auth errors to clear product copy.
 * Never return raw `error.message` to the UI.
 */
export function formatAuthError(
  error: ProviderAuthError,
  context: AuthErrorContext,
): string {
  const raw = (error?.message ?? "").trim();
  const providerCode = (error?.code ?? "").trim().toLowerCase();
  const normalized = raw.toLowerCase();

  const fromCode = PROVIDER_CODE_MAP[providerCode];
  if (fromCode) {
    return authErrorMessage(AUTH_ERROR_CODE[fromCode]);
  }

  for (const rule of MESSAGE_MATCHERS) {
    if (rule.includes.some((fragment) => normalized.includes(fragment))) {
      return authErrorMessage(AUTH_ERROR_CODE[rule.key]);
    }
  }

  return authErrorMessage(
    context === "signIn"
      ? AUTH_ERROR_CODE.SIGN_IN_FAILED
      : AUTH_ERROR_CODE.SIGN_UP_FAILED,
  );
}
