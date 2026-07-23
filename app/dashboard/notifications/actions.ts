"use server";

import { revalidatePath } from "next/cache";
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
  if (!user) return { error: "Unauthorized" };

  try {
    await markNotificationRead(id);
    revalidatePath("/dashboard/notifications");
    return { ok: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to mark read",
    };
  }
}

export async function markAllNotificationsReadAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  try {
    await markAllNotificationsRead();
    revalidatePath("/dashboard/notifications");
    return { ok: true as const };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to mark all read",
    };
  }
}
