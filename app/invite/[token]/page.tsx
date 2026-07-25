import { InviteAcceptPanel } from "@/app/_components/invite-accept-panel";
import { createClient } from "@/lib/supabase/server";
import { getInvitePreview } from "@/lib/workspace-invites";

type Params = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Params) {
  const { token: raw } = await params;
  const token = decodeURIComponent(raw ?? "").trim();
  const preview = await getInvitePreview(token);

  const supabase = await createClient();
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
