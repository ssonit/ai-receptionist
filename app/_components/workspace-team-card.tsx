"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createWorkspaceInvite,
  revokeWorkspaceInvite,
  type InviteActionState,
} from "@/app/dashboard/settings/invite-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  WorkspaceInviteRow,
  WorkspaceMemberRow,
  WorkspaceRole,
} from "@/lib/workspace-invites";

const initial: InviteActionState = {};

function absoluteInviteUrl(origin: string, path: string) {
  if (path.startsWith("http")) return path;
  return `${origin.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function WorkspaceTeamCard({
  role,
  members,
  pendingInvites,
  inviteOrigin,
}: {
  role: WorkspaceRole;
  members: WorkspaceMemberRow[];
  pendingInvites: WorkspaceInviteRow[];
  inviteOrigin: string;
}) {
  const router = useRouter();
  const isOwner = role === "owner";
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

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied.");
    } catch {
      toast.error("Could not copy link.");
    }
  }

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team</CardTitle>
        <CardDescription>
          Staff share this workspace dashboard. Invite links expire in 14 days.
          {isOwner
            ? " Only owners can create invites."
            : " Ask the owner if you need to invite someone."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium">Members</p>
          <ul className="divide-y rounded-md border">
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
                <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                  {m.role}
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        {isOwner ? (
          <>
            <form action={action} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Invite email (optional)</Label>
                <Input
                  autoComplete="email"
                  id="invite-email"
                  name="email"
                  placeholder="staff@example.com"
                  type="email"
                />
                <p className="text-muted-foreground text-xs">
                  Leave blank for an open link. If set, only that email can
                  accept.
                </p>
              </div>
              <Button disabled={pending} type="submit">
                {pending ? "Creating…" : "Create invite link"}
              </Button>
            </form>

            {lastInviteUrl ? (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
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
                <ul className="divide-y rounded-md border">
                  {pendingInvites.map((inv) => {
                    const url = absoluteInviteUrl(
                      inviteOrigin,
                      `/invite/${inv.token}`,
                    );
                    return (
                      <li
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                        key={inv.id}
                      >
                        <div className="min-w-0">
                          <p className="truncate">
                            {inv.email ?? "Open link"}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            Expires{" "}
                            {new Date(inv.expires_at).toLocaleDateString()}
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
      </CardContent>
    </Card>
  );
}
