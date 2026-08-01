import { randomBytes } from "node:crypto";
import slugify from "slugify";
import { parseEmbedWorkspaceKey } from "@/lib/embed";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/workspace-secrets";
import { isDefinitiveCalOAuthError, refreshAccessToken } from "@/lib/cal-oauth";
import { bookingConfig } from "@/lib/booking-config";
import { parseChatSuggestions } from "@/lib/chat-branding";
import { getBillingMode, isSubActive, type SubscriptionStatus } from "@/lib/billing";
import { APP_ERROR_CODE, AppError } from "@/lib/errors";
import { DEFAULT_LOCALE, parseAppLocale, type AppLocale } from "@/lib/locale";
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
  cal_auth_mode: string | null;
};

export async function getWorkspaceById(
  workspaceId: string,
): Promise<WorkspaceTenant | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select(
      "id, name, slug, timezone, service_mode, cal_username, cal_event_type_id, cal_event_type_slug, setup_completed_at, cal_api_key_encrypted, cal_auth_mode",
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
    cal_auth_mode: (data.cal_auth_mode as string) ?? null,
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
  "id, name, slug, tagline, about, business_hours, services_summary, phone, email, address, website, setup_completed_at, cal_api_key_encrypted, cal_event_type_id, cal_auth_mode, embed_allowed_origins, chat_assistant_label, chat_intro, chat_suggestions, chat_placeholder, workspace_faq_items(question, answer, sort_order)";

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
  cal_auth_mode?: string | null;
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
    calAuthMode: data.cal_auth_mode,
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

export function authAttr(
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

  let workspaceId: string | null = null;

  if (chatSessionId) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("chat_sessions")
      .select("workspace_id")
      .eq("id", chatSessionId)
      .not("workspace_id", "is", null)
      .maybeSingle();
    if (data?.workspace_id) workspaceId = data.workspace_id as string;
  }

  if (!workspaceId && slug) {
    workspaceId = await resolveWorkspaceIdBySlug(slug);
  }

  if (!workspaceId && input.sessionId?.trim()) {
    const supabase = createAdminClient();
    const id = input.sessionId.trim();
    const { data } = await supabase
      .from("chat_sessions")
      .select("workspace_id")
      .or(`id.eq.${id},eve_session_id.eq.${id}`)
      .not("workspace_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (data?.workspace_id) workspaceId = data.workspace_id as string;
  }

  if (!workspaceId) {
    if (hadTenantHint) {
      throw new Error(
        "Could not determine workspace from chat session — refusing to write to another workspace.",
      );
    }
    // CLI / Eve Pilot demo only (no tenant headers).
    return getDefaultWorkspaceId();
  }

  await assertWorkspaceSubscriptionActive(workspaceId);

  return workspaceId;
}

/**
 * Subscription gate for the AI receptionist. Pilot demo and `BILLING_MODE=test`
 * always pass.
 *
 * Fails **closed**: a workspace row we cannot read is treated as inactive. An
 * unreadable billing row must never silently unlock paid capacity — the guest
 * sees the same "booking paused" copy either way.
 *
 * @throws AppError SUBSCRIPTION_INACTIVE
 */
export async function assertWorkspaceSubscriptionActive(
  workspaceId: string,
): Promise<void> {
  if (
    workspaceId === getDefaultWorkspaceId() ||
    workspaceId === PILOT_WORKSPACE_ID ||
    getBillingMode() === "none" ||
    getBillingMode() === "test"
  ) {
    return;
  }

  const supabase = createAdminClient();
  const { data: ws, error } = await supabase
    .from("workspaces")
    .select("plan_tier, subscription_status, trial_ends_at")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error || !ws) {
    console.error(
      `[billing] could not read billing state for workspace ${workspaceId} — blocking`,
      error,
    );
    throw new AppError(APP_ERROR_CODE.SUBSCRIPTION_INACTIVE);
  }

  const active = isSubActive({
    planTier: (ws.plan_tier as "free" | "starter" | "pro") ?? "free",
    subscriptionStatus: (ws.subscription_status as SubscriptionStatus | null) ?? null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    trialEndsAt: (ws.trial_ends_at as string | null) ?? null,
  });

  if (!active) {
    throw new AppError(APP_ERROR_CODE.SUBSCRIPTION_INACTIVE);
  }
}

/**
 * True when the workspace has any usable Cal credential
 * (OAuth tokens, encrypted API key, or legacy non-null encrypted key).
 */
export function hasCalCredential(row: {
  cal_auth_mode?: string | null;
  cal_api_key_encrypted?: string | null;
}): boolean {
  if (row.cal_auth_mode === "oauth" || row.cal_auth_mode === "api_key") return true;
  return Boolean(row.cal_api_key_encrypted);
}

