import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table";
import { SectionCards, type SectionCardStat } from "@/components/section-cards";
import { getCalBookingViewLabel } from "@/lib/booking-status";
import { getDashboardUser } from "@/lib/dashboard-user";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default async function DashboardPage() {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect("/login?next=/dashboard");
  }

  const supabase = await createClient();

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, guest_name, guest_phone, guest_email, start_time, status, service, cal_booking_uid, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: leads } = await supabase
    .from("leads")
    .select("id, full_name, phone, email, service, urgency, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const todayIso = startOfTodayIso();
  const bookingsList = bookings ?? [];
  const leadsList = leads ?? [];
  const bookingsToday = bookingsList.filter((b) => b.start_time >= todayIso).length;
  const confirmed = bookingsList.filter((b) =>
    ["accepted", "pending"].includes(
      String(b.status).toLowerCase().replace("confirmed", "accepted"),
    ),
  ).length;

  const stats: SectionCardStat[] = [
    {
      label: "Bookings today",
      value: String(bookingsToday),
      delta: "+12.5%",
      trend: "up",
      footnote: "Appointments starting today",
      detail: "Synced from Cal.com",
    },
    {
      label: "New leads",
      value: String(leadsList.length),
      delta: leadsList.length ? "+8%" : "0%",
      trend: leadsList.length ? "up" : "down",
      footnote: "Captured from chat",
      detail: "Last 50 records",
    },
    {
      label: "Total bookings",
      value: String(bookingsList.length),
      delta: "+4.2%",
      trend: "up",
      footnote: "Recent booking volume",
      detail: "Mirrored in Supabase",
    },
    {
      label: "Confirmed rate",
      value: bookingsList.length
        ? `${Math.round((confirmed / bookingsList.length) * 100)}%`
        : "0%",
      delta: "+4.5%",
      trend: "up",
      footnote: "Upcoming + Unconfirmed (Cal.com)",
      detail: "Needs attention when below 60%",
    },
  ];

  const tableData = [
    ...bookingsList.map((b, index) => ({
      id: index + 1,
      header: b.guest_name,
      type: b.service || "Appointment",
      status: getCalBookingViewLabel(String(b.status), b.start_time),
      target: new Date(b.start_time).toLocaleString("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      }),
      limit: b.guest_phone || "—",
      reviewer: b.guest_email || "—",
    })),
    ...leadsList.map((lead, index) => ({
      id: bookingsList.length + index + 1,
      header: lead.full_name || "Lead",
      type: lead.service || "Lead",
      status: "Unconfirmed",
      target: new Date(lead.created_at).toLocaleString("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      }),
      limit: lead.phone || "—",
      reviewer: lead.email?.trim() || "—",
    })),
  ];

  const navUser = dashboard.navUser;

  return (
    <DashboardShell title="Overview" user={navUser}>
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <SectionCards stats={stats} />
          <div className="px-4 lg:px-6" id="analytics">
            <ChartAreaInteractive />
          </div>
          <div id="bookings">
            <DataTable data={tableData} />
          </div>
          <div className="px-4 text-sm text-muted-foreground lg:px-6" id="leads">
            Leads appear in the table above (type = Lead). Open chat to capture more.
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
