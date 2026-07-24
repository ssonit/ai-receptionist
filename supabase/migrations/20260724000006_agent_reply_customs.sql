-- Agent reply + guest composer customs (tone, name, locale, handoff, placeholder)

alter table public.workspaces
  add column if not exists agent_display_name text,
  add column if not exists agent_tone text,
  add column if not exists agent_reply_locale text,
  add column if not exists agent_handoff text,
  add column if not exists chat_placeholder text;

alter table public.workspaces
  drop constraint if exists workspaces_agent_tone_check;

alter table public.workspaces
  add constraint workspaces_agent_tone_check
  check (
    agent_tone is null
    or agent_tone in ('friendly', 'formal', 'brief')
  );

alter table public.workspaces
  drop constraint if exists workspaces_agent_reply_locale_check;

alter table public.workspaces
  add constraint workspaces_agent_reply_locale_check
  check (
    agent_reply_locale is null
    or agent_reply_locale in ('auto', 'vi', 'en')
  );

comment on column public.workspaces.agent_display_name is
  'Name the model uses for itself (e.g. Lan). Null = generic booking assistant.';
comment on column public.workspaces.agent_tone is
  'Reply tone: friendly | formal | brief. Null = friendly.';
comment on column public.workspaces.agent_reply_locale is
  'Preferred reply language: auto | vi | en. Null = auto (follow guest UI).';
comment on column public.workspaces.agent_handoff is
  'When / how to hand off to a human (phone/email). Injected into agent instructions.';
comment on column public.workspaces.chat_placeholder is
  'Guest chat composer placeholder. Null = app default i18n string.';
