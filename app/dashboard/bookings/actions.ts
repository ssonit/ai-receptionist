"use server";

import { revalidatePath } from "next/cache";
import { syncCalBookingsToSupabase } from "@/lib/sync-cal-bookings";
import { createClient } from "@/lib/supabase/server";

export type SyncBookingsState = {
  error?: string;
  success?: string;
};

export async function syncBookingsAction(): Promise<SyncBookingsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Bạn cần đăng nhập." };
  }

  const result = await syncCalBookingsToSupabase();

  if (result.error && !result.skipped) {
    return { error: result.error };
  }

  if (result.skipped) {
    return { error: result.error ?? "Chưa cấu hình Cal.com." };
  }

  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/notifications");

  const windowHint = result.scopeLabel ? ` (${result.scopeLabel})` : "";
  const truncWarn = result.truncated
    ? " — một số filter bị cắt bởi maxPages, tăng BOOKING_SYNC_MAX_PAGES."
    : "";
  const changeHint =
    (result.cancelledNotified ?? 0) + (result.rescheduledNotified ?? 0) > 0
      ? ` · ${result.cancelledNotified ?? 0} hủy, ${result.rescheduledNotified ?? 0} đổi giờ → thông báo.`
      : "";

  return {
    success:
      result.synced > 0
        ? `Đã đồng bộ ${result.synced} lịch từ Cal.com${windowHint}.${truncWarn}${changeHint}`
        : `Không có lịch trong phạm vi sync${windowHint}.${truncWarn}${changeHint}`,
  };
}
