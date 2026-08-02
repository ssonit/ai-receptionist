"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  createWorkspaceInvite,
  removeWorkspaceMember,
  resendWorkspaceInvite,
  transferWorkspaceOwnership,
  revokeWorkspaceInvite,
  type InviteActionState,
} from "@/app/dashboard/settings/invite-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  WorkspaceInviteRow,
  WorkspaceMemberRow,
  WorkspaceRole,
} from "@/lib/workspace-invites";
import { WORKSPACE_ROLE } from "@/lib/workspace-roles";
import { ROUTES, inviteRoute } from "@/lib/routes";

const initial: InviteActionState = {};

function absoluteInviteUrl(origin: string, path: string) {
  if (path.startsWith("http")) return path;
  return `${origin.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied.");
  } catch {
    toast.error("Could not copy link.");
  }
}

export function WorkspaceTeamCard({
  role,
  members,
  pendingInvites,
  inviteOrigin,
  currentUserId,
}: {
  role: WorkspaceRole;
  members: WorkspaceMemberRow[];
  pendingInvites: WorkspaceInviteRow[];
  inviteOrigin: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const t = useTranslations();
  const isOwner = role === WORKSPACE_ROLE.OWNER;
  const [state, action, pending] = useActionState(createWorkspaceInvite, initial);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
    if (state.inviteUrl) {
      setLastInviteUrl(absoluteInviteUrl(inviteOrigin, state.inviteUrl));
    }
  }, [state, inviteOrigin]);

  function onRevoke(id: string) {
    setRevokingId(id);
    startTransition(async () => {
      const result = await revokeWorkspaceInvite(id);
      setRevokingId(null);
      if (result.error) toast.error(result.error);
      else {
        toast.success(result.success ?? "Invite revoked.");
        router.refresh();
      }
    });
  }

  function onRemove(userId: string) {
    if (!window.confirm(t("dashboard.teamConfirmRemove"))) return;
    startTransition(async () => {
      const result = await removeWorkspaceMember(userId);
      if (result.error) toast.error(result.error);
      else {
        toast.success(result.success ?? "Member removed.");
        router.refresh();
      }
    });
  }

  function onTransfer(userId: string) {
    if (!window.confirm(t("dashboard.teamConfirmTransfer"))) return;
    startTransition(async () => {
      const result = await transferWorkspaceOwnership(userId);
      if (result.error) toast.error(result.error);
      else {
        toast.success(result.success ?? "Ownership transferred.");
        router.refresh();
      }
    });
  }

  function onResend(inviteId: string) {
    startTransition(async () => {
      const result = await resendWorkspaceInvite(inviteId);
      if (result.error) toast.error(result.error);
      else {
        toast.success(result.success ?? "Invite resent.");
        router.refresh();
      }
    });
  }

  return (
    <section className="scroll-mt-28 py-8 lg:py-10">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold tracking-tight">Team</h2>
          <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
            Staff share this workspace dashboard. Invite links expire in 7 days.
            {isOwner
              ? " Only owners can create invites."
              : " Ask the owner if you need to invite someone."}
          </p>
        </div>

        <div className="min-w-0 space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">Members</p>
            <ul className="divide-y rounded-lg border border-border/80">
              {members.map((m) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                  key={m.id}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {m.full_name?.trim() || m.email || "Member"}
                    </p>
                    {m.email ? (
                      <p className="truncate text-muted-foreground text-xs">
                        {m.email}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        m.role === WORKSPACE_ROLE.OWNER ? "default" : "secondary"
                      }
                    >
                      {m.role}
                    </Badge>
                    {isOwner && m.id !== currentUserId ? (
                      <>
                        <Button
                          onClick={() => onTransfer(m.id)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          {t("dashboard.teamMakeOwner")}
                        </Button>
                        <Button
                          onClick={() => onRemove(m.id)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          {t("dashboard.teamRemove")}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {isOwner ? (
            <>
              <form action={action} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">
                    {t("dashboard.teamInviteEmailLabel")}
                  </Label>
                  <Input
                    autoComplete="email"
                    id="invite-email"
                    name="email"
                    placeholder="staff@example.com"
                    required
                    type="email"
                  />
                  <p className="text-muted-foreground text-xs">
                    {t("dashboard.teamInviteEmailHint")}
                  </p>
                </div>
                <Button disabled={pending} type="submit">
                  {pending
                    ? t("dashboard.teamSending")
                    : t("dashboard.teamSendInvite")}
                </Button>
              </form>

              {lastInviteUrl ? (
                <div className="space-y-2 rounded-lg border border-border/80 bg-muted/30 p-3">
                  <p className="text-sm font-medium">Latest invite</p>
                  <code className="block break-all text-xs">{lastInviteUrl}</code>
                  <Button
                    onClick={() => void copyLink(lastInviteUrl)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Copy link
                  </Button>
                </div>
              ) : null}

              {pendingInvites.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Pending invites</p>
                  <ul className="divide-y rounded-lg border border-border/80">
                    {pendingInvites.map((inv) => {
                      const url = absoluteInviteUrl(
                        inviteOrigin,
                        inviteRoute(inv.token),
                      );
                      return (
                        <li
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                          key={inv.id}
                        >
                          <div className="min-w-0">
                            <p className="truncate">{inv.email}</p>
                            <p className="text-muted-foreground text-xs">
                              Expires{" "}
                              {new Date(inv.expires_at).toLocaleDateString(
                                "en-US",
                                { timeZone: "UTC" },
                              )}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              onClick={() => void copyLink(url)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              Copy
                            </Button>
                            <Button
                              onClick={() => onResend(inv.id)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              {t("dashboard.teamResend")}
                            </Button>
                            <Button
                              disabled={isPending && revokingId === inv.id}
                              onClick={() => onRevoke(inv.id)}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              Revoke
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
