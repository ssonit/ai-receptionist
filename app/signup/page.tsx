import Link from "next/link";
import { AuthShell } from "@/app/_components/auth-shell";
import { SignupForm } from "../login/signup-form";
import { getInvitePreview } from "@/lib/workspace-invites";

export default async function SignupPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ invite?: string }>;
}) {
  const params = await searchParams;
  const inviteToken = params.invite?.trim() || null;
  let inviteEmail: string | null = null;
  let workspaceName: string | null = null;

  if (inviteToken) {
    const preview = await getInvitePreview(inviteToken);
    if (preview.ok) {
      inviteEmail = preview.email;
      workspaceName = preview.workspaceName;
    }
  }

  return (
    <AuthShell
      description={
        inviteToken
          ? "Create an account to join the workspace as staff. You will not get a separate workspace."
          : "Create an account to open the booking dashboard. Your profile is created automatically after signup."
      }
      footer={
        <Link className="transition hover:text-white" href="/">
          ← Back to home
        </Link>
      }
      mode="signup"
      title={inviteToken ? "Join as staff" : "Create your account"}
    >
      <SignupForm
        inviteEmail={inviteEmail}
        inviteToken={inviteToken}
        workspaceName={workspaceName}
      />
    </AuthShell>
  );
}
