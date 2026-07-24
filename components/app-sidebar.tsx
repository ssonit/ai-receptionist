"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  IconCalendarEvent,
  IconChartBar,
  IconDashboard,
  IconHelp,
  IconInnerShadowTop,
  IconMessage,
  IconMessageChatbot,
  IconQuestionMark,
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

  const navMain = [
    {
      title: t("dashboard.nav.dashboard"),
      url: "/dashboard",
      icon: IconDashboard,
    },
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
    { title: t("dashboard.nav.faq"), url: "/dashboard/faq", icon: IconQuestionMark },
    { title: t("dashboard.nav.leads"), url: "/dashboard/leads", icon: IconUsers },
    {
      title: t("dashboard.nav.conversations"),
      url: "/dashboard/conversations",
      icon: IconMessage,
    },
    {
      title: t("dashboard.nav.analytics"),
      url: "/dashboard/analytics",
      icon: IconChartBar,
    },
    {
      title: t("dashboard.bookingPage"),
      url: bookingPagePath,
      icon: IconMessageChatbot,
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
        <NavMain items={navMain} />
        <NavSecondary className="mt-auto" items={navSecondary} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
