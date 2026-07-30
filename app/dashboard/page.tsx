import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table";
import { SectionCards, type SectionCardStat } from "@/components/section-cards";
import { getCalBookingViewLabel } from "@/lib/booking-status";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { getDashboardUser } from "@/lib/dashboard-user";
import { createClient } from "@/lib/supabase/server";
import { WORKSPACE_ROLE } from "@/lib/workspace-roles";
import { redirect } from "next/navigation";

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export default async function DashboardPage() {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect(`/login?next=${DASHBOARD_PATH.root}`);
  }

  const workspaceId = dashboard.workspaceId;
  if (!workspaceId) {
    redirect(
      dashboard.role === WORKSPACE_ROLE.OWNER
        ? DASHBOARD_PATH.setup
        : "/login",
    );
  }

  const supabase = await createClient();

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, guest_name, guest_phone, guest_email, start_time, status, service, cal_booking_uid, created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(50);

  const weekAgo = daysAgoIso(7);
  const { data: newLeads } = await supabase
    .from("leads")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("status", "new")
    .gte("created_at", weekAgo);

  const { count: leadsTotal } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  const todayIso = startOfTodayIso();
  const bookingsList = bookings ?? [];
  const newLeadsCount = newLeads?.length ?? 0;
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
      value: String(newLeadsCount),
      delta: leadsTotal ? `${leadsTotal} total` : "0 total",
      trend: newLeadsCount ? "up" : "down",
      footnote: "Status = new (7 days)",
      detail: "Xem /dashboard/leads",
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

  const tableData = bookingsList.map((b, index) => ({
    id: index + 1,
    header: b.guest_name,
    type: b.service || "Appointment",
    status: getCalBookingViewLabel(String(b.status), b.start_time),
    target: new Date(b.start_time).toLocaleString("en-US", {
      dateStyle: "short",
      timeStyle: "short",
    }),
    limit: b.guest_phone || "—",
    reviewer: b.guest_email || "—",
  }));

  return (
    <DashboardShell title="Overview" user={dashboard.navUser} workspaceId={dashboard.workspaceId}>
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <SectionCards stats={stats} />
          <div id="bookings">
            <DataTable data={tableData} />
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
