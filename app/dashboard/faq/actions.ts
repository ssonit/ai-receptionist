"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_FAQ_ITEMS,
  type FaqItemInput,
  type FaqSettingsState,
} from "@/lib/workspace-faq-types";

export type { FaqSettingsState } from "@/lib/workspace-faq-types";

function parseFaqItems(formData: FormData): FaqItemInput[] | { error: string } {
  const raw = String(formData.get("faq_items") ?? "").trim();
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Dữ liệu FAQ không hợp lệ." };
  }

  if (!Array.isArray(parsed)) {
    return { error: "Dữ liệu FAQ không hợp lệ." };
  }

  if (parsed.length > MAX_FAQ_ITEMS) {
    return { error: `Tối đa ${MAX_FAQ_ITEMS} FAQ mỗi workspace.` };
  }

  const items: FaqItemInput[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i];
    if (!entry || typeof entry !== "object") {
      return { error: `FAQ #${i + 1} không hợp lệ.` };
    }
    const question = String(
      (entry as { question?: unknown }).question ?? "",
    ).trim();
    const answer = String((entry as { answer?: unknown }).answer ?? "").trim();
    if (!question || !answer) {
      return { error: `FAQ #${i + 1}: câu hỏi và câu trả lời đều bắt buộc.` };
    }
    items.push({ question, answer });
  }

  return items;
}

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

  const parsedItems = parseFaqItems(formData);
  if ("error" in parsedItems) {
    return { error: parsedItems.error };
  }

  const { error: deleteError } = await supabase
    .from("workspace_faq_items")
    .delete()
    .eq("workspace_id", workspaceId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  if (parsedItems.length > 0) {
    const { error: insertError } = await supabase
      .from("workspace_faq_items")
      .insert(
        parsedItems.map((item, index) => ({
          workspace_id: workspaceId,
          question: item.question,
          answer: item.answer,
          sort_order: index,
        })),
      );

    if (insertError) {
      return { error: insertError.message };
    }
  }

  revalidatePath("/dashboard/faq");
  return { success: "Đã lưu FAQ. Agent sẽ dùng nội dung mới ở lượt chat tiếp theo." };
}
