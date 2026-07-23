export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "booked",
  "lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_VIEWS = [
  { id: "all" as const, label: "All" },
  { id: "new" as const, label: "New" },
  { id: "contacted" as const, label: "Contacted" },
  { id: "qualified" as const, label: "Qualified" },
  { id: "booked" as const, label: "Booked" },
  { id: "lost" as const, label: "Lost" },
];

export type LeadStatusView = (typeof LEAD_STATUS_VIEWS)[number]["id"];

export const LEAD_URGENCIES = ["low", "normal", "high", "urgent"] as const;
export type LeadUrgency = (typeof LEAD_URGENCIES)[number];

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

export function getLeadStatusLabel(status: string): string {
  switch (status) {
    case "new":
      return "New";
    case "contacted":
      return "Contacted";
    case "qualified":
      return "Qualified";
    case "booked":
      return "Booked";
    case "lost":
      return "Lost";
    default:
      return status;
  }
}

/** Normalize free-text urgency from the agent into a small enum. */
export function normalizeLeadUrgency(
  raw: string | null | undefined,
): LeadUrgency | null {
  if (!raw?.trim()) return null;
  const v = raw.trim().toLowerCase();
  if (["urgent", "asap", "khẩn", "gap", "gấp", "emergency"].some((k) => v.includes(k))) {
    return "urgent";
  }
  if (["high", "cao", "ưu tiên cao", "priority"].some((k) => v.includes(k))) {
    return "high";
  }
  if (["low", "thấp", "không gấp"].some((k) => v.includes(k))) {
    return "low";
  }
  if ((LEAD_URGENCIES as readonly string[]).includes(v)) {
    return v as LeadUrgency;
  }
  return "normal";
}
