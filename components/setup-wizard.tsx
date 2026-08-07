"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useTransition } from "react";
import {
  CalendarBlankIcon,
  CheckCircleIcon,
  ChatCircleIcon,
  SparkleIcon,
  StorefrontIcon,
} from "@phosphor-icons/react";
import {
  completeSetupAction,
  disconnectCalAction,
  finishSetupAction,
  saveCalApiKeyAction,
  saveSetupProfileAction,
  setSetupAiMeetingTypeAction,
  syncSetupMeetingTypesAction,
  type SetupActionState,
} from "@/app/dashboard/setup/actions";
import { trackSetupEventAction } from "@/app/dashboard/setup/track";
import { checkWorkspaceSlugAvailable } from "@/app/dashboard/(main)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TimezoneSelect } from "@/components/timezone-select";
import { ANALYTICS_EVENT } from "@/lib/analytics-events";
import { track } from "@/lib/analytics-client";
import type { WorkspaceMeetingTypeRow } from "@/lib/workspace-cal";
import { WORKSPACE_AI_DEFAULTS } from "@/lib/workspace-ai-defaults";
import { resolveWorkspaceSlugField, slugifyWorkspaceName } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const empty: SetupActionState = {};

const STEPS = [
  {
    id: 1 as const,
    label: "Profile",
    required: true,
    title: "Your workspace profile",
    question: "Confirm name, public slug, and timezone.",
    hint: "Required once — unlocks the dashboard.",
  },
  {
    id: 2 as const,
    label: "Try agent",
    required: false,
    title: "Try the booking agent",
    question: "Chat with a live sandbox demo.",
    hint: "Uses Eve Pilot calendar — connect your Cal.com next for real bookings.",
  },
  {
    id: 3 as const,
    label: "Cal.com",
    required: false,
    title: "Connect your booking calendar",
    question: "Connect your Cal.com account.",
    hint: "Optional for now — needed before guests can book on your public page.",
  },
  {
    id: 4 as const,
    label: "Meeting type",
    required: false,
    title: "Choose a meeting type for AI",
    question: "Which meeting type should the agent use?",
    hint: "Optional until you go live. Sync from Cal.com, then pick one type.",
  },
];

export type SetupWizardProps = {
  initialStep: 1 | 2 | 3 | 4;
  setupCompleted: boolean;
  workspace: {
    id: string;
    name: string;
    slug: string | null;
    timezone: string;
    about: string | null;
    calUsername: string | null;
    hasCalKey: boolean;
    calAuthMode: string | null;
    aiMeetingTypeId: string | null;
  };
  meetingTypes: WorkspaceMeetingTypeRow[];
  chatBaseUrl: string;
};

