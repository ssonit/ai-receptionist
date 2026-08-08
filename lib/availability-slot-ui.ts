/**
 * Pure helpers for the web chat availability slot picker.
 * Parses `check_availability` tool output into day/period groups for UI.
 */

export const AVAILABILITY_SLOT_UI = {
  /** Web picker shows times for one day only — other days stay in agent prose / next check. */
  MAX_DAYS: 1,
  MAX_SLOTS_PER_DAY: 12,
} as const;

export const SLOT_PERIOD = {
  MORNING: "morning",
  AFTERNOON: "afternoon",
  EVENING: "evening",
} as const;

export type SlotPeriod = (typeof SLOT_PERIOD)[keyof typeof SLOT_PERIOD];

export type AvailabilitySlotRow = {
  start: string;
  display: string;
  guestDisplay: string | null;
  businessDisplay: string;
};

export type SlotPickerPeriodGroup = {
  period: SlotPeriod;
  slots: AvailabilitySlotRow[];
};

export type SlotPickerDayGroup = {
  day: string;
  dayLabel: string;
  periods: SlotPickerPeriodGroup[];
  hiddenCount: number;
};

export type SlotPickerModel = {
  days: SlotPickerDayGroup[];
  /** Days with openings in the tool result that are not shown in the picker. */
  otherDaysWithSlots: number;
  truncated: boolean;
  businessTimeZone: string;
};

const PERIOD_ORDER: SlotPeriod[] = [
  SLOT_PERIOD.MORNING,
  SLOT_PERIOD.AFTERNOON,
  SLOT_PERIOD.EVENING,
];

export function periodForHour(hour: number): SlotPeriod {
  if (hour < 12) return SLOT_PERIOD.MORNING;
  if (hour < 17) return SLOT_PERIOD.AFTERNOON;
  return SLOT_PERIOD.EVENING;
}

export function hourInTimeZone(iso: string, timeZone: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return 0;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(new Date(ms));
    const raw = parts.find((p) => p.type === "hour")?.value;
    const hour = Number(raw);
    return Number.isFinite(hour) ? hour : 0;
  } catch {
    return new Date(ms).getUTCHours();
  }
}

export function formatSlotTimeLabel(
  iso: string,
  timeZone: string,
  locale = "en-US",
): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(ms));
  } catch {
    return iso;
  }
}

export function formatDayLabel(ymd: string, locale = "en-US"): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Noon UTC avoids DST edge cases when labeling a calendar date.
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function buildSlotSelectMessage(slot: {
  start: string;
  display: string;
}): string {
  return `I'd like ${slot.display} (start=${slot.start})`;
}

function isSlotRow(value: unknown): value is AvailabilitySlotRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.start === "string" &&
    row.start.length > 0 &&
    typeof row.display === "string"
  );
}

function normalizeSlot(row: AvailabilitySlotRow): AvailabilitySlotRow {
  return {
    start: row.start,
    display: row.display,
    guestDisplay:
      typeof row.guestDisplay === "string" ? row.guestDisplay : null,
    businessDisplay:
      typeof row.businessDisplay === "string"
        ? row.businessDisplay
        : row.display,
  };
}

/**
 * Returns a capped, day/period-grouped model for the picker, or null when
 * the tool output is missing / failed / empty.
 */
export function buildSlotPickerModel(
  output: unknown,
  opts?: { locale?: string },
): SlotPickerModel | null {
  if (!output || typeof output !== "object") return null;
  const raw = output as Record<string, unknown>;
  if (raw.ok !== true) return null;

  const businessTimeZone =
    (typeof raw.businessTimeZone === "string" && raw.businessTimeZone) ||
    (typeof raw.timezone === "string" && raw.timezone) ||
    "UTC";

  const locale = opts?.locale ?? "en-US";
  const byDay = new Map<string, AvailabilitySlotRow[]>();

  if (raw.slotsByDay && typeof raw.slotsByDay === "object") {
    for (const [day, slots] of Object.entries(
      raw.slotsByDay as Record<string, unknown>,
    )) {
      if (!Array.isArray(slots)) continue;
      const rows = slots.filter(isSlotRow).map(normalizeSlot);
      if (rows.length > 0) byDay.set(day, rows);
    }
  }

  if (byDay.size === 0 && Array.isArray(raw.slots)) {
    for (const item of raw.slots) {
      if (!isSlotRow(item)) continue;
      const row = normalizeSlot(item);
      const day = row.start.slice(0, 10);
      const list = byDay.get(day) ?? [];
      list.push(row);
      byDay.set(day, list);
    }
  }

  if (byDay.size === 0) return null;

  const allDayKeys = [...byDay.keys()].toSorted();
  const dayKeys = allDayKeys.slice(0, AVAILABILITY_SLOT_UI.MAX_DAYS);
  const otherDaysWithSlots = Math.max(0, allDayKeys.length - dayKeys.length);
  const days: SlotPickerDayGroup[] = [];

  for (const day of dayKeys) {
    const all = byDay.get(day) ?? [];
    const visible = all.slice(0, AVAILABILITY_SLOT_UI.MAX_SLOTS_PER_DAY);
    const hiddenCount = Math.max(0, all.length - visible.length);

    const buckets = new Map<SlotPeriod, AvailabilitySlotRow[]>();
    for (const slot of visible) {
      const period = periodForHour(
        hourInTimeZone(slot.start, businessTimeZone),
      );
      const list = buckets.get(period) ?? [];
      list.push(slot);
      buckets.set(period, list);
    }

    const periods: SlotPickerPeriodGroup[] = [];
    for (const period of PERIOD_ORDER) {
      const slots = buckets.get(period);
      if (slots && slots.length > 0) {
        periods.push({ period, slots });
      }
    }

    if (periods.length === 0) continue;

    days.push({
      day,
      dayLabel: formatDayLabel(day, locale),
      periods,
      hiddenCount,
    });
  }

  if (days.length === 0) return null;

  return {
    days,
    otherDaysWithSlots,
    truncated: raw.truncated === true,
    businessTimeZone,
  };
}
