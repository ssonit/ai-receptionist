/**
 * Aligned with Cal.com API docs (GET /v2/bookings, cal-api-version 2026-05-01):
 *
 * @see https://cal.com/docs/api-reference/v2/bookings/get-all-bookings
 *
 * List query `status` (one per request; merge client-side):
 *   upcoming | recurring | past | cancelled | unconfirmed
 *
 * Booking object `status` (lifecycle stored in DB):
 *   accepted | pending | cancelled | rejected
 *
 * Cal.com UI badge “Confirmed” = lifecycle `accepted` (display copy only).
 */

/** Query values for GET /v2/bookings?status=… */
export type CalBookingListFilter =
  | "upcoming"
  | "recurring"
  | "past"
  | "cancelled"
  | "unconfirmed";

export const CAL_BOOKING_LIST_FILTERS: readonly CalBookingListFilter[] = [
  "upcoming",
  "unconfirmed",
  "recurring",
  "past",
  "cancelled",
] as const;

/** Tabs matching Cal.com Bookings UI. */
export type CalBookingView = CalBookingListFilter;

export const CAL_BOOKING_VIEWS: {
  id: CalBookingView | "all";
  label: string;
  /** API list filter; cancelled keeps British spelling from docs. */
  filter: CalBookingListFilter | null;
}[] = [
  { id: "all", label: "All", filter: null },
  { id: "upcoming", label: "Upcoming", filter: "upcoming" },
  { id: "unconfirmed", label: "Unconfirmed", filter: "unconfirmed" },
  { id: "recurring", label: "Recurring", filter: "recurring" },
  { id: "past", label: "Past", filter: "past" },
  { id: "cancelled", label: "Canceled", filter: "cancelled" },
];

/** Lifecycle statuses on booking objects (docs enum). */
export type CalBookingLifecycleStatus =
  | "accepted"
  | "pending"
  | "cancelled"
  | "rejected";

/** Normalize to Cal.com booking.status enum values. */
export function normalizeCalApiStatus(status: string): CalBookingLifecycleStatus | string {
  const s = status.trim().toLowerCase();
  // UI / legacy aliases → API lifecycle
  if (s === "confirmed" || s === "done") return "accepted";
  if (s === "canceled") return "cancelled";
  if (s === "unconfirmed" || s === "awaiting_host") return "pending";
  return s;
}

export function isCancelledStatus(status: string): boolean {
  const s = normalizeCalApiStatus(status);
  return s === "cancelled" || s === "rejected";
}

export function isUnconfirmedStatus(status: string): boolean {
  return normalizeCalApiStatus(status) === "pending";
}

export function isAcceptedStatus(status: string): boolean {
  return normalizeCalApiStatus(status) === "accepted";
}

export function hasRecurringBooking(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const item = raw as Record<string, unknown>;
  const nested =
    item.data && typeof item.data === "object"
      ? (item.data as Record<string, unknown>)
      : item;
  return Boolean(
    nested.recurringEventId ||
      nested.recurringBookingUid ||
      nested.fromReschedule === "recurring" ||
      (typeof nested.recurringEvent === "object" && nested.recurringEvent),
  );
}

/**
 * Derive Cal.com Bookings tab for a stored row.
 * Prefer list filter when known; otherwise lifecycle + time (+ recurring).
 */
export function getCalBookingView(
  status: string,
  startTime: string,
  options?: { raw?: unknown; listFilter?: CalBookingListFilter | null; nowMs?: number },
): CalBookingView {
  if (options?.listFilter) return options.listFilter;

  if (isCancelledStatus(status)) return "cancelled";
  if (isUnconfirmedStatus(status)) return "unconfirmed";
  if (hasRecurringBooking(options?.raw)) return "recurring";

  const nowMs = options?.nowMs ?? Date.now();
  const start = Date.parse(startTime);
  if (!Number.isNaN(start) && start < nowMs) return "past";
  return "upcoming";
}

export function getCalBookingViewLabel(
  status: string,
  startTime: string,
  options?: { raw?: unknown; listFilter?: CalBookingListFilter | null },
): string {
  const view = getCalBookingView(status, startTime, options);
  return CAL_BOOKING_VIEWS.find((v) => v.id === view)?.label ?? "Upcoming";
}

/** Cal.com detail badge copy: Confirmed ≡ accepted. */
export function getCalLifecycleBadgeLabel(status: string): string {
  const s = normalizeCalApiStatus(status);
  if (s === "accepted") return "Confirmed";
  if (s === "pending") return "Unconfirmed";
  if (s === "cancelled") return "Canceled";
  if (s === "rejected") return "Rejected";
  return String(status);
}
