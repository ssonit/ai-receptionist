/**
 * Shared date helpers for agent prompts/tools (workspace timezone).
 */

/** YYYY-MM-DD in the given IANA timezone. */
export function todayYmd(timeZone: string, date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Human label like "Wednesday, 22 July 2026". */
export function todayLabel(timeZone: string, date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

/** Local clock time HH:mm in timezone. */
export function nowHm(timeZone: string, date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function addDaysYmd(ymd: string, days: number, timeZone: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  utc.setUTCDate(utc.getUTCDate() + days);
  return todayYmd(timeZone, utc);
}

export function compareYmd(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Normalize a tool date input to YYYY-MM-DD (first 10 chars if ISO). */
export function toYmd(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return trimmed.slice(0, 10);
  return todayYmd("UTC", new Date(parsed));
}
