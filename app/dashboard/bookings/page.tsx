import { redirect } from "next/navigation";
import { BookingsSyncButton } from "@/components/bookings-sync-button";
import { BookingsTable } from "@/components/bookings-table";
import { DashboardShell } from "@/components/dashboard-shell";
import { getDashboardUser } from "@/lib/dashboard-user";
import { createClient } from "@/lib/supabase/server";

export default async function BookingsPage() {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect("/login?next=/dashboard/bookings");
  }

  const workspaceId = dashboard.workspaceId;
  if (!workspaceId) {
    redirect("/dashboard/setup");
  }

  const supabase = await createClient();
  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, guest_name, guest_phone, guest_email, start_time, status, list_status, service, cal_booking_uid, session_id, synced_at, raw",
    )
    .eq("workspace_id", workspaceId)
    .order("start_time", { ascending: false })
    .limit(100);

  const lastSyncedAt = (bookings ?? []).reduce<string | null>((latest, row) => {
    if (!row.synced_at) return latest;
    if (!latest || row.synced_at > latest) return row.synced_at;
    return latest;
  }, null);

  const syncMessage = lastSyncedAt
    ? `Dữ liệu Supabase — đồng bộ lần cuối ${new Date(lastSyncedAt).toLocaleString("vi-VN")}.`
    : "Dữ liệu Supabase — nhấn Đồng bộ Cal.com để lấy lịch từ Cal.com.";

  return (
    <DashboardShell title="Bookings" user={dashboard.navUser}>
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
            <div>
              <p className="text-sm text-muted-foreground">{syncMessage}</p>
              <p className="text-muted-foreground text-xs">
                Cal.com là nguồn gốc — Supabase mirror để dashboard &amp; chat
                tracking.
              </p>
            </div>
            <BookingsSyncButton />
          </div>
          <BookingsTable rows={bookings ?? []} />
        </div>
      </div>
    </DashboardShell>
  );
}
