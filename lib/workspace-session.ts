import { createClient } from "@/lib/supabase/server";

/** Cookie-session workspace helpers — not safe for Eve agent tool bundles. */

export async function getSessionWorkspaceId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.workspace_id ?? null;
}

export async function requireSessionWorkspaceId(): Promise<string> {
  const id = await getSessionWorkspaceId();
  if (!id) {
    throw new Error("Account is not assigned to a workspace.");
  }
  return id;
}
