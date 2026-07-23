"use server";

import { revalidatePath } from "next/cache";
import { isLeadStatus, type LeadStatus } from "@/lib/lead-status";
import { createClient } from "@/lib/supabase/server";

export type LeadActionState = {
  error?: string;
  success?: string;
};

async function requireWorkspace() {
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

export async function updateLeadStatusAction(
  leadId: string,
  status: string,
): Promise<LeadActionState> {
  const auth = await requireWorkspace();
  if ("error" in auth) return { error: auth.error };
  if (!isLeadStatus(status)) return { error: "Status không hợp lệ." };

  const { error } = await auth.supabase
    .from("leads")
    .update({ status: status as LeadStatus })
    .eq("id", leadId)
    .eq("workspace_id", auth.workspaceId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard");
  return { success: `Đã cập nhật status → ${status}.` };
}

export async function updateLeadNotesAction(
  leadId: string,
  notes: string,
): Promise<LeadActionState> {
  const auth = await requireWorkspace();
  if ("error" in auth) return { error: auth.error };

  const { error } = await auth.supabase
    .from("leads")
    .update({ notes: notes.trim() || null })
    .eq("id", leadId)
    .eq("workspace_id", auth.workspaceId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/leads");
  return { success: "Đã lưu notes." };
}
