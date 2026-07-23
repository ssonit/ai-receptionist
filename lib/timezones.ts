import { getTimeZones, type TimeZone } from "@vvo/tzdb";

export type TimezoneOption = {
  /** Canonical IANA name to persist (e.g. Asia/Ho_Chi_Minh). */
  value: string;
  /** Human label for the combobox. */
  label: string;
  /** Search keywords (cities, country, aliases like Asia/Saigon). */
  keywords: string[];
  /** All IANA names in this zone group (includes deprecated aliases). */
  group: string[];
};

let cachedOptions: TimezoneOption[] | null = null;
let cachedCanonicalMap: Map<string, string> | null = null;

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = String(abs % 60).padStart(2, "0");
  return `GMT ${sign}${h}:${m}`;
}

function toOption(zone: TimeZone): TimezoneOption {
  return {
    value: zone.name,
    // Cal.com-style: Asia/Ho_Chi_Minh GMT +7:00
    label: `${zone.name} ${formatOffset(zone.currentTimeOffsetInMinutes)}`,
    keywords: [
      zone.name,
      zone.alternativeName,
      zone.abbreviation,
      zone.countryName,
      ...zone.mainCities,
      ...zone.group,
    ],
    group: zone.group,
  };
}

/** Simplified IANA zones from @vvo/tzdb (Cal.com-style picker data). */
export function listTimezoneOptions(): TimezoneOption[] {
  if (cachedOptions) return cachedOptions;
  cachedOptions = getTimeZones()
    .map(toOption)
    .sort((a, b) => a.value.localeCompare(b.value));
  return cachedOptions;
}

function buildCanonicalMap(): Map<string, string> {
  if (cachedCanonicalMap) return cachedCanonicalMap;
  const map = new Map<string, string>();
  for (const zone of getTimeZones()) {
    map.set(zone.name, zone.name);
    for (const alias of zone.group) {
      map.set(alias, zone.name);
    }
  }
  // Explicit legacy aliases (also present in tzdb group, kept for clarity)
  map.set("Asia/Saigon", "Asia/Ho_Chi_Minh");
  cachedCanonicalMap = map;
  return map;
}

/**
 * Map deprecated/alias IANA names to the canonical name we persist.
 * Example: Asia/Saigon → Asia/Ho_Chi_Minh
 */
export function canonicalizeTimezone(input: string | null | undefined): string {
  const raw = (input ?? "").trim();
  if (!raw) return "Asia/Ho_Chi_Minh";
  return buildCanonicalMap().get(raw) ?? raw;
}

/** Find the picker option for a stored value (handles aliases). */
export function findTimezoneOption(
  input: string | null | undefined,
): TimezoneOption | undefined {
  const canonical = canonicalizeTimezone(input);
  return listTimezoneOptions().find(
    (opt) =>
      opt.value === canonical ||
      opt.group.includes(input?.trim() ?? "") ||
      opt.group.includes(canonical),
  );
}

export function formatTimezoneLabel(
  input: string | null | undefined,
): string {
  return findTimezoneOption(input)?.label ?? canonicalizeTimezone(input);
}
