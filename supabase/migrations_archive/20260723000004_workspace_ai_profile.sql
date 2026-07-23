-- Richer workspace profile for AI booking agent context

alter table public.workspaces
  add column if not exists email text,
  add column if not exists website text,
  add column if not exists tagline text,
  add column if not exists about text,
  add column if not exists business_hours text,
  add column if not exists services_summary text,
  add column if not exists agent_instructions text;

comment on column public.workspaces.email is 'Public contact email for guests / agent replies';
comment on column public.workspaces.website is 'Public website URL';
comment on column public.workspaces.tagline is 'One-line pitch the agent can use to introduce the business';
comment on column public.workspaces.about is 'Short about / intro paragraph for the agent';
comment on column public.workspaces.business_hours is 'Opening hours text (agent FAQ context)';
comment on column public.workspaces.services_summary is 'Services overview the agent can summarize';
comment on column public.workspaces.agent_instructions is 'Extra rules / tone / booking notes injected into agent context';
