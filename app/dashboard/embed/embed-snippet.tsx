"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmbedSnippet({
  snippet,
  className,
}: {
  snippet: string;
  className?: string;
}) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <pre className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 pr-28 text-xs leading-relaxed text-zinc-100 shadow-sm">
        <code className="font-mono whitespace-pre-wrap break-all">{snippet}</code>
      </pre>
      <Button
        className="absolute top-3 right-3 gap-1.5 transition-colors"
        onClick={() => {
          void navigator.clipboard.writeText(snippet).then(() => {
            setCopied(true);
            toast.success(t("dashboard.embedCopied"));
            window.setTimeout(() => setCopied(false), 2000);
          }).catch(() => {
            // clipboard may be blocked
          });
        }}
        size="sm"
        type="button"
        variant="secondary"
      >
        {copied ? (
          <CheckIcon className="size-4" weight="bold" />
        ) : (
          <CopyIcon className="size-4" weight="bold" />
        )}
        {copied ? t("dashboard.embedCopied") : t("dashboard.embedCopy")}
      </Button>
    </div>
  );
}
