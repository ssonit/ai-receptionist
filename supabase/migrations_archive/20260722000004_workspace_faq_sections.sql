-- FAQ content per workspace (separate from workspaces profile row)

create table public.workspace_faq (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  opening_hours text,
  services text,
  pricing text,
  preparation text,
  cancel_policy text,
  extra text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger workspace_faq_updated_at
before update on public.workspace_faq
for each row
execute function public.handle_updated_at();

alter table public.workspace_faq enable row level security;

create policy "Authenticated can read workspace faq (pilot)"
on public.workspace_faq
for select
to authenticated
using (true);

comment on table public.workspace_faq is 'Booking chat FAQ sections per workspace';
comment on column public.workspace_faq.opening_hours is 'Markdown bullets — opening hours';
comment on column public.workspace_faq.services is 'Markdown bullets — services';
comment on column public.workspace_faq.pricing is 'Markdown bullets — pricing guidance';
comment on column public.workspace_faq.preparation is 'Markdown bullets — booking / arrival';
comment on column public.workspace_faq.cancel_policy is 'Markdown bullets — cancel / reschedule';
comment on column public.workspace_faq.extra is 'Optional extra markdown under "## Thêm"';
