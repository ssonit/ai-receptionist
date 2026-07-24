"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconHome } from "@tabler/icons-react";
import { DashboardRefreshButton } from "@/components/dashboard-refresh-button";
import { LocaleToggle } from "@/components/locale-provider";
import { NotificationsBell } from "@/components/notifications-bell";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

const TITLE_BY_PATH: Record<string, string> = {
  "/dashboard": "dashboard.nav.overview",
  "/dashboard/bookings": "dashboard.nav.bookings",
  "/dashboard/meeting-types": "dashboard.nav.meetingTypes",
  "/dashboard/faq": "dashboard.nav.faq",
  "/dashboard/leads": "dashboard.nav.leads",
  "/dashboard/conversations": "dashboard.nav.conversations",
  "/dashboard/analytics": "dashboard.nav.analytics",
  "/dashboard/settings": "dashboard.settings",
  "/dashboard/help": "dashboard.getHelp",
  "/dashboard/account": "dashboard.account",
  "/dashboard/notifications": "dashboard.notifications",
};

export function SiteHeader({
  title,
  bookingPagePath = "/b/eve-pilot",
}: {
  title?: string;
  bookingPagePath?: string;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const titleKey = TITLE_BY_PATH[pathname];
  const heading = titleKey ? t(titleKey) : (title ?? t("dashboard.nav.dashboard"));

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] duration-300 ease-in-out group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          className="mx-2 data-[orientation=vertical]:h-4"
          orientation="vertical"
        />
        <h1 className="text-base font-medium">{heading}</h1>
        <div className="ml-auto flex items-center gap-2">
          <LocaleToggle variant="light" />
          <NotificationsBell />
          <DashboardRefreshButton />
          <Button asChild className="hidden sm:flex" size="sm" variant="outline">
            <Link href={bookingPagePath}>{t("dashboard.bookingPage")}</Link>
          </Button>
          <Button
            asChild
            aria-label="Landing"
            size="icon-sm"
            title="Landing"
            variant="default"
          >
            <Link href="/">
              <IconHome className="size-4" />
              <span className="sr-only">Landing</span>
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
