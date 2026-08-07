"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconCirclePlusFilled, IconMail, type Icon } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { isDashboardNavActive } from "@/lib/dashboard-access";
import { ROUTES } from "@/lib/routes";

export type NavMainItem = {
  title: string;
  url: string;
  icon?: Icon;
};

export type NavMainGroup = {
  label: string;
  items: NavMainItem[];
};

export function NavMain({ groups }: { groups: NavMainGroup[] }) {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent className="flex flex-col gap-2">
          <SidebarMenu>
            <SidebarMenuItem className="flex items-center gap-2">
              <SidebarMenuButton
                asChild
                className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
                tooltip={t("dashboard.openChat")}
              >
                <Link href={ROUTES.CHAT}>
                  <IconCirclePlusFilled />
                  <span>{t("dashboard.openChat")}</span>
                </Link>
              </SidebarMenuButton>
              <Button
                asChild
                className="size-8 group-data-[collapsible=icon]:opacity-0"
                size="icon"
                variant="outline"
              >
                <Link
                  aria-label={t("dashboard.nav.leads")}
                  href={ROUTES.DASHBOARD_LEADS}
                >
                  <IconMail />
                  <span className="sr-only">{t("dashboard.nav.leads")}</span>
                </Link>
              </Button>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={isDashboardNavActive(pathname, item.url)}
                    tooltip={item.title}
                  >
                    <Link href={item.url}>
                      {item.icon ? <item.icon /> : null}
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
