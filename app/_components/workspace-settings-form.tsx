"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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

const NAV = [
  { id: "essentials", label: "Essentials" },
  { id: "contact", label: "Contact" },
  { id: "language", label: "Language" },
  { id: "booking", label: "Booking" },
  { id: "reminders", label: "Reminders" },
  { id: "public-link", label: "Public link" },
  { id: "team", label: "Team" },
] as const;

function hasText(...values: Array<string | null | undefined>) {
  return values.some((v) => Boolean(v?.trim()));
}

function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      className="scroll-mt-28 border-b border-border/70 py-8 last:border-b-0 lg:py-10"
      id={id}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <div className="space-y-1.5 lg:pt-0.5">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
            {description}
          </p>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

export function WorkspaceSettingsForm({
  workspace,
  publicBookingUrl,
  children,
}: WorkspaceSettingsFormProps) {
  const t = useTranslations();
  const router = useRouter();
  const [state, action, pending] = useActionState(saveWorkspaceSettings, initial);
  const [activeId, setActiveId] = useState<string>("essentials");
  const navLockRef = useRef<string | null>(null);
  const navLockTimerRef = useRef<number | null>(null);

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

  const hasPublicLink = Boolean(publicBookingUrl);
  const hasTeam = Boolean(children);
  const navItems = NAV.filter((item) => {
    if (item.id === "public-link" && !hasPublicLink) return false;
    if (item.id === "team" && !hasTeam) return false;
    return true;
  });

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

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;

    navLockRef.current = id;
    setActiveId(id);
    if (navLockTimerRef.current != null) {
      window.clearTimeout(navLockTimerRef.current);
    }
    navLockTimerRef.current = window.setTimeout(() => {
      navLockRef.current = null;
      navLockTimerRef.current = null;
    }, 900);

    const top = window.scrollY + el.getBoundingClientRect().top - 96;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };

  useEffect(() => {
    return () => {
      if (navLockTimerRef.current != null) {
        window.clearTimeout(navLockTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const ids = NAV.filter((item) => {
      if (item.id === "public-link" && !hasPublicLink) return false;
      if (item.id === "team" && !hasTeam) return false;
      return true;
    }).map((item) => item.id);

    const syncActiveFromScroll = () => {
      if (navLockRef.current) return;
      const marker = 120;
      let current = ids[0] ?? "essentials";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= marker) current = id;
      }
      setActiveId(current);
    };

    syncActiveFromScroll();
    window.addEventListener("scroll", syncActiveFromScroll, { passive: true });
    window.addEventListener("resize", syncActiveFromScroll);
    return () => {
      window.removeEventListener("scroll", syncActiveFromScroll);
      window.removeEventListener("resize", syncActiveFromScroll);
    };
  }, [hasPublicLink, hasTeam]);

  const saveDisabled =
    pending || slugChecking || slugStatus?.available === false;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 lg:px-6">
      <div className="mb-6 flex flex-col gap-1 border-b border-border/70 pb-6 lg:mb-2 lg:border-0 lg:pb-0">
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed text-pretty">
          Workspace identity, contact, booking rules, and team. AI greeting and
          persona live under{" "}
          <Link
            className="font-medium text-foreground underline-offset-4 hover:underline"
            href="/dashboard/agent"
          >
            AI Agent
          </Link>
          .
        </p>
      </div>

      {/* Mobile section chips */}
      <div className="sticky top-0 z-20 -mx-4 mb-5 flex gap-1.5 overflow-x-auto border-b border-border/60 bg-background/90 px-4 py-2.5 backdrop-blur-md supports-backdrop-filter:bg-background/75 lg:hidden">
        {navItems.map((item) => (
          <button
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              activeId === item.id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            key={item.id}
            onClick={() => scrollToSection(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="lg:grid lg:grid-cols-[11.5rem_minmax(0,1fr)] lg:items-start lg:gap-10 xl:grid-cols-[12.5rem_minmax(0,1fr)] xl:gap-14">
        <nav
          aria-label="Settings sections"
          className="sticky top-20 z-10 hidden self-start lg:block"
        >
          <p className="mb-3 px-0.5 text-[10px] font-medium tracking-[0.14em] text-muted-foreground/80 uppercase">
            On this page
          </p>
          <ul className="space-y-0.5">
            {navItems.map((item) => {
              const active = activeId === item.id;
              return (
                <li key={item.id}>
                  <button
                    aria-current={active ? "location" : undefined}
                    className={cn(
                      "group relative flex w-full items-center rounded-md py-2 pr-2 pl-3 text-left text-[13px] leading-none transition-colors",
                      active
                        ? "bg-foreground/6 font-medium text-foreground"
                        : "text-muted-foreground/75 hover:bg-muted/60 hover:text-foreground",
                    )}
                    onClick={() => scrollToSection(item.id)}
                    type="button"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full transition-colors",
                        active
                          ? "bg-foreground"
                          : "bg-transparent group-hover:bg-border",
                      )}
                    />
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0">
          <form action={action} id="workspace-settings-form">
            <input name="name" type="hidden" value={name} />
            <input name="slug" type="hidden" value={slug} />
            <input name="timezone" type="hidden" value={timezone} />
            <input name="phone" type="hidden" value={phone} />
            <input name="email" type="hidden" value={email} />
            <input name="website" type="hidden" value={website} />
            <input name="address" type="hidden" value={address} />
            <input name="tagline" type="hidden" value={tagline} />

            <SettingsSection
              description="Name, timezone, and public booking URL slug. Personality lives under AI Agent."
              id="essentials"
              title="Essentials"
            >
              <div className="grid gap-4 sm:grid-cols-2">
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
                    aria-invalid={
                      slugStatus ? !slugStatus.available : undefined
                    }
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
                    <p className="text-muted-foreground text-xs">
                      Checking slug…
                    </p>
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
              </div>
            </SettingsSection>

            <SettingsSection
              description="How guests reach you. Extra fields stay collapsed until you need them."
              id="contact"
              title="Contact"
            >
              <div className="grid gap-4 sm:grid-cols-2">
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
              </div>

              <Collapsible
                className="mt-4"
                onOpenChange={setMoreContactOpen}
                open={moreContactOpen}
              >
                <CollapsibleTrigger asChild>
                  <button
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/40"
                    type="button"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      More contact
                      {!moreContactOpenDefault && !moreContactOpen ? (
                        <Badge variant="secondary">Optional</Badge>
                      ) : null}
                    </span>
                    <ChevronDownIcon
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform",
                        moreContactOpen && "rotate-180",
                      )}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </SettingsSection>

            <SettingsSection
              description={t("dashboard.languageCardBody")}
              id="language"
              title={t("dashboard.languageCardTitle")}
            >
              <LocaleToggle variant="light" />
            </SettingsSection>

            <SettingsSection
              description="Service mode and whether guests can cancel or reschedule in chat."
              id="booking"
              title="Booking"
            >
              <div className="space-y-6">
                <fieldset className="space-y-3">
                  <legend className="mb-1 text-sm font-medium">
                    Service mode
                  </legend>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/80 p-3 transition-colors has-checked:border-foreground/25 has-checked:bg-muted/30">
                    <input
                      className="mt-1"
                      defaultChecked={workspace?.serviceMode !== "online"}
                      name="serviceMode"
                      type="radio"
                      value="onsite"
                    />
                    <span>
                      <span className="text-sm font-medium">Onsite</span>
                      <span className="text-muted-foreground block text-xs leading-relaxed">
                        Guest visits in person — never ask for their timezone.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/80 p-3 transition-colors has-checked:border-foreground/25 has-checked:bg-muted/30">
                    <input
                      className="mt-1"
                      defaultChecked={workspace?.serviceMode === "online"}
                      name="serviceMode"
                      type="radio"
                      value="online"
                    />
                    <span>
                      <span className="text-sm font-medium">Online</span>
                      <span className="text-muted-foreground block text-xs leading-relaxed">
                        Remote meetings — use browser timezone or ask the guest
                        once.
                      </span>
                    </span>
                  </label>
                </fieldset>

                <div className="space-y-3 border-t border-border/60 pt-5">
                  <p className="text-sm font-medium">Guest cancel / reschedule</p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      defaultChecked={workspace?.guestCancelEnabled !== false}
                      name="guestCancelEnabled"
                      type="checkbox"
                    />
                    Allow guest cancel
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      defaultChecked={
                        workspace?.guestRescheduleEnabled !== false
                      }
                      name="guestRescheduleEnabled"
                      type="checkbox"
                    />
                    Allow guest reschedule
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      defaultChecked={workspace?.guestEmailRequired !== false}
                      name="guestEmailRequired"
                      type="checkbox"
                    />
                    Require guest email
                  </label>
                  <div className="max-w-xs space-y-2">
                    <Label htmlFor="guest-cutoff">
                      Cutoff (minutes before start)
                    </Label>
                    <Input
                      defaultValue={workspace?.guestChangeCutoffMinutes ?? 120}
                      id="guest-cutoff"
                      min={0}
                      name="guestChangeCutoffMinutes"
                      type="number"
                    />
                  </div>
                </div>
              </div>
            </SettingsSection>

            <SettingsSection
              description="Email guests before appointments. Needs a verified Resend domain — otherwise mail lands in spam."
              id="reminders"
              title="Reminders"
            >
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    defaultChecked={workspace?.bookingRemindersEnabled === true}
                    name="bookingRemindersEnabled"
                    type="checkbox"
                  />
                  Enable booking reminders
                </label>
                <div className="space-y-2">
                  <Label htmlFor="reminder-leads">
                    Long lead(s) in minutes (comma-separated)
                  </Label>
                  <Input
                    defaultValue={(
                      workspace?.reminderLeadMinutes ?? [1440]
                    ).join(",")}
                    id="reminder-leads"
                    name="reminderLeadMinutes"
                    placeholder="1440"
                  />
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Example: 1440 = 24 hours before. A second reminder is always
                    scheduled at cutoff + 30 minutes.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="quiet-start">Quiet hours start (0–23)</Label>
                    <Input
                      defaultValue={workspace?.reminderQuietStart ?? 21}
                      id="quiet-start"
                      max={23}
                      min={0}
                      name="reminderQuietStart"
                      type="number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quiet-end">Quiet hours end (0–23)</Label>
                    <Input
                      defaultValue={workspace?.reminderQuietEnd ?? 8}
                      id="quiet-end"
                      max={23}
                      min={0}
                      name="reminderQuietEnd"
                      type="number"
                    />
                  </div>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Default 21→08. Set start = end to disable quiet hours. Long
                  reminders in quiet hours defer to end; short ones are skipped.
                </p>
              </div>
            </SettingsSection>

            {publicBookingUrl ? (
              <SettingsSection
                description="Share on your site, IG bio, Zalo, or QR. Guests chat and book into this workspace."
                id="public-link"
                title="Public link"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <CopyBookingLink
                    className="min-w-0 flex-1"
                    url={publicBookingUrl}
                  />
                  <Button asChild className="shrink-0" size="sm" variant="outline">
                    <Link href={publicBookingUrl} target="_blank">
                      Open page
                    </Link>
                  </Button>
                </div>
              </SettingsSection>
            ) : null}

            {state.error ? (
              <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.error}
              </p>
            ) : null}

            <div className="border-t border-border/70 py-8 lg:py-10">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                <div className="hidden lg:block" />
                <div className="min-w-0">
                  <Button disabled={saveDisabled} type="submit">
                    {pending ? "Saving…" : "Save settings"}
                  </Button>
                </div>
              </div>
            </div>
          </form>

          {children ? (
            <div className="scroll-mt-28 border-t border-border/70 pt-2" id="team">
              {children}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
