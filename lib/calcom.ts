/**
 * Cal.com API v2 client — aligned with official docs:
 * - Slots:  GET /v2/slots   header cal-api-version: 2024-09-04
 * - Bookings create: POST /v2/bookings header cal-api-version: 2024-08-13
 * - Bookings cancel: POST /v2/bookings/{uid}/cancel header cal-api-version: 2024-08-13
 * - Bookings reschedule: POST /v2/bookings/{uid}/reschedule header cal-api-version: 2024-08-13
 * - Bookings list: GET /v2/bookings header cal-api-version: 2026-05-01
 *   status filter: upcoming|recurring|past|cancelled|unconfirmed (one per request)
 *
 * - Meeting types (Cal.com "event-types"): GET/POST /v2/event-types header cal-api-version: 2024-06-14
 *
 * @see https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type
 * @see https://cal.com/docs/api-reference/v2/bookings/create-a-booking
 * @see https://cal.com/docs/api-reference/v2/bookings/cancel-a-booking
 * @see https://cal.com/docs/api-reference/v2/bookings/reschedule-a-booking
 * @see https://cal.com/docs/api-reference/v2/bookings/get-all-bookings
 * @see https://cal.com/docs/api-reference/v2/event-types/create-an-event-type
 */
import { bookingConfig } from "@/lib/booking-config";
import {
  CAL_BOOKING_LIST_FILTERS,
  getCalBookingView,
  normalizeCalApiStatus,
  type CalBookingListFilter,
} from "@/lib/booking-status";
import { withRetry, type RetryConfig } from "@/lib/retry";

const SLOTS_API_VERSION = "2024-09-04";
const BOOKINGS_API_VERSION = "2024-08-13";
/** List endpoint requires 2026-05-01 for status filter enum (docs). */
const BOOKINGS_LIST_API_VERSION = "2026-05-01";
/** Meeting types CRUD via Cal.com /v2/event-types */
const EVENT_TYPES_API_VERSION = "2024-06-14";
/** GET /v2/me — profile (username for public booking URL) */
const ME_API_VERSION = "2024-06-14";

type CalErrorBody = {
  message?: string;
  error?: { message?: string };
  status?: string;
};

export type AvailableSlot = {
  start: string;
  end?: string;
};

export type CreateBookingInput = {
  start: string;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone?: string;
  timeZone?: string;
  notes?: string;
  eventTypeId?: number;
  eventTypeSlug?: string;
  username?: string;
};

export type CreateBookingResult = {
  uid: string;
  start: string;
  status: string;
  meetingUrl?: string;
  raw: unknown;
};

export type CalEventType = {
  id: number;
  slug: string;
  title: string;
  lengthInMinutes: number;
  minimumBookingNotice?: number;
  description?: string;
  raw: unknown;
};

export type CreateEventTypeInput = {
  title: string;
  slug: string;
  lengthInMinutes: number;
  description?: string;
  /** Minutes before event that a booking can be made (Cal.com field). */
  minimumBookingNotice?: number;
  /**
   * Conferencing / location. Cal.com: `{ type: "integration", integration: "cal-video" | "google-meet" | ... }`.
   * @see https://cal.com/docs/api-reference/v2/event-types/create-an-event-type
   */
  locations?: Array<{ type: "integration"; integration: string }>;
};

export type CalBookingListItem = {
  uid: string;
  start: string;
  end?: string;
  /** Lifecycle: accepted | pending | cancelled | rejected */
  status: string;
  /** List filter used when this row was fetched */
  listStatus: CalBookingListFilter;
  title?: string;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone?: string;
  raw: unknown;
};

export type CalEventRef = {
  eventTypeId?: number;
  eventTypeSlug?: string;
  username?: string;
};

/** API key only — enough for event-type list/create and unscoped booking lists. */
let calApiKeyOverride: string | null = null;

