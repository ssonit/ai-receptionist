# Polar + SePay Billing — Dual-Rail SaaS Subscriptions

**Date:** 2026-08-02  
**Status:** approved  
**Branch / worktree:** `feat/polar-sepay-billing` at `../eve-wt-polar-sepay` (not `main`)

## Context

Eve SaaS billing today is Stripe-only (`lib/billing.ts`, `/api/stripe/webhook`,
`stripe_*` columns on `workspaces`). Owners pay for Starter ($19) / Pro ($49)
after a 14-day trial. Guest booking deposits are out of scope.

Problems with Stripe-only:

1. International tax/VAT is on Eve as the merchant — Polar as Merchant of Record
   removes that ops burden for foreign card customers.
2. Vietnamese owners prefer VietQR bank transfer (scan-and-pay), not international
   cards. Stripe does not solve QR CK well for VN.

## Decisions

1. **Polar** for international card subscriptions (MoR: tax, checkout, portal,
   subscription webhooks). Remove the `stripe` package and `STRIPE_*` env.
2. **SePay** for Vietnam VietQR (balance webhook + dynamic QR). Chosen over payOS
   for clearer setup (sandbox, ~30 min VietQR, any supported bank) and fixed
   subscription pricing (Free 50 tx/mo or Startup from 120kđ) without % of GMV.
3. **Owner picks rail** on the billing UI: VietQR (VN) vs Card (International).
   No geo-IP guessing.
4. **VND list prices** (env-overridable): Starter 499.000₫, Pro 1.299.000₫.
   USD remains `PLAN_PRICE_USD` (19 / 49).
5. **SePay is period-based**, not auto-recurring: each paid QR grants
   `period_ends_at += 30 days`. Polar keeps true recurring subscriptions;
   we still store `period_ends_at` from Polar for UI consistency.
6. **One active provider per workspace** — checkout refuses a different rail
   while an active paid entitlement exists.
7. **Provider-agnostic columns** on `workspaces`: `billing_provider`,
   `billing_customer_id`, `billing_subscription_id`, `period_ends_at`.
   Drop `stripe_*`. Idempotent ledger: `billing_payments`.
8. **Gates unchanged in spirit:** `isSubActive`, `assertWorkspaceSubscriptionActive`,
   `plan-features` — only extend `WorkspaceBilling` and SePay period checks.

## Out of scope

- Guest deposit collection (VNPay/MoMo/ZaloPay)
- payOS
- Keeping Stripe in parallel
- Email renew reminders (phase 2)
- SePay Payment Gateway hosted form (phase 1 uses QR + balance webhook)

## Flows

```
Owner → POST /api/billing/checkout { planTier, rail }
  rail=polar → Polar checkout URL → /api/polar/webhook → workspaces
  rail=sepay → billing_payments + QR page → /api/sepay/webhook → workspaces
```

`isSubActive` (live): free-in-trial; or Polar `active`/`trialing`; or SePay
`active` with `period_ends_at > now`.

## Env

```
BILLING_MODE=test|none|live
POLAR_ACCESS_TOKEN=
POLAR_WEBHOOK_SECRET=
POLAR_STARTER_PRODUCT_ID=
POLAR_PRO_PRODUCT_ID=
POLAR_SERVER=sandbox|production
SEPAY_WEBHOOK_API_KEY=
SEPAY_BANK_ACCOUNT=
SEPAY_BANK_NAME=
SEPAY_ACCOUNT_NAME=
SEPAY_STARTER_AMOUNT_VND=499000
SEPAY_PRO_AMOUNT_VND=1299000
```

## Source of truth

Implementation plan: `docs/superpowers/plans/2026-08-02-polar-sepay-billing.md`
