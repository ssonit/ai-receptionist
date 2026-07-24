"use client";

import { CopyIcon, CheckIcon } from "@phosphor-icons/react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyBookingLink({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  return (
    <div
      className={cn(
        "bg-muted/50 flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center",
        className,
      )}
    >
      <code className="min-w-0 flex-1 truncate text-xs sm:text-sm">{url}</code>
      <Button
        className="shrink-0"
        size="sm"
        type="button"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          } catch {
            // ignore
          }
        }}
      >
        {copied ? (
          <CheckIcon className="size-4" weight="bold" />
        ) : (
          <CopyIcon className="size-4" weight="bold" />
        )}
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}
