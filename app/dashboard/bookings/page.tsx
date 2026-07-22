import { redirect } from "next/navigation";
import { BookingsSyncButton } from "@/components/bookings-sync-button";
import { BookingsTable } from "@/components/bookings-table";
import { DashboardShell } from "@/components/dashboard-shell";
import { createClient } from "@/lib/supabase/server";

export default async function BookingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, guest_name, guest_phone, guest_email, start_time, status, list_status, service, cal_booking_uid, session_id, synced_at, raw",
    )
    .order("start_time", { ascending: false })
    .limit(100);

  const navUser = {
    name: profile?.full_name || user.email?.split("@")[0] || "Account",
    email: profile?.email || user.email || "you@eve.local",
    avatar: "",
  };

  const lastSyncedAt = (bookings ?? []).reduce<string | null>((latest, row) => {
    if (!row.synced_at) return latest;
    if (!latest || row.synced_at > latest) return row.synced_at;
    return latest;
  }, null);

  const syncMessage = lastSyncedAt
    ? `Dữ liệu Supabase — đồng bộ lần cuối ${new Date(lastSyncedAt).toLocaleString("vi-VN")}.`
    : "Dữ liệu Supabase — nhấn Đồng bộ Cal.com để lấy lịch từ Cal.com.";

  return (
    <DashboardShell title="Bookings" user={navUser}>
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
