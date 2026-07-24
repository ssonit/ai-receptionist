"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  IconCalendarEvent,
  IconChartBar,
  IconDashboard,
  IconHelp,
  IconMessage,
  IconMessageChatbot,
  IconQuestionMark,
  IconSettings,
  IconTags,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";
import { useDashboardCommand } from "@/components/dashboard-command-context";
import { useOptionalAppLocale } from "@/components/locale-provider";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

type LeadHit = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
};

type BookingHit = {
  id: string;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  start_time: string;
  status: string;
};

export function DashboardCommand({
  bookingPagePath = "/b/eve-pilot",
}: {
  bookingPagePath?: string;
}) {
  const t = useTranslations();
  const localeCtx = useOptionalAppLocale();
  const dateLocale = localeCtx?.locale === "vi" ? "vi-VN" : "en-US";
  const router = useRouter();
  const { open, setOpen } = useDashboardCommand();
  const [query, setQuery] = React.useState("");
  const [leads, setLeads] = React.useState<LeadHit[]>([]);
  const [bookings, setBookings] = React.useState<BookingHit[]>([]);
  const [searching, setSearching] = React.useState(false);

  const pages = React.useMemo(
    () => [
      {
        title: t("dashboard.nav.dashboard"),
        href: "/dashboard",
        icon: IconDashboard,
      },
      {
        title: t("dashboard.nav.bookings"),
        href: "/dashboard/bookings",
        icon: IconCalendarEvent,
      },
      {
        title: t("dashboard.nav.meetingTypes"),
        href: "/dashboard/meeting-types",
        icon: IconTags,
      },
      { title: t("dashboard.nav.faq"), href: "/dashboard/faq", icon: IconQuestionMark },
      { title: t("dashboard.nav.leads"), href: "/dashboard/leads", icon: IconUsers },
      {
        title: t("dashboard.nav.conversations"),
        href: "/dashboard/conversations",
        icon: IconMessage,
      },
      {
        title: t("dashboard.nav.analytics"),
        href: "/dashboard/analytics",
        icon: IconChartBar,
      },
      {
        title: t("dashboard.settings"),
        href: "/dashboard/settings",
        icon: IconSettings,
      },
      { title: t("dashboard.getHelp"), href: "/dashboard/help", icon: IconHelp },
      { title: t("dashboard.account"), href: "/dashboard/account", icon: IconUser },
      {
        title: t("dashboard.bookingPage"),
        href: bookingPagePath,
        icon: IconMessageChatbot,
      },
    ],
    [bookingPagePath, t],
  );

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setLeads([]);
      setBookings([]);
    }
  }, [open]);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setLeads([]);
      setBookings([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/dashboard/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          leads: LeadHit[];
          bookings: BookingHit[];
        };
        setLeads(data.leads ?? []);
        setBookings(data.bookings ?? []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("[dashboard search]", error);
        }
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t("dashboard.search")}
      description={t("dashboard.searchDescription")}
    >
      <CommandInput
        placeholder={t("dashboard.searchPlaceholder")}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {searching ? t("dashboard.searching") : t("dashboard.noResults")}
        </CommandEmpty>
        <CommandGroup heading={t("dashboard.pages")}>
          {pages.map((page) => (
            <CommandItem
              key={page.href}
              value={`${page.title} ${page.href}`}
              onSelect={() => go(page.href)}
            >
              <page.icon />
              <span>{page.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        {leads.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("dashboard.nav.leads")}>
              {leads.map((lead) => (
                <CommandItem
                  key={lead.id}
                  value={`lead ${lead.full_name} ${lead.phone} ${lead.email}`}
                  onSelect={() => go("/dashboard/leads")}
                >
                  <IconUsers />
                  <span className="truncate">
                    {lead.full_name || t("dashboard.nav.leads")}
                    {lead.phone ? ` · ${lead.phone}` : ""}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
        {bookings.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("dashboard.nav.bookings")}>
              {bookings.map((booking) => (
                <CommandItem
                  key={booking.id}
                  value={`booking ${booking.guest_name} ${booking.guest_phone} ${booking.guest_email}`}
                  onSelect={() => go("/dashboard/bookings")}
                >
                  <IconCalendarEvent />
                  <span className="truncate">
                    {booking.guest_name}
                    {booking.start_time
                      ? ` · ${new Date(booking.start_time).toLocaleString(dateLocale, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}`
                      : ""}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
