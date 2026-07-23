"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceSettingsState } from "@/lib/workspace-settings-types";

export type { WorkspaceSettingsState } from "@/lib/workspace-settings-types";

async function requireWorkspaceId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return { error: "Tài khoản chưa được gán workspace." as const };
  }

  return { supabase, workspaceId: profile.workspace_id as string };
}

function optionalText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim() || null;
}

export async function saveWorkspaceSettings(
  _prev: WorkspaceSettingsState,
  formData: FormData,
): Promise<WorkspaceSettingsState> {
  const auth = await requireWorkspaceId();
  if ("error" in auth) return { error: auth.error };

  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();

  if (!name) return { error: "Tên workspace là bắt buộc." };
  if (!timezone) return { error: "Timezone là bắt buộc." };

  const { error } = await auth.supabase
    .from("workspaces")
    .update({
      name,
      timezone,
      phone: optionalText(formData, "phone"),
      address: optionalText(formData, "address"),
      email: optionalText(formData, "email"),
      website: optionalText(formData, "website"),
      tagline: optionalText(formData, "tagline"),
      about: optionalText(formData, "about"),
      business_hours: optionalText(formData, "business_hours"),
      services_summary: optionalText(formData, "services_summary"),
      agent_instructions: optionalText(formData, "agent_instructions"),
    })
    .eq("id", auth.workspaceId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/faq");
  return { success: "Đã lưu cấu hình workspace." };
}
