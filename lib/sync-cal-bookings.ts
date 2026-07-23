import { fetchAllCalBookings, withCalApiKey } from "@/lib/calcom";
import { bookingConfig } from "@/lib/booking-config";
import { isCancelledStatus, normalizeCalApiStatus } from "@/lib/booking-status";
import { ensureDigestNotifications } from "@/lib/notification-digests";
import { createNotification } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCalApiKeyForWorkspace,
  getDefaultWorkspaceId,
} from "@/lib/workspace";
import { getSessionWorkspaceId } from "@/lib/workspace-session";

export type SyncCalBookingsResult = {
  synced: number;
  error?: string;
  skipped?: boolean;
  scopeLabel?: string;
  truncated?: boolean;
  cancelledNotified?: number;
  rescheduledNotified?: number;
};

type ExistingBooking = {
  cal_booking_uid: string;
  status: string;
  start_time: string;
  guest_name: string | null;
  guest_email: string | null;
  session_id: string | null;
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

/** Full Cal.com mirror → upsert Supabase (preserves chat `session_id`). */
export async function syncCalBookingsToSupabase(
  workspaceId?: string,
): Promise<SyncCalBookingsResult> {
  const wsId =
    workspaceId ??
    (await getSessionWorkspaceId()) ??
    getDefaultWorkspaceId();

  let apiKey: string;
  try {
    apiKey = await getCalApiKeyForWorkspace(wsId);
  } catch {
    return {
      synced: 0,
      skipped: true,
      error: "Cal.com API key chưa cấu hình cho workspace",
    };
  }

  try {
    const { items: calBookings, scope } = await withCalApiKey(apiKey, () =>
      fetchAllCalBookings(),
    );
    const truncHint =
      scope.truncatedFilters.length > 0
        ? ` · truncated: ${scope.truncatedFilters.join(",")}`
        : "";
    const scopeLabel = `all filters · ≤${scope.pageLimit * scope.maxPages}/filter${truncHint}`;

    const supabase = createAdminClient();
    const workspaceId = wsId;
    const uids = calBookings.map((b) => b.uid);

    const existingByUid = new Map<string, ExistingBooking>();
    if (uids.length > 0) {
      const chunkSize = 200;
      for (let i = 0; i < uids.length; i += chunkSize) {
        const chunk = uids.slice(i, i + chunkSize);
        const { data: existing } = await supabase
          .from("bookings")
          .select(
            "cal_booking_uid, status, start_time, guest_name, guest_email, session_id",
          )
          .in("cal_booking_uid", chunk);

        for (const row of existing ?? []) {
          if (row.cal_booking_uid) {
            existingByUid.set(row.cal_booking_uid, row as ExistingBooking);
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
      session_id: existingByUid.get(b.uid)?.session_id ?? null,
      synced_at: syncedAt,
      ...(storeRaw ? { raw: b.raw } : {}),
    }));

    let cancelledNotified = 0;
    let rescheduledNotified = 0;

    for (const row of rows) {
      const prev = existingByUid.get(row.cal_booking_uid);
      if (!prev) continue;

      const guest =
        row.guest_name?.trim() ||
        row.guest_email?.trim() ||
        prev.guest_name?.trim() ||
        prev.guest_email?.trim() ||
        row.cal_booking_uid.slice(0, 8);

      const wasCancelled = isCancelledStatus(prev.status);
      const nowCancelled = isCancelledStatus(String(row.status));

      if (!wasCancelled && nowCancelled) {
        const id = await createNotification({
          type: "booking_cancelled",
          title: "Booking đã hủy trên Cal.com",
          body: `${guest} · ${formatWhen(row.start_time)}`,
          severity: "high",
          href: "/dashboard/bookings",
          entityType: "booking",
          entityId: row.cal_booking_uid,
          workspaceId,
        });
        if (id) cancelledNotified += 1;
        continue;
      }

      if (
        !nowCancelled &&
        prev.start_time &&
        row.start_time &&
        prev.start_time !== row.start_time
      ) {
        const id = await createNotification({
          type: "booking_rescheduled",
          title: "Booking đổi giờ trên Cal.com",
          body: `${guest}: ${formatWhen(prev.start_time)} → ${formatWhen(row.start_time)}`,
          severity: "high",
          href: "/dashboard/bookings",
          entityType: "booking",
          entityId: `${row.cal_booking_uid}:${row.start_time}`,
          workspaceId,
        });
        if (id) rescheduledNotified += 1;
      }
    }

    if (rows.length === 0) {
      await ensureDigestNotifications(workspaceId);
      return {
        synced: 0,
        scopeLabel,
        truncated: scope.truncatedFilters.length > 0,
        cancelledNotified,
        rescheduledNotified,
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
          cancelledNotified,
          rescheduledNotified,
        };
      }
    }

    await ensureDigestNotifications(workspaceId);

    return {
      synced: rows.length,
      scopeLabel,
      truncated: scope.truncatedFilters.length > 0,
      cancelledNotified,
      rescheduledNotified,
    };
  } catch (error) {
    return {
      synced: 0,
      error: error instanceof Error ? error.message : "Đồng bộ Cal.com thất bại",
    };
  }
}
