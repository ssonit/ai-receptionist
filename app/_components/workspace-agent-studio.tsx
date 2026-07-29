"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useState,
  useTransition,
} from "react";
import {
  ChevronDownIcon,
  GripVerticalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { saveWorkspaceAgent } from "@/app/dashboard/agent/actions";
import { setAiBookingMeetingTypeAction } from "@/app/dashboard/meeting-types/actions";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  looksLikeBulletList,
  parseBulletLines,
  parseServiceTags,
  serializeBulletLines,
  serializeServiceTags,
} from "@/lib/agent-profile-builders";
import {
  AGENT_ABOUT_TEMPLATES,
  AGENT_HOURS_PRESETS,
  AGENT_INSTRUCTIONS_STARTERS,
} from "@/lib/agent-profile-templates";
import {
  AGENT_REPLY_LOCALE_OPTIONS,
  AGENT_TONE_OPTIONS,
  DEFAULT_AGENT_REPLY_LOCALE,
  DEFAULT_AGENT_TONE,
  type AgentReplyLocale,
  type AgentTone,
} from "@/lib/agent-reply-customs";
import {
  DEFAULT_CHAT_ASSISTANT_LABEL,
  DEFAULT_CHAT_INTRO,
  DEFAULT_CHAT_PLACEHOLDER,
  DEFAULT_CHAT_SUGGESTIONS,
  MAX_CHAT_SUGGESTIONS,
  resolveChatBranding,
  type ChatSuggestion,
} from "@/lib/chat-branding";
import { WORKSPACE_AI_DEFAULTS } from "@/lib/workspace-ai-defaults";
import { cn } from "@/lib/utils";
import type {
  WorkspaceAgentStudioProps,
  WorkspaceSettingsState,
} from "@/lib/workspace-settings-types";

const initial: WorkspaceSettingsState = {};

type SuggestionDraft = ChatSuggestion & { key: string };
type StudioTab = "greeting" | "persona" | "booking";

function SortableSuggestionChip({
  item,
  selected,
  onSelect,
}: {
  item: SuggestionDraft;
  selected: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <button
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-left text-xs transition-colors",
        selected
          ? "border-white/40 bg-white/15 text-white"
          : "border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10",
        isDragging && "opacity-70",
        !item.label.trim() && "border-dashed text-zinc-500",
      )}
      onClick={onSelect}
      ref={setNodeRef}
      style={style}
      type="button"
    >
      <span
        className="touch-none text-zinc-500"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVerticalIcon className="size-3.5" />
      </span>
      <span className="truncate">
        {item.label.trim() || "Untitled chip"}
      </span>
    </button>
  );
}

