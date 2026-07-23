import { createClient } from "@/lib/supabase/server";
import { publicBookingPath } from "@/lib/workspace";

export type DashboardNavUser = {
  name: string;
  email: string;
  avatar: string;
};

export async function getDashboardUser(): Promise<{
  navUser: DashboardNavUser;
  workspaceId: string | null;
  workspaceSlug: string | null;
  bookingPagePath: string | null;
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

  let workspaceSlug: string | null = null;
  if (profile?.workspace_id) {
    const { data: ws } = await supabase
      .from("workspaces")
      .select("slug")
      .eq("id", profile.workspace_id)
      .maybeSingle();
    workspaceSlug = ws?.slug ?? null;
  }

  return {
    navUser: {
      name: profile?.full_name || user.email?.split("@")[0] || "Account",
      email: profile?.email || user.email || "",
      avatar: "",
    },
    workspaceId: profile?.workspace_id ?? null,
    workspaceSlug,
    bookingPagePath: workspaceSlug ? publicBookingPath(workspaceSlug) : null,
  };
}
