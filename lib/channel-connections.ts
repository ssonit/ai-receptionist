/**
 * Per-workspace messaging channel credentials, provider-agnostic.
 *
 * Secrets are encrypted here and nowhere else, and every read goes through the
 * service-role client — the table has RLS on with no `authenticated` policies.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/workspace-secrets";

export type ChannelProvider = "messenger" | "zalo";

export type ChannelConnection = {
  workspaceId: string;
  provider: ChannelProvider;
  externalId: string;
  displayName: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  metadata: Record<string, unknown>;
};

/** Thrown when an external account already belongs to another workspace. */
export const CHANNEL_EXTERNAL_ID_TAKEN = "CHANNEL_EXTERNAL_ID_TAKEN";

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

/** A lock held longer than this belonged to an instance that died. */
const LOCK_STALE_MS = 30_000;

const ROW_SELECT =
  "workspace_id, provider, external_id, display_name, access_encrypted, refresh_encrypted, expires_at, metadata";

type Row = {
  workspace_id: string;
  provider: string;
  external_id: string;
  display_name: string | null;
  access_encrypted: string | null;
  refresh_encrypted: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown> | null;
};

/**
 * Decrypt defensively: a row encrypted under a rotated key would otherwise
 * throw deep inside a webhook handler instead of reading as "not connected".
 */
function safeDecrypt(value: string | null): string | null {
  if (!value) return null;
  try {
    return decryptSecret(value);
  } catch {
    return null;
  }
}

function toConnection(row: Row): ChannelConnection {
  return {
    workspaceId: row.workspace_id,
    provider: row.provider as ChannelProvider,
    externalId: row.external_id,
    displayName: row.display_name,
    accessToken: safeDecrypt(row.access_encrypted),
    refreshToken: safeDecrypt(row.refresh_encrypted),
    expiresAt: row.expires_at,
    metadata: row.metadata ?? {},
  };
}

export async function getChannelConnection(
  workspaceId: string,
  provider: ChannelProvider,
): Promise<ChannelConnection | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("workspace_channel_connections")
    .select(ROW_SELECT)
    .eq("workspace_id", workspaceId)
    .eq("provider", provider)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toConnection(data as Row) : null;
}

export async function getChannelConnectionByExternalId(
  provider: ChannelProvider,
  externalId: string,
): Promise<ChannelConnection | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("workspace_channel_connections")
    .select(ROW_SELECT)
    .eq("provider", provider)
    .eq("external_id", externalId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toConnection(data as Row) : null;
}

export async function upsertChannelConnection(input: {
  workspaceId: string;
  provider: ChannelProvider;
  externalId: string;
  displayName?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createAdminClient();

  const row: Record<string, unknown> = {
    workspace_id: input.workspaceId,
    provider: input.provider,
    external_id: input.externalId,
    display_name: input.displayName ?? null,
    expires_at: input.expiresAt ?? null,
    metadata: input.metadata ?? {},
    refresh_lock_at: null,
    updated_at: new Date().toISOString(),
  };
  if (input.accessToken !== undefined) {
    row.access_encrypted = input.accessToken ? encryptSecret(input.accessToken) : null;
  }
  if (input.refreshToken !== undefined) {
    row.refresh_encrypted = input.refreshToken ? encryptSecret(input.refreshToken) : null;
  }

  const { error } = await supabase
    .from("workspace_channel_connections")
    .upsert(row, { onConflict: "workspace_id,provider" });

  if (error) {
    // The (provider, external_id) index — this account belongs to someone else.
    if (error.code === UNIQUE_VIOLATION) throw new Error(CHANNEL_EXTERNAL_ID_TAKEN);
    throw new Error(error.message);
  }
}

export async function deleteChannelConnection(
  workspaceId: string,
  provider: ChannelProvider,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("workspace_channel_connections")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("provider", provider);

  if (error) throw new Error(error.message);
}

/**
 * Claim the right to refresh this connection's token.
 *
 * Zalo refresh tokens are single-use: two concurrent refreshes leave the
 * workspace with no valid credential at all. The claim is a conditional UPDATE
 * so the lock holds across serverless instances, not just within one process.
 */
export async function claimRefreshLock(
  workspaceId: string,
  provider: ChannelProvider,
): Promise<{ claimed: boolean; refreshToken: string | null }> {
  const supabase = createAdminClient();
  const staleCutoff = new Date(Date.now() - LOCK_STALE_MS).toISOString();

  const { data, error } = await supabase
    .from("workspace_channel_connections")
    .update({ refresh_lock_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("provider", provider)
    .or(`refresh_lock_at.is.null,refresh_lock_at.lt.${staleCutoff}`)
    .select("refresh_encrypted");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return { claimed: false, refreshToken: null };

  return {
    claimed: true,
    refreshToken: safeDecrypt((data[0] as { refresh_encrypted: string | null }).refresh_encrypted),
  };
}

export async function releaseRefreshLock(
  workspaceId: string,
  provider: ChannelProvider,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("workspace_channel_connections")
    .update({ refresh_lock_at: null })
    .eq("workspace_id", workspaceId)
    .eq("provider", provider);

  if (error) console.error("[channel-connections] lock release failed", error.message);
}
