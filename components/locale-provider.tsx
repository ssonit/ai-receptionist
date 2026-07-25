"use client";

import * as React from "react";
import { NextIntlClientProvider } from "next-intl";
import { createTranslator, DEFAULT_INTL_TIMEZONE, getMessages } from "@/lib/i18n";
import {
  DASHBOARD_LOCALE_COOKIE,
  DEFAULT_LOCALE,
  GUEST_LOCALE_COOKIE,
  localeCookieOptions,
  parseAppLocale,
  type AppLocale,
} from "@/lib/locale";
import { cn } from "@/lib/utils";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
}

function writeCookie(name: string, value: AppLocale) {
  const opts = localeCookieOptions();
  document.cookie = `${name}=${encodeURIComponent(value)}; path=${opts.path}; max-age=${opts.maxAge}; samesite=${opts.sameSite}`;
}

type LocaleKind = "guest" | "dashboard";

function cookieNameFor(kind: LocaleKind) {
  return kind === "guest" ? GUEST_LOCALE_COOKIE : DASHBOARD_LOCALE_COOKIE;
}

const LocaleCtx = React.createContext<{
  locale: AppLocale;
  setLocale: (next: AppLocale) => void;
  kind: LocaleKind;
} | null>(null);

export function useAppLocale() {
  const ctx = React.useContext(LocaleCtx);
  if (!ctx) {
    throw new Error("useAppLocale must be used within LocaleProvider");
  }
  return ctx;
}

export function useOptionalAppLocale() {
  return React.useContext(LocaleCtx);
}

export function LocaleProvider({
  kind,
  initialLocale,
  children,
}: {
  kind: LocaleKind;
  initialLocale?: AppLocale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = React.useState<AppLocale>(() =>
    parseAppLocale(initialLocale ?? DEFAULT_LOCALE),
  );

  React.useEffect(() => {
    const fromCookie = parseAppLocale(
      readCookie(cookieNameFor(kind)),
      initialLocale ?? DEFAULT_LOCALE,
    );
    setLocaleState(fromCookie);
  }, [kind, initialLocale]);

  const setLocale = React.useCallback(
    (next: AppLocale) => {
      const parsed = parseAppLocale(next);
      writeCookie(cookieNameFor(kind), parsed);
      setLocaleState(parsed);
    },
    [kind],
  );

  const messages = React.useMemo(() => getMessages(locale), [locale]);

  return (
    <LocaleCtx.Provider value={{ locale, setLocale, kind }}>
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone={DEFAULT_INTL_TIMEZONE}
      >
        {children}
      </NextIntlClientProvider>
    </LocaleCtx.Provider>
  );
}

/** Compact EN | VI control for chat header / dashboard chrome. */
export function LocaleToggle({
  className,
  variant = "dark",
}: {
  className?: string;
  /** `dark` for chat chrome; `light` for dashboard header. */
  variant?: "dark" | "light";
}) {
  const { locale, setLocale, kind } = useAppLocale();
  const t = createTranslator(locale);

  return (
    <div
      aria-label={kind === "guest" ? t("chat.language") : t("dashboard.language")}
      className={cn(
        "inline-flex items-center rounded-full p-0.5 text-[11px] font-medium tracking-wide",
        variant === "dark"
          ? "border border-white/10 bg-black/20"
          : "border border-border bg-muted/60",
        className,
      )}
      role="group"
    >
      {(["en", "vi"] as const).map((code) => {
        const active = locale === code;
        return (
          <button
            className={cn(
              "rounded-full px-2.5 py-1 transition",
              variant === "dark"
                ? active
                  ? "bg-white/15 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
                : active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
            )}
            key={code}
            onClick={() => setLocale(code)}
            type="button"
          >
            {t(`common.${code}`)}
          </button>
        );
      })}
    </div>
  );
}
