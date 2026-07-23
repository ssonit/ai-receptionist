"use client";

import * as React from "react";
import Link from "next/link";
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

const navMain = [
  { title: "Dashboard", url: "/dashboard", icon: IconDashboard },
  { title: "Bookings", url: "/dashboard/bookings", icon: IconCalendarEvent },
  { title: "Meeting types", url: "/dashboard/meeting-types", icon: IconTags },
  { title: "FAQ", url: "/dashboard/faq", icon: IconQuestionMark },
  { title: "Leads", url: "/dashboard/leads", icon: IconUsers },
  { title: "Conversations", url: "/dashboard/conversations", icon: IconMessage },
  { title: "Analytics", url: "/dashboard/analytics", icon: IconChartBar },
  { title: "Chat", url: "/chat", icon: IconMessageChatbot },
];

const navSecondary = [
  { title: "Settings", url: "/dashboard/settings", icon: IconSettings },
  { title: "Get Help", url: "/dashboard/help", icon: IconHelp },
  { title: "Search", icon: IconSearch, action: "search" as const },
];

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string; avatar: string };
}) {
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
