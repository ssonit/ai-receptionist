-- Lead lifecycle for dashboard + agent

alter table public.leads
  add column if not exists status text not null default 'new',
  add column if not exists updated_at timestamptz not null default now();

alter table public.leads
  drop constraint if exists leads_status_check;

alter table public.leads
  add constraint leads_status_check
  check (status in ('new', 'contacted', 'qualified', 'booked', 'lost'));

create index if not exists leads_workspace_status_idx
  on public.leads (workspace_id, status, created_at desc);

create index if not exists leads_workspace_session_idx
  on public.leads (workspace_id, session_id)
  where session_id is not null;

create index if not exists leads_workspace_phone_idx
  on public.leads (workspace_id, phone)
  where phone is not null;

drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at
before update on public.leads
for each row
execute function public.handle_updated_at();

comment on column public.leads.status is
  'Lead lifecycle: new | contacted | qualified | booked | lost';
