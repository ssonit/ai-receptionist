import type { CSSProperties, ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardCommand } from "@/components/dashboard-command";
import { DashboardCommandProvider } from "@/components/dashboard-command-context";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { DashboardNavUser } from "@/lib/dashboard-user";

export function DashboardShell({
  user,
  title,
  children,
}: {
  user: DashboardNavUser;
  title: string;
  children: ReactNode;
}) {
  return (
    <DashboardCommandProvider>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as CSSProperties
        }
      >
        <AppSidebar user={user} variant="inset" />
        <SidebarInset>
          <SiteHeader title={title} />
          <div className="flex flex-1 flex-col">{children}</div>
        </SidebarInset>
        <DashboardCommand />
      </SidebarProvider>
    </DashboardCommandProvider>
  );
}
