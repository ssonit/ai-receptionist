"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FaqSettingsState = {
  error?: string;
  success?: string;
};

export async function saveFaqSettings(
  _prev: FaqSettingsState,
  formData: FormData,
): Promise<FaqSettingsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Bạn cần đăng nhập." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) {
    return { error: "Tài khoản chưa được gán workspace." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const openingHours = String(formData.get("opening_hours") ?? "").trim();
  const services = String(formData.get("services") ?? "").trim();
  const pricing = String(formData.get("pricing") ?? "").trim();
  const preparation = String(formData.get("preparation") ?? "").trim();
  const cancelPolicy = String(formData.get("cancel_policy") ?? "").trim();
  const extra = String(formData.get("extra") ?? "").trim();

  if (!name) {
    return { error: "Tên workspace là bắt buộc." };
  }
  if (!timezone) {
    return { error: "Timezone là bắt buộc." };
  }

  const { error: workspaceError } = await supabase
    .from("workspaces")
    .update({
      name,
      timezone,
      phone: phone || null,
      address: address || null,
    })
    .eq("id", workspaceId);

  if (workspaceError) {
    return { error: workspaceError.message };
  }

  const { error: faqError } = await supabase.from("workspace_faq").upsert({
    workspace_id: workspaceId,
    opening_hours: openingHours || null,
    services: services || null,
    pricing: pricing || null,
    preparation: preparation || null,
    cancel_policy: cancelPolicy || null,
    extra: extra || null,
  });

  if (faqError) {
    return { error: faqError.message };
  }

  revalidatePath("/dashboard/settings");
  return { success: "Đã lưu FAQ. Agent sẽ dùng nội dung mới ở lượt chat tiếp theo." };
}
