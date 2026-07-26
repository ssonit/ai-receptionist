-- Durable replacement for the in-memory agent rate limiter (per-process Map).
create table if not exists public.agent_rate_limits (
  bucket_key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

alter table public.agent_rate_limits enable row level security;
-- Intentionally no policies: service-role only, never read from the client.

create index if not exists agent_rate_limits_window_start_idx
  on public.agent_rate_limits (window_start);

create or replace function public.bump_agent_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_max integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_start timestamptz;
begin
  insert into public.agent_rate_limits (bucket_key, window_start, count)
  values (p_key, now(), 0)
  on conflict (bucket_key) do nothing;

  select window_start, count
    into v_start, v_count
    from public.agent_rate_limits
   where bucket_key = p_key
     for update;

  if v_start + make_interval(secs => p_window_seconds) <= now() then
    update public.agent_rate_limits
       set window_start = now(), count = 1
     where bucket_key = p_key;
    return true;
  end if;

  if v_count >= p_max then
    return false;
  end if;

  update public.agent_rate_limits
     set count = count + 1
   where bucket_key = p_key;
  return true;
end;
$$;

revoke all on function public.bump_agent_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.bump_agent_rate_limit(text, integer, integer)
  to service_role;

-- Housekeeping: drop buckets untouched for a day. Called from /api/cron/tick.
create or replace function public.prune_agent_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.agent_rate_limits
   where window_start < now() - interval '1 day';
$$;

revoke all on function public.prune_agent_rate_limits()
  from public, anon, authenticated;
grant execute on function public.prune_agent_rate_limits()
  to service_role;
