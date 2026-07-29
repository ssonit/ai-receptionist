import slugify from "slugify";
import { parseEmbedWorkspaceKey } from "@/lib/embed";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/workspace-secrets";
import { bookingConfig } from "@/lib/booking-config";
import { parseChatSuggestions } from "@/lib/chat-branding";
import {
  parseServiceMode,
  type WorkspaceServiceMode,
} from "@/lib/guest-timezone";
import { withWorkspaceAiDefaults } from "@/lib/workspace-ai-defaults";

/** Pilot / default workspace id for local demo + Eve CLI fallback. */
export const PILOT_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";

/** @deprecated Prefer getSessionWorkspaceId from workspace-session / resolveWorkspaceId* */
export function getPilotWorkspaceId(): string {
  return (
    process.env.NEXT_PUBLIC_BOOKING_WORKSPACE_ID?.trim() ||
    process.env.BOOKING_WORKSPACE_ID?.trim() ||
    PILOT_WORKSPACE_ID
  );
}

export function getDefaultWorkspaceId(): string {
  return getPilotWorkspaceId();
}

/**
 * Booking-page / meeting-type slug.
 *
 * Uses npm `slugify` with `locale: "vi"` (đ/Đ → d, diacritics stripped).
 *
 * KEEP IN SYNC with Postgres `public.slugify_workspace_name`
 * (`supabase/migrations/20260724000004_slugify_vietnamese.sql` and init_schema):
 * same contract — lower, hyphen, [a-z0-9] only, max 48, fallback `ws` if < 2 chars,
 * Vietnamese via unaccent+đ, and `&`→`and` / `@`→`at` like this package.
 * Signup trigger can only run SQL; live preview + server actions use this TS helper.
 * Collision policy differs by design: SQL auto-appends -1,-2; Settings rejects duplicates.
 */
export function slugifyWorkspaceName(name: string): string {
  const base = slugify(name.trim(), {
    lower: true,
    strict: true,
    locale: "vi",
    trim: true,
  }).slice(0, 48);
  return base.length >= 2 ? base : "ws";
}

/**
 * Pre-fix SQL signup slugify — dropped Vietnamese letters instead of
 * transliterating (`Phòng` → `ph-ng`). Used to heal settings UI.
 */
export function legacyAsciiOnlySlugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base.length >= 2 ? base : "ws";
}

/** Prefer a corrected slug when DB still has the legacy broken form. */
export function resolveWorkspaceSlugField(
  name: string | null | undefined,
  storedSlug: string | null | undefined,
): string {
  const nameTrim = name?.trim() ?? "";
  const stored = storedSlug?.trim() ?? "";
  const good = nameTrim ? slugifyWorkspaceName(nameTrim) : "";
  if (!stored) return good;
  if (
    nameTrim &&
    stored === legacyAsciiOnlySlugify(nameTrim) &&
    good !== stored
  ) {
    return good;
  }
  return stored;
}

export type WorkspaceTenant = {
  id: string;
  name: string;
  slug: string | null;
  timezone: string;
  service_mode: WorkspaceServiceMode;
  cal_username: string | null;
  cal_event_type_id: number | null;
  cal_event_type_slug: string | null;
  setup_completed_at: string | null;
  has_cal_key: boolean;
};

export async function getWorkspaceById(
  workspaceId: string,
): Promise<WorkspaceTenant | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select(
      "id, name, slug, timezone, service_mode, cal_username, cal_event_type_id, cal_event_type_slug, setup_completed_at, cal_api_key_encrypted",
    )
    .eq("id", workspaceId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    timezone: data.timezone,
    service_mode: parseServiceMode(data.service_mode as string | null),
    cal_username: data.cal_username,
    cal_event_type_id: data.cal_event_type_id,
    cal_event_type_slug: data.cal_event_type_slug,
    setup_completed_at: data.setup_completed_at,
    has_cal_key: Boolean(data.cal_api_key_encrypted),
  };
}

