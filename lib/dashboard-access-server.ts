import { redirect } from "next/navigation";
import { DASHBOARD_PATH, WORKSPACE_ROLE } from "@/lib/dashboard-access";
import { getDashboardUser } from "@/lib/dashboard-user";

/**
 * Auth + owner gate for owner-only dashboard pages.
 * Redirects staff to `/dashboard`; unauthenticated to login.
 * Server-only — do not import from client components.
 */
export async function assertOwnerPage(loginNext: string) {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect(`/login?next=${encodeURIComponent(loginNext)}`);
  }
  if (dashboard.role !== WORKSPACE_ROLE.OWNER) {
    redirect(DASHBOARD_PATH.root);
  }
  return dashboard;
}
