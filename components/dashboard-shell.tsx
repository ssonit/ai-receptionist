import type { CSSProperties, ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardCommand } from "@/components/dashboard-command";
import { DashboardCommandProvider } from "@/components/dashboard-command-context";
import { DashboardShellChrome } from "@/components/dashboard-shell-chrome";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { DashboardNavUser } from "@/lib/dashboard-user";

export function DashboardShell({
  user,
  title,
  bookingPagePath,
  children,
}: {
  user: DashboardNavUser;
  title: string;
  /** Optional override; defaults to layout context `/b/{slug}`. */
  bookingPagePath?: string | null;
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
        <DashboardShellChrome
          bookingPagePath={bookingPagePath}
          title={title}
          user={user}
        >
          {children}
        </DashboardShellChrome>
      </SidebarProvider>
    </DashboardCommandProvider>
  );
}

/** Re-export inset for typing consumers that imported from shell. */
export { SidebarInset };
