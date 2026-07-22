import { createClient } from "@/lib/supabase/server";

export type DashboardNavUser = {
  name: string;
  email: string;
  avatar: string;
};

export async function getDashboardUser(): Promise<{
  navUser: DashboardNavUser;
  workspaceId: string | null;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  return {
    navUser: {
      name: profile?.full_name || user.email?.split("@")[0] || "Account",
      email: profile?.email || user.email || "",
      avatar: "",
    },
    workspaceId: profile?.workspace_id ?? null,
  };
}
