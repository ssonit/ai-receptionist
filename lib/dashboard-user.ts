import { cache } from "react";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { createClient } from "@/lib/supabase/server";
import { publicBookingPath } from "@/lib/workspace";
import type { WorkspaceRole } from "@/lib/workspace-roles";

export type DashboardNavUser = {
  name: string;
  email: string;
  avatar: string;
};

export const getDashboardUser = cache(async (): Promise<{
  navUser: DashboardNavUser;
  userId: string;
  workspaceId: string | null;
  workspaceSlug: string | null;
  bookingPagePath: string | null;
  role: WorkspaceRole | null;
} | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: profile }, active] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle(),
    getActiveWorkspace(),
  ]);

  let workspaceSlug: string | null = null;
  if (active?.workspaceId) {
    const { data: ws } = await supabase
      .from("workspaces")
      .select("slug")
      .eq("id", active.workspaceId)
      .maybeSingle();
    workspaceSlug = ws?.slug ?? null;
  }

  return {
    navUser: {
      name: profile?.full_name || user.email?.split("@")[0] || "Account",
      email: profile?.email || user.email || "",
      avatar: "",
    },
    userId: user.id,
    workspaceId: active?.workspaceId ?? null,
    workspaceSlug,
    bookingPagePath: workspaceSlug ? publicBookingPath(workspaceSlug) : null,
    role: active?.role ?? null,
  };
});
