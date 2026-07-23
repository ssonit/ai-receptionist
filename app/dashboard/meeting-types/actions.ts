"use server";

import { revalidatePath } from "next/cache";
import {
  createEventType,
  listEventTypes,
  withCalApiKey,
  type CalEventType,
} from "@/lib/calcom";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCalApiKeyForWorkspace, slugifyWorkspaceName } from "@/lib/workspace";

export type MeetingTypesActionState = {
  error?: string;
  success?: string;
};

async function requireWorkspaceId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Bạn cần đăng nhập." as const };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return { error: "Tài khoản chưa được gán workspace." as const };
  }

  return { workspaceId: profile.workspace_id as string, userId: user.id };
}

function mirrorRow(
  workspaceId: string,
  et: CalEventType,
  extras?: { isAiBooking?: boolean },
) {
  return {
    workspace_id: workspaceId,
    cal_event_type_id: et.id,
    slug: et.slug,
    title: et.title,
    length_minutes: et.lengthInMinutes,
    minimum_notice_minutes: et.minimumBookingNotice ?? null,
    raw: et.raw,
    synced_at: new Date().toISOString(),
    ...(extras?.isAiBooking !== undefined
      ? { is_ai_booking: extras.isAiBooking }
      : {}),
  };
}

async function setAiBookingOnWorkspace(
  workspaceId: string,
  et: { cal_event_type_id: number; slug: string },
) {
  const admin = createAdminClient();

  await admin
    .from("workspace_event_types")
    .update({ is_ai_booking: false })
    .eq("workspace_id", workspaceId)
    .eq("is_ai_booking", true);

  const { error: flagError } = await admin
    .from("workspace_event_types")
    .update({ is_ai_booking: true })
    .eq("workspace_id", workspaceId)
    .eq("cal_event_type_id", et.cal_event_type_id);

  if (flagError) throw new Error(flagError.message);

  const { error: wsError } = await admin
    .from("workspaces")
    .update({
      cal_event_type_id: et.cal_event_type_id,
      cal_event_type_slug: et.slug,
    })
    .eq("id", workspaceId);

  if (wsError) throw new Error(wsError.message);
}

function revalidateMeetingTypePaths() {
  revalidatePath("/dashboard/meeting-types");
  revalidatePath("/dashboard/settings");
}

export async function syncMeetingTypesAction(): Promise<MeetingTypesActionState> {
  const auth = await requireWorkspaceId();
  if ("error" in auth) return { error: auth.error };

  try {
    const apiKey = await getCalApiKeyForWorkspace(auth.workspaceId);
    const remote = await withCalApiKey(apiKey, () => listEventTypes());
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("workspace_event_types")
      .select("cal_event_type_id, is_ai_booking")
      .eq("workspace_id", auth.workspaceId);

    const hadAi = (existing ?? []).some((r) => r.is_ai_booking);

    if (remote.length > 0) {
      const upsertRows = remote.map((et) => mirrorRow(auth.workspaceId, et));
      const { error } = await admin.from("workspace_event_types").upsert(upsertRows, {
        onConflict: "workspace_id,cal_event_type_id",
        ignoreDuplicates: false,
      });
      if (error) return { error: error.message };

      if (!hadAi && remote[0]) {
        const { data: aiRow } = await admin
          .from("workspace_event_types")
          .select("id")
          .eq("workspace_id", auth.workspaceId)
          .eq("is_ai_booking", true)
          .maybeSingle();
        if (!aiRow) {
          await setAiBookingOnWorkspace(auth.workspaceId, {
            cal_event_type_id: remote[0].id,
            slug: remote[0].slug,
          });
        }
      }
    }

    revalidateMeetingTypePaths();
    return {
      success:
        remote.length > 0
          ? `Đã sync ${remote.length} meeting type từ Cal.com.`
          : "Cal.com không có meeting type nào.",
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Sync meeting types thất bại",
    };
  }
}

export async function createMeetingTypeAction(
  _prev: MeetingTypesActionState,
  formData: FormData,
): Promise<MeetingTypesActionState> {
  const auth = await requireWorkspaceId();
  if ("error" in auth) return { error: auth.error };

  const title = String(formData.get("title") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const lengthMinutes = Number(formData.get("length_minutes") ?? 30);
  const description = String(formData.get("description") ?? "").trim();
  const location = String(formData.get("location") ?? "cal-video").trim();

  if (!title) return { error: "Title là bắt buộc." };
  if (!Number.isFinite(lengthMinutes) || lengthMinutes < 1) {
    return { error: "Duration không hợp lệ." };
  }

  const allowedLocations = new Set(["cal-video", "google-meet"]);
  if (!allowedLocations.has(location)) {
    return { error: "Location không hợp lệ." };
  }

  const slug =
    slugRaw ||
    slugifyWorkspaceName(title) ||
    `meeting-${lengthMinutes}`;

  try {
    const apiKey = await getCalApiKeyForWorkspace(auth.workspaceId);
    const created = await withCalApiKey(apiKey, () =>
      createEventType({
        title,
        slug,
        lengthInMinutes: lengthMinutes,
        description: description || undefined,
        locations: [{ type: "integration", integration: location }],
      }),
    );

    const admin = createAdminClient();
    const { data: aiExisting } = await admin
      .from("workspace_event_types")
      .select("id")
      .eq("workspace_id", auth.workspaceId)
      .eq("is_ai_booking", true)
      .maybeSingle();

    const makeAi = !aiExisting;
    const { error } = await admin.from("workspace_event_types").upsert(
      mirrorRow(auth.workspaceId, created, { isAiBooking: makeAi }),
      { onConflict: "workspace_id,cal_event_type_id" },
    );
    if (error) return { error: error.message };

    if (makeAi) {
      await setAiBookingOnWorkspace(auth.workspaceId, {
        cal_event_type_id: created.id,
        slug: created.slug,
      });
    }

    revalidateMeetingTypePaths();
    return {
      success: makeAi
        ? `Đã tạo “${created.title}” và chọn làm AI booking.`
        : `Đã tạo “${created.title}” trên Cal.com.`,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Tạo meeting type thất bại",
    };
  }
}

export async function setAiBookingMeetingTypeAction(
  meetingTypeRowId: string,
): Promise<MeetingTypesActionState> {
  const auth = await requireWorkspaceId();
  if ("error" in auth) return { error: auth.error };

  try {
    const admin = createAdminClient();
    const { data: row, error } = await admin
      .from("workspace_event_types")
      .select("cal_event_type_id, slug, title")
      .eq("id", meetingTypeRowId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle();

    if (error) return { error: error.message };
    if (!row) return { error: "Không tìm thấy meeting type." };

    await setAiBookingOnWorkspace(auth.workspaceId, {
      cal_event_type_id: row.cal_event_type_id,
      slug: row.slug,
    });

    revalidateMeetingTypePaths();
    return { success: `AI booking dùng “${row.title}”.` };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Không chọn được AI booking meeting type",
    };
  }
}
