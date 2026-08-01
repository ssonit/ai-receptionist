"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChatCircleIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { disconnectMessengerAction } from "@/app/dashboard/settings/actions";
import { toast } from "sonner";

type Props = {
  workspaceId: string;
  messengerPageId: string | null;
  messengerPageName: string | null;
};

export function MessengerConnectionCard({
  workspaceId,
  messengerPageId,
  messengerPageName,
}: Props) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  const handleDisconnect = () => {
    if (
      !window.confirm(
        "Disconnect Messenger? Guests will not be able to book via Facebook Messenger until you reconnect.",
      )
    )
      return;
    setDisconnecting(true);
    disconnectMessengerAction(workspaceId)
      .then((result) => {
        if (result.error) toast.error(result.error);
        else {
          toast.success("Messenger disconnected.");
          router.refresh();
        }
      })
      .catch(() => toast.error("Could not disconnect. Try again."))
      .finally(() => setDisconnecting(false));
  };

  return (
    <div className="rounded-2xl border border-border/80 bg-card/50 p-5 sm:p-6">
      {messengerPageId ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircleIcon
              className="mt-0.5 size-5 shrink-0 text-emerald-500"
              weight="fill"
            />
            <div>
              <p className="font-medium text-foreground">Messenger connected</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {messengerPageName ?? "Facebook Page"}
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
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <ChatCircleIcon
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              weight="regular"
            />
            <div>
              <p className="font-medium text-foreground">
                Messenger not connected
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect your Facebook Page so guests can book via Messenger.
              </p>
            </div>
          </div>
          <Button asChild size="sm" type="button">
            <a
              href={`/api/messenger/oauth/start?returnTo=/dashboard/settings`}
            >
              <ChatCircleIcon className="size-4" weight="fill" />
              <span className="ml-2">Connect Messenger</span>
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}
