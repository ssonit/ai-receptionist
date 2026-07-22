import { AgentChat } from "@/app/_components/agent-chat";
import { createClient } from "@/lib/supabase/server";

export default async function ChatPage() {
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

  return <AgentChat user={chatUser} />;
}
