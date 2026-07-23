import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/workspace-secrets";
import { bookingConfig } from "@/lib/booking-config";

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

export function slugifyWorkspaceName(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    // đ/Đ do not decompose under NFD/NFKD
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base.length >= 2 ? base : "ws";
}

export type WorkspaceTenant = {
  id: string;
  name: string;
  slug: string | null;
  timezone: string;
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
      "id, name, slug, timezone, cal_username, cal_event_type_id, cal_event_type_slug, setup_completed_at, cal_api_key_encrypted",
    )
    .eq("id", workspaceId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    timezone: data.timezone,
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

/** Resolve tenant for public chat (?w=slug) with pilot fallback. */
export async function resolvePublicWorkspaceId(
  slug?: string | null,
): Promise<string> {
  const fromSlug = await resolveWorkspaceIdBySlug(slug);
  if (fromSlug) return fromSlug;
  return getDefaultWorkspaceId();
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
  faqItems: { question: string; answer: string }[];
};

/** Public booking page `/b/[slug]` — service role (RLS is auth-only). */
export async function getPublicBookingWorkspace(
  slug: string,
): Promise<PublicBookingWorkspace | null> {
  const cleaned = slug.trim().toLowerCase();
  if (!cleaned) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select(
      "id, name, slug, tagline, about, business_hours, services_summary, phone, email, address, website, setup_completed_at, workspace_faq_items(question, answer, sort_order)",
    )
    .eq("slug", cleaned)
    .maybeSingle();

  if (error || !data?.slug) return null;

  const rawFaq = data.workspace_faq_items;
  const faqRows = Array.isArray(rawFaq) ? rawFaq : rawFaq ? [rawFaq] : [];
  const faqItems = [...faqRows]
    .sort(
      (a, b) =>
        ((a as { sort_order?: number }).sort_order ?? 0) -
        ((b as { sort_order?: number }).sort_order ?? 0),
    )
    .slice(0, 5)
    .map((row) => ({
      question: String((row as { question: string }).question ?? ""),
      answer: String((row as { answer: string }).answer ?? ""),
    }))
    .filter((row) => row.question.trim());

  return {
    id: data.id as string,
    name: data.name as string,
    slug: data.slug as string,
    tagline: (data.tagline as string | null) ?? null,
    about: (data.about as string | null) ?? null,
    businessHours: (data.business_hours as string | null) ?? null,
    servicesSummary: (data.services_summary as string | null) ?? null,
    phone: (data.phone as string | null) ?? null,
    email: (data.email as string | null) ?? null,
    address: (data.address as string | null) ?? null,
    website: (data.website as string | null) ?? null,
    setupCompletedAt: (data.setup_completed_at as string | null) ?? null,
    faqItems,
  };
}

export function publicBookingPath(slug: string): string {
  return `/b/${encodeURIComponent(slug.trim().toLowerCase())}`;
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
      "Demo Eve Pilot cần CALCOM_API_KEY trong env (sandbox calendar).",
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
    "Cal.com API key chưa cấu hình. Vào Setup / Settings để dán API key của workspace.",
  );
}

export async function isWorkspaceSetupComplete(
  workspaceId: string,
): Promise<boolean> {
  const ws = await getWorkspaceById(workspaceId);
  return Boolean(ws?.setup_completed_at);
}