/** Run Cal.com calls with a workspace-specific API key. */
export async function withCalApiKey<T>(
  apiKey: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = calApiKeyOverride;
  calApiKeyOverride = apiKey;
  try {
    return await fn();
  } finally {
    calApiKeyOverride = prev;
  }
}

export function requireCalApiKey() {
  const apiKey = calApiKeyOverride ?? bookingConfig.cal.apiKey;
  const { apiBaseUrl } = bookingConfig.cal;
  if (!apiKey) {
    throw new Error("CALCOM_API_KEY is not configured");
  }
  return { apiKey, apiBaseUrl };
}

function resolveEventRef(override?: CalEventRef): Required<Pick<CalEventRef, "username">> & CalEventRef {
  const eventTypeId = override?.eventTypeId ?? bookingConfig.cal.eventTypeId;
  const eventTypeSlug = override?.eventTypeSlug ?? bookingConfig.cal.eventTypeSlug;
  const username = override?.username ?? bookingConfig.cal.username;
  if (!eventTypeId && !(username && eventTypeSlug)) {
    throw new Error(
      "No meeting type selected for AI booking. Choose one in Settings, sync/create in Meeting types, or set CALCOM_EVENT_TYPE_ID.",
    );
  }
  return { eventTypeId, eventTypeSlug, username };
}

function requireCalConfig(override?: CalEventRef) {
  const { apiKey, apiBaseUrl } = requireCalApiKey();
  return { apiKey, apiBaseUrl, ...resolveEventRef(override) };
}

const CAL_FETCH_TIMEOUT_MS = 12_000;

async function calFetch<T>(
  path: string,
  init: RequestInit & { apiVersion: string },
): Promise<T> {
  const { apiKey, apiBaseUrl } = requireCalApiKey();

  return withRetry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CAL_FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${apiBaseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "cal-api-version": init.apiVersion,
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Cal.com request timed out after ${CAL_FETCH_TIMEOUT_MS / 1000}s`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const body = (await res.json().catch(() => ({}))) as T & CalErrorBody;
    if (!res.ok) {
      const message =
        body.message ?? body.error?.message ?? `Cal.com request failed (${res.status})`;
      throw new Error(message);
    }
    return body;
  });
}

/** Docs: date-only `start` → start of day; date-only `end` → end of day. Keep YYYY-MM-DD. */
function toSlotsQueryDate(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.slice(0, 10);
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid Cal.com date: ${raw}`);
  }
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Booking `start` must be UTC ISO 8601 without a named zone
 * (docs: Rome 11:00 GMT+2 → pass 09:00Z).
 */
