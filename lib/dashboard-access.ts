import {
  WORKSPACE_ROLE,
  type WorkspaceRole,
} from "@/lib/workspace-roles";

export type { WorkspaceRole };
export { WORKSPACE_ROLE };

/** Canonical dashboard route paths. */
export const DASHBOARD_PATH = {
  root: "/dashboard",
  analytics: "/dashboard/analytics",
  bookings: "/dashboard/bookings",
  meetingTypes: "/dashboard/meeting-types",
  embed: "/dashboard/embed",
  conversations: "/dashboard/conversations",
  leads: "/dashboard/leads",
  agent: "/dashboard/agent",
  faq: "/dashboard/faq",
  settings: "/dashboard/settings",
  help: "/dashboard/help",
  account: "/dashboard/account",
  notifications: "/dashboard/notifications",
  setup: "/dashboard/setup",
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
