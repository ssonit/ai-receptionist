"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconCalendarEvent } from "@tabler/icons-react";
import { DashboardRefreshButton } from "@/components/dashboard-refresh-button";
import { EveLogoMark } from "@/components/eve-logo";
import { LocaleToggle } from "@/components/locale-provider";
import { NotificationsBell } from "@/components/notifications-bell";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";

const TITLE_BY_PATH: Record<string, string> = {
  [DASHBOARD_PATH.root]: "dashboard.nav.overview",
  [DASHBOARD_PATH.bookings]: "dashboard.nav.bookings",
  [DASHBOARD_PATH.meetingTypes]: "dashboard.nav.meetingTypes",
  [DASHBOARD_PATH.embed]: "dashboard.nav.embed",
  [DASHBOARD_PATH.faq]: "dashboard.nav.faq",
  [DASHBOARD_PATH.agent]: "dashboard.nav.agent",
  [DASHBOARD_PATH.leads]: "dashboard.nav.leads",
  [DASHBOARD_PATH.conversations]: "dashboard.nav.conversations",
  [DASHBOARD_PATH.analytics]: "dashboard.nav.analytics",
  [DASHBOARD_PATH.settings]: "dashboard.settings",
  [DASHBOARD_PATH.help]: "dashboard.getHelp",
  [DASHBOARD_PATH.account]: "dashboard.account",
  [DASHBOARD_PATH.notifications]: "dashboard.notifications",
  [DASHBOARD_PATH.billing]: "dashboard.nav.billing",
};

const BILLING_PAY_PATH = `${DASHBOARD_PATH.billing}/pay`;

function titleKeyForPath(pathname: string): string | undefined {
  if (pathname === BILLING_PAY_PATH || pathname.startsWith(`${BILLING_PAY_PATH}/`)) {
    return "dashboard.billing.payTitle";
  }
  return TITLE_BY_PATH[pathname];
}

export function SiteHeader({
  title,
  bookingPagePath = "/b/eve-pilot",
}: {
  title?: string;
  bookingPagePath?: string;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const titleKey = titleKeyForPath(pathname);
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
          <Button
            asChild
            aria-label={t("dashboard.bookingPage")}
            className="hidden sm:inline-flex"
            size="icon-sm"
            title={t("dashboard.bookingPage")}
            variant="outline"
          >
            <Link href={bookingPagePath}>
              <IconCalendarEvent className="size-4" />
              <span className="sr-only">{t("dashboard.bookingPage")}</span>
            </Link>
          </Button>
          <Button
            asChild
            aria-label="Landing"
            size="icon-sm"
            title="Landing"
            variant="default"
          >
            <Link href="/">
              <EveLogoMark className="rounded-sm" size="xs" />
              <span className="sr-only">Landing</span>
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