export function WorkspaceAgentStudio({
  workspace,
  meetingTypes,
  faqItems = [],
}: WorkspaceAgentStudioProps) {
  const router = useRouter();
  const formId = "workspace-agent-form";
  const [state, action, pending] = useActionState(saveWorkspaceAgent, initial);
  const [selectPending, startSelect] = useTransition();
  const [tab, setTab] = useState<StudioTab>("greeting");
  const [editingField, setEditingField] = useState<
    "label" | "intro" | "suggestion" | null
  >(null);
  const [activeSuggestionKey, setActiveSuggestionKey] = useState<string | null>(
    null,
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [hoursRawMode, setHoursRawMode] = useState(
    () => !looksLikeBulletList(workspace?.businessHours),
  );
  const [servicesRawMode, setServicesRawMode] = useState(
    () => !looksLikeBulletList(workspace?.servicesSummary),
  );

  const [about, setAbout] = useState(workspace?.about ?? "");
  const [businessHours, setBusinessHours] = useState(
    workspace?.businessHours ?? "",
  );
  const [hourLines, setHourLines] = useState(() =>
    parseBulletLines(workspace?.businessHours),
  );
  const [servicesSummary, setServicesSummary] = useState(
    workspace?.servicesSummary ?? "",
  );
  const [serviceTags, setServiceTags] = useState(() =>
    parseServiceTags(workspace?.servicesSummary),
  );
  const [serviceDraft, setServiceDraft] = useState("");
  const [agentInstructions, setAgentInstructions] = useState(
    workspace?.agentInstructions ?? "",
  );
  const [agentDisplayName, setAgentDisplayName] = useState(
    workspace?.agentDisplayName ?? "",
  );
  const [agentTone, setAgentTone] = useState<AgentTone>(
    workspace?.agentTone ?? DEFAULT_AGENT_TONE,
  );
  const [agentReplyLocale, setAgentReplyLocale] = useState<AgentReplyLocale>(
    workspace?.agentReplyLocale ?? DEFAULT_AGENT_REPLY_LOCALE,
  );
  const [agentHandoff, setAgentHandoff] = useState(
    workspace?.agentHandoff ?? "",
  );
  const [chatAssistantLabel, setChatAssistantLabel] = useState(
    workspace?.chatAssistantLabel ?? "",
  );
  const [chatIntro, setChatIntro] = useState(workspace?.chatIntro ?? "");
  const [chatPlaceholder, setChatPlaceholder] = useState(
    workspace?.chatPlaceholder ?? "",
  );
  const [suggestions, setSuggestions] = useState<SuggestionDraft[]>(() =>
    (workspace?.chatSuggestions ?? []).map((item, i) => ({
      ...item,
      key: `s-${i}`,
    })),
  );

  const name = workspace?.name ?? "";
  const tagline = workspace?.tagline ?? "";
  const aiRow = meetingTypes.find((r) => r.is_ai_booking) ?? null;

  const branding = resolveChatBranding({
    assistantLabel: chatAssistantLabel || null,
    intro: chatIntro || null,
    suggestions: suggestions.map(({ label, prompt }) => ({ label, prompt })),
    placeholder: chatPlaceholder || null,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    setAbout(workspace?.about ?? "");
    setBusinessHours(workspace?.businessHours ?? "");
    setHourLines(parseBulletLines(workspace?.businessHours));
    setHoursRawMode(!looksLikeBulletList(workspace?.businessHours));
    setServicesSummary(workspace?.servicesSummary ?? "");
    setServiceTags(parseServiceTags(workspace?.servicesSummary));
    setServicesRawMode(!looksLikeBulletList(workspace?.servicesSummary));
    setAgentInstructions(workspace?.agentInstructions ?? "");
    setAgentDisplayName(workspace?.agentDisplayName ?? "");
    setAgentTone(workspace?.agentTone ?? DEFAULT_AGENT_TONE);
    setAgentReplyLocale(
      workspace?.agentReplyLocale ?? DEFAULT_AGENT_REPLY_LOCALE,
    );
    setAgentHandoff(workspace?.agentHandoff ?? "");
    setChatAssistantLabel(workspace?.chatAssistantLabel ?? "");
    setChatIntro(workspace?.chatIntro ?? "");
    setChatPlaceholder(workspace?.chatPlaceholder ?? "");
    setSuggestions(
      (workspace?.chatSuggestions ?? []).map((item, i) => ({
        ...item,
        key: `s-${i}-${item.label}`,
      })),
    );
    setAdvancedOpen(
      Boolean(
        workspace?.agentInstructions?.trim() || workspace?.agentHandoff?.trim(),
      ),
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
    if (!hoursRawMode) {
      setBusinessHours(serializeBulletLines(hourLines));
    }
  }, [hourLines, hoursRawMode]);

  useEffect(() => {
    if (!servicesRawMode) {
      setServicesSummary(serializeServiceTags(serviceTags));
    }
  }, [serviceTags, servicesRawMode]);

  const suggestionPayload = suggestions.map(({ label, prompt }) => ({
    label,
    prompt,
  }));

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSuggestions((prev) => {
      const oldIndex = prev.findIndex((s) => s.key === active.id);
      const newIndex = prev.findIndex((s) => s.key === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function resetChatDefaults() {
    setChatAssistantLabel(WORKSPACE_AI_DEFAULTS.chatAssistantLabel);
    setChatIntro(WORKSPACE_AI_DEFAULTS.chatIntro);
    setChatPlaceholder(WORKSPACE_AI_DEFAULTS.chatPlaceholder);
    setSuggestions(
      WORKSPACE_AI_DEFAULTS.chatSuggestions.map((item, i) => ({
        ...item,
        key: `s-default-${i}`,
      })),
    );
    setEditingField(null);
    setActiveSuggestionKey(null);
  }

  function addSuggestion() {
    if (suggestions.length >= MAX_CHAT_SUGGESTIONS) return;
    const key = `s-new-${Date.now()}`;
    setSuggestions((prev) => [...prev, { key, label: "", prompt: "" }]);
    setActiveSuggestionKey(key);
    setEditingField("suggestion");
  }

  function addServiceTag() {
    const next = serviceDraft.trim();
    if (!next) return;
    if (serviceTags.includes(next)) {
      setServiceDraft("");
      return;
    }
    setServiceTags((prev) => [...prev, next]);
    setServiceDraft("");
  }

  const activeSuggestion =
    suggestions.find((s) => s.key === activeSuggestionKey) ?? null;

  const displaySuggestions =
    suggestions.length > 0
      ? suggestions
      : DEFAULT_CHAT_SUGGESTIONS.map((item, i) => ({
          ...item,
          key: `default-${i}`,
        }));

  return (
    <div className="flex flex-col gap-4 px-4 pb-10 lg:px-6">
      <form action={action} className="contents" id={formId}>
        <input name="about" type="hidden" value={about} />
        <input name="business_hours" type="hidden" value={businessHours} />
        <input name="services_summary" type="hidden" value={servicesSummary} />
        <input
          name="agent_instructions"
          type="hidden"
          value={agentInstructions}
        />
        <input
          name="agent_display_name"
          type="hidden"
          value={agentDisplayName}
        />
        <input name="agent_tone" type="hidden" value={agentTone} />
        <input
          name="agent_reply_locale"
          type="hidden"
          value={agentReplyLocale}
        />
        <input name="agent_handoff" type="hidden" value={agentHandoff} />
        <input
          name="chat_assistant_label"
          type="hidden"
          value={chatAssistantLabel}
        />
        <input name="chat_intro" type="hidden" value={chatIntro} />
        <input name="chat_placeholder" type="hidden" value={chatPlaceholder} />
        <input
          name="chat_suggestions"
          type="hidden"
          value={JSON.stringify(suggestionPayload)}
        />
      </form>

      <Tabs
        className="gap-0"
        onValueChange={(v) => setTab(v as StudioTab)}
        value={tab}
      >
        <div className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
          <TabsList className="min-w-0" variant="line">
            <TabsTrigger value="greeting">Greeting</TabsTrigger>
            <TabsTrigger value="persona">Persona</TabsTrigger>
            <TabsTrigger value="booking">Booking</TabsTrigger>
          </TabsList>
          <Button disabled={pending} form={formId} type="submit">
            {pending ? "Saving…" : "Save agent"}
          </Button>
        </div>

        <TabsContent className="mt-6 outline-none" value="greeting">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,24rem)] lg:items-start">
            <div className="animate-in fade-in-0 duration-300">
              <div className="mx-auto w-full max-w-md">
                <div className="overflow-hidden rounded-[1.75rem] border border-border/80 bg-zinc-950 text-zinc-100 shadow-lg ring-1 ring-black/5">
                  <div className="flex items-center justify-center gap-1 border-b border-white/10 py-2">
                    <span className="size-1.5 rounded-full bg-zinc-600" />
                    <span className="h-1 w-16 rounded-full bg-zinc-700" />
                  </div>
                  <div className="border-b border-white/10 px-5 py-4">
                    <button
                      className={cn(
                        "text-[10px] font-medium tracking-[0.14em] text-zinc-500 uppercase transition-colors hover:text-zinc-300",
                        editingField === "label" && "text-zinc-300",
                      )}
                      onClick={() => {
                        setEditingField("label");
                        setActiveSuggestionKey(null);
                      }}
                      type="button"
                    >
                      {branding.assistantLabel}
                    </button>
                    <p className="mt-1 text-lg font-semibold tracking-tight text-white">
                      {name.trim() || "Your workspace"}
                    </p>
                    {tagline.trim() ? (
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {tagline.trim()}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex min-h-72 flex-col gap-4 px-5 py-6">
                    <button
                      className={cn(
                        "text-left text-sm leading-relaxed text-zinc-400 transition-colors hover:text-zinc-200",
                        editingField === "intro" && "text-zinc-200",
                        !chatIntro.trim() &&
                          !tagline.trim() &&
                          "italic text-zinc-500",
                      )}
                      onClick={() => {
                        setEditingField("intro");
                        setActiveSuggestionKey(null);
                      }}
                      type="button"
                    >
                      {chatIntro.trim() ||
                        branding.intro ||
                        "Click to set greeting"}
                    </button>

                    <DndContext
                      collisionDetection={closestCenter}
                      onDragEnd={onDragEnd}
                      sensors={sensors}
                    >
                      <SortableContext
                        items={
                          suggestions.length > 0
                            ? suggestions.map((s) => s.key)
                            : []
                        }
                        strategy={horizontalListSortingStrategy}
                      >
                        <div className="flex flex-wrap gap-2">
                          {suggestions.length > 0 ? (
                            suggestions.map((item) => (
                              <SortableSuggestionChip
                                item={item}
                                key={item.key}
                                onSelect={() => {
                                  setActiveSuggestionKey(item.key);
                                  setEditingField("suggestion");
                                }}
                                selected={activeSuggestionKey === item.key}
                              />
                            ))
                          ) : (
                            displaySuggestions.map((item) => (
                              <span
                                className="rounded-full border border-dashed border-white/20 px-3 py-1 text-xs text-zinc-500"
                                key={item.key}
                              >
                                {item.label}
                              </span>
                            ))
                          )}
                          {suggestions.length > 0 &&
                          suggestions.length < MAX_CHAT_SUGGESTIONS ? (
                            <button
                              className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/25 px-3 py-1 text-xs text-zinc-400 hover:bg-white/5"
                              onClick={addSuggestion}
                              type="button"
                            >
                              <PlusIcon className="size-3.5" />
                              Add
                            </button>
                          ) : null}
                        </div>
                      </SortableContext>
                    </DndContext>

                    {suggestions.length === 0 ? (
                      <p className="text-[11px] text-zinc-600">
                        Ghost chips = Eve defaults. Add custom chips to replace
                        them.
                      </p>
                    ) : null}

                    <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                      <p className="truncate text-xs text-zinc-500">
                        {branding.placeholder}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Card className="animate-in fade-in-0 slide-in-from-right-2 duration-300 lg:sticky lg:top-28">
              <CardHeader>
                <CardTitle className="text-base">Greeting editor</CardTitle>
                <CardDescription>
                  Click the phone preview to edit. Empty fields keep Eve
                  defaults.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(editingField === "label" || editingField === null) && (
                  <div className="space-y-2">
                    <Label htmlFor="chat_assistant_label_ui">AI label</Label>
                    <Input
                      id="chat_assistant_label_ui"
                      onChange={(e) => setChatAssistantLabel(e.target.value)}
                      onFocus={() => setEditingField("label")}
                      placeholder={DEFAULT_CHAT_ASSISTANT_LABEL}
                      value={chatAssistantLabel}
                    />
                  </div>
                )}
                {(editingField === "intro" || editingField === null) && (
                  <div className="space-y-2">
                    <Label htmlFor="chat_intro_ui">Intro</Label>
                    <Textarea
                      id="chat_intro_ui"
                      onChange={(e) => setChatIntro(e.target.value)}
                      onFocus={() => setEditingField("intro")}
                      placeholder={DEFAULT_CHAT_INTRO}
                      rows={3}
                      value={chatIntro}
                    />
                  </div>
                )}
                {(editingField === null ||
                  editingField === "label" ||
                  editingField === "intro") && (
                  <div className="space-y-2">
                    <Label htmlFor="chat_placeholder_ui">
                      Composer placeholder
                    </Label>
                    <Input
                      id="chat_placeholder_ui"
                      onChange={(e) => setChatPlaceholder(e.target.value)}
                      placeholder={DEFAULT_CHAT_PLACEHOLDER}
                      value={chatPlaceholder}
                    />
                    <p className="text-muted-foreground text-xs">
                      Hint text in the guest chat input before they type.
                    </p>
                  </div>
                )}
                {editingField === "suggestion" && activeSuggestion ? (
                  <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">Suggestion chip</p>
                      <Button
                        aria-label="Remove suggestion"
                        onClick={() => {
                          setSuggestions((prev) =>
                            prev.filter((s) => s.key !== activeSuggestion.key),
                          );
                          setActiveSuggestionKey(null);
                          setEditingField(null);
                        }}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                    <Input
                      onChange={(e) =>
                        setSuggestions((prev) =>
                          prev.map((s) =>
                            s.key === activeSuggestion.key
                              ? { ...s, label: e.target.value }
                              : s,
                          ),
                        )
                      }
                      placeholder="Button label"
                      value={activeSuggestion.label}
                    />
                    <Input
                      onChange={(e) =>
                        setSuggestions((prev) =>
                          prev.map((s) =>
                            s.key === activeSuggestion.key
                              ? { ...s, prompt: e.target.value }
                              : s,
                          ),
                        )
                      }
                      placeholder="Message sent on click"
                      value={activeSuggestion.prompt}
                    />
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={suggestions.length >= MAX_CHAT_SUGGESTIONS}
                    onClick={addSuggestion}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <PlusIcon className="size-4" />
                    Add chip
                  </Button>
                  <Button
                    onClick={resetChatDefaults}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Reset starter defaults
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent className="mt-6 outline-none" value="persona">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,24rem)] lg:items-start">
            <Card className="animate-in fade-in-0 duration-300 overflow-hidden">
              <CardHeader className="border-b bg-muted/30">
                <p className="text-muted-foreground text-[10px] font-medium tracking-[0.14em] uppercase">
                  Agent profile
                </p>
                <CardTitle className="text-xl">
                  {agentDisplayName.trim() || name.trim() || "Your workspace"}
                </CardTitle>
                <CardDescription>
                  {agentDisplayName.trim()
                    ? `Assistant for ${name.trim() || "workspace"}`
                    : tagline.trim() ||
                      "Set a display name so guests know who is chatting."}
                </CardDescription>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Badge variant="secondary">{agentTone}</Badge>
                  <Badge variant="outline">
                    {agentReplyLocale === "auto"
                      ? "Match guest UI"
                      : agentReplyLocale === "vi"
                        ? "VI first"
                        : "EN first"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 pt-6">
                <div className="space-y-2">
                  <p className="text-sm font-medium">About</p>
                  <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">
                    {about.trim() || "Click a starter or write about below."}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Hours</p>
                  <div className="flex flex-wrap gap-2">
                    {(hoursRawMode
                      ? parseBulletLines(businessHours)
                      : hourLines
                    ).length > 0 ? (
                      (hoursRawMode
                        ? parseBulletLines(businessHours)
                        : hourLines
                      ).map((line) => (
                        <Badge key={line} variant="secondary">
                          {line}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        No hours yet
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Services</p>
                  <div className="flex flex-wrap gap-2">
                    {(servicesRawMode
                      ? parseServiceTags(servicesSummary)
                      : serviceTags
                    ).length > 0 ? (
                      (servicesRawMode
                        ? parseServiceTags(servicesSummary)
                        : serviceTags
                      ).map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        No services yet
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-muted-foreground text-xs">
                  FAQ: {faqItems.length} saved item
                  {faqItems.length === 1 ? "" : "s"}.{" "}
                  <Link
                    className="underline underline-offset-4"
                    href="/dashboard/faq"
                  >
                    Train answers in FAQ →
                  </Link>
                </p>
              </CardContent>
            </Card>

            <div className="animate-in fade-in-0 slide-in-from-right-2 duration-300 space-y-4 lg:sticky lg:top-28">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Persona</CardTitle>
                  <CardDescription>
                    How the agent sounds and what background it uses with FAQ.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
                    <p className="text-sm font-medium">Voice & reply</p>
                    <div className="space-y-2">
                      <Label htmlFor="agent_display_name_ui">
                        Agent display name
                      </Label>
                      <Input
                        id="agent_display_name_ui"
                        onChange={(e) => setAgentDisplayName(e.target.value)}
                        placeholder="e.g. Lan, Mai, Clinic assistant"
                        value={agentDisplayName}
                      />
                      <p className="text-muted-foreground text-xs">
                        How the model introduces itself (not the empty-state
                        eyebrow).
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Tone</Label>
                      <div className="grid gap-2">
                        {AGENT_TONE_OPTIONS.map((opt) => (
                          <button
                            className={cn(
                              "rounded-lg border px-3 py-2 text-left transition-colors",
                              agentTone === opt.id
                                ? "border-foreground/30 bg-background"
                                : "hover:bg-muted/50",
                            )}
                            key={opt.id}
                            onClick={() => setAgentTone(opt.id)}
                            type="button"
                          >
                            <p className="text-sm font-medium">{opt.label}</p>
                            <p className="text-muted-foreground text-xs">
                              {opt.blurb}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Default reply language</Label>
                      <div className="grid gap-2">
                        {AGENT_REPLY_LOCALE_OPTIONS.map((opt) => (
                          <button
                            className={cn(
                              "rounded-lg border px-3 py-2 text-left transition-colors",
                              agentReplyLocale === opt.id
                                ? "border-foreground/30 bg-background"
                                : "hover:bg-muted/50",
                            )}
                            key={opt.id}
                            onClick={() => setAgentReplyLocale(opt.id)}
                            type="button"
                          >
                            <p className="text-sm font-medium">{opt.label}</p>
                            <p className="text-muted-foreground text-xs">
                              {opt.blurb}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>About starters</Label>
                    <div className="flex flex-wrap gap-2">
                      {AGENT_ABOUT_TEMPLATES.map((tpl) => (
                        <Button
                          key={tpl.id}
                          onClick={() => setAbout(tpl.about)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {tpl.label}
                        </Button>
                      ))}
                    </div>
                    <Textarea
                      onChange={(e) => setAbout(e.target.value)}
                      placeholder="Short description of the workspace…"
                      rows={4}
                      value={about}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Business hours</Label>
                      <Button
                        onClick={() => {
                          if (hoursRawMode) {
                            setHourLines(parseBulletLines(businessHours));
                            setHoursRawMode(false);
                          } else {
                            setBusinessHours(serializeBulletLines(hourLines));
                            setHoursRawMode(true);
                          }
                        }}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {hoursRawMode ? "Use builder" : "Edit as text"}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {AGENT_HOURS_PRESETS.map((preset) => (
                        <Button
                          key={preset.id}
                          onClick={() => {
                            setBusinessHours(preset.hours);
                            setHourLines(parseBulletLines(preset.hours));
                            setHoursRawMode(false);
                          }}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                    {hoursRawMode ? (
                      <Textarea
                        onChange={(e) => setBusinessHours(e.target.value)}
                        placeholder={
                          "- Mon–Sat: 08:00–20:00\n- Sunday: 08:00–12:00"
                        }
                        rows={4}
                        value={businessHours}
                      />
                    ) : (
                      <div className="space-y-2">
                        {hourLines.map((line, index) => (
                          <div className="flex gap-2" key={`h-${index}`}>
                            <Input
                              onChange={(e) =>
                                setHourLines((prev) =>
                                  prev.map((l, i) =>
                                    i === index ? e.target.value : l,
                                  ),
                                )
                              }
                              placeholder="Mon–Fri: 09:00–17:00"
                              value={line}
                            />
                            <Button
                              aria-label="Remove hours line"
                              onClick={() =>
                                setHourLines((prev) =>
                                  prev.filter((_, i) => i !== index),
                                )
                              }
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <Trash2Icon className="size-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          onClick={() =>
                            setHourLines((prev) => [...prev, ""])
                          }
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <PlusIcon className="size-4" />
                          Add line
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Services</Label>
                      <Button
                        onClick={() => {
                          if (servicesRawMode) {
                            setServiceTags(parseServiceTags(servicesSummary));
                            setServicesRawMode(false);
                          } else {
                            setServicesSummary(
                              serializeServiceTags(serviceTags),
                            );
                            setServicesRawMode(true);
                          }
                        }}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {servicesRawMode ? "Use tags" : "Edit as text"}
                      </Button>
                    </div>
                    {servicesRawMode ? (
                      <Textarea
                        onChange={(e) => setServicesSummary(e.target.value)}
                        placeholder={
                          "- Tư vấn / Consultation (30 phút) — Có thể đặt lịch trực tiếp qua chat.\n- Khám / điều trị dài hơn — nhân viên xếp lịch"
                        }
                        rows={4}
                        value={servicesSummary}
                      />
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {serviceTags.map((tag) => (
                            <button
                              className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-3 py-1 text-xs transition-colors hover:bg-muted"
                              key={tag}
                              onClick={() =>
                                setServiceTags((prev) =>
                                  prev.filter((t) => t !== tag),
                                )
                              }
                              type="button"
                            >
                              {tag}
                              <Trash2Icon className="size-3 opacity-60" />
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            onChange={(e) => setServiceDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addServiceTag();
                              }
                            }}
                            placeholder="Add a service…"
                            value={serviceDraft}
                          />
                          <Button
                            onClick={addServiceTag}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <Collapsible
                    onOpenChange={setAdvancedOpen}
                    open={advancedOpen}
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium"
                        type="button"
                      >
                        Advanced — handoff & instructions
                        <ChevronDownIcon
                          className={cn(
                            "size-4 text-muted-foreground transition-transform",
                            advancedOpen && "rotate-180",
                          )}
                        />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-3 pt-3">
                      <div className="space-y-2">
                        <Label htmlFor="agent_handoff_ui">Human handoff</Label>
                        <Textarea
                          id="agent_handoff_ui"
                          onChange={(e) => setAgentHandoff(e.target.value)}
                          placeholder={
                            "When the guest needs something outside booking / FAQ, offer to call 090… or email hello@…"
                          }
                          rows={3}
                          value={agentHandoff}
                        />
                        <p className="text-muted-foreground text-xs">
                          Injected into every reply turn — when to pass to a
                          person.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {AGENT_INSTRUCTIONS_STARTERS.map((starter) => (
                          <Button
                            key={starter.id}
                            onClick={() =>
                              setAgentInstructions(starter.instructions)
                            }
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {starter.label}
                          </Button>
                        ))}
                      </div>
                      <Textarea
                        onChange={(e) => setAgentInstructions(e.target.value)}
                        placeholder="- Tone extras, what not to promise…"
                        rows={5}
                        value={agentInstructions}
                      />
                      <p className="text-muted-foreground text-xs">
                        Operational notes only — does not replace FAQ Q&amp;A.
                      </p>
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent className="mt-6 outline-none" value="booking">
          <div className="mx-auto max-w-3xl animate-in fade-in-0 duration-300 space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                AI booking meeting type
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                The agent checks slots and books with this Cal.com type. Manage
                the list under{" "}
                <Link
                  className="underline underline-offset-4"
                  href="/dashboard/meeting-types"
                >
                  Meeting types
                </Link>
                .
              </p>
            </div>

            {meetingTypes.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No meeting types yet.{" "}
                  <Link
                    className="underline underline-offset-4"
                    href="/dashboard/meeting-types"
                  >
                    Sync or create one
                  </Link>
                  .
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {meetingTypes.map((row) => {
                  const selected = row.is_ai_booking;
                  return (
                    <button
                      className={cn(
                        "rounded-xl border p-4 text-left transition-all",
                        selected
                          ? "border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/30"
                          : "hover:border-foreground/20 hover:bg-muted/40",
                        selectPending && "pointer-events-none opacity-70",
                      )}
                      disabled={selectPending}
                      key={row.id}
                      onClick={() => {
                        if (selected) return;
                        startSelect(async () => {
                          const result =
                            await setAiBookingMeetingTypeAction(row.id);
                          if (result.error) toast.error(result.error);
                          else if (result.success) {
                            toast.success(result.success);
                            router.refresh();
                          }
                        });
                      }}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{row.title}</p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {row.length_minutes} min · `{row.slug}`
                          </p>
                        </div>
                        {selected ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                            AI uses this
                          </Badge>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {!aiRow && meetingTypes.length > 0 ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                No AI meeting type selected yet — pick a card above.
              </p>
            ) : null}

            <p className="text-muted-foreground text-xs">
              <Link
                className="underline underline-offset-4"
                href="/dashboard/faq"
              >
                Train answers in FAQ →
              </Link>
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {state.error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