/**
 * Resolve a Cal.com Bearer token for a workspace.
 * - Eve Pilot: env `CALCOM_API_KEY`
 * - OAuth: decrypt + auto-refresh on expiry
 * - API key: decrypt encrypted workspace key
 */
export async function getCalAccessTokenForWorkspace(
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
    .select(
      "cal_api_key_encrypted, cal_auth_mode, cal_oauth_access_encrypted, cal_oauth_refresh_encrypted, cal_oauth_expires_at",
    )
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Workspace not found");

  // OAuth — auto-refresh if expiring within 60 seconds
  if (data.cal_auth_mode === "oauth") {
    if (data.cal_oauth_access_encrypted && data.cal_oauth_refresh_encrypted) {
      const expiresAt = data.cal_oauth_expires_at
        ? new Date(data.cal_oauth_expires_at as string).getTime()
        : 0;
      const now = Date.now();

      if (expiresAt - 60_000 > now) {
        return decryptSecret(data.cal_oauth_access_encrypted as string);
      }

      // Refresh
      const refreshToken = decryptSecret(data.cal_oauth_refresh_encrypted as string);
      let newTokens;
      try {
        newTokens = await refreshAccessToken(refreshToken);
      } catch (refreshError) {
        // Cal.com rotates the refresh token, so a concurrent request that
        // refreshed first leaves ours invalid. Re-read before concluding the
        // credentials are dead — otherwise a busy tenant disconnects itself.
        const { data: fresh } = await supabase
          .from("workspaces")
          .select("cal_oauth_access_encrypted, cal_oauth_refresh_encrypted")
          .eq("id", workspaceId)
          .maybeSingle();

        if (
          fresh?.cal_oauth_access_encrypted &&
          fresh.cal_oauth_refresh_encrypted !== data.cal_oauth_refresh_encrypted
        ) {
          return decryptSecret(fresh.cal_oauth_access_encrypted as string);
        }

        // Only a rejected grant means the token is genuinely dead. A timeout
        // or a Cal.com 5xx must not wipe a working integration — the owner
        // would have to redo the whole OAuth flow over a blip.
        if (!isDefinitiveCalOAuthError(refreshError)) {
          console.error(
            `[cal-oauth] transient refresh failure for workspace ${workspaceId}`,
            refreshError,
          );
          throw new Error("CAL_OAUTH_REFRESH_FAILED");
        }

        await supabase
          .from("workspaces")
          .update({
            cal_oauth_access_encrypted: null,
            cal_oauth_refresh_encrypted: null,
            cal_oauth_expires_at: null,
            cal_oauth_scope: null,
            cal_auth_mode: null,
          })
          .eq("id", workspaceId);
        throw new Error("CAL_OAUTH_REFRESH_FAILED");
      }

      const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();
      const { error: persistError } = await supabase
        .from("workspaces")
        .update({
          cal_oauth_access_encrypted: encryptSecret(newTokens.access_token),
          cal_oauth_refresh_encrypted: encryptSecret(newTokens.refresh_token),
          cal_oauth_expires_at: newExpiresAt,
          cal_oauth_scope: newTokens.scope,
        })
        .eq("id", workspaceId);

      // The rotated refresh token only exists in this response. Losing the
      // write means the DB keeps a refresh token Cal.com has already retired,
      // and the next refresh fails for good.
      if (persistError) {
        console.error(
          `[cal-oauth] failed to persist refreshed tokens for workspace ${workspaceId}`,
          persistError,
        );
      }

      return newTokens.access_token;
    }

    throw new Error(
      "Cal.com OAuth tokens are missing. Reconnect in Settings.",
    );
  }

  // API key (explicit mode or legacy encrypted key)
  if (data.cal_api_key_encrypted) {
    return decryptSecret(data.cal_api_key_encrypted as string);
  }

  throw new Error(
    "Cal.com is not configured. Go to Setup / Settings to connect your calendar.",
  );
}

/**
 * Cal.com API key for a workspace (thin wrapper — prefer getCalAccessTokenForWorkspace).
 * - Eve Pilot (marketing `/chat` demo): always from env `CALCOM_API_KEY`.
 * - Real tenants: only their encrypted workspace key (never the shared env key).
 */
export async function getCalApiKeyForWorkspace(
  workspaceId: string,
): Promise<string> {
  return getCalAccessTokenForWorkspace(workspaceId);
}

/**
 * Messenger page access token for a workspace (long-lived, no refresh needed).
 * - Pilot: checks env MESSENGER_PAGE_ACCESS_TOKEN (global fallback).
 * - Real tenants: decrypt from workspace row.
 */
