import en from "@/messages/en.json";
import vi from "@/messages/vi.json";
import {
  DEFAULT_LOCALE,
  type AppLocale,
  parseAppLocale,
} from "@/lib/locale";

/**
 * Stable IANA zone for next-intl date/time formatting so SSR and the
 * browser never disagree (ENVIRONMENT_FALLBACK). Booking slots still use
 * workspace / guest timezones elsewhere — this is chrome copy only.
 */
export const DEFAULT_INTL_TIMEZONE = "UTC";

export type Messages = typeof en;

const catalogs: Record<AppLocale, Messages> = {
  en,
  vi,
};

export function getMessages(locale: AppLocale | string): Messages {
  return catalogs[parseAppLocale(locale)] ?? catalogs[DEFAULT_LOCALE];
}

type NestedValue = string | { [key: string]: NestedValue };

function lookup(messages: Messages, key: string): string | undefined {
  const parts = key.split(".");
  let cur: NestedValue = messages as NestedValue;
  for (const part of parts) {
    if (cur == null || typeof cur === "string") return undefined;
    cur = cur[part]!;
  }
  return typeof cur === "string" ? cur : undefined;
}

/** Simple dotted-key translator (no ICU). */
export function createTranslator(locale: AppLocale | string) {
  const messages = getMessages(locale);
  return function t(key: string, fallback?: string): string {
    return lookup(messages, key) ?? fallback ?? key;
  };
}
