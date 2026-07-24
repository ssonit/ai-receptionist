/** App locales — EN default, VI optional. Guest and dashboard cookies stay separate. */

export const APP_LOCALES = ["en", "vi"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "en";

/** Guest chat `/chat` + `/b/[slug]` */
export const GUEST_LOCALE_COOKIE = "eve_guest_locale";
/** Operator dashboard */
export const DASHBOARD_LOCALE_COOKIE = "eve_dashboard_locale";
/** Browser → Eve HTTP agent */
export const EVE_LOCALE_HEADER = "x-eve-locale";

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return value === "en" || value === "vi";
}

export function parseAppLocale(
  value: string | null | undefined,
  fallback: AppLocale = DEFAULT_LOCALE,
): AppLocale {
  const cleaned = value?.trim().toLowerCase();
  return isAppLocale(cleaned) ? cleaned : fallback;
}

export function localeCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 365,
  };
}
