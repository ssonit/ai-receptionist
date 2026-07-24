"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { toast } from "sonner";
import {
  checkWorkspaceSlugAvailable,
  saveWorkspaceSettings,
} from "@/app/dashboard/settings/actions";
import { CopyBookingLink } from "@/components/copy-booking-link";
import { LocaleToggle } from "@/components/locale-provider";
import { TimezoneSelect } from "@/components/timezone-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { resolveWorkspaceSlugField, slugifyWorkspaceName } from "@/lib/workspace";
import {
  type WorkspaceSettingsFormProps,
  type WorkspaceSettingsState,
} from "@/lib/workspace-settings-types";

const initial: WorkspaceSettingsState = {};

export type { WorkspaceOpsValues } from "@/lib/workspace-settings-types";

type SlugStatus = {
  available: boolean;
  slug: string;
  message: string;
} | null;

function hasText(...values: Array<string | null | undefined>) {
  return values.some((v) => Boolean(v?.trim()));
}

function SectionHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground text-xs leading-relaxed sm:col-span-2">
      {children}
    </p>
  );
}

export function WorkspaceSettingsForm({
  workspace,
  publicBookingUrl,
}: WorkspaceSettingsFormProps) {
  const t = useTranslations();
  const router = useRouter();
  const [state, action, pending] = useActionState(saveWorkspaceSettings, initial);

  const [name, setName] = useState(workspace?.name ?? "");
  const [slug, setSlug] = useState(() =>
    resolveWorkspaceSlugField(workspace?.name, workspace?.slug),
  );
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [timezone, setTimezone] = useState(
    workspace?.timezone ?? "Asia/Ho_Chi_Minh",
  );
  const [phone, setPhone] = useState(workspace?.phone ?? "");
  const [email, setEmail] = useState(workspace?.email ?? "");
  const [website, setWebsite] = useState(workspace?.website ?? "");
  const [address, setAddress] = useState(workspace?.address ?? "");
  const [tagline, setTagline] = useState(workspace?.tagline ?? "");

  const moreContactOpenDefault = hasText(
    workspace?.tagline,
    workspace?.website,
    workspace?.address,
  );
  const [moreContactOpen, setMoreContactOpen] = useState(moreContactOpenDefault);

  useEffect(() => {
    setName(workspace?.name ?? "");
    setSlug(resolveWorkspaceSlugField(workspace?.name, workspace?.slug));
    setSlugTouched(false);
    setSlugStatus(null);
    setTimezone(workspace?.timezone ?? "Asia/Ho_Chi_Minh");
    setPhone(workspace?.phone ?? "");
    setEmail(workspace?.email ?? "");
    setWebsite(workspace?.website ?? "");
    setAddress(workspace?.address ?? "");
    setTagline(workspace?.tagline ?? "");
    setMoreContactOpen(
      hasText(workspace?.tagline, workspace?.website, workspace?.address),
    );
  }, [workspace]);

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  useEffect(() => {
    const normalized = slugifyWorkspaceName(slug);
    if (!normalized || normalized.length < 2) {
      setSlugStatus(null);
      return;
    }

    let cancelled = false;
    setSlugChecking(true);
    const timer = window.setTimeout(async () => {
      const result = await checkWorkspaceSlugAvailable(normalized);
      if (!cancelled) {
        setSlugStatus(result);
        setSlugChecking(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slug]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 pb-10 lg:px-6">
      <form
        action={action}
        className="flex flex-col gap-6"
        id="workspace-settings-form"
      >
        <input name="name" type="hidden" value={name} />
        <input name="slug" type="hidden" value={slug} />
        <input name="timezone" type="hidden" value={timezone} />
        <input name="phone" type="hidden" value={phone} />
        <input name="email" type="hidden" value={email} />
        <input name="website" type="hidden" value={website} />
        <input name="address" type="hidden" value={address} />
        <input name="tagline" type="hidden" value={tagline} />

        <Card>
          <CardHeader>
            <CardTitle>Essentials</CardTitle>
            <CardDescription>
              Name, timezone, booking link, and how guests reach you.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <SectionHint>
              Shows on the public booking page and in agent replies. AI
              personality lives under{" "}
              <Link
                className="underline underline-offset-4"
                href="/dashboard/agent"
              >
                AI Agent
              </Link>
              .
            </SectionHint>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Workspace name</Label>
              <Input
                id="name"
                onChange={(e) => {
                  const next = e.target.value;
                  setName(next);
                  if (!slugTouched || !slug.trim()) {
                    setSlugTouched(false);
                    setSlug(slugifyWorkspaceName(next));
                  }
                }}
                placeholder="Eve Pilot"
                required
                value={name}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <TimezoneSelect
                id="timezone"
                name="timezone_ui"
                onValueChange={setTimezone}
                required
                value={timezone}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="slug">Booking page slug</Label>
              <Input
                aria-invalid={slugStatus ? !slugStatus.available : undefined}
                id="slug"
                onChange={(e) => {
                  const next = e.target.value;
                  if (!next.trim()) {
                    setSlugTouched(false);
                    setSlug(slugifyWorkspaceName(name));
                    return;
                  }
                  setSlugTouched(true);
                  setSlug(next);
                }}
                placeholder="phong-kham-hoa"
                required
                value={slug}
              />
              <p className="text-muted-foreground text-xs">
                Public URL: /b/
                {slugifyWorkspaceName(slug.trim() ? slug : name) || "…"}
              </p>
              {slugChecking ? (
                <p className="text-muted-foreground text-xs">Checking slug…</p>
              ) : slugStatus ? (
                <p
                  className={cn(
                    "text-xs",
                    slugStatus.available
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive",
                  )}
                >
                  {slugStatus.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0901234567"
                value={phone}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hello@example.com"
                type="email"
                value={email}
              />
            </div>
          </CardContent>
        </Card>

        <Collapsible onOpenChange={setMoreContactOpen} open={moreContactOpen}>
          <Card>
            <CardHeader className="space-y-0">
              <CollapsibleTrigger asChild>
                <button
                  className="flex w-full items-start justify-between gap-3 text-left"
                  type="button"
                >
                  <div className="space-y-1.5">
                    <CardTitle className="flex items-center gap-2">
                      More contact
                      {!moreContactOpenDefault && !moreContactOpen ? (
                        <Badge variant="secondary">Optional</Badge>
                      ) : null}
                    </CardTitle>
                    <CardDescription>
                      Tagline, website, and address on the guest booking page.
                    </CardDescription>
                  </div>
                  <ChevronDownIcon
                    className={cn(
                      "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
                      moreContactOpen && "rotate-180",
                    )}
                  />
                </button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="grid gap-4 border-t pt-6 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="tagline">Tagline</Label>
                  <Input
                    id="tagline"
                    onChange={(e) => setTagline(e.target.value)}
                    placeholder="24/7 booking assistant for clinics / studios"
                    value={tagline}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://example.com"
                    type="url"
                    value={website}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="123 Nguyen Hue, District 1, Ho Chi Minh City"
                    value={address}
                  />
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.languageCardTitle")}</CardTitle>
            <CardDescription>{t("dashboard.languageCardBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <LocaleToggle variant="light" />
          </CardContent>
        </Card>

        {publicBookingUrl ? (
          <Card>
            <CardHeader>
              <CardTitle>Public booking page</CardTitle>
              <CardDescription>
                Link it on your website, IG bio, Zalo, or QR. Customers chat and
                book into this workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <CopyBookingLink url={publicBookingUrl} />
              <Button asChild className="w-full" size="sm" variant="secondary">
                <Link href={publicBookingUrl} target="_blank">
                  Open booking page
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {state.error ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button
            disabled={
              pending || slugChecking || slugStatus?.available === false
            }
            type="submit"
          >
            {pending ? "Saving…" : "Save settings"}
          </Button>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Changing the slug changes the public URL. Configure AI greeting,
            persona, and booking type on{" "}
            <Link
              className="underline underline-offset-4"
              href="/dashboard/agent"
            >
              AI Agent
            </Link>
            .
          </p>
        </div>
      </form>
    </div>
  );
}
