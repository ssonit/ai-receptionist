"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptWorkspaceInviteAction } from "@/app/dashboard/settings/invite-actions";
import { signOut } from "@/app/auth/actions";
import { AuthShell } from "@/app/_components/auth-shell";
import { RainbowButton } from "@/components/ui/rainbow-button";
import { inviteEmailMismatchMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { InvitePreview } from "@/lib/workspace-invites";

export function InviteAcceptPanel({
  token,
  preview,
  signedIn,
  userEmail,
}: {
  token: string;
  preview: InvitePreview;
  signedIn: boolean;
  userEmail: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!preview.ok) {
    const message =
      preview.error === "expired"
        ? "This invite link has expired. Ask the owner for a new one."
        : preview.error === "already_accepted"
          ? "This invite was already used."
          : "This invite link is invalid.";

    return (
      <AuthShell
        description="Ask the workspace owner to send a fresh invite."
        footer={
          <Link className="transition hover:text-white" href="/">
            ← Back to home
          </Link>
        }
        mode="login"
        title="Invite unavailable"
      >
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100">
          {message}
        </p>
        <Link
          className="mt-4 inline-flex h-11 items-center justify-center rounded-full border border-white/10 text-sm text-zinc-300 transition hover:border-white/20 hover:text-white"
          href="/login"
        >
          Sign in
        </Link>
      </AuthShell>
    );
  }

  const signupHref = `/signup?invite=${encodeURIComponent(token)}`;
  const loginHref = `/login?next=${encodeURIComponent(`/invite/${token}`)}`;

  function onAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptWorkspaceInviteAction(token);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <AuthShell
      description={
        <>
          You&apos;ve been invited to join{" "}
          <span className="text-white">{preview.workspaceName}</span> as staff.
          {preview.email ? (
            <>
              {" "}
              This invite is for <span className="text-white">{preview.email}</span>
              .
            </>
          ) : null}
        </>
      }
      footer={
        <Link className="transition hover:text-white" href="/">
          ← Back to home
        </Link>
      }
      mode="login"
      title="Join workspace"
    >
      <div className="flex w-full flex-col gap-4">
        {signedIn ? (
          preview.email &&
          userEmail &&
          preview.email.trim().toLowerCase() !== userEmail.trim().toLowerCase() ? (
            <>
              <p
                className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100"
                role="alert"
              >
                {inviteEmailMismatchMessage(preview.email)}
              </p>
              <p className="text-sm text-zinc-400">
                Signed in as <span className="text-white">{userEmail}</span>.
              </p>
              <button
                className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-sm text-zinc-300 transition hover:border-white/20 hover:text-white"
                onClick={() => {
                  void signOut(`/invite/${token}`);
                }}
                type="button"
              >
                Sign in with a different account
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-400">
                Signed in as{" "}
                <span className="text-white">{userEmail ?? "your account"}</span>.
              </p>
              {error ? (
                <p
                  className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
              <RainbowButton
                className={cn(
                  "h-11 w-full rounded-full font-semibold",
                  pending && "opacity-70",
                )}
                disabled={pending}
                onClick={onAccept}
                size="lg"
                type="button"
              >
                {pending ? "Joining…" : "Accept invite"}
              </RainbowButton>
            </>
          )
        ) : (
          <>
            <RainbowButton asChild className="h-11 w-full rounded-full font-semibold" size="lg">
              <Link href={signupHref}>Create account & join</Link>
            </RainbowButton>
            <Link
              className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-sm text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
              href={loginHref}
            >
              Already have an account? Sign in
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  );
}
