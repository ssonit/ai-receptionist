"use server";

import { revalidatePath } from "next/cache";
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
    return { error: "Name cannot be empty." };
  }
  if (fullName.length > 120) {
    return { error: "Name must be at most 120 characters." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You need to sign in." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/account");
  revalidatePath("/dashboard", "layout");

  return { success: "Display name updated." };
}
