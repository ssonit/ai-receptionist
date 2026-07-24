import { cookies } from "next/headers";
import {
  DASHBOARD_LOCALE_COOKIE,
  DEFAULT_LOCALE,
  GUEST_LOCALE_COOKIE,
  parseAppLocale,
  type AppLocale,
} from "@/lib/locale";

export async function readGuestLocale(): Promise<AppLocale> {
  const jar = await cookies();
  return parseAppLocale(jar.get(GUEST_LOCALE_COOKIE)?.value, DEFAULT_LOCALE);
}

export async function readDashboardLocale(): Promise<AppLocale> {
  const jar = await cookies();
  return parseAppLocale(
    jar.get(DASHBOARD_LOCALE_COOKIE)?.value,
    DEFAULT_LOCALE,
  );
}
