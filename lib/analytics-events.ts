/**
 * Single source of truth for PostHog event names.
 * Do not confuse with lib/analytics.ts (dashboard KPI aggregates).
 */
export const ANALYTICS_EVENT = {
  LANDING_VIEWED: "landing_viewed",
  SIGNUP_STARTED: "signup_started",
  SIGNUP_COMPLETED: "signup_completed",

  SETUP_OPENED: "setup_opened",
  SETUP_PROFILE_SAVED: "setup_profile_saved",
  SETUP_CAL_CONNECTED: "setup_cal_connected",
  SETUP_CAL_SKIPPED: "setup_cal_skipped",
  SETUP_COMPLETED: "setup_completed",

  CHAT_MESSAGE_SENT: "chat_message_sent",
  BOOKING_CREATED: "booking_created",
  BOOKING_CANCELLED_BY_GUEST: "booking_cancelled_by_guest",
  BOOKING_RESCHEDULED_BY_GUEST: "booking_rescheduled_by_guest",

  REMINDER_SENT: "reminder_sent",
  REMINDER_LINK_OPENED: "reminder_link_opened",
  REMINDER_OPTED_OUT: "reminder_opted_out",

  EMBED_LOADED: "embed_loaded",
  EMBED_OPENED: "embed_opened",
} as const;

export type AnalyticsEvent =
  (typeof ANALYTICS_EVENT)[keyof typeof ANALYTICS_EVENT];
