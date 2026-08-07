"use server";

import { revalidatePath } from "next/cache";
import {
  APP_ERROR_CODE,
  appErrorMessage,
  formatUnknownError,
} from "@/lib/errors";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

export async function markNotificationReadAction(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: appErrorMessage(APP_ERROR_CODE.UNAUTHORIZED) };
  }

  try {
    await markNotificationRead(id);
    revalidatePath("/dashboard/notifications");
    return { ok: true as const };
  } catch (error) {
    return {
      error: formatUnknownError(error, APP_ERROR_CODE.MARK_READ_FAILED),
    };
  }
}

export async function markAllNotificationsReadAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: appErrorMessage(APP_ERROR_CODE.UNAUTHORIZED) };
  }

  try {
    await markAllNotificationsRead();
    revalidatePath("/dashboard/notifications");
    return { ok: true as const };
  } catch (error) {
    return {
      error: formatUnknownError(error, APP_ERROR_CODE.MARK_ALL_READ_FAILED),
    };
  }
}
