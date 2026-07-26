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
  IconInnerShadowTop,
  IconMessage,
  IconMessageChatbot,
  IconQuestionMark,
  IconRobot,
  IconSearch,
  IconSettings,
  IconTags,
  IconUsers,
} from "@tabler/icons-react";

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

export function AppSidebar({
  user,
  bookingPagePath = "/b/eve-pilot",
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string; avatar: string };
  bookingPagePath?: string;
}) {
  const t = useTranslations();

  const navGroups = [
    {
      label: t("dashboard.nav.groups.overview"),
      items: [
        {
          title: t("dashboard.nav.dashboard"),
          url: "/dashboard",
          icon: IconDashboard,
        },
        {
          title: t("dashboard.nav.analytics"),
          url: "/dashboard/analytics",
          icon: IconChartBar,
        },
      ],
    },
    {
      label: t("dashboard.nav.groups.booking"),
      items: [
        {
          title: t("dashboard.nav.bookings"),
          url: "/dashboard/bookings",
          icon: IconCalendarEvent,
        },
        {
          title: t("dashboard.nav.meetingTypes"),
          url: "/dashboard/meeting-types",
          icon: IconTags,
        },
        {
          title: t("dashboard.nav.embed"),
          url: "/dashboard/embed",
          icon: IconCode,
        },
        {
          title: t("dashboard.bookingPage"),
          url: bookingPagePath,
          icon: IconMessageChatbot,
        },
      ],
    },
    {
      label: t("dashboard.nav.groups.customers"),
      items: [
        {
          title: t("dashboard.nav.conversations"),
          url: "/dashboard/conversations",
          icon: IconMessage,
        },
        {
          title: t("dashboard.nav.leads"),
          url: "/dashboard/leads",
          icon: IconUsers,
        },
      ],
    },
    {
      label: t("dashboard.nav.groups.agent"),
      items: [
        {
          title: t("dashboard.nav.agent"),
          url: "/dashboard/agent",
          icon: IconRobot,
        },
        {
          title: t("dashboard.nav.faq"),
          url: "/dashboard/faq",
          icon: IconQuestionMark,
        },
      ],
    },
  ];

  const navSecondary = [
    {
      title: t("dashboard.settings"),
      url: "/dashboard/settings",
      icon: IconSettings,
    },
    {
      title: t("dashboard.getHelp"),
      url: "/dashboard/help",
      icon: IconHelp,
    },
    {
      title: t("dashboard.search"),
      icon: IconSearch,
      action: "search" as const,
    },
  ];

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <Link href="/dashboard">
                <IconInnerShadowTop className="size-5!" />
                <span className="text-base font-semibold">Eve</span>
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
