import { WorkspaceBookingPage } from "@/app/_components/workspace-booking-page";
import { createClient } from "@/lib/supabase/server";
import { readGuestLocale } from "@/lib/read-locale-cookie";
import {
  getDefaultWorkspaceId,
  getPublicBookingWorkspace,
  getWorkspaceById,
} from "@/lib/workspace";

/**
 * Marketing product demo — always Eve Pilot (seeded sandbox).
 * Same chat UI as tenant booking `/b/[slug]`, with a demo banner.
 */
export default async function ChatPage() {
  const initialLocale = await readGuestLocale();
  const tenant = await getWorkspaceById(getDefaultWorkspaceId());
  const workspace = tenant?.slug
    ? await getPublicBookingWorkspace(tenant.slug)
    : null;

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

  if (!workspace?.bookingLive) {
    // Dev-only diagnostics — never surface seed/env instructions to guests.
    console.warn(
      "[eve chat] Eve Pilot not ready:",
      !workspace
        ? "workspace missing (seed with supabase db reset)"
        : "Cal.com env incomplete",
    );
    const title =
      initialLocale === "vi"
        ? "Chat tạm thời chưa sẵn sàng."
        : "Chat isn't available right now.";
    const body =
      initialLocale === "vi"
        ? "Vui lòng thử lại sau ít phút."
        : "Please try again in a few minutes.";
    const back =
      initialLocale === "vi" ? "Về trang chủ" : "Back to home";
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-black px-6 text-center text-zinc-300">
        <p className="text-sm">{title}</p>
        <p className="max-w-md text-xs text-zinc-500">
          {body}
        </p>
        <a className="text-sm text-teal-200 underline-offset-2 hover:underline" href="/">
          {back}
        </a>
      </div>
    );
  }

  return (
    <WorkspaceBookingPage
      demoMode
      initialLocale={initialLocale}
      user={chatUser}
      workspace={workspace}
    />
  );
}
