"use client";

import * as React from "react";
import Link from "next/link";
import {
  IconCalendarEvent,
  IconChartBar,
  IconDashboard,
  IconHelp,
  IconInnerShadowTop,
  IconMessageChatbot,
  IconQuestionMark,
  IconSearch,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";

import { NavDocuments } from "@/components/nav-documents";
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
  { title: "Leads", url: "/dashboard#leads", icon: IconUsers },
  { title: "Analytics", url: "/dashboard#analytics", icon: IconChartBar },
  { title: "Chat", url: "/chat", icon: IconMessageChatbot },
  { title: "FAQ", url: "/dashboard/settings", icon: IconQuestionMark },
];

const documents = [
  { name: "Bookings", url: "/dashboard/bookings", icon: IconCalendarEvent },
  { name: "Leads", url: "/dashboard#leads", icon: IconUsers },
  { name: "Chat", url: "/chat", icon: IconMessageChatbot },
];

const navSecondary = [
  { title: "Settings", url: "/dashboard/settings", icon: IconSettings },
  { title: "Get Help", url: "/chat", icon: IconHelp },
  { title: "Search", url: "/dashboard", icon: IconSearch },
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
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
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
        <NavDocuments items={documents} />
        <NavSecondary className="mt-auto" items={navSecondary} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
