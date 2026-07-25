import type { CSSProperties, ReactNode } from "react";
import { BookingLiveBanner } from "@/components/booking-live-banner";
import { DashboardCommandProvider } from "@/components/dashboard-command-context";
import { DashboardShellChrome } from "@/components/dashboard-shell-chrome";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { DashboardNavUser } from "@/lib/dashboard-user";
import { isWorkspaceBookingLive } from "@/lib/workspace";

export async function DashboardShell({
  user,
  title,
  bookingPagePath,
  workspaceId,
  children,
}: {
  user: DashboardNavUser;
  title: string;
  /** Optional override; defaults to layout context `/b/{slug}`. */
  bookingPagePath?: string | null;
  /** When set, show Cal.com connect banner if booking is not live. */
  workspaceId?: string | null;
  children: ReactNode;
}) {
  const bookingLive = workspaceId
    ? await isWorkspaceBookingLive(workspaceId)
    : true;

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
          {!bookingLive ? <BookingLiveBanner /> : null}
          {children}
        </DashboardShellChrome>
      </SidebarProvider>
    </DashboardCommandProvider>
  );
}

/** Re-export inset for typing consumers that imported from shell. */
export { SidebarInset };
