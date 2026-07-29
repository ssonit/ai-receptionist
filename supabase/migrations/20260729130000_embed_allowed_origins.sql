-- Soft embed security: optional host allowlist for /embed/* iframes.
-- Empty array = allow all origins (default).

alter table public.workspaces
  add column if not exists embed_allowed_origins text[] not null default '{}';

comment on column public.workspaces.embed_allowed_origins is
  'Hostnames allowed to frame /embed (empty = all). Soft Referer/Origin check only.';
