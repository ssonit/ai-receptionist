import { InviteAcceptPanel } from "@/app/_components/invite-accept-panel";
import { createClient } from "@/lib/supabase/server";
import { getInvitePreview } from "@/lib/workspace-invites";

export const metadata = {
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Params) {
  const { token: raw } = await params;
  const token = decodeURIComponent(raw ?? "").trim();

  const [preview, supabase] = await Promise.all([
    getInvitePreview(token),
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <InviteAcceptPanel
      preview={preview}
      signedIn={Boolean(user)}
      token={token}
      userEmail={user?.email ?? null}
    />
  );
}