export async function resolveWorkspaceIdBySlug(
  slug: string | null | undefined,
): Promise<string | null> {
  const cleaned = slug?.trim().toLowerCase();
  if (!cleaned) return null;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("workspaces")
    .select("id")
    .eq("slug", cleaned)
    .maybeSingle();

  return data?.id ?? null;
}

/** Resolve tenant for public chat (?w=slug) with pilot fallback only when slug omitted. */
export async function resolvePublicWorkspaceId(
  slug?: string | null,
): Promise<string> {
  const cleaned = slug?.trim().toLowerCase();
  if (!cleaned) return getDefaultWorkspaceId();

  const fromSlug = await resolveWorkspaceIdBySlug(cleaned);
  if (fromSlug) return fromSlug;

  // Explicit tenant slug that does not resolve must NOT fall back to Eve Pilot
  // (that would mix visitor chat into the demo workspace).
  throw new Error(`Workspace does not exist: ${cleaned}`);
}

export type PublicBookingWorkspace = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  about: string | null;
  businessHours: string | null;
  servicesSummary: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  setupCompletedAt: string | null;
  /** Derived: Cal key + AI meeting type — gates public /b/[slug]. */
  bookingLive: boolean;
  /** Soft embed gate — empty = allow all hosts. */
  embedAllowedOrigins: string[];
  faqItems: { question: string; answer: string }[];
  chatAssistantLabel: string | null;
  chatIntro: string | null;
  chatSuggestions: unknown;
  chatPlaceholder: string | null;
};

const PUBLIC_BOOKING_SELECT =
  "id, name, slug, tagline, about, business_hours, services_summary, phone, email, address, website, setup_completed_at, cal_api_key_encrypted, cal_event_type_id, embed_allowed_origins, chat_assistant_label, chat_intro, chat_suggestions, chat_placeholder, workspace_faq_items(question, answer, sort_order)";

type PublicBookingRow = {
  id: string;
  name: string;
  slug: string | null;
  tagline: string | null;
  about: string | null;
  business_hours: string | null;
  services_summary: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  setup_completed_at: string | null;
  cal_api_key_encrypted: string | null;
  cal_event_type_id: number | null;
  embed_allowed_origins?: string[] | null;
  chat_assistant_label: string | null;
  chat_intro: string | null;
  chat_suggestions: unknown;
  chat_placeholder: string | null;
  workspace_faq_items?:
    | { question: string; answer: string; sort_order?: number }
    | { question: string; answer: string; sort_order?: number }[]
    | null;
};

function mapPublicBookingWorkspace(
  data: PublicBookingRow,
): PublicBookingWorkspace | null {
  if (!data.slug) return null;

  const rawFaq = data.workspace_faq_items;
  const faqRows = Array.isArray(rawFaq) ? rawFaq : rawFaq ? [rawFaq] : [];
  const faqItems: { question: string; answer: string }[] = [];
  for (const row of [...faqRows].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  )) {
    if (faqItems.length >= 5) break;
    const question = String(row.question ?? "").trim();
    if (!question) continue;
    faqItems.push({
      question,
      answer: String(row.answer ?? ""),
    });
  }

  const filled = withWorkspaceAiDefaults({
    tagline: data.tagline ?? null,
    about: data.about ?? null,
    businessHours: data.business_hours ?? null,
    servicesSummary: data.services_summary ?? null,
    chatAssistantLabel: data.chat_assistant_label ?? null,
    chatIntro: data.chat_intro ?? null,
    chatPlaceholder: data.chat_placeholder ?? null,
    chatSuggestions: parseChatSuggestions(data.chat_suggestions),
  });

  const id = data.id;
  const bookingLive = isPilotBookingLive({
    workspaceId: id,
    hasEncryptedCalKey: Boolean(data.cal_api_key_encrypted),
    calEventTypeId: data.cal_event_type_id,
  });

  const embedAllowedOrigins = Array.isArray(data.embed_allowed_origins)
    ? data.embed_allowed_origins.filter(
        (h): h is string => typeof h === "string" && h.trim().length > 0,
      )
    : [];

  return {
    id,
    name: data.name,
    slug: data.slug,
    tagline: filled.tagline,
    about: filled.about,
    businessHours: filled.businessHours,
    servicesSummary: filled.servicesSummary,
    phone: data.phone ?? null,
    email: data.email ?? null,
    address: data.address ?? null,
    website: data.website ?? null,
    setupCompletedAt: data.setup_completed_at ?? null,
    bookingLive,
    embedAllowedOrigins,
    faqItems,
    chatAssistantLabel: filled.chatAssistantLabel,
    chatIntro: filled.chatIntro,
    chatSuggestions: filled.chatSuggestions,
    chatPlaceholder: filled.chatPlaceholder,
  };
}

