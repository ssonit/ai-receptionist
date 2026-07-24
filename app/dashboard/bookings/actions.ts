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
    return { error: "You need to sign in." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return { error: "Account is not assigned to a workspace." };
  }

  const result = await syncCalBookingsToSupabase(profile.workspace_id);

  if (result.error && !result.skipped) {
    return { error: result.error };
  }

  if (result.skipped) {
    return { error: result.error ?? "Cal.com is not configured." };
  }

  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/notifications");

  const windowHint = result.scopeLabel ? ` (${result.scopeLabel})` : "";
  const truncWarn = result.truncated
    ? " — some filters were truncated by maxPages; increase BOOKING_SYNC_MAX_PAGES."
    : "";
  const changeHint =
    (result.cancelledNotified ?? 0) + (result.rescheduledNotified ?? 0) > 0
      ? ` · ${result.cancelledNotified ?? 0} cancelled, ${result.rescheduledNotified ?? 0} rescheduled → notifications.`
      : "";

  return {
    success:
      result.synced > 0
        ? `Synced ${result.synced} booking${result.synced === 1 ? "" : "s"} from Cal.com${windowHint}.${truncWarn}${changeHint}`
        : `No bookings in sync scope${windowHint}.${truncWarn}${changeHint}`,
  };
}
