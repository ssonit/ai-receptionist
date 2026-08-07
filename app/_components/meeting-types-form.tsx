"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  IconChevronRight,
  IconClock,
  IconPlus,
  IconRefresh,
  IconVideo,
} from "@tabler/icons-react";
import {
  createMeetingTypeAction,
  syncMeetingTypesAction,
  type MeetingTypesActionState,
} from "@/app/dashboard/(main)/meeting-types/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugifyWorkspaceName } from "@/lib/workspace";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { WorkspaceMeetingTypeRow } from "@/lib/workspace-cal";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const initial: MeetingTypesActionState = {};

const LOCATIONS = [
  { value: "cal-video", label: "Cal Video (Default)" },
  { value: "google-meet", label: "Google Meet" },
] as const;

function slugify(title: string) {
  return slugifyWorkspaceName(title);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hr`;
  }
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours} hr ${rem} min`;
}

function formatNotice(minutes: number | null) {
  if (minutes == null) return "—";
  return formatDuration(minutes);
}

function extractDescription(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const desc = (raw as { description?: unknown }).description;
  return typeof desc === "string" && desc.trim() ? desc.trim() : null;
}

function extractLocationLabel(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const locations = (raw as { locations?: unknown }).locations;
  if (!Array.isArray(locations) || locations.length === 0) return null;
  const first = locations[0];
  if (!first || typeof first !== "object") return null;
  const integration = (first as { integration?: unknown }).integration;
  if (typeof integration !== "string") return null;
  const match = LOCATIONS.find((l) => l.value === integration);
  return match?.label ?? integration;
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 border-b border-border/60 py-3 last:border-b-0 sm:grid-cols-[8rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd
        className={cn(
          "text-sm break-all",
          mono && "font-mono text-xs tracking-tight",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function MeetingTypeDetailSheet({
  row,
  calUsername,
}: {
  row: WorkspaceMeetingTypeRow;
  calUsername: string;
}) {
  const description = extractDescription(row.raw);
  const location = extractLocationLabel(row.raw);
  const publicPath = calUsername
    ? `cal.com/${calUsername}/${row.slug}`
    : null;
  const publicUrl = publicPath ? `https://${publicPath}` : null;

  return (
    <div className="flex h-full flex-col">
      <SheetTitle className="sr-only">{row.title}</SheetTitle>
      <SheetDescription className="sr-only">
        Meeting type details for {row.slug}
      </SheetDescription>

      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-8 pr-14">
        {row.is_ai_booking ? (
          <Badge className="mb-4 w-fit rounded-md border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            AI booking
          </Badge>
        ) : (
          <Badge variant="outline" className="mb-4 w-fit rounded-md text-xs">
            Cal.com
          </Badge>
        )}

        <h2 className="text-foreground mb-2 text-xl leading-snug font-semibold tracking-tight">
          {row.title}
        </h2>
        <p className="text-muted-foreground mb-8 flex items-center gap-1.5 text-sm">
          <IconClock className="size-4" />
          {row.length_minutes} min
          {row.minimum_notice_minutes != null
            ? ` · ${formatNotice(row.minimum_notice_minutes)} notice`
            : ""}
        </p>

        {description ? (
          <section className="mb-8 space-y-2">
            <h3 className="text-muted-foreground text-sm">Description</h3>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {description}
            </p>
          </section>
        ) : null}

        <section>
          <h3 className="text-muted-foreground mb-1 text-sm">Details</h3>
          <dl>
            <DetailRow
              label="URL"
              value={
                publicUrl && publicPath ? (
                  <a
                    className="text-foreground underline-offset-4 hover:underline"
                    href={publicUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {publicPath}
                  </a>
                ) : (
                  <span className="text-muted-foreground">
                    `/{row.slug}` — no username from Cal.com yet
                  </span>
                )
              }
            />
            <DetailRow label="Slug" mono value={row.slug} />
            <DetailRow label="Cal ID" mono value={String(row.cal_event_type_id)} />
            <DetailRow label="Location" value={location ?? "—"} />
            <DetailRow
              label="Minimum notice"
              value={formatNotice(row.minimum_notice_minutes)}
            />
            <DetailRow
              label="AI booking"
              value={
                row.is_ai_booking ? (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    In use for chat
                  </span>
                ) : (
                  <span>
                    No — select in{" "}
                    <Link
                      className="underline underline-offset-4"
                      href="/dashboard/agent"
                    >
                      AI Agent
                    </Link>
                  </span>
                )
              }
            />
            <DetailRow label="Synced" value={formatDateTime(row.synced_at)} />
            <DetailRow label="Created" value={formatDateTime(row.created_at)} />
            <DetailRow label="Updated" value={formatDateTime(row.updated_at)} />
          </dl>
        </section>
      </div>
    </div>
  );
}

function CreateMeetingTypeSheet({
  open,
  onOpenChange,
  calUsername,
  createAction,
  createPending,
  createState,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calUsername: string;
  createAction: (payload: FormData) => void;
  createPending: boolean;
  createState: MeetingTypesActionState;
}) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [lengthMinutes, setLengthMinutes] = useState(30);
  const [location, setLocation] = useState<string>("cal-video");

  useEffect(() => {
    if (!open) {
      setTitle("");
      setSlug("");
      setSlugTouched(false);
      setLengthMinutes(30);
      setLocation("cal-video");
    }
  }, [open]);

  const urlPrefix = calUsername
    ? `cal.com/${calUsername}/`
    : null;

  const heading = title.trim() || "New meeting type";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        <div className="flex h-full flex-col">
          <SheetTitle className="sr-only">{heading}</SheetTitle>
          <SheetDescription className="sr-only">
            Create a new meeting type on Cal.com
          </SheetDescription>

          <form
            action={createAction}
            className="flex h-full flex-col"
          >
            <div className="flex-1 overflow-y-auto px-6 pt-6 pb-6 pr-14">
              <h2 className="text-foreground mb-8 text-xl font-semibold tracking-tight">
                {heading}
              </h2>

              <div className="flex flex-col gap-5">
                <div className="space-y-2">
                  <Label htmlFor="et-title">Title</Label>
                  <Input
                    id="et-title"
                    name="title"
                    onChange={(e) => {
                      const next = e.target.value;
                      setTitle(next);
                      if (!slugTouched) setSlug(slugify(next));
                    }}
                    placeholder="General checkup 90m"
                    required
                    value={title}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="et-desc">Description</Label>
                  <Textarea
                    id="et-desc"
                    name="description"
                    placeholder="A quick video meeting."
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="et-slug">URL</Label>
                  {urlPrefix ? (
                    <div className="flex overflow-hidden rounded-lg border focus-within:ring-2 focus-within:ring-ring/40">
                      <span className="bg-muted text-muted-foreground flex shrink-0 items-center border-r px-3 text-xs whitespace-nowrap sm:text-sm">
                        {urlPrefix}
                      </span>
                      <Input
                        className="rounded-none border-0 shadow-none focus-visible:ring-0"
                        id="et-slug"
                        name="slug"
                        onChange={(e) => {
                          setSlugTouched(true);
                          setSlug(e.target.value);
                        }}
                        placeholder="kham-tong-quat-90p"
                        required
                        value={slug}
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Input
                        id="et-slug"
                        name="slug"
                        onChange={(e) => {
                          setSlugTouched(true);
                          setSlug(e.target.value);
                        }}
                        placeholder="kham-tong-quat-90p"
                        required
                        value={slug}
                      />
                      <p className="text-muted-foreground text-xs">
                        Could not get username from Cal.com (`GET /v2/me`). Check
                        `CALCOM_API_KEY`.
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="et-length">Duration</Label>
                  <div className="relative">
                    <Input
                      className="pr-20"
                      id="et-length"
                      min={1}
                      name="length_minutes"
                      onChange={(e) =>
                        setLengthMinutes(Number(e.target.value) || 30)
                      }
                      type="number"
                      value={lengthMinutes}
                    />
                    <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">
                      Minutes
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="et-location">Location</Label>
                  <input name="location" type="hidden" value={location} />
                  <Select value={location} onValueChange={setLocation}>
                    <SelectTrigger id="et-location">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOCATIONS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          <span className="flex items-center gap-2">
                            <IconVideo className="size-4" />
                            {item.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {createState.error ? (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {createState.error}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="bg-background flex items-center justify-end gap-2 border-t px-6 py-4">
              <Button
                disabled={createPending}
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={createPending} type="submit">
                {createPending ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function MeetingTypesForm({
  rows,
  calUsername = "",
}: {
  rows: WorkspaceMeetingTypeRow[];
  calUsername?: string;
}) {
  const router = useRouter();
  const [createState, createAction, createPending] = useActionState(
    createMeetingTypeAction,
    initial,
  );
  const [syncPending, startSync] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [lastCreateSuccess, setLastCreateSuccess] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!createState.success || createState.success === lastCreateSuccess) {
      return;
    }
    setLastCreateSuccess(createState.success);
    toast.success(createState.success);
    setCreateOpen(false);
    router.refresh();
  }, [createState.success, lastCreateSuccess, router]);

  useEffect(() => {
    if (
      createState.error &&
      createOpen &&
      !createPending
    ) {
      toast.error(createState.error);
    }
  }, [createState.error, createOpen, createPending]);

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.is_ai_booking !== b.is_ai_booking) return a.is_ai_booking ? -1 : 1;
        return a.title.localeCompare(b.title);
      }),
    [rows],
  );

  const active = selectedId
    ? (sorted.find((row) => row.id === selectedId) ?? null)
    : null;

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 lg:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Meeting types
          </h2>
          <p className="text-muted-foreground mt-1 max-w-xl text-sm">
            Mirrored from Cal.com. Choose the AI type in{" "}
            <Link
              className="underline underline-offset-4"
              href="/dashboard/agent"
            >
              AI Agent
            </Link>
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            disabled={syncPending}
            onClick={() => {
              startSync(async () => {
                const result = await syncMeetingTypesAction();
                if (result.error) toast.error(result.error);
                else if (result.success) {
                  toast.success(result.success);
                  router.refresh();
                }
              });
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <IconRefresh
              className={cn("size-4", syncPending && "animate-spin")}
            />
            {syncPending ? "Syncing…" : "Sync"}
          </Button>
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            type="button"
          >
            <IconPlus className="size-4" />
            New
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="text-muted-foreground border-b px-4 py-3 text-xs font-medium tracking-wide uppercase">
          {sorted.length} meeting type{sorted.length === 1 ? "" : "s"}
        </div>

        {sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <p className="text-muted-foreground text-sm">
              No meeting types yet. Sync from Cal.com or create one.
            </p>
            <Button onClick={() => setCreateOpen(true)} size="sm" type="button">
              <IconPlus className="size-4" />
              New meeting type
            </Button>
          </div>
        ) : (
          <ul className="divide-y">
            {sorted.map((row) => {
              const isActive = active?.id === row.id;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-4 px-4 py-4 text-left transition-colors",
                      "hover:bg-muted/40",
                      isActive && "bg-muted/50",
                    )}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <div className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
                      <IconClock className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{row.title}</p>
                        {row.is_ai_booking ? (
                          <Badge className="rounded-md border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                            AI
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-sm">
                        {row.length_minutes} min
                        {row.minimum_notice_minutes != null
                          ? ` · ${formatNotice(row.minimum_notice_minutes)} notice`
                          : ""}
                      </p>
                    </div>
                    <IconChevronRight className="text-muted-foreground size-4 shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Sheet
        open={Boolean(active)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          {active ? (
            <MeetingTypeDetailSheet
              calUsername={calUsername}
              row={active}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <CreateMeetingTypeSheet
        calUsername={calUsername}
        createAction={createAction}
        createPending={createPending}
        createState={createState}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}