/** Public booking page `/b/[slug]` — service role (RLS is auth-only). */
export async function getPublicBookingWorkspace(
  slug: string,
): Promise<PublicBookingWorkspace | null> {
  const cleaned = slug.trim().toLowerCase();
  if (!cleaned) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select(PUBLIC_BOOKING_SELECT)
    .eq("slug", cleaned)
    .maybeSingle();

  if (error || !data) return null;
  return mapPublicBookingWorkspace(data as PublicBookingRow);
}

/** Public embed by stable workspace UUID (Site ID / data-eve-id). */
export async function getPublicBookingWorkspaceById(
  workspaceId: string,
): Promise<PublicBookingWorkspace | null> {
  const id = workspaceId.trim().toLowerCase();
  if (!id) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select(PUBLIC_BOOKING_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return mapPublicBookingWorkspace(data as PublicBookingRow);
}

/** Resolve `/embed/[key]` by Site ID (`chat_<uuid>` / UUID) or legacy slug. */
export async function resolvePublicEmbedWorkspace(
  key: string,
): Promise<PublicBookingWorkspace | null> {
  const parsed = parseEmbedWorkspaceKey(key);
  if (!parsed) return null;
  if (parsed.kind === "id") {
    return getPublicBookingWorkspaceById(parsed.id);
  }
  return getPublicBookingWorkspace(parsed.slug);
}

export function publicBookingPath(slug: string): string {
  return `/b/${encodeURIComponent(slug.trim().toLowerCase())}`;
}

/** Browser → Eve HTTP: public booking slug (`/b/[slug]` or `?w=`). */
export const EVE_WORKSPACE_HEADER = "x-eve-w";
/** Browser → Eve HTTP: Supabase `chat_sessions.id` for reliable tenant lookup. */
export const EVE_CHAT_SESSION_HEADER = "x-eve-chat-session";

function authAttr(
  attributes: Readonly<Record<string, string | readonly string[]>> | undefined,
  key: string,
): string | null {
  const raw = attributes?.[key];
  if (typeof raw === "string") {
    const v = raw.trim();
    return v.length > 0 ? v : null;
  }
  if (Array.isArray(raw) && typeof raw[0] === "string") {
    const v = raw[0].trim();
    return v.length > 0 ? v : null;
  }
  return null;
}

/**
 * Agent tools: map Eve/chat session → workspace_id.
 * Falls back to default workspace for CLI / legacy sessions.
 */
export async function resolveWorkspaceIdForAgentSession(
  sessionId: string | null | undefined,
): Promise<string> {
  if (sessionId?.trim()) {
    const supabase = createAdminClient();
    const id = sessionId.trim();
    const { data } = await supabase
      .from("chat_sessions")
      .select("workspace_id")
      .or(`id.eq.${id},eve_session_id.eq.${id}`)
      .not("workspace_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (data?.workspace_id) return data.workspace_id as string;
  }
  return getDefaultWorkspaceId();
}

/**
 * Resolve tenant for agent tools / instructions / skills.
 * Prefer auth attributes from {@link EVE_CHAT_SESSION_HEADER} /
 * {@link EVE_WORKSPACE_HEADER}, then Eve session → chat_sessions link.
 *
 * If the request carried a tenant hint (slug / chat session) but lookup
 * fails, refuse to fall back to Eve Pilot — wrong-tenant writes are worse
 * than a tool error.
 */
export async function resolveWorkspaceIdFromAgentContext(input: {
  sessionId?: string | null;
  auth?: {
    attributes?: Readonly<Record<string, string | readonly string[]>>;
  } | null;
}): Promise<string> {
  const attrs = input.auth?.attributes;
  const chatSessionId = authAttr(attrs, "chatSessionId");
  const slug = authAttr(attrs, "workspaceSlug");
  const hadTenantHint = Boolean(chatSessionId || slug);

  if (chatSessionId) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("chat_sessions")
      .select("workspace_id")
      .eq("id", chatSessionId)
      .not("workspace_id", "is", null)
      .maybeSingle();
    if (data?.workspace_id) return data.workspace_id as string;
  }

  if (slug) {
    const fromSlug = await resolveWorkspaceIdBySlug(slug);
    if (fromSlug) return fromSlug;
  }

  if (input.sessionId?.trim()) {
    const supabase = createAdminClient();
    const id = input.sessionId.trim();
    const { data } = await supabase
      .from("chat_sessions")
      .select("workspace_id")
      .or(`id.eq.${id},eve_session_id.eq.${id}`)
      .not("workspace_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (data?.workspace_id) return data.workspace_id as string;
  }

  if (hadTenantHint) {
    throw new Error(
      "Could not determine workspace from chat session — refusing to write to another workspace.",
    );
  }

  // CLI / Eve Pilot demo only (no tenant headers).
  return getDefaultWorkspaceId();
}

/**
 * Cal.com API key for a workspace.
 * - Eve Pilot (marketing `/chat` demo): always from env `CALCOM_API_KEY`.
 * - Real tenants: only their encrypted workspace key (never the shared env key).
 */
export async function getCalApiKeyForWorkspace(
  workspaceId: string,
): Promise<string> {
  const pilotId = getDefaultWorkspaceId();
  if (workspaceId === pilotId || workspaceId === PILOT_WORKSPACE_ID) {
    const envKey = bookingConfig.cal.apiKey?.trim();
    if (envKey) return envKey;
    throw new Error(
      "Eve Pilot demo requires CALCOM_API_KEY in env (sandbox calendar).",
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select("cal_api_key_encrypted")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (data?.cal_api_key_encrypted) {
    return decryptSecret(data.cal_api_key_encrypted);
  }

  throw new Error(
    "Cal.com API key is not configured. Go to Setup / Settings to paste the workspace API key.",
  );
}

export async function isWorkspaceSetupComplete(
  workspaceId: string,
): Promise<boolean> {
  const ws = await getWorkspaceById(workspaceId);
  return Boolean(ws?.setup_completed_at);
}

/** True when the workspace can accept real bookings (Cal key + AI meeting type). */
export async function isWorkspaceBookingLive(
  workspaceId: string,
): Promise<boolean> {
  const ws = await getWorkspaceById(workspaceId);
  if (!ws) return false;
  return isPilotBookingLive({
    workspaceId: ws.id,
    hasEncryptedCalKey: ws.has_cal_key,
    calEventTypeId: ws.cal_event_type_id,
  });
}

/**
 * Pilot marketing demo (`/chat`, `/b/eve-pilot`) uses env `CALCOM_*`, not an
 * encrypted workspace key. Tenants need encrypted key + AI meeting type.
 */
export function isPilotBookingLive(input: {
  workspaceId: string;
  hasEncryptedCalKey: boolean;
  calEventTypeId: number | null | undefined;
}): boolean {
  const pilotId = getDefaultWorkspaceId();
  const isPilot =
    input.workspaceId === pilotId || input.workspaceId === PILOT_WORKSPACE_ID;

  if (isPilot) {
    const envKey = bookingConfig.cal.apiKey?.trim();
    if (!envKey) return false;
    if (input.calEventTypeId) return true;
    if (bookingConfig.cal.eventTypeId) return true;
    return Boolean(
      bookingConfig.cal.username?.trim() &&
        bookingConfig.cal.eventTypeSlug?.trim(),
    );
  }

  return Boolean(input.hasEncryptedCalKey && input.calEventTypeId);
}
