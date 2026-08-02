"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChatCircleIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { disconnectZaloAction } from "@/app/dashboard/settings/actions";
import { ROUTES } from "@/lib/routes";
import { toast } from "sonner";

type Props = {
  workspaceId: string;
  zaloOaId: string | null;
  zaloOaName: string | null;
  canConnect: boolean;
};

export function ZaloConnectionCard({
  workspaceId,
  zaloOaId,
  zaloOaName,
  canConnect,
}: Props) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  const handleDisconnect = () => {
    if (
      !window.confirm(
        "Disconnect Zalo? Guests will not be able to book via your Zalo Official Account until you reconnect.",
      )
    )
      return;
    setDisconnecting(true);
    disconnectZaloAction(workspaceId)
      .then((result) => {
        if (result.error) toast.error(result.error);
        else {
          toast.success("Zalo disconnected.");
          router.refresh();
        }
      })
      .catch(() => toast.error("Could not disconnect. Try again."))
      .finally(() => setDisconnecting(false));
  };

  return (
    <div className="rounded-2xl border border-border/80 bg-card/50 p-5 sm:p-6">
      {zaloOaId ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircleIcon
              className="mt-0.5 size-5 shrink-0 text-emerald-500"
              weight="fill"
            />
            <div>
              <p className="font-medium text-foreground">Zalo connected</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {zaloOaName ?? "Official Account"}
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
              <p className="font-medium text-foreground">Zalo not connected</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect your Zalo Official Account so guests can book over Zalo.
              </p>
            </div>
          </div>
          {canConnect ? (
            <form
              action={`/api/zalo/oauth/start?returnTo=${ROUTES.DASHBOARD_SETTINGS}`}
              method="POST"
            >
              <Button size="sm" type="submit">
                <ChatCircleIcon className="size-4" weight="fill" />
                <span className="ml-2">Connect Zalo</span>
              </Button>
            </form>
          ) : (
            <Button asChild size="sm" type="button" variant="outline">
              <a href={ROUTES.DASHBOARD_BILLING}>
                <span>Upgrade to connect</span>
              </a>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

