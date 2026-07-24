"use server";

import { revalidatePath } from "next/cache";
import {
  APP_ERROR_CODE,
  appErrorMessage,
  formatUnknownError,
} from "@/lib/errors";
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
    return { error: appErrorMessage(APP_ERROR_CODE.SIGN_IN_REQUIRED) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return { error: appErrorMessage(APP_ERROR_CODE.NO_WORKSPACE) };
  }

  const result = await syncCalBookingsToSupabase(profile.workspace_id);

  if (result.error && !result.skipped) {
    return {
      error: formatUnknownError(
        new Error(result.error),
        APP_ERROR_CODE.SYNC_FAILED,
      ),
    };
  }

  if (result.skipped) {
    return { error: appErrorMessage(APP_ERROR_CODE.CAL_NOT_CONFIGURED) };
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