export async function getMessengerCredentialsForWorkspace(
  workspaceId: string,
): Promise<{ pageId: string; pageAccessToken: string }> {
  const pilotId = getDefaultWorkspaceId();
  if (workspaceId === pilotId || workspaceId === PILOT_WORKSPACE_ID) {
    const envToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN?.trim();
    const envPageId = process.env.MESSENGER_PAGE_ID?.trim();
    if (envToken && envPageId) return { pageId: envPageId, pageAccessToken: envToken };
    throw new Error("MESSENGER_NOT_CONFIGURED");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select("messenger_page_id, messenger_page_access_token_encrypted")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.messenger_page_access_token_encrypted) {
    throw new Error("MESSENGER_NOT_CONFIGURED");
  }

  return {
    pageId: (data.messenger_page_id as string) ?? "",
    pageAccessToken: decryptSecret(data.messenger_page_access_token_encrypted as string),
  };
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
    calAuthMode: ws.cal_auth_mode,
  });
}

/**
 * Pilot marketing demo (`/chat`, `/b/eve-pilot`) uses env `CALCOM_*`, not an
 * encrypted workspace key. Tenants need any Cal credential + AI meeting type.
 */
export function isPilotBookingLive(input: {
  workspaceId: string;
  hasEncryptedCalKey: boolean;
  calEventTypeId: number | null | undefined;
  calAuthMode?: string | null;
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

  const hasCred = hasCalCredential({
    cal_auth_mode: input.calAuthMode,
    cal_api_key_encrypted: input.hasEncryptedCalKey ? "1" : null,
  });
  return Boolean(hasCred && input.calEventTypeId);
}

/** Generate a cryptographically random webhook secret (64 hex chars). */
function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Ensure the workspace has a webhook secret, generating one if needed.
 * Returns the plaintext secret for display in dashboard settings.
 */
export async function ensureWebhookSecret(workspaceId: string): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("workspaces")
    .select("webhook_secret_encrypted")
    .eq("id", workspaceId)
    .maybeSingle();

  if (data?.webhook_secret_encrypted) {
    return decryptSecret(data.webhook_secret_encrypted as string);
  }

  const plain = generateWebhookSecret();
  const encrypted = encryptSecret(plain);
  const { error } = await supabase
    .from("workspaces")
    .update({ webhook_secret_encrypted: encrypted })
    .eq("id", workspaceId);

  // Never hand back a secret we failed to persist — the owner would paste it
  // into Cal.com and every webhook would then fail signature verification.
  if (error) {
    console.error(
      `[webhook] failed to persist webhook secret for workspace ${workspaceId}`,
      error,
    );
    throw new AppError(APP_ERROR_CODE.WEBHOOK_SECRET_FAILED);
  }

  return plain;
}

/**
 * Resolve the webhook secret for verifying a Cal.com webhook request.
 *
 * Per-workspace secret only, except the Pilot demo which may still use the
 * shared `CALCOM_WEBHOOK_SECRET` env var — same rule as `CALCOM_API_KEY`.
 *
 * Returns null when no secret is configured at all (caller must reject).
 */
export async function getWebhookSecretForWorkspace(
  workspaceId: string,
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("workspaces")
    .select("webhook_secret_encrypted")
    .eq("id", workspaceId)
    .maybeSingle();

  if (data?.webhook_secret_encrypted) {
    return decryptSecret(data.webhook_secret_encrypted as string);
  }

  // Pilot-only fallback — real tenants must have a per-workspace secret.
  const pilotId = getPilotWorkspaceId();
  if (workspaceId === pilotId || workspaceId === PILOT_WORKSPACE_ID) {
    const envSecret = process.env.CALCOM_WEBHOOK_SECRET?.trim();
    if (envSecret) return envSecret;
  }
  return null;
}

/**
 * Reply language for channels that carry no browser locale header (Messenger,
 * Zalo, …). `agent_reply_locale` is `auto | vi | en`; `auto` means "follow the
 * guest UI", which those channels don't have, so it falls back to the default.
 */
export async function getWorkspaceReplyLocale(
  workspaceId: string,
): Promise<AppLocale> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("workspaces")
    .select("agent_reply_locale")
    .eq("id", workspaceId)
    .maybeSingle();

  const configured = (data?.agent_reply_locale as string | null)?.trim();
  if (!configured || configured === "auto") return DEFAULT_LOCALE;
  return parseAppLocale(configured);
}

/** True when the workspace has its own secret (i.e. not on the shared env one). */
export async function hasOwnWebhookSecret(
  workspaceId: string,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("workspaces")
    .select("webhook_secret_encrypted")
    .eq("id", workspaceId)
    .maybeSingle();

  return Boolean(data?.webhook_secret_encrypted);
}
