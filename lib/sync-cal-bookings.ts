import { fetchAllCalBookings } from "@/lib/calcom";
import { bookingConfig } from "@/lib/booking-config";
import { normalizeCalApiStatus } from "@/lib/booking-status";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPilotWorkspaceId } from "@/lib/workspace";

export type SyncCalBookingsResult = {
  synced: number;
  error?: string;
  skipped?: boolean;
  scopeLabel?: string;
  truncated?: boolean;
};

/** Full Cal.com mirror → upsert Supabase (preserves chat `session_id`). */
export async function syncCalBookingsToSupabase(): Promise<SyncCalBookingsResult> {
  if (!bookingConfig.cal.apiKey) {
    return { synced: 0, skipped: true, error: "CALCOM_API_KEY chưa cấu hình" };
  }

  try {
    const { items: calBookings, scope } = await fetchAllCalBookings();
    const truncHint =
      scope.truncatedFilters.length > 0
        ? ` · truncated: ${scope.truncatedFilters.join(",")}`
        : "";
    const scopeLabel = `all filters · ≤${scope.pageLimit * scope.maxPages}/filter${truncHint}`;

    const supabase = createAdminClient();
    const workspaceId = getPilotWorkspaceId();
    const uids = calBookings.map((b) => b.uid);

    const sessionByUid = new Map<string, string | null>();
    if (uids.length > 0) {
      const chunkSize = 200;
      for (let i = 0; i < uids.length; i += chunkSize) {
        const chunk = uids.slice(i, i + chunkSize);
        const { data: existing } = await supabase
          .from("bookings")
          .select("cal_booking_uid, session_id")
          .in("cal_booking_uid", chunk);

        for (const row of existing ?? []) {
          if (row.cal_booking_uid) {
            sessionByUid.set(row.cal_booking_uid, row.session_id);
          }
        }
      }
    }

    const syncedAt = new Date().toISOString();
    const storeRaw = bookingConfig.sync.storeRaw;
    const rows = calBookings.map((b) => ({
      workspace_id: workspaceId,
      cal_booking_uid: b.uid,
      guest_name: b.attendeeName,
      guest_phone: b.attendeePhone ?? null,
      guest_email: b.attendeeEmail,
      service: b.title ?? null,
      start_time: b.start,
      status: normalizeCalApiStatus(b.status),
      list_status: b.listStatus,
      notes: null,
      session_id: sessionByUid.get(b.uid) ?? null,
      synced_at: syncedAt,
      ...(storeRaw ? { raw: b.raw } : {}),
    }));

    if (rows.length === 0) {
      return {
        synced: 0,
        scopeLabel,
        truncated: scope.truncatedFilters.length > 0,
      };
    }

    // Upsert in chunks to keep payloads small
    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase.from("bookings").upsert(chunk, {
        onConflict: "cal_booking_uid",
      });
      if (error) {
        return {
          synced: i,
          error: error.message,
          scopeLabel,
          truncated: scope.truncatedFilters.length > 0,
        };
      }
    }

    return {
      synced: rows.length,
      scopeLabel,
      truncated: scope.truncatedFilters.length > 0,
    };
  } catch (error) {
    return {
      synced: 0,
      error: error instanceof Error ? error.message : "Đồng bộ Cal.com thất bại",
    };
  }
}
