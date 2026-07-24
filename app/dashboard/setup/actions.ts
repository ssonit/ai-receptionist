"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getCalMeProfile,
  listEventTypes,
  withCalApiKey,
} from "@/lib/calcom";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  getCalApiKeyForWorkspace,
  getWorkspaceById,
  slugifyWorkspaceName,
} from "@/lib/workspace";
import { encryptSecret } from "@/lib/workspace-secrets";
import { canonicalizeTimezone } from "@/lib/timezones";
import { setAiBookingMeetingTypeAction } from "@/app/dashboard/meeting-types/actions";

export type SetupActionState = {
  error?: string;
  success?: string;
};

async function requireOwnerWorkspace() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in." as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return { error: "Account is not assigned to a workspace." as const };
  }

  return { workspaceId: profile.workspace_id as string, userId: user.id };
}

export async function saveCalApiKeyAction(
  _prev: SetupActionState,
  formData: FormData,
): Promise<SetupActionState> {
  const auth = await requireOwnerWorkspace();
  if ("error" in auth) return { error: auth.error };

  const apiKey = String(formData.get("calApiKey") ?? "").trim();
  if (!apiKey) return { error: "Paste a Cal.com API key to continue." };

  try {
    const me = await withCalApiKey(apiKey, () => getCalMeProfile());
    const encrypted = encryptSecret(apiKey);
    const admin = createAdminClient();
    const { error } = await admin
      .from("workspaces")
      .update({
        cal_api_key_encrypted: encrypted,
        cal_username: me.username,
        timezone: me.timeZone
          ? canonicalizeTimezone(me.timeZone)
          : undefined,
      })
      .eq("id", auth.workspaceId);

    if (error) return { error: error.message };

    revalidatePath("/dashboard/setup");
    return { success: `Connected Cal.com · @${me.username}` };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not verify Cal.com API key",
    };
  }
}

export async function syncSetupMeetingTypesAction(): Promise<SetupActionState> {
  const auth = await requireOwnerWorkspace();
  if ("error" in auth) return { error: auth.error };

  try {
    const apiKey = await getCalApiKeyForWorkspace(auth.workspaceId);
    const remote = await withCalApiKey(apiKey, () => listEventTypes());
    const admin = createAdminClient();

    if (remote.length === 0) {
      return {
        error:
          "No meeting types on Cal.com. Create an event type, then Sync again.",
      };
    }

    const rows = remote.map((et) => ({
      workspace_id: auth.workspaceId,
      cal_event_type_id: et.id,
      slug: et.slug,
      title: et.title,
      length_minutes: et.lengthInMinutes,
      minimum_notice_minutes: et.minimumBookingNotice ?? null,
      raw: et.raw,
      synced_at: new Date().toISOString(),
    }));

    const { error } = await admin.from("workspace_event_types").upsert(rows, {
      onConflict: "workspace_id,cal_event_type_id",
    });
    if (error) return { error: error.message };

    revalidatePath("/dashboard/setup");
    return { success: `Synced ${remote.length} meeting type${remote.length === 1 ? "" : "s"}.` };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Sync failed",
    };
  }
}

export async function setSetupAiMeetingTypeAction(
  meetingTypeRowId: string,
): Promise<SetupActionState> {
  return setAiBookingMeetingTypeAction(meetingTypeRowId);
}

export async function saveSetupProfileAction(
  _prev: SetupActionState,
  formData: FormData,
): Promise<SetupActionState> {
  const auth = await requireOwnerWorkspace();
  if ("error" in auth) return { error: auth.error };

  const name = String(formData.get("name") ?? "").trim();
  let slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();
  const timezone = canonicalizeTimezone(
    String(formData.get("timezone") ?? "").trim() || "Asia/Ho_Chi_Minh",
  );
  const about = String(formData.get("about") ?? "").trim();

  if (!name) return { error: "Workspace name is required." };
  if (!slug) slug = slugifyWorkspaceName(name);
  slug = slugifyWorkspaceName(slug);

  const admin = createAdminClient();
  const { data: clash } = await admin
    .from("workspaces")
    .select("id")
    .eq("slug", slug)
    .neq("id", auth.workspaceId)
    .maybeSingle();

  if (clash) {
    return { error: `Slug “${slug}” is already taken. Choose another.` };
  }

  const { error } = await admin
    .from("workspaces")
    .update({ name, slug, timezone, about: about || null })
    .eq("id", auth.workspaceId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/setup");
  return { success: "Workspace profile saved." };
}

export async function completeSetupAction(): Promise<SetupActionState> {
  const auth = await requireOwnerWorkspace();
  if ("error" in auth) return { error: auth.error };

  const ws = await getWorkspaceById(auth.workspaceId);
  if (!ws?.has_cal_key) {
    return { error: "Cal.com API key is not connected." };
  }
  if (!ws.cal_event_type_id) {
    return { error: "AI booking meeting type is not selected." };
  }

  const admin = createAdminClient();
  let slug = ws.slug?.trim() || null;

  // Rare: signup should always set slug — ensure one before opening public page.
  if (!slug) {
    let base = slugifyWorkspaceName(ws.name || "ws");
    let candidate = base;
    let n = 0;
    while (true) {
      const { data: clash } = await admin
        .from("workspaces")
        .select("id")
        .eq("slug", candidate)
        .neq("id", auth.workspaceId)
        .maybeSingle();
      if (!clash) break;
      n += 1;
      candidate = `${base.slice(0, 40)}-${n}`;
    }
    slug = candidate;
  }

  const { error } = await admin
    .from("workspaces")
    .update({
      slug,
      setup_completed_at: new Date().toISOString(),
    })
    .eq("id", auth.workspaceId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/setup");
  revalidatePath(`/b/${slug}`);
  redirect("/dashboard");
}

/** Save optional profile fields from step 3, then mark setup complete. */
export async function finishSetupAction(
  _prev: SetupActionState,
  formData: FormData,
): Promise<SetupActionState> {
  const saved = await saveSetupProfileAction(_prev, formData);
  if (saved.error) return saved;
  return completeSetupAction();
}
