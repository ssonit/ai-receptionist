-- =============================================================================
-- Per-workspace webhook secret for Cal.com webhook signature verification.
-- Each workspace gets a unique HMAC-SHA256 secret so tenant A can't forge
-- a signed payload for workspace B.
-- =============================================================================

alter table public.workspaces
add column if not exists webhook_secret_encrypted text;

comment on column public.workspaces.webhook_secret_encrypted is
  'AES-GCM encrypted per-workspace webhook secret for Cal.com HMAC-SHA256 signature verification';
