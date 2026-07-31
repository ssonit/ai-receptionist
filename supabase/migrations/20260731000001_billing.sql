-- =============================================================================
-- Billing — Stripe subscription columns on workspaces
-- =============================================================================

alter table public.workspaces
  add column plan_tier text not null default 'free'
    check (plan_tier in ('free', 'starter', 'pro')),
  add column subscription_status text
    check (subscription_status in ('active', 'past_due', 'canceled', 'incomplete', 'trialing')),
  add column stripe_customer_id text,
  add column stripe_subscription_id text,
  add column trial_ends_at timestamptz not null default (now() + interval '14 days');
