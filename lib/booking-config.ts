/** Hard-coded pilot booking config (single-tenant MVP). */
export const bookingConfig = {
  name: process.env.BOOKING_NAME ?? "Eve Pilot",
  timezone: process.env.BOOKING_TIMEZONE ?? "Asia/Ho_Chi_Minh",
  /**
   * Must match Cal.com event type "Minimum booking notice".
   * Used only for guest-facing explanations (Cal.com enforces the real cutoff).
   */
  minNoticeHours: process.env.BOOKING_MIN_NOTICE_HOURS
    ? Number(process.env.BOOKING_MIN_NOTICE_HOURS)
    : 2,
  /**
   * Cal.com sync — full mirror of every list filter (no date cutoff).
   * Performance: parallel filters + cursor pagination; skip heavy `raw` by default.
   * @see https://cal.com/docs/api-reference/v2/bookings/get-all-bookings
   */
  sync: {
    /** Page size per list request (Cal.com `limit`, max 100). */
    pageLimit: process.env.BOOKING_SYNC_PAGE_LIMIT
      ? Number(process.env.BOOKING_SYNC_PAGE_LIMIT)
      : 100,
    /**
     * Safety cap only — sync paginates until `hasMore=false`.
     * Raise if toast shows truncated (extremely large calendars).
     */
    maxPages: process.env.BOOKING_SYNC_MAX_PAGES
      ? Number(process.env.BOOKING_SYNC_MAX_PAGES)
      : 100,
    /** Persist full Cal.com payload (heavier writes). */
    storeRaw: process.env.BOOKING_SYNC_STORE_RAW === "true",
  },
  cal: {
    apiKey: process.env.CALCOM_API_KEY ?? "",
    apiBaseUrl: process.env.CALCOM_API_BASE_URL ?? "https://api.cal.com/v2",
    eventTypeId: process.env.CALCOM_EVENT_TYPE_ID
      ? Number(process.env.CALCOM_EVENT_TYPE_ID)
      : undefined,
    eventTypeSlug: process.env.CALCOM_EVENT_TYPE_SLUG ?? "consultation-30",
    username: process.env.CALCOM_USERNAME ?? "",
  },
} as const;
