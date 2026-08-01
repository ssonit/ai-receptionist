"use client";

import { useState } from "react";
import { KeyIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { revealWebhookSecretAction } from "@/app/dashboard/settings/actions";

type Props = {
  workspaceId: string;
  webhookUrl: string;
  hasOwnSecret: boolean;
};

export function WebhookSecretCard({
  workspaceId,
  webhookUrl,
  hasOwnSecret,
}: Props) {
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleReveal = () => {
    if (
      !hasOwnSecret &&
      !window.confirm(
        "Generate a signing secret for this workspace? Cal.com webhooks will reject payloads until you paste the new secret into your Cal.com webhook settings.",
      )
    )
      return;

    setLoading(true);
    revealWebhookSecretAction(workspaceId)
      .then((result) => {
        if (result.error) toast.error(result.error);
        else setSecret(result.secret ?? null);
      })
      .catch(() => toast.error("Could not load the secret. Try again."))
      .finally(() => setLoading(false));
  };

  const copy = (value: string, label: string) => {
    navigator.clipboard
      .writeText(value)
      .then(() => toast.success(`${label} copied.`))
      .catch(() => toast.error("Could not copy."));
  };

  return (
    <div className="rounded-2xl border border-border/80 bg-card/50 p-5 sm:p-6">
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <KeyIcon
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            weight="regular"
          />
          <div className="min-w-0">
            <p className="font-medium text-foreground">Cal.com webhook</p>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              Add this URL and secret to your Cal.com webhook so bookings
              changed on Cal.com stay in sync here.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Webhook URL
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">
              {webhookUrl}
            </code>
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => copy(webhookUrl, "URL")}
            >
              Copy
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Signing secret
          </p>
          {secret ? (
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">
                {secret}
              </code>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => copy(secret, "Secret")}
              >
                Copy
              </Button>
            </div>
          ) : (
            <Button
              disabled={loading}
              size="sm"
              type="button"
              variant={hasOwnSecret ? "outline" : "default"}
              onClick={handleReveal}
            >
              {loading
                ? "Loading…"
                : hasOwnSecret
                  ? "Show signing secret"
                  : "Generate signing secret"}
            </Button>
          )}
        </div>

        {hasOwnSecret ? null : (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
            <WarningCircleIcon
              className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500"
              weight="fill"
            />
            <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
              This workspace still verifies webhooks with the shared server
              secret. Generating your own closes that gap — update the secret in
              Cal.com right after.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
