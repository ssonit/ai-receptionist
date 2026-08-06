import { DashboardBookingPathProvider } from "@/components/dashboard-booking-path-context";
import { DashboardRoleProvider } from "@/components/dashboard-role-context";
import { LocaleProvider } from "@/components/locale-provider";
import { WorkspaceListProvider } from "@/components/workspace-list-context";
import { listMyWorkspaces } from "@/lib/active-workspace";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { getDashboardUser } from "@/lib/dashboard-user";
import { readDashboardLocale } from "@/lib/read-locale-cookie";
import { redirect } from "next/navigation";

/** Auth gate only — setup completion is enforced in proxy. */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Independent reads — run them together (async-parallel).
  const [dashboard, workspaces] = await Promise.all([
    getDashboardUser(),
    listMyWorkspaces(),
  ]);
  if (!dashboard) {
    redirect(`/login?next=${DASHBOARD_PATH.root}`);
  }
  const initialLocale = await readDashboardLocale();
  return (
    <LocaleProvider initialLocale={initialLocale} kind="dashboard">
      <DashboardRoleProvider role={dashboard.role}>
        <WorkspaceListProvider
          activeWorkspaceId={dashboard.workspaceId}
          workspaces={workspaces}
        >
          <DashboardBookingPathProvider value={dashboard.bookingPagePath}>
            {children}
          </DashboardBookingPathProvider>
        </WorkspaceListProvider>
      </DashboardRoleProvider>
    </LocaleProvider>
  );
}