export function SetupWizard({
  initialStep,
  setupCompleted,
  workspace,
  meetingTypes,
  chatBaseUrl,
}: SetupWizardProps) {
  const router = useRouter();
  const [step, setStep] = React.useState(initialStep);
  const [calState, calAction, calPending] = useActionState(
    saveCalApiKeyAction,
    empty,
  );
  const [profileState, profileAction, profilePending] = useActionState(
    saveSetupProfileAction,
    empty,
  );
  const [finishState, finishAction, finishPending] = useActionState(
    finishSetupAction,
    empty,
  );
  const [pending, startTransition] = useTransition();
  const [aiId, setAiId] = React.useState(workspace.aiMeetingTypeId ?? "");
  const [name, setName] = React.useState(workspace.name ?? "");
  const [slug, setSlug] = React.useState(() =>
    resolveWorkspaceSlugField(workspace.name, workspace.slug),
  );
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [slugStatus, setSlugStatus] = React.useState<{
    available: boolean;
    message: string;
  } | null>(null);
  const [slugChecking, setSlugChecking] = React.useState(false);
  const [calKeyDraft, setCalKeyDraft] = React.useState("");
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [profileDirty, setProfileDirty] = React.useState(false);
  const [profileSaved, setProfileSaved] = React.useState(setupCompleted);
  const openedRef = React.useRef(false);

  const trackSetup = (
    event: Parameters<typeof trackSetupEventAction>[0],
    meta?: Record<string, unknown>,
  ) => {
    void trackSetupEventAction(event, meta).catch(() => {
      // Analytics must not surface as unhandledRejection.
    });
  };

  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    track(ANALYTICS_EVENT.SETUP_OPENED, { workspaceId: workspace.id });
    trackSetup("setup_open", { initialStep });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStep]);

  useEffect(() => {
    if (step === 2) trackSetup("setup_step2_view");
  }, [step]);

  useEffect(() => {
    if (calState.success) {
      toast.success(calState.success);
      setCalKeyDraft("");
      trackSetup("setup_cal_connected");
      router.refresh();
      setStep(4);
    } else if (calState.error) toast.error(calState.error);
  }, [calState, router]);

  useEffect(() => {
    if (profileState.success) {
      toast.success(profileState.success);
      setProfileDirty(false);
      setProfileSaved(true);
      router.refresh();
    } else if (profileState.error) toast.error(profileState.error);
  }, [profileState, router]);

  useEffect(() => {
    if (finishState.success) {
      toast.success(finishState.success);
      setProfileDirty(false);
      setProfileSaved(true);
      trackSetup("setup_step1_done");
      router.refresh();
      setStep(2);
    } else if (finishState.error) toast.error(finishState.error);
  }, [finishState, router]);

  useEffect(() => {
    setAiId(workspace.aiMeetingTypeId ?? "");
  }, [workspace.aiMeetingTypeId]);

  useEffect(() => {
    if (step !== 1) return;
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
        setSlugStatus({
          available: result.available,
          message: result.message,
        });
        setSlugChecking(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slug, step]);

  const formDirty =
    (step === 3 && !workspace.hasCalKey && calKeyDraft.trim().length > 0) ||
    (step === 1 && profileDirty);

  // Detect OAuth callback success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("cal_oauth_ok")) {
      toast.success("Cal.com connected");
      trackSetup("setup_cal_connected");
      router.refresh();
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete("cal_oauth_ok");
      window.history.replaceState({}, "", url.toString());
    } else if (params.get("cal_oauth_error")) {
      const code = params.get("cal_oauth_error");
      const messages: Record<string, string> = {
        denied: "Connection declined. Try again when ready.",
        state_invalid: "Session expired. Start again.",
        exchange_failed: "Could not connect. Try again.",
      };
      toast.error(messages[code ?? ""] ?? "Connection failed. Try again.");
      const url = new URL(window.location.href);
      url.searchParams.delete("cal_oauth_error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [router]);

  const handleDisconnect = () => {
    if (!window.confirm("Disconnect Cal.com? Guests will not be able to book until you reconnect.")) return;
    setDisconnecting(true);
    disconnectCalAction(workspace.id)
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

  useEffect(() => {
    if (!formDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [formDirty]);

  const meta = STEPS[step - 1]!;

  const goBack = () => {
    if (step > 1) setStep((s) => (s - 1) as 1 | 2 | 3 | 4);
  };

  const goDashboard = (event: "setup_cal_skip" | "setup_complete_dashboard") => {
    trackSetup(event);
    router.push("/dashboard");
  };

  const selectMeetingType = (id: string) => {
    setAiId(id);
    startTransition(async () => {
      const result = await setSetupAiMeetingTypeAction(id);
      if (result.error) toast.error(result.error);
      else {
        toast.success(result.success ?? "Selected");
        trackSetup("setup_meeting_type", { id });
        // Local aiId already reflects selection; refresh can race the
        // proxy "booking live → leave setup" document redirect.
      }
    });
  };

  const icon =
    step === 1 ? (
      <StorefrontIcon className="size-4 text-white" weight="fill" />
    ) : step === 2 ? (
      <ChatCircleIcon className="size-4 text-white" weight="fill" />
    ) : step === 3 ? (
      <CalendarBlankIcon className="size-4 text-white" weight="fill" />
    ) : (
      <SparkleIcon className="size-4 text-white" weight="fill" />
    );

  return (
    <div className="flex min-h-[calc(100svh-5.5rem)] flex-col">
      <div className="mx-auto mb-3 flex w-full max-w-md gap-1.5">
        {STEPS.map((s) => (
          <button
            key={s.id}
            aria-label={`Step ${s.id}: ${s.label}${s.required ? " (required)" : " (optional)"}`}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              step >= s.id ? "bg-white" : "bg-white/15",
            )}
            type="button"
            onClick={() => {
              if (s.id === 1) setStep(1);
              else if (profileSaved || setupCompleted) setStep(s.id);
            }}
          />
        ))}
      </div>
      <p className="mb-8 text-center text-xs text-zinc-500">
        Step 1 unlocks the dashboard · Cal.com steps are optional until you go
        live
      </p>

      <div className="mb-8 space-y-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-amber-600 shadow-[0_0_24px_-4px_rgba(251,146,60,0.55)]">
            {icon}
          </span>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                {meta.title}
              </h1>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase",
                  meta.required
                    ? "bg-orange-400/15 text-orange-200"
                    : "bg-white/10 text-zinc-400",
                )}
              >
                {meta.required ? "Required" : "Optional"}
              </span>
            </div>
            <p className="text-pretty text-sm leading-relaxed text-zinc-400">
              <span className="font-medium text-zinc-200">{meta.question}</span>{" "}
              {meta.hint}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1">
        {step === 1 ? (
          <form
            action={profileSaved ? profileAction : finishAction}
            className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
            id="setup-profile-form"
            onChange={() => setProfileDirty(true)}
          >
            <div className="space-y-2">
              <Label className="text-zinc-200" htmlFor="name">
                Workspace name
              </Label>
              <Input
                className="h-11 border-white/10 bg-black/40 text-white"
                id="name"
                name="name"
                required
                value={name}
                onChange={(e) => {
                  const next = e.target.value;
                  setName(next);
                  setProfileDirty(true);
                  if (!slugTouched || !slug.trim()) {
                    setSlugTouched(false);
                    setSlug(slugifyWorkspaceName(next));
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-200" htmlFor="slug">
                Booking page slug
              </Label>
              <Input
                aria-invalid={slugStatus ? !slugStatus.available : undefined}
                className="h-11 border-white/10 bg-black/40 text-white"
                id="slug"
                name="slug"
                required
                value={slug}
                onChange={(e) => {
                  const next = e.target.value;
                  setProfileDirty(true);
                  if (!next.trim()) {
                    setSlugTouched(false);
                    setSlug(slugifyWorkspaceName(name));
                    return;
                  }
                  setSlugTouched(true);
                  setSlug(next);
                }}
              />
              <p className="break-all text-xs text-zinc-500">
                Public link: {chatBaseUrl}/b/
                {encodeURIComponent(
                  slugifyWorkspaceName(slug.trim() ? slug : name) || "…",
                )}
              </p>
              {slugChecking ? (
                <p className="text-xs text-zinc-500">Checking slug…</p>
              ) : slugStatus ? (
                <p
                  className={cn(
                    "text-xs",
                    slugStatus.available ? "text-emerald-400" : "text-red-400",
                  )}
                >
                  {slugStatus.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-200" htmlFor="timezone">
                Timezone
              </Label>
              <TimezoneSelect
                defaultValue={workspace.timezone || "Asia/Ho_Chi_Minh"}
                id="timezone"
                name="timezone"
                required
                triggerClassName="h-11 border-white/10 bg-black/40 text-white hover:bg-black/50 hover:text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-200" htmlFor="about">
                Short intro{" "}
                <span className="font-normal text-zinc-500">(optional)</span>
              </Label>
              <Textarea
                className="min-h-[88px] border-white/10 bg-black/40 text-white"
                defaultValue={
                  workspace.about?.trim() || WORKSPACE_AI_DEFAULTS.about
                }
                id="about"
                name="about"
                placeholder="Short intro for guests and the AI agent…"
                rows={3}
              />
            </div>
          </form>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
            <p className="px-1 text-sm text-zinc-400">
              This is a{" "}
              <span className="font-medium text-zinc-200">sandbox demo</span>{" "}
              calendar. Connect Cal.com in the next step to use your real
              availability.
            </p>
            <iframe
              className="h-[min(70vh,560px)] w-full rounded-xl border border-white/10 bg-black"
              src={`${chatBaseUrl}/chat`}
              title="Eve booking agent demo"
            />
          </div>
        ) : null}

        {step === 3 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            {workspace.calAuthMode === "oauth" ? (
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <CheckCircleIcon
                    className="mt-0.5 size-5 shrink-0 text-emerald-400"
                    weight="fill"
                  />
                  <div>
                    <p className="font-medium text-white">Cal.com connected</p>
                    <p className="mt-1 text-sm text-zinc-400">
                      {workspace.calUsername
                        ? `@${workspace.calUsername}`
                        : "Connected via OAuth"}
                    </p>
                  </div>
                </div>
                <Button
                  className="rounded-full border-red-400/30 text-red-300 hover:bg-red-400/10 hover:text-red-200"
                  disabled={disconnecting}
                  type="button"
                  variant="outline"
                  onClick={handleDisconnect}
                >
                  {disconnecting ? "Disconnecting…" : "Disconnect"}
                </Button>
              </div>
            ) : workspace.calAuthMode === "api_key" ? (
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <CheckCircleIcon
                    className="mt-0.5 size-5 shrink-0 text-emerald-400"
                    weight="fill"
                  />
                  <div>
                    <p className="font-medium text-white">Cal.com connected</p>
                    <p className="mt-1 text-sm text-zinc-400">
                      {workspace.calUsername
                        ? `@${workspace.calUsername}`
                        : "API key saved (encrypted)."}
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <a
                    className="inline-flex h-10 items-center justify-center rounded-full bg-white px-5 text-sm font-medium text-black hover:bg-zinc-200"
                    href={`/api/cal/oauth/start?returnTo=/dashboard/setup`}
                  >
                    Upgrade to OAuth
                  </a>
                  <details className="group text-sm">
                    <summary className="cursor-pointer text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline">
                      Change API key
                    </summary>
                    <form action={calAction} className="mt-4 space-y-3">
                      <Input
                        autoComplete="off"
                        className="h-11 border-white/10 bg-black/40 text-white placeholder:text-zinc-600"
                        name="calApiKey"
                        placeholder="cal_live_…"
                        required
                        type="password"
                        value={calKeyDraft}
                        onChange={(e) => setCalKeyDraft(e.target.value)}
                      />
                      <Button
                        className="rounded-full"
                        disabled={calPending}
                        type="submit"
                      >
                        Save new key
                      </Button>
                    </form>
                  </details>
                  <Button
                    className="rounded-full border-red-400/30 text-red-300 hover:bg-red-400/10 hover:text-red-200"
                    disabled={disconnecting}
                    type="button"
                    variant="outline"
                    onClick={handleDisconnect}
                  >
                    {disconnecting ? "Disconnecting…" : "Disconnect"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <a
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-medium text-black hover:bg-zinc-200"
                  href={`/api/cal/oauth/start?returnTo=/dashboard/setup`}
                >
                  <CalendarBlankIcon className="size-4" weight="fill" />
                  Connect Cal.com
                </a>
                <p className="text-center text-xs text-zinc-500">
                  You'll be redirected to Cal.com to authorize this app.
                </p>
                <details className="group text-sm">
                  <summary className="cursor-pointer text-zinc-500 underline-offset-4 hover:text-zinc-300 hover:underline">
                    Paste API key instead
                  </summary>
                  <form action={calAction} className="mt-4 space-y-3" id="setup-cal-form">
                    <div className="space-y-2">
                      <Label className="text-zinc-200" htmlFor="calApiKey">
                        Cal.com API key
                      </Label>
                      <Input
                        autoComplete="off"
                        className="h-11 border-white/10 bg-black/40 text-white placeholder:text-zinc-600"
                        id="calApiKey"
                        name="calApiKey"
                        placeholder="cal_live_… or cal_test_…"
                        required
                        type="password"
                        value={calKeyDraft}
                        onChange={(e) => setCalKeyDraft(e.target.value)}
                      />
                    </div>
                    <a
                      className="inline-block text-sm text-zinc-400 underline underline-offset-4 transition hover:text-zinc-200"
                      href="https://app.cal.com/settings/developer/api-keys"
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open Cal.com API key settings
                    </a>
                  </form>
                </details>
              </div>
            )}
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs tracking-wide text-zinc-500 uppercase">
                {meetingTypes.length} meeting type
                {meetingTypes.length === 1 ? "" : "s"}
              </p>
              <Button
                className="rounded-full border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white"
                disabled={pending || !workspace.hasCalKey}
                size="sm"
                type="button"
                variant="outline"
                onClick={() => {
                  startTransition(async () => {
                    const result = await syncSetupMeetingTypesAction();
                    if (result.error) toast.error(result.error);
                    else {
                      toast.success(result.success ?? "Synced");
                      router.refresh();
                    }
                  });
                }}
              >
                {pending ? "Syncing…" : "Sync from Cal.com"}
              </Button>
            </div>

            {!workspace.hasCalKey ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-5 py-10 text-center">
                <p className="text-sm text-zinc-400">
                  Connect Cal.com in the previous step before syncing meeting
                  types.
                </p>
              </div>
            ) : meetingTypes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-5 py-10 text-center">
                <p className="text-sm text-zinc-400">
                  No meeting types yet. Create one on Cal.com, then Sync.
                </p>
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {meetingTypes.map((mt) => {
                  const selected = aiId === mt.id || mt.is_ai_booking;
                  return (
                    <li key={mt.id}>
                      <button
                        className={cn(
                          "flex w-full flex-col gap-1 rounded-xl border px-4 py-4 text-left transition",
                          selected
                            ? "border-orange-400/50 bg-orange-400/10 shadow-[0_0_0_1px_rgba(251,146,60,0.25)]"
                            : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                        )}
                        disabled={pending}
                        type="button"
                        onClick={() => selectMeetingType(mt.id)}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-medium text-white">
                            {mt.title}
                          </span>
                          {selected ? (
                            <CheckCircleIcon
                              className="size-4 shrink-0 text-orange-300"
                              weight="fill"
                            />
                          ) : null}
                        </span>
                        <span className="text-sm text-zinc-400">
                          {mt.length_minutes} min
                          {mt.slug ? ` · ${mt.slug}` : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-6">
        {step > 1 ? (
          <button
            className="text-sm text-zinc-400 transition hover:text-white"
            type="button"
            onClick={goBack}
          >
            Back
          </button>
        ) : (
          <span />
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          {step === 1 ? (
            <>
              {profileSaved ? (
                <>
                  <Button
                    className="rounded-full border-white/10 bg-white/5 text-zinc-200"
                    disabled={
                      profilePending ||
                      slugChecking ||
                      slugStatus?.available === false
                    }
                    form="setup-profile-form"
                    type="submit"
                    variant="outline"
                  >
                    {profilePending ? "Saving…" : "Save profile"}
                  </Button>
                  <Button
                    className="h-10 rounded-full bg-white px-5 font-medium text-black hover:bg-zinc-200"
                    type="button"
                    onClick={() => setStep(2)}
                  >
                    Continue →
                  </Button>
                </>
              ) : (
                <Button
                  className="h-10 rounded-full bg-white px-5 font-medium text-black hover:bg-zinc-200"
                  disabled={
                    finishPending ||
                    slugChecking ||
                    slugStatus?.available === false
                  }
                  form="setup-profile-form"
                  type="submit"
                >
                  {finishPending ? "Saving…" : "Save & continue"}
                </Button>
              )}
            </>
          ) : null}

          {step === 2 ? (
            <Button
              className="h-10 rounded-full bg-white px-5 font-medium text-black hover:bg-zinc-200"
              type="button"
              onClick={() => setStep(3)}
            >
              Continue →
            </Button>
          ) : null}

          {step === 3 ? (
            <>
              <Button
                className="rounded-full text-zinc-300"
                type="button"
                variant="ghost"
                onClick={() => goDashboard("setup_cal_skip")}
              >
                Skip for now
              </Button>
              {workspace.calAuthMode ? (
                <Button
                  className="h-10 rounded-full bg-white px-5 font-medium text-black hover:bg-zinc-200"
                  type="button"
                  onClick={() => setStep(4)}
                >
                  Continue →
                </Button>
              ) : (
                <Button
                  className="h-10 rounded-full bg-white px-5 font-medium text-black hover:bg-zinc-200"
                  disabled={calPending || !calKeyDraft.trim()}
                  form="setup-cal-form"
                  type="submit"
                >
                  {calPending ? "Saving…" : "Save key →"}
                </Button>
              )}
            </>
          ) : null}

          {step === 4 ? (
            <>
              <Button
                className="rounded-full text-zinc-300"
                type="button"
                variant="ghost"
                onClick={() => goDashboard("setup_cal_skip")}
              >
                Skip for now
              </Button>
              <Button
                className="h-10 rounded-full bg-white px-5 font-medium text-black hover:bg-zinc-200"
                type="button"
                onClick={() => {
                  startTransition(async () => {
                    if (!setupCompleted && !profileSaved) {
                      const result = await completeSetupAction();
                      if (result?.error) {
                        toast.error(result.error);
                        return;
                      }
                    }
                    goDashboard("setup_complete_dashboard");
                  });
                }}
              >
                Go to dashboard
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
