/**
 * Guest timezone helpers — validate, parse spoken locations, dual-format slots.
 * Business calendar stays on workspaces.timezone; this is display + intent only.
 */
import { canonicalizeTimezone, listTimezoneOptions } from "@/lib/timezones";

const ABBREV: Record<string, string> = {
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
  MST: "America/Denver",
  MDT: "America/Denver",
  CST: "America/Chicago",
  CDT: "America/Chicago",
  EST: "America/New_York",
  EDT: "America/New_York",
  CET: "Europe/Berlin",
  CEST: "Europe/Berlin",
  GMT: "Europe/London",
  BST: "Europe/London",
  JST: "Asia/Tokyo",
  KST: "Asia/Seoul",
  IST: "Asia/Kolkata",
  ICT: "Asia/Ho_Chi_Minh",
  SGT: "Asia/Singapore",
  HKT: "Asia/Hong_Kong",
  AEST: "Australia/Sydney",
  AEDT: "Australia/Sydney",
};

const PLACE: Record<string, string> = {
  london: "Europe/London",
  "new york": "America/New_York",
  nyc: "America/New_York",
  "los angeles": "America/Los_Angeles",
  "la": "America/Los_Angeles",
  "san francisco": "America/Los_Angeles",
  chicago: "America/Chicago",
  toronto: "America/Toronto",
  vancouver: "America/Vancouver",
  berlin: "Europe/Berlin",
  paris: "Europe/Paris",
  amsterdam: "Europe/Amsterdam",
  madrid: "Europe/Madrid",
  rome: "Europe/Rome",
  tokyo: "Asia/Tokyo",
  japan: "Asia/Tokyo",
  seoul: "Asia/Seoul",
  korea: "Asia/Seoul",
  singapore: "Asia/Singapore",
  "hong kong": "Asia/Hong_Kong",
  bangkok: "Asia/Bangkok",
  thailand: "Asia/Bangkok",
  hanoi: "Asia/Ho_Chi_Minh",
  "ho chi minh": "Asia/Ho_Chi_Minh",
  saigon: "Asia/Ho_Chi_Minh",
  vietnam: "Asia/Ho_Chi_Minh",
  sydney: "Australia/Sydney",
  melbourne: "Australia/Melbourne",
  dubai: "Asia/Dubai",
  mumbai: "Asia/Kolkata",
  delhi: "Asia/Kolkata",
  india: "Asia/Kolkata",
  uk: "Europe/London",
  "united kingdom": "Europe/London",
  england: "Europe/London",
  germany: "Europe/Berlin",
  france: "Europe/Paris",
  netherlands: "Europe/Amsterdam",
  australia: "Australia/Sydney",
  usa: "America/New_York",
  "united states": "America/New_York",
  canada: "America/Toronto",
};

let supportedSet: Set<string> | null = null;

function supportedTimeZones(): Set<string> {
  if (supportedSet) return supportedSet;
  try {
    const values =
      typeof Intl !== "undefined" &&
      "supportedValuesOf" in Intl &&
      typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("timeZone")
        : [];
    supportedSet = new Set(values);
  } catch {
    supportedSet = new Set(listTimezoneOptions().map((o) => o.value));
  }
  return supportedSet;
}

