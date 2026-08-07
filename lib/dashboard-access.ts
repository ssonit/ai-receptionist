import { ROUTES } from "@/lib/routes";
import {
  WORKSPACE_ROLE,
  type WorkspaceRole,
} from "@/lib/workspace-roles";

export type { WorkspaceRole };
export { WORKSPACE_ROLE };

/** Canonical dashboard route paths (derived from ROUTES). */
export const DASHBOARD_PATH = {
  root: ROUTES.DASHBOARD,
  analytics: ROUTES.DASHBOARD_ANALYTICS,
  bookings: ROUTES.DASHBOARD_BOOKINGS,
  meetingTypes: ROUTES.DASHBOARD_MEETING_TYPES,
  embed: ROUTES.DASHBOARD_EMBED,
  conversations: ROUTES.DASHBOARD_CONVERSATIONS,
  leads: ROUTES.DASHBOARD_LEADS,
  agent: ROUTES.DASHBOARD_AGENT,
  faq: ROUTES.DASHBOARD_FAQ,
  settings: ROUTES.DASHBOARD_SETTINGS,
  help: ROUTES.DASHBOARD_HELP,
  account: ROUTES.DASHBOARD_ACCOUNT,
  notifications: ROUTES.DASHBOARD_NOTIFICATIONS,
  setup: ROUTES.DASHBOARD_SETUP,
  billing: ROUTES.DASHBOARD_BILLING,
} as const;

export type DashboardPath =
  (typeof DASHBOARD_PATH)[keyof typeof DASHBOARD_PATH];

/** Dashboard paths that only workspace owners may open or mutate. */
export const OWNER_ONLY_PATHS = [
  DASHBOARD_PATH.settings,
  DASHBOARD_PATH.setup,
  DASHBOARD_PATH.agent,
  DASHBOARD_PATH.faq,
  DASHBOARD_PATH.meetingTypes,
  DASHBOARD_PATH.embed,
  DASHBOARD_PATH.billing,
] as const;

export function isOwnerOnlyPath(pathname: string): boolean {
  const path = pathname.split("?")[0]?.replace(/\/$/, "") || pathname;
  return OWNER_ONLY_PATHS.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function canAccessDashboardPath(
  role: WorkspaceRole | null | undefined,
  pathname: string,
): boolean {
  if (!isOwnerOnlyPath(pathname)) return true;
  return role === WORKSPACE_ROLE.OWNER;
}

/** Whether a sidebar nav href should show as active for the current pathname. */
export function isDashboardNavActive(pathname: string, href: string): boolean {
  const path = pathname.split("?")[0]?.replace(/\/$/, "") || pathname;
  const target = href.split("?")[0]?.replace(/\/$/, "") || href;
  if (target === DASHBOARD_PATH.root) {
    return path === target;
  }
  return path === target || path.startsWith(`${target}/`);
}
