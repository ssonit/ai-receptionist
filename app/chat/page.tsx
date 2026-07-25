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
    const missingEnv = !workspace;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-black px-6 text-center text-zinc-300">
        <p className="text-sm">Eve Pilot demo isn&apos;t ready yet.</p>
        <p className="text-muted-foreground max-w-md text-xs text-zinc-500">
          {missingEnv
            ? "Run npx supabase db reset so the eve-pilot workspace is seeded."
            : "Set CALCOM_API_KEY and CALCOM_EVENT_TYPE_ID (or USERNAME + EVENT_TYPE_SLUG) in .env.local, then restart the dev server."}
        </p>
        <a className="text-sm text-teal-200 underline-offset-2 hover:underline" href="/">
          Back to home
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
