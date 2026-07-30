"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  IconCalendarEvent,
  IconChartBar,
  IconDashboard,
  IconCode,
  IconHelp,
  IconMessage,
  IconMessageChatbot,
  IconQuestionMark,
  IconRobot,
  IconSearch,
  IconSettings,
  IconTags,
  IconUsers,
} from "@tabler/icons-react";

import { EveLogo } from "@/components/eve-logo";
import { useDashboardRole } from "@/components/dashboard-role-context";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  canAccessDashboardPath,
  DASHBOARD_PATH,
} from "@/lib/dashboard-access";

export function AppSidebar({
  user,
  bookingPagePath = "/b/eve-pilot",
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string; avatar: string };
  bookingPagePath?: string;
}) {
  const t = useTranslations();
  const role = useDashboardRole();

  const navGroups = [
    {
      label: t("dashboard.nav.groups.overview"),
      items: [
        {
          title: t("dashboard.nav.dashboard"),
          url: DASHBOARD_PATH.root,
          icon: IconDashboard,
        },
        {
          title: t("dashboard.nav.analytics"),
          url: DASHBOARD_PATH.analytics,
          icon: IconChartBar,
        },
      ],
    },
    {
      label: t("dashboard.nav.groups.booking"),
      items: [
        {
          title: t("dashboard.nav.bookings"),
          url: DASHBOARD_PATH.bookings,
          icon: IconCalendarEvent,
        },
        {
          title: t("dashboard.nav.meetingTypes"),
          url: DASHBOARD_PATH.meetingTypes,
          icon: IconTags,
        },
        {
          title: t("dashboard.nav.embed"),
          url: DASHBOARD_PATH.embed,
          icon: IconCode,
        },
        {
          title: t("dashboard.bookingPage"),
          url: bookingPagePath,
          icon: IconMessageChatbot,
        },
      ].filter((item) => canAccessDashboardPath(role, item.url)),
    },
    {
      label: t("dashboard.nav.groups.customers"),
      items: [
        {
          title: t("dashboard.nav.conversations"),
          url: DASHBOARD_PATH.conversations,
          icon: IconMessage,
        },
        {
          title: t("dashboard.nav.leads"),
          url: DASHBOARD_PATH.leads,
          icon: IconUsers,
        },
      ],
    },
    {
      label: t("dashboard.nav.groups.agent"),
      items: [
        {
          title: t("dashboard.nav.agent"),
          url: DASHBOARD_PATH.agent,
          icon: IconRobot,
        },
        {
          title: t("dashboard.nav.faq"),
          url: DASHBOARD_PATH.faq,
          icon: IconQuestionMark,
        },
      ].filter((item) => canAccessDashboardPath(role, item.url)),
    },
  ].filter((group) => group.items.length > 0);

  const navSecondary = [
    {
      title: t("dashboard.settings"),
      url: DASHBOARD_PATH.settings,
      icon: IconSettings,
    },
    {
      title: t("dashboard.getHelp"),
      url: DASHBOARD_PATH.help,
      icon: IconHelp,
    },
    {
      title: t("dashboard.search"),
      icon: IconSearch,
      action: "search" as const,
    },
  ].filter((item) => !item.url || canAccessDashboardPath(role, item.url));

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <Link href={DASHBOARD_PATH.root}>
                <EveLogo showLabel size="sm" />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={navGroups} />
        <NavSecondary className="mt-auto" items={navSecondary} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