export function toUtcBookingStart(isoOrOffset: string): string {
  const ms = Date.parse(isoOrOffset);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid booking start time: ${isoOrOffset}`);
  }
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

type SlotEntry = string | { start?: string; end?: string };

function normalizeSlotEntry(entry: SlotEntry): AvailableSlot | null {
  if (typeof entry === "string" && entry.trim()) {
    return { start: entry.trim() };
  }
  if (entry && typeof entry === "object" && typeof entry.start === "string") {
    return {
      start: entry.start,
      ...(typeof entry.end === "string" ? { end: entry.end } : {}),
    };
  }
  return null;
}

/**
 * Response (2024-09-04):
 * { status: "success", data: { "YYYY-MM-DD": SlotEntry[] } }
 * Default format may be start strings or `{ start }` objects (docs examples use objects).
 * Older / alternate: { data: { slots: { "YYYY-MM-DD": ... } } }
 */
export function flattenSlots(data: unknown): AvailableSlot[] {
  if (!data || typeof data !== "object") return [];

  const root = data as Record<string, unknown>;
  let dayMap: Record<string, SlotEntry[] | undefined> | undefined;

  const payload = (root.data ?? root) as Record<string, unknown>;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    if ("slots" in payload && payload.slots && typeof payload.slots === "object") {
      dayMap = payload.slots as Record<string, SlotEntry[] | undefined>;
    } else {
      const keys = Object.keys(payload);
      if (keys.length === 0) return [];
      if (keys.every((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))) {
        dayMap = payload as Record<string, SlotEntry[] | undefined>;
      }
    }
  }

  if (!dayMap) return [];

  const out: AvailableSlot[] = [];
  for (const day of Object.keys(dayMap).sort()) {
    for (const entry of dayMap[day] ?? []) {
      const slot = normalizeSlotEntry(entry);
      if (slot) out.push(slot);
    }
  }
  return out;
}

export async function getAvailableSlots(input: {
  startDate: string;
  endDate: string;
  timeZone?: string;
  eventTypeId?: number;
  eventTypeSlug?: string;
  username?: string;
}): Promise<AvailableSlot[]> {
  const { eventTypeId, eventTypeSlug, username } = requireCalConfig(input);
  const params = new URLSearchParams({
    start: toSlotsQueryDate(input.startDate),
    end: toSlotsQueryDate(input.endDate),
    timeZone: input.timeZone ?? bookingConfig.timezone,
    // Explicit: start (+ optional end via range). Default "time" is start-only.
    format: "time",
  });

  if (eventTypeId) {
    params.set("eventTypeId", String(eventTypeId));
  } else {
    params.set("username", username ?? "");
    params.set("eventTypeSlug", eventTypeSlug ?? "");
  }

  const body = await calFetch<unknown>(`/slots?${params.toString()}`, {
    method: "GET",
    apiVersion: SLOTS_API_VERSION,
  });

  return flattenSlots(body);
}

export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const { eventTypeId, eventTypeSlug, username } = requireCalConfig(input);
  const startUtc = toUtcBookingStart(input.start);

  const payload: Record<string, unknown> = {
    start: startUtc,
    attendee: {
      name: input.attendeeName,
      email: input.attendeeEmail,
      timeZone: input.timeZone ?? bookingConfig.timezone,
      language: "vi",
      ...(input.attendeePhone ? { phoneNumber: input.attendeePhone } : {}),
    },
    ...(input.notes
      ? {
          metadata: { notes: input.notes },
        }
      : {}),
  };

  if (eventTypeId) {
    payload.eventTypeId = eventTypeId;
  } else {
    payload.username = username;
    payload.eventTypeSlug = eventTypeSlug;
  }

  const body = await calFetch<{
    status?: string;
    data?: Record<string, unknown>;
  } & Record<string, unknown>>("/bookings", {
    method: "POST",
    apiVersion: BOOKINGS_API_VERSION,
    body: JSON.stringify(payload),
  });

  const data = (body.data ?? body) as Record<string, unknown>;
  const uid = String(data.uid ?? data.id ?? "");
  if (!uid) {
    throw new Error("Cal.com booking response missing uid");
  }

  return {
    uid,
    start: String(data.start ?? startUtc),
    status: normalizeCalApiStatus(String(data.status ?? body.status ?? "accepted")),
    meetingUrl:
      typeof data.meetingUrl === "string"
        ? data.meetingUrl
        : typeof data.location === "string"
          ? data.location
          : undefined,
    raw: body,
  };
}

function parseBookingPayload(
  body: { status?: string; data?: Record<string, unknown> } & Record<string, unknown>,
  fallbackStart?: string,
): CreateBookingResult {
  const data = (body.data ?? body) as Record<string, unknown>;
  const uid = String(data.uid ?? data.id ?? "");
  if (!uid) {
    throw new Error("Cal.com booking response missing uid");
  }
  const start =
    typeof data.start === "string" && data.start.trim()
      ? data.start
      : fallbackStart ?? "";
  return {
    uid,
    start,
    status: normalizeCalApiStatus(String(data.status ?? body.status ?? "accepted")),
    meetingUrl:
      typeof data.meetingUrl === "string"
        ? data.meetingUrl
        : typeof data.location === "string"
          ? data.location
          : undefined,
    raw: body,
  };
}

/**
 * POST /v2/bookings/{uid}/cancel
 * @see https://cal.com/docs/api-reference/v2/bookings/cancel-a-booking
 */
export async function cancelCalBooking(input: {
  bookingUid: string;
  cancellationReason?: string;
}): Promise<CreateBookingResult> {
  requireCalApiKey();
  const uid = input.bookingUid.trim();
  if (!uid) throw new Error("bookingUid is required");

  const payload: Record<string, unknown> = {};
  if (input.cancellationReason?.trim()) {
    payload.cancellationReason = input.cancellationReason.trim();
  }

  const body = await calFetch<
    { status?: string; data?: Record<string, unknown> } & Record<string, unknown>
  >(`/bookings/${encodeURIComponent(uid)}/cancel`, {
    method: "POST",
    apiVersion: BOOKINGS_API_VERSION,
    body: JSON.stringify(payload),
  });

  const result = parseBookingPayload(body);
  return {
    ...result,
    status: normalizeCalApiStatus(result.status || "cancelled"),
  };
}

/**
 * POST /v2/bookings/{uid}/reschedule
 * @see https://cal.com/docs/api-reference/v2/bookings/reschedule-a-booking
 */
export async function rescheduleCalBooking(input: {
  bookingUid: string;
  start: string;
  reschedulingReason?: string;
}): Promise<CreateBookingResult> {
  requireCalApiKey();
  const uid = input.bookingUid.trim();
  if (!uid) throw new Error("bookingUid is required");
  const startUtc = toUtcBookingStart(input.start);

  const payload: Record<string, unknown> = {
    start: startUtc,
  };
  if (input.reschedulingReason?.trim()) {
    payload.reschedulingReason = input.reschedulingReason.trim();
  }

  const body = await calFetch<
    { status?: string; data?: Record<string, unknown> } & Record<string, unknown>
  >(`/bookings/${encodeURIComponent(uid)}/reschedule`, {
    method: "POST",
    apiVersion: BOOKINGS_API_VERSION,
    body: JSON.stringify(payload),
  });

  return parseBookingPayload(body, startUtc);
}

function parseCalEventType(item: Record<string, unknown>): CalEventType | null {
  const id = Number(item.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const slug = String(item.slug ?? "").trim();
  const title = String(item.title ?? "").trim();
  const lengthInMinutes = Number(
    item.lengthInMinutes ?? item.length ?? item.duration ?? 0,
  );
  if (!slug || !title || !Number.isFinite(lengthInMinutes) || lengthInMinutes <= 0) {
    return null;
  }
  const notice = item.minimumBookingNotice;
  return {
    id,
    slug,
    title,
    lengthInMinutes,
    minimumBookingNotice:
      typeof notice === "number" && Number.isFinite(notice) ? notice : undefined,
    description: typeof item.description === "string" ? item.description : undefined,
    raw: item,
  };
}

export type CalMeProfile = {
  id: number;
  username: string;
  email: string;
  name: string | null;
  timeZone: string;
};

/**
 * GET /v2/me — username used in public booking URLs (`cal.com/{username}/{slug}`).
 * @see https://cal.com/docs/api-reference/v2/me/get-my-profile
 */
export async function getCalMeProfile(): Promise<CalMeProfile> {
  requireCalApiKey();
  const body = await calFetch<{ data?: Record<string, unknown> } & Record<string, unknown>>(
    "/me",
    {
      method: "GET",
      apiVersion: ME_API_VERSION,
    },
  );

  const data = (body.data ?? body) as Record<string, unknown>;
  const username = String(data.username ?? "").trim();
  const id = Number(data.id);
  const email = String(data.email ?? "").trim();

  if (!username || !Number.isFinite(id) || !email) {
    throw new Error("Cal.com /me response missing username");
  }

  return {
    id,
    username,
    email,
    name: typeof data.name === "string" ? data.name : null,
    timeZone: typeof data.timeZone === "string" ? data.timeZone : "",
  };
}

/** GET /v2/event-types — cal-api-version 2024-06-14 */
export async function listEventTypes(): Promise<CalEventType[]> {
  requireCalApiKey();
  const body = await calFetch<{ data?: unknown } | unknown[]>("/event-types", {
    method: "GET",
    apiVersion: EVENT_TYPES_API_VERSION,
  });

  const rawList = Array.isArray(body)
    ? body
    : Array.isArray((body as { data?: unknown }).data)
      ? ((body as { data: unknown[] }).data)
      : [];

  const out: CalEventType[] = [];
  for (const item of rawList) {
    if (item && typeof item === "object") {
      const parsed = parseCalEventType(item as Record<string, unknown>);
      if (parsed) out.push(parsed);
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

/** POST /v2/event-types — cal-api-version 2024-06-14 */
export async function createEventType(
  input: CreateEventTypeInput,
): Promise<CalEventType> {
  requireCalApiKey();
  const payload: Record<string, unknown> = {
    title: input.title.trim(),
    slug: input.slug.trim(),
    lengthInMinutes: input.lengthInMinutes,
    ...(input.description?.trim()
      ? { description: input.description.trim() }
      : {}),
    ...(typeof input.minimumBookingNotice === "number"
      ? { minimumBookingNotice: input.minimumBookingNotice }
      : {}),
    ...(input.locations?.length ? { locations: input.locations } : {}),
  };

  const body = await calFetch<{ data?: Record<string, unknown> } & Record<string, unknown>>(
    "/event-types",
    {
      method: "POST",
      apiVersion: EVENT_TYPES_API_VERSION,
      body: JSON.stringify(payload),
    },
  );

  const data = (body.data ?? body) as Record<string, unknown>;
  const parsed = parseCalEventType(data);
  if (!parsed) {
    throw new Error("Cal.com create meeting type response missing id/slug/title");
  }
  return parsed;
}

function parseListBooking(
  item: Record<string, unknown>,
  listStatus: CalBookingListFilter,
): CalBookingListItem | null {
  const uid = String(item.uid ?? "");
  const start = String(item.start ?? "");
  if (!uid || !start) return null;

  const attendees = Array.isArray(item.attendees) ? item.attendees : [];
  const first = attendees[0] as Record<string, unknown> | undefined;
  const fields =
    item.bookingFieldsResponses && typeof item.bookingFieldsResponses === "object"
      ? (item.bookingFieldsResponses as Record<string, unknown>)
      : undefined;

  const attendeePhone =
    (typeof first?.phoneNumber === "string" ? first.phoneNumber : undefined) ||
    (typeof fields?.phone === "string" ? fields.phone : undefined) ||
    (typeof fields?.phoneNumber === "string" ? fields.phoneNumber : undefined);

  const attendeeEmail = String(first?.email ?? first?.displayEmail ?? "").trim();

  return {
    uid,
    start,
    end: typeof item.end === "string" ? item.end : undefined,
    status: normalizeCalApiStatus(String(item.status ?? "accepted")),
    listStatus,
    title: typeof item.title === "string" ? item.title : undefined,
    attendeeName: String(first?.name ?? "Guest").trim() || "Guest",
    attendeeEmail: attendeeEmail || "unknown@local.invalid",
    attendeePhone,
    raw: item,
  };
}

type ListBookingsResponse = {
  status?: string;
  data?: unknown[];
  pagination?: {
    hasMore?: boolean;
    nextCursor?: string | null;
  };
};

/** Cursor-paginated list from Cal.com (source of truth for dashboard sync). */
export async function listBookings(input?: {
  eventTypeId?: number;
  status?: CalBookingListFilter;
  maxPages?: number;
  limit?: number;
  afterStart?: string;
  beforeEnd?: string;
  afterUpdatedAt?: string;
}): Promise<{
  items: CalBookingListItem[];
  truncated: boolean;
}> {
  requireCalApiKey();
  const filterId = input?.eventTypeId ?? bookingConfig.cal.eventTypeId;
  const maxPages = input?.maxPages ?? bookingConfig.sync.maxPages;
  const pageLimit = input?.limit ?? bookingConfig.sync.pageLimit;
  const all: CalBookingListItem[] = [];
  let cursor: string | undefined;
  let truncated = false;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams();
    if (filterId) params.set("eventTypeId", String(filterId));
    if (input?.status) params.set("status", input.status);
    if (input?.afterStart) params.set("afterStart", input.afterStart);
    if (input?.beforeEnd) params.set("beforeEnd", input.beforeEnd);
    if (input?.afterUpdatedAt) params.set("afterUpdatedAt", input.afterUpdatedAt);
    if (cursor) params.set("cursor", cursor);
    params.set("limit", String(pageLimit));

    let body: ListBookingsResponse;
    try {
      body = await calFetch<ListBookingsResponse>(`/bookings?${params.toString()}`, {
        method: "GET",
        apiVersion: BOOKINGS_LIST_API_VERSION,
      });
    } catch {
      body = await calFetch<ListBookingsResponse>(`/bookings?${params.toString()}`, {
        method: "GET",
        apiVersion: BOOKINGS_API_VERSION,
      });
    }

    const items = Array.isArray(body.data) ? body.data : [];
    for (const item of items) {
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const lifecycle = normalizeCalApiStatus(String(record.status ?? "accepted"));
        const start = String(record.start ?? "");
        const listStatus =
          input?.status ??
          (start
            ? (getCalBookingView(lifecycle, start) as CalBookingListFilter)
            : "upcoming");
        const parsed = parseListBooking(record, listStatus);
        if (parsed) all.push(parsed);
      }
    }

    const next = body.pagination?.nextCursor;
    if (body.pagination?.hasMore && next) {
      cursor = next;
      if (page === maxPages - 1) truncated = true;
    } else {
      break;
    }
  }

  return { items: all, truncated };
}

export type FetchCalBookingsScope = {
  pageLimit: number;
  maxPages: number;
  filters: readonly CalBookingListFilter[];
  truncatedFilters: string[];
};

/**
 * Full Cal.com mirror — every list filter, no date cutoff.
 *
 * Docs: `status` is one value per request → parallel + merge; paginate until done.
 * @see https://cal.com/docs/api-reference/v2/bookings/get-all-bookings
 */
export async function fetchAllCalBookings(): Promise<{
  items: CalBookingListItem[];
  scope: FetchCalBookingsScope;
}> {
  requireCalApiKey();
  const pageLimit = Math.min(100, Math.max(1, bookingConfig.sync.pageLimit));
  const maxPages = Math.max(1, bookingConfig.sync.maxPages);
  const byUid = new Map<string, CalBookingListItem>();
  const truncatedFilters: string[] = [];

  const batches = await Promise.all(
    CAL_BOOKING_LIST_FILTERS.map(async (status) => {
      const result = await listBookings({
        status,
        maxPages,
        limit: pageLimit,
      }).catch(() => ({ items: [] as CalBookingListItem[], truncated: false }));
      return { label: status, ...result };
    }),
  );

  for (const batch of batches) {
    if (batch.truncated) truncatedFilters.push(batch.label);
    for (const item of batch.items) {
      if (!byUid.has(item.uid)) {
        byUid.set(item.uid, item);
      }
    }
  }

  const items = [...byUid.values()].sort(
    (a, b) => Date.parse(b.start) - Date.parse(a.start),
  );

  return {
    items,
    scope: {
      pageLimit,
      maxPages,
      filters: CAL_BOOKING_LIST_FILTERS,
      truncatedFilters,
    },
  };
}
