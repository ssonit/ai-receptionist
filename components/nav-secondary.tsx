"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type Icon } from "@tabler/icons-react";

import { useDashboardCommand } from "@/components/dashboard-command-context";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DASHBOARD_PATH,
  isDashboardNavActive,
} from "@/lib/dashboard-access";

export type NavSecondaryItem = {
  title: string;
  url?: string;
  icon: Icon;
  action?: "search";
};

export function NavSecondary({
  items,
  ...props
}: {
  items: NavSecondaryItem[];
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const { setOpen } = useDashboardCommand();
  const pathname = usePathname();

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              {item.action === "search" ? (
                <SidebarMenuButton
                  type="button"
                  tooltip="Search (⌘K)"
                  onClick={() => setOpen(true)}
                >
                  <item.icon />
                  <span>{item.title}</span>
                  <span className="text-muted-foreground ml-auto text-[10px] tracking-wide">
                    ⌘K
                  </span>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton
                  asChild
                  isActive={isDashboardNavActive(
                    pathname,
                    item.url || DASHBOARD_PATH.root,
                  )}
                  tooltip={item.title}
                >
                  <Link href={item.url || DASHBOARD_PATH.root}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
