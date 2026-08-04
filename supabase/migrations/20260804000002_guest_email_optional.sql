-- Guest email optional per workspace (VN market: name + phone is enough).
-- Source: docs/superpowers/specs/2026-08-04-optional-guest-email-design.md

alter table public.workspaces
  add column if not exists guest_email_required boolean not null default true;

comment on column public.workspaces.guest_email_required is
  'If false, guest_email may be a system-generated placeholder (@no-email.invalid) — booking created via phone/name only';
