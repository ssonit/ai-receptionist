"use server";

import { revalidatePath } from "next/cache";
import {
  APP_ERROR_CODE,
  appErrorMessage,
  formatDbError,
} from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type AccountActionState = {
  error?: string;
  success?: string;
};

export async function updateAccountNameAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  if (!fullName) {
    return { error: appErrorMessage(APP_ERROR_CODE.NAME_EMPTY) };
  }
  if (fullName.length > 120) {
    return { error: appErrorMessage(APP_ERROR_CODE.NAME_TOO_LONG) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: appErrorMessage(APP_ERROR_CODE.SIGN_IN_REQUIRED) };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);

  if (error) {
    return { error: formatDbError(error) };
  }

  revalidatePath("/dashboard/account");
  revalidatePath("/dashboard", "layout");

  return { success: "Display name updated." };
}
