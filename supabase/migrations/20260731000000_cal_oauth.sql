-- Cal.com Developer OAuth — replace paste API key with "Connect Cal.com"
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS cal_oauth_access_encrypted text,
  ADD COLUMN IF NOT EXISTS cal_oauth_refresh_encrypted text,
  ADD COLUMN IF NOT EXISTS cal_oauth_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS cal_oauth_scope text,
  ADD COLUMN IF NOT EXISTS cal_auth_mode text CHECK (cal_auth_mode IN ('api_key', 'oauth'));
