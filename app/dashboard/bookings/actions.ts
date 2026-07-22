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

  const windowHint = result.scopeLabel ? ` (${result.scopeLabel})` : "";
  const truncWarn = result.truncated
    ? " — một số filter bị cắt bởi maxPages, tăng BOOKING_SYNC_MAX_PAGES."
    : "";

  return {
    success:
      result.synced > 0
        ? `Đã đồng bộ ${result.synced} lịch từ Cal.com${windowHint}.${truncWarn}`
        : `Không có lịch trong phạm vi sync${windowHint}.${truncWarn}`,
  };
}
