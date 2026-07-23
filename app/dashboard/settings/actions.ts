"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canonicalizeTimezone } from "@/lib/timezones";
import type { WorkspaceSettingsState } from "@/lib/workspace-settings-types";
import { slugifyWorkspaceName } from "@/lib/workspace";

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
  let slug = String(formData.get("slug") ?? "").trim();

  if (!name) return { error: "Tên workspace là bắt buộc." };
  if (!timezone) return { error: "Timezone là bắt buộc." };

  const canonicalTimezone = canonicalizeTimezone(timezone);

  if (!slug) slug = slugifyWorkspaceName(name);
  slug = slugifyWorkspaceName(slug);

  const { data: taken } = await auth.supabase
    .from("workspaces")
    .select("id")
    .eq("slug", slug)
    .neq("id", auth.workspaceId)
    .maybeSingle();

  if (taken) {
    return { error: `Slug “${slug}” đã được dùng. Chọn slug khác.` };
  }

  const { error } = await auth.supabase
    .from("workspaces")
    .update({
      name,
      slug,
      timezone: canonicalTimezone,
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
  revalidatePath(`/b/${slug}`);
  return { success: "Đã lưu cấu hình workspace." };
}

export async function checkWorkspaceSlugAvailable(
  slugRaw: string,
): Promise<{ available: boolean; slug: string; message: string }> {
  const auth = await requireWorkspaceId();
  if ("error" in auth) {
    return { available: false, slug: "", message: auth.error };
  }

  const slug = slugifyWorkspaceName(slugRaw);
  if (slug.length < 2) {
    return {
      available: false,
      slug,
      message: "Slug cần ít nhất 2 ký tự (a-z, 0-9).",
    };
  }

  // Unchanged from current workspace — still "available" for this user
  const { data: self } = await auth.supabase
    .from("workspaces")
    .select("id")
    .eq("id", auth.workspaceId)
    .eq("slug", slug)
    .maybeSingle();

  if (self) {
    return {
      available: true,
      slug,
      message: `“${slug}” đang là slug của bạn.`,
    };
  }

  const { data: taken } = await auth.supabase
    .from("workspaces")
    .select("id")
    .eq("slug", slug)
    .neq("id", auth.workspaceId)
    .maybeSingle();

  if (taken) {
    return {
      available: false,
      slug,
      message: `“${slug}” đã được dùng. Chọn slug khác.`,
    };
  }

  return {
    available: true,
    slug,
    message: `“${slug}” có thể dùng.`,
  };
}
