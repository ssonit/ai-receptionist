-- =============================================================================
-- Billing — Polar + SePay (replace Stripe columns)
-- =============================================================================

alter table public.workspaces
  add column if not exists billing_provider text
    check (billing_provider is null or billing_provider in ('polar', 'sepay')),
  add column if not exists billing_customer_id text,
  add column if not exists billing_subscription_id text,
  add column if not exists period_ends_at timestamptz;

-- Copy any legacy Stripe IDs into generic columns before drop (best-effort).
update public.workspaces
set
  billing_provider = coalesce(billing_provider, 'polar'),
  billing_customer_id = coalesce(billing_customer_id, stripe_customer_id),
  billing_subscription_id = coalesce(billing_subscription_id, stripe_subscription_id)
where stripe_customer_id is not null or stripe_subscription_id is not null;

alter table public.workspaces
  drop column if exists stripe_customer_id,
  drop column if exists stripe_subscription_id;

-- -----------------------------------------------------------------------------
-- billing_payments — idempotent ledger for Polar orders + SePay QR cycles
-- -----------------------------------------------------------------------------

create table public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null check (provider in ('polar', 'sepay')),
  external_id text not null,
  plan_tier text not null check (plan_tier in ('starter', 'pro')),
  amount int not null check (amount > 0),
  currency text not null check (currency in ('USD', 'VND')),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'expired')),
  period_starts_at timestamptz,
  period_ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);

create index billing_payments_workspace_idx
  on public.billing_payments (workspace_id, created_at desc);

create index billing_payments_sepay_pending_idx
  on public.billing_payments (external_id)
  where provider = 'sepay' and status = 'pending';

comment on table public.billing_payments is
  'Ledger for Polar orders and SePay VietQR period payments; webhook idempotency via (provider, external_id).';

alter table public.billing_payments enable row level security;

grant select on public.billing_payments to authenticated;
grant all on public.billing_payments to service_role;

create policy "Users can read workspace billing_payments"
on public.billing_payments for select to authenticated
using (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);
