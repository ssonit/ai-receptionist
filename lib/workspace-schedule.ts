import type { CalScheduleAvailability } from "@/lib/calcom";

const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const DAY_LABEL: Record<string, { vi: string; en: string }> = {
  Monday: { vi: "Thứ 2", en: "Mon" },
  Tuesday: { vi: "Thứ 3", en: "Tue" },
  Wednesday: { vi: "Thứ 4", en: "Wed" },
  Thursday: { vi: "Thứ 5", en: "Thu" },
  Friday: { vi: "Thứ 6", en: "Fri" },
  Saturday: { vi: "Thứ 7", en: "Sat" },
  Sunday: { vi: "Chủ nhật", en: "Sun" },
};

function dayRangeLabel(days: string[], locale: "en" | "vi"): string {
  const ordered = DAY_ORDER.filter((d) => days.includes(d));
  if (ordered.length === 0) return "";
  if (ordered.length === 1) return DAY_LABEL[ordered[0]][locale];

  // Contiguous run in DAY_ORDER → "A–B"; otherwise list each day.
  const indices = ordered.map((d) => DAY_ORDER.indexOf(d));
  const isContiguous = indices.every(
    (idx, i) => i === 0 || idx === indices[i - 1] + 1,
  );
  if (isContiguous) {
    const dash = locale === "vi" ? "–" : "–";
    return `${DAY_LABEL[ordered[0]][locale]}${dash}${DAY_LABEL[ordered[ordered.length - 1]][locale]}`;
  }
  return ordered.map((d) => DAY_LABEL[d][locale]).join(", ");
}

export function formatScheduleAsBusinessHours(
  availability: CalScheduleAvailability[],
  locale: "en" | "vi",
): string {
  if (availability.length === 0) {
    return locale === "vi" ? "- Chưa thiết lập giờ làm việc" : "- Hours not set yet";
  }

  return availability
    .map((slot) => {
      const label = dayRangeLabel(slot.days, locale);
      return `- ${label}: ${slot.startTime}–${slot.endTime}`;
    })
    .join("\n");
}
