import { redirect } from "next/navigation";
import { BookingsSyncButton } from "@/components/bookings-sync-button";
import { BookingsTable } from "@/components/bookings-table";
import { NewBookingDialog } from "@/components/new-booking-dialog";
import { bookingConfig } from "@/lib/booking-config";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { getDashboardUser } from "@/lib/dashboard-user";
import { createClient } from "@/lib/supabase/server";
import { WORKSPACE_ROLE } from "@/lib/workspace-roles";
import { listWorkspaceMeetingTypes } from "@/lib/workspace-cal";

export default async function BookingsPage() {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect(`/login?next=${DASHBOARD_PATH.bookings}`);
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
  const [{ data: bookings }, { data: workspace }, meetingTypes] =
    await Promise.all([
      supabase
        .from("bookings")
        .select(
          "id, guest_name, guest_phone, guest_email, start_time, status, list_status, cancelled_by, guest_timezone, service, cal_booking_uid, session_id, synced_at, raw, created_by_staff_id",
        )
        .eq("workspace_id", workspaceId)
        .order("start_time", { ascending: false })
        .limit(100),
      supabase
        .from("workspaces")
        .select("name, timezone, service_mode")
        .eq("id", workspaceId)
        .maybeSingle(),
      listWorkspaceMeetingTypes(workspaceId),
    ]);

  const staffIds = [
    ...new Set(
      (bookings ?? [])
        .map((b) => b.created_by_staff_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const staffNameById = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: staffProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", staffIds);
    for (const p of staffProfiles ?? []) {
      staffNameById.set(p.id, p.full_name || p.email || "Team");
    }
  }

  const rows = (bookings ?? []).map((b) => ({
    ...b,
    created_by_staff_name: b.created_by_staff_id
      ? (staffNameById.get(b.created_by_staff_id) ?? null)
      : null,
  }));

  const lastSyncedAt = rows.reduce<string | null>((latest, row) => {
    if (!row.synced_at) return latest;
    if (!latest || row.synced_at > latest) return row.synced_at;
    return latest;
  }, null);

  const syncMessage = lastSyncedAt
    ? `Supabase data — last synced ${new Date(lastSyncedAt).toLocaleString("en-US")}.`
    : "Supabase data — click Sync Cal.com to pull bookings from Cal.com.";

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <div>
            <p className="text-sm text-muted-foreground">{syncMessage}</p>
            <p className="text-muted-foreground text-xs">
              Cal.com is the source of truth — Supabase mirrors it for dashboard &amp; chat
              tracking.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <NewBookingDialog
              meetingTypes={meetingTypes.map((mt) => ({
                id: mt.id,
                title: mt.title,
                lengthMinutes: mt.length_minutes,
              }))}
            />
            <BookingsSyncButton />
          </div>
        </div>
        <BookingsTable
          hostName={workspace?.name ?? "Appointment"}
          rows={rows}
          serviceMode={
            workspace?.service_mode === "online" ? "online" : "onsite"
          }
          timeZone={workspace?.timezone ?? bookingConfig.timezone}
        />
      </div>
    </div>
  );
}
