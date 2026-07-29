"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ArrowRightIcon, ChatCircleIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { buildEmbedSnippets } from "@/lib/embed";

import {
  saveEmbedAllowedOrigins,
  type EmbedSecurityState,
} from "./actions";
import { EmbedSnippet } from "./embed-snippet";

const INSTALL_STEPS = [
  "dashboard.embedInstallStep1",
  "dashboard.embedInstallStep2",
  "dashboard.embedInstallStep3",
] as const;

const HOW_BULLETS = [
  "dashboard.embedHow1",
  "dashboard.embedHow2",
  "dashboard.embedHow3",
] as const;

const PLATFORMS = [
  { id: "html", labelKey: "dashboard.embedPlatformHtml" },
  { id: "react", labelKey: "dashboard.embedPlatformReact" },
  { id: "nextjs", labelKey: "dashboard.embedPlatformNext" },
  { id: "vue", labelKey: "dashboard.embedPlatformVue" },
  { id: "wordpress", labelKey: "dashboard.embedPlatformWordpress" },
  { id: "shopify", labelKey: "dashboard.embedPlatformShopify" },
] as const;

type Snippets = ReturnType<typeof buildEmbedSnippets>;

const initialSecurity: EmbedSecurityState = {};

export function EmbedPageClient({
  allowedOrigins,
  bookingLive,
  embedHostDemoUrl,
  embedPreviewUrl,
  siteId,
  snippets,
}: {
  allowedOrigins: string[];
  bookingLive: boolean;
  embedHostDemoUrl: string | null;
  embedPreviewUrl: string | null;
  siteId: string;
  snippets: Snippets;
}) {
  const t = useTranslations();
  const [securityState, securityAction, securityPending] = useActionState(
    saveEmbedAllowedOrigins,
    initialSecurity,
  );

  useEffect(() => {
    if (securityState.success) {
      toast.success(t("dashboard.embedSecuritySaved"));
    }
  }, [securityState.success, t]);

  const originsText =
    securityState.origins?.join("\n") ?? allowedOrigins.join("\n");

  return (
    <div className="mx-auto max-w-5xl animate-in fade-in-0 duration-300 space-y-6 px-4 py-6 lg:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {t("dashboard.embedIntro")}
        </p>
        {bookingLive ? (
          <Badge
            className="w-fit shrink-0 border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
            variant="outline"
          >
            {t("dashboard.embedStatusLive")}
          </Badge>
        ) : (
          <Badge
            className="w-fit shrink-0 border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400"
            variant="outline"
          >
            {t("dashboard.embedStatusNotLive")}
          </Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,24rem)] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.embedInstallTitle")}</CardTitle>
            <CardDescription>{t("dashboard.embedSnippetHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ol className="space-y-3">
              {INSTALL_STEPS.map((key, index) => (
                <li className="flex gap-3 text-sm" key={key}>
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border bg-muted/50 text-xs font-medium tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="pt-0.5 leading-relaxed text-foreground/90">
                    {t(key)}
                  </span>
                </li>
              ))}
            </ol>

            <Tabs defaultValue="html">
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
                {PLATFORMS.map((p) => (
                  <TabsTrigger className="flex-none" key={p.id} value={p.id}>
                    {t(p.labelKey)}
                  </TabsTrigger>
                ))}
              </TabsList>
              {PLATFORMS.map((p) => (
                <TabsContent className="mt-3" key={p.id} value={p.id}>
                  <EmbedSnippet snippet={snippets[p.id]} />
                </TabsContent>
              ))}
            </Tabs>

            <div className="flex flex-col gap-2 sm:flex-row">
              {bookingLive && embedPreviewUrl ? (
                <Button asChild className="gap-1.5" size="sm">
                  <Link
                    href={embedPreviewUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {t("dashboard.embedOpenPreview")}
                    <ArrowRightIcon className="size-4" weight="bold" />
                  </Link>
                </Button>
              ) : (
                <Button asChild className="gap-1.5" size="sm">
                  <Link href="/dashboard/setup">
                    {t("dashboard.embedCompleteSetup")}
                    <ArrowRightIcon className="size-4" weight="bold" />
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden lg:sticky lg:top-20">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle className="text-base">
              {t("dashboard.embedPreviewTitle")}
            </CardTitle>
            <CardDescription>{t("dashboard.embedPreviewCaption")}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative aspect-4/5 min-h-64 overflow-hidden bg-muted/40 sm:min-h-72">
              <div className="absolute inset-3 overflow-hidden rounded-lg border bg-background shadow-sm">
                <div className="flex items-center gap-1.5 border-b bg-muted/50 px-3 py-2">
                  <span className="size-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                  <span className="size-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                  <span className="size-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                  <span className="ml-2 h-2 max-w-28 flex-1 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                </div>
                <div className="space-y-2 p-4">
                  <div className="h-3 w-2/3 rounded bg-zinc-100 dark:bg-zinc-800" />
                  <div className="h-3 w-full rounded bg-zinc-100 dark:bg-zinc-800" />
                  <div className="h-3 w-5/6 rounded bg-zinc-100 dark:bg-zinc-800" />
                  <div className="mt-4 h-24 rounded-md bg-zinc-50 dark:bg-zinc-900/80" />
                </div>
              </div>

              <div
                aria-hidden
                className="pointer-events-none absolute right-5 bottom-5 flex h-13 items-center gap-2 rounded-[26px] px-4.5 text-sm font-semibold text-white shadow-[0_6px_20px_rgba(0,0,0,0.24)]"
                style={{ background: "#18181b" }}
              >
                <ChatCircleIcon className="size-5" weight="fill" />
                Chat
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("dashboard.embedSiteIdTitle")}
          </CardTitle>
          <CardDescription>{t("dashboard.embedSiteIdBody")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>{t("dashboard.embedSiteIdLabel")}</Label>
            <EmbedSnippet snippet={siteId} />
            <p className="text-xs text-muted-foreground">
              {t("dashboard.embedSiteIdNote")}
            </p>
          </div>

          <form action={securityAction} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="allowedOrigins">
                {t("dashboard.embedAllowedDomainsLabel")}
              </Label>
              <Textarea
                className="min-h-28 font-mono text-xs"
                defaultValue={originsText}
                id="allowedOrigins"
                key={originsText}
                name="allowedOrigins"
                placeholder={t("dashboard.embedAllowedDomainsPlaceholder")}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("dashboard.embedAllowedDomainsHint")}
              </p>
            </div>
            {securityState.error ? (
              <p className="text-sm text-destructive">{securityState.error}</p>
            ) : null}
            <Button disabled={securityPending} size="sm" type="submit">
              {securityPending
                ? t("dashboard.embedSecuritySaving")
                : t("dashboard.embedSecuritySave")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dashboard.embedTryHostTitle")}</CardTitle>
          <CardDescription>{t("dashboard.embedTryHostBody")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("dashboard.embedTryHostNote")}
          </p>
          {bookingLive && embedHostDemoUrl ? (
            <Button asChild className="gap-1.5" size="sm">
              <Link
                href={embedHostDemoUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                {t("dashboard.embedTryHostCta")}
                <ArrowRightIcon className="size-4" weight="bold" />
              </Link>
            </Button>
          ) : (
            <Button asChild className="gap-1.5" size="sm" variant="secondary">
              <Link href="/dashboard/setup">
                {t("dashboard.embedCompleteSetup")}
                <ArrowRightIcon className="size-4" weight="bold" />
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dashboard.embedHowTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-3">
            {HOW_BULLETS.map((key, index) => (
              <li
                className="rounded-xl border bg-muted/20 p-3 text-sm leading-relaxed text-muted-foreground"
                key={key}
              >
                <span className="mb-1.5 block text-xs font-medium tabular-nums text-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {t(key)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
