"use client";

import { useState, useTransition } from "react";
import { IconMailCheck, IconX } from "@tabler/icons-react";
import { acceptWorkspaceInviteAction } from "@/app/dashboard/(main)/settings/invite-actions";
import type { MyPendingInvite } from "@/lib/workspace-invites";

export function PendingInviteBanner({
  invites,
}: {
  readonly invites: MyPendingInvite[];
}) {
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [acceptingToken, setAcceptingToken] = useState<string | null>(null);

  const visible = invites.filter((invite) => !dismissed[invite.token]);
  if (visible.length === 0) return null;

  function onAccept(token: string) {
    setErrors((prev) => ({ ...prev, [token]: "" }));
    setAcceptingToken(token);
    startTransition(async () => {
      const result = await acceptWorkspaceInviteAction(token);
      if (result?.error) {
        setErrors((prev) => ({ ...prev, [token]: result.error! }));
      }
      setAcceptingToken(null);
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b border-teal-500/25 bg-teal-500/10 px-4 py-3 lg:px-6">
      {visible.map((invite) => (
        <div
          className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3"
          key={invite.token}
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <IconMailCheck className="mt-0.5 size-5 shrink-0 text-teal-600 dark:text-teal-400" />
            <div className="min-w-0 text-sm">
              <p className="font-medium text-teal-950 dark:text-teal-50">
                You&apos;re invited to join {invite.workspaceName}
              </p>
              <p className="text-teal-900/80 dark:text-teal-100/75">
                {invite.inviterName
                  ? `${invite.inviterName} invited you as staff.`
                  : "Invited as staff."}
                {errors[invite.token] ? (
                  <span className="ml-1 text-red-700 dark:text-red-300">
                    {errors[invite.token]}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="inline-flex h-9 items-center rounded-full bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60 dark:bg-teal-500 dark:hover:bg-teal-400 dark:text-teal-950"
              disabled={pending && acceptingToken === invite.token}
              onClick={() => onAccept(invite.token)}
              type="button"
            >
              {pending && acceptingToken === invite.token ? "Joining…" : "Accept"}
            </button>
            <button
              aria-label="Dismiss"
              className="inline-flex size-9 items-center justify-center rounded-full text-teal-900/60 hover:bg-teal-500/15 hover:text-teal-950 dark:text-teal-100/60 dark:hover:text-teal-50"
              onClick={() =>
                setDismissed((prev) => ({ ...prev, [invite.token]: true }))
              }
              type="button"
            >
              <IconX className="size-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
