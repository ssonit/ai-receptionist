import { AgentChat } from "@/app/_components/agent-chat";
import { createClient } from "@/lib/supabase/server";
import {
  getDefaultWorkspaceId,
  getWorkspaceById,
} from "@/lib/workspace";

/**
 * Marketing product demo — always Eve Pilot (seeded sandbox).
 * Real tenant booking lives at `/b/[slug]`.
 */
export default async function ChatPage() {
  const workspaceId = getDefaultWorkspaceId();
  const workspace = await getWorkspaceById(workspaceId);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()
    : { data: null };

  const chatUser = user
    ? {
        name: profile?.full_name || user.email?.split("@")[0] || "Account",
        email: profile?.email || user.email || "",
        avatar: "",
      }
    : null;

  return (
    <AgentChat
      demoMode
      user={chatUser}
      workspaceName={workspace?.name ?? "Eve Pilot"}
      workspaceSlug={workspace?.slug ?? "eve-pilot"}
    />
  );
}
