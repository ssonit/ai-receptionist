"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarBlankIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { disconnectCalAction } from "@/app/dashboard/setup/actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  workspaceId: string;
  calAuthMode: string | null;
  calUsername: string | null;
};

export function CalConnectionCard({ workspaceId, calAuthMode, calUsername }: Props) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  const handleDisconnect = () => {
    if (!window.confirm("Disconnect Cal.com? Guests will not be able to book until you reconnect.")) return;
    setDisconnecting(true);
    disconnectCalAction(workspaceId)
      .then((result) => {
        if (result.error) toast.error(result.error);
        else {
          toast.success("Cal.com disconnected.");
          router.refresh();
        }
      })
      .catch(() => toast.error("Could not disconnect. Try again."))
      .finally(() => setDisconnecting(false));
  };

  return (
    <div className="rounded-2xl border border-border/80 bg-card/50 p-5 sm:p-6">
      {calAuthMode === "oauth" ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircleIcon
              className="mt-0.5 size-5 shrink-0 text-emerald-500"
              weight="fill"
            />
            <div>
              <p className="font-medium text-foreground">Cal.com connected</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {calUsername ? `@${calUsername}` : "Connected via OAuth"}
              </p>
            </div>
          </div>
          <Button
            disabled={disconnecting}
            size="sm"
            type="button"
            variant="outline"
            onClick={handleDisconnect}
          >
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </Button>
        </div>
      ) : calAuthMode === "api_key" ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircleIcon
              className="mt-0.5 size-5 shrink-0 text-emerald-500"
              weight="fill"
            />
            <div>
              <p className="font-medium text-foreground">Cal.com connected</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {calUsername ? `@${calUsername}` : "API key (legacy)"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" type="button">
              <a href={`/api/cal/oauth/start?returnTo=/dashboard/settings`}>
                Upgrade to OAuth
              </a>
            </Button>
            <Button
              disabled={disconnecting}
              size="sm"
              type="button"
              variant="outline"
              onClick={handleDisconnect}
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <CalendarBlankIcon
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              weight="regular"
            />
            <div>
              <p className="font-medium text-foreground">Cal.com not connected</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect your calendar so guests can book appointments.
              </p>
            </div>
          </div>
          <Button asChild size="sm" type="button">
            <a href={`/api/cal/oauth/start?returnTo=/dashboard/settings`}>
              <CalendarBlankIcon className="size-4" weight="fill" />
              <span className="ml-2">Connect Cal.com</span>
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}
