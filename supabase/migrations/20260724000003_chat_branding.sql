-- Editable chat empty-state branding (label, intro, suggestion chips)

alter table public.workspaces
  add column if not exists chat_assistant_label text,
  add column if not exists chat_intro text,
  add column if not exists chat_suggestions jsonb;

comment on column public.workspaces.chat_assistant_label is
  'Empty-state eyebrow, e.g. AI booking assistant. Null = app default.';
comment on column public.workspaces.chat_intro is
  'Empty-state description under workspace name. Null = app default.';
comment on column public.workspaces.chat_suggestions is
  'JSON array of {label, prompt} quick-reply chips. Null/empty = app default.';
