"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

const PAGES_BASE = [
  { title: "Dashboard", href: "/dashboard", icon: IconDashboard },
  { title: "Bookings", href: "/dashboard/bookings", icon: IconCalendarEvent },
  { title: "Meeting types", href: "/dashboard/meeting-types", icon: IconTags },
  { title: "FAQ", href: "/dashboard/faq", icon: IconQuestionMark },
  { title: "Leads", href: "/dashboard/leads", icon: IconUsers },
  {
    title: "Conversations",
    href: "/dashboard/conversations",
    icon: IconMessage,
  },
  { title: "Analytics", href: "/dashboard/analytics", icon: IconChartBar },
  { title: "Settings", href: "/dashboard/settings", icon: IconSettings },
  { title: "Get Help", href: "/dashboard/help", icon: IconHelp },
  { title: "Account", href: "/dashboard/account", icon: IconUser },
] as const;

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
  const router = useRouter();
  const { open, setOpen } = useDashboardCommand();
  const [query, setQuery] = React.useState("");
  const [leads, setLeads] = React.useState<LeadHit[]>([]);
  const [bookings, setBookings] = React.useState<BookingHit[]>([]);
  const [searching, setSearching] = React.useState(false);

  const pages = React.useMemo(
    () => [
      ...PAGES_BASE,
      {
        title: "Booking page",
        href: bookingPagePath,
        icon: IconMessageChatbot,
      },
    ],
    [bookingPagePath],
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
      title="Search"
      description="Jump to pages or find leads and bookings"
    >
      <CommandInput
        placeholder="Tìm trang, lead, booking…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {searching ? "Đang tìm…" : "Không có kết quả."}
        </CommandEmpty>
        <CommandGroup heading="Pages">
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
            <CommandGroup heading="Leads">
              {leads.map((lead) => (
                <CommandItem
                  key={lead.id}
                  value={`lead ${lead.full_name} ${lead.phone} ${lead.email}`}
                  onSelect={() => go("/dashboard/leads")}
                >
                  <IconUsers />
                  <span className="truncate">
                    {lead.full_name || "Lead"}
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
            <CommandGroup heading="Bookings">
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
                      ? ` · ${new Date(booking.start_time).toLocaleString("vi-VN", {
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