export function isValidIanaTimeZone(tz: string | null | undefined): boolean {
  const raw = (tz ?? "").trim();
  if (!raw) return false;
  const canonical = canonicalizeTimezone(raw);
  if (supportedTimeZones().has(canonical) || supportedTimeZones().has(raw)) {
    return true;
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone: canonical }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** Normalize to canonical IANA or null if invalid. */
export function normalizeIanaTimeZone(
  tz: string | null | undefined,
): string | null {
  const raw = (tz ?? "").trim();
  if (!raw || !isValidIanaTimeZone(raw)) return null;
  return canonicalizeTimezone(raw);
}

/**
 * Map guest wording → IANA. Conservative: return null when unsure.
 * Handles city/country names, common abbrevs, GMT±N offsets (mapped coarsely).
 */
export function resolveTimeZoneFromText(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;

  // Direct IANA
  if (raw.includes("/")) {
    return normalizeIanaTimeZone(raw);
  }

  const upper = raw.toUpperCase().replace(/\s+/g, "");
  if (ABBREV[upper]) {
    return ABBREV[upper]!;
  }

  // GMT+7 / UTC-5 → pick a stable representative (not ideal, but explicit)
  const offsetMatch = raw.match(
    /(?:GMT|UTC)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?/i,
  );
  if (offsetMatch) {
    const sign = offsetMatch[1] === "-" ? -1 : 1;
    const hours = Number(offsetMatch[2]);
    const mins = Number(offsetMatch[3] ?? "0");
    if (!Number.isFinite(hours) || hours > 14) return null;
    const total = sign * (hours * 60 + mins);
    const byOffset: Record<number, string> = {
      0: "Europe/London",
      60: "Europe/Berlin",
      120: "Europe/Helsinki",
      180: "Europe/Moscow",
      330: "Asia/Kolkata",
      420: "Asia/Ho_Chi_Minh",
      480: "Asia/Singapore",
      540: "Asia/Tokyo",
      600: "Australia/Sydney",
      [-300]: "America/New_York",
      [-360]: "America/Chicago",
      [-420]: "America/Denver",
      [-480]: "America/Los_Angeles",
    };
    return byOffset[total] ?? null;
  }

  const lower = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Strip common prefixes
  const stripped = lower
    .replace(/^(i'?m in|i am in|toi o|tôi ở|o |ở |in |timezone |time zone |mui gio |múi giờ )/u, "")
    .trim();

  if (PLACE[stripped]) return PLACE[stripped]!;

  // Partial city match — skip short keys (la/uk) to avoid "la habana" → LA
  for (const [key, tz] of Object.entries(PLACE)) {
    if (key.length <= 2) continue;
    if (
      stripped === key ||
      stripped.endsWith(` ${key}`) ||
      stripped.startsWith(`${key} `)
    ) {
      return tz;
    }
  }

  // Search tzdb labels conservatively: only if exactly one option matches a city keyword
  const needle = stripped;
  if (needle.length < 3) return null;
  const hits = listTimezoneOptions().filter((opt) =>
    opt.keywords.some((k) => k.toLowerCase() === needle),
  );
  if (hits.length === 1) return hits[0]!.value;

  return null;
}

/**
 * Intl formatters are expensive to construct and these run per slot —
 * check_availability formats up to 40, each needing a slot + a zone-name
 * formatter for both the guest and the business zone. Cache by their key.
 */
function cachedFormatter(
  cache: Map<string, Intl.DateTimeFormat>,
  key: string,
  build: () => Intl.DateTimeFormat,
): Intl.DateTimeFormat | null {
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const fmt = build();
    cache.set(key, fmt);
    return fmt;
  } catch {
    return null;
  }
}

const slotFormatters = new Map<string, Intl.DateTimeFormat>();
const tzNameFormatters = new Map<string, Intl.DateTimeFormat>();

function formatInZone(
  iso: string,
  timeZone: string,
  locale = "en-US",
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const fmt = cachedFormatter(
    slotFormatters,
    `${locale}|${timeZone}`,
    () =>
      new Intl.DateTimeFormat(locale, {
        timeZone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
  );
  return fmt ? fmt.format(d) : iso;
}

function shortTzName(iso: string, timeZone: string): string {
  const fmt = cachedFormatter(
    tzNameFormatters,
    timeZone,
    () => new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }),
  );
  if (!fmt) return timeZone;
  try {
    const parts = fmt.formatToParts(new Date(iso));
    return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

/**
 * Dual display for guest vs business. Same tz → single string.
 */
/**
 * Calendar date (YYYY-MM-DD) of an instant *in the given zone*.
 *
 * Cal.com's `/slots` takes a date-only range interpreted in `timeZone`, so
 * deriving the day with `iso.slice(0, 10)` asks for the wrong day whenever the
 * zone offset pushes the instant across midnight — e.g. `2026-08-01T18:00Z` is
 * already 2026-08-02 in Asia/Ho_Chi_Minh, and the slot check would look at the
 * previous day and reject a perfectly open slot.
 */
const ymdFormatters = new Map<string, Intl.DateTimeFormat>();

export function calendarDayInTimeZone(iso: string, timeZone: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso.slice(0, 10);
  const fmt = cachedFormatter(
    ymdFormatters,
    timeZone,
    // en-CA formats as YYYY-MM-DD.
    () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
  );
  if (!fmt) return new Date(ms).toISOString().slice(0, 10);
  return fmt.format(new Date(ms));
}

export function formatSlotForGuest(
  iso: string,
  guestTz: string | null | undefined,
  businessTz: string,
  opts?: { locale?: string; yourTimeLabel?: string },
): {
  guest: string | null;
  business: string;
  combined: string;
  guestTimeZone: string | null;
  businessTimeZone: string;
} {
  const biz = canonicalizeTimezone(businessTz);
  const guest = guestTz ? normalizeIanaTimeZone(guestTz) : null;
  const locale = opts?.locale ?? "en-US";
  const yourLabel = opts?.yourTimeLabel ?? "your time";
  const business = `${formatInZone(iso, biz, locale)} ${shortTzName(iso, biz)}`;

  if (!guest || guest === biz) {
    return {
      guest: null,
      business,
      combined: business,
      guestTimeZone: guest,
      businessTimeZone: biz,
    };
  }

  const guestFormatted = `${formatInZone(iso, guest, locale)} (${yourLabel})`;
  const bizShort = `${formatInZone(iso, biz, locale)} ${shortTzName(iso, biz)}`;
  return {
    guest: guestFormatted,
    business: bizShort,
    combined: `${guestFormatted} · ${bizShort}`,
    guestTimeZone: guest,
    businessTimeZone: biz,
  };
}

export type WorkspaceServiceMode = "onsite" | "online";

export function parseServiceMode(
  value: string | null | undefined,
): WorkspaceServiceMode {
  return value === "online" ? "online" : "onsite";
}
