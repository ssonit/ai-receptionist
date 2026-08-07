import { DashboardShell } from "@/components/dashboard-shell";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { getDashboardUser } from "@/lib/dashboard-user";
import { redirect } from "next/navigation";

/** Persistent chrome — sidebar/header stay mounted across soft navigations. */
export default async function DashboardMainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect(`/login?next=${DASHBOARD_PATH.root}`);
  }

  return (
    <DashboardShell
      user={dashboard.navUser}
      workspaceId={dashboard.workspaceId}
    >
      {children}
    </DashboardShell>
  );
}
