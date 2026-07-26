"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export function EmbedSnippet({ snippet }: { snippet: string }) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-3">
      <pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-xs">
        <code>{snippet}</code>
      </pre>
      <Button
        onClick={() => {
          void navigator.clipboard.writeText(snippet).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        type="button"
        variant="outline"
      >
        {copied ? t("dashboard.embedCopied") : t("dashboard.embedCopy")}
      </Button>
    </div>
  );
}

