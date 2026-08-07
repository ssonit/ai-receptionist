"use client";

import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardCommand } from "@/components/dashboard-command";
import { useDashboardBookingPath } from "@/components/dashboard-booking-path-context";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset } from "@/components/ui/sidebar";
import type { DashboardNavUser } from "@/lib/dashboard-user";

export function DashboardShellChrome({
  user,
  title,
  bookingPagePath,
  children,
}: {
  user: DashboardNavUser;
  title?: string;
  bookingPagePath?: string | null;
  children: ReactNode;
}) {
  const fromContext = useDashboardBookingPath();
  const chatHref = bookingPagePath || fromContext;

  return (
    <>
      <AppSidebar bookingPagePath={chatHref} user={user} variant="inset" />
      <SidebarInset>
        <SiteHeader bookingPagePath={chatHref} title={title} />
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
      <DashboardCommand bookingPagePath={chatHref} />
    </>
  );
}
