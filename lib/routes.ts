/** Canonical application route paths — use these instead of hardcoded strings. */

export const ROUTES = {
  // Public
  HOME: "/",
  LOGIN: "/login",
  SIGNUP: "/signup",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
  CHECK_EMAIL: "/check-email",
  TERMS: "/terms",

  // Auth
  AUTH_CALLBACK: "/auth/callback",

  // Public chat (Pilot demo only)
  CHAT: "/chat",

  // Internal
  CONSOLE: "/console",

  // Dashboard
  DASHBOARD: "/dashboard",
  DASHBOARD_ANALYTICS: "/dashboard/analytics",
  DASHBOARD_BOOKINGS: "/dashboard/bookings",
  DASHBOARD_MEETING_TYPES: "/dashboard/meeting-types",
  DASHBOARD_EMBED: "/dashboard/embed",
  DASHBOARD_CONVERSATIONS: "/dashboard/conversations",
  DASHBOARD_LEADS: "/dashboard/leads",
  DASHBOARD_AGENT: "/dashboard/agent",
  DASHBOARD_FAQ: "/dashboard/faq",
  DASHBOARD_SETTINGS: "/dashboard/settings",
  DASHBOARD_HELP: "/dashboard/help",
  DASHBOARD_ACCOUNT: "/dashboard/account",
  DASHBOARD_NOTIFICATIONS: "/dashboard/notifications",
  DASHBOARD_SETUP: "/dashboard/setup",
  DASHBOARD_BILLING: "/dashboard/billing",
  DASHBOARD_EVENT_TYPES: "/dashboard/event-types",
} as const;

export type Route = (typeof ROUTES)[keyof typeof ROUTES];

/** Dynamic route builders — use these instead of template literals. */

export function bookingRoute(slug: string) {
  return `/b/${encodeURIComponent(slug)}`;
}

export function inviteRoute(token: string) {
  return `/invite/${encodeURIComponent(token)}`;
}

export function embedRoute(slug: string) {
  return `/embed/${encodeURIComponent(slug)}`;
}

export function loginWithNext(path: string) {
  return `/login?next=${encodeURIComponent(path)}`;
}

export function chatRoute(slug: string) {
  return `/b/${encodeURIComponent(slug)}`;
}
