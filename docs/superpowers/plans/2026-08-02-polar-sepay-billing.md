# Polar + SePay Billing — Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` or
> `superpowers:subagent-driven-development` **with** `using-git-worktrees`.
> Do **not** implement on `main`.

**Goal:** Replace Stripe with Polar (international) + SePay VietQR (Vietnam)
behind a provider-agnostic billing layer; keep plan feature gates intact.

**Architecture:** `lib/billing.ts` owns mode + `isSubActive`. Adapters in
`lib/billing/polar.ts` and `lib/billing/sepay.ts`. Entitlement writes go through
`lib/billing/apply-entitlement.ts`. Webhooks at `/api/polar/webhook` and
`/api/sepay/webhook`.

**Tech stack:** Next.js, TypeScript, Supabase, `@polar-sh/sdk`, vitest.

**Source spec:** `docs/superpowers/specs/2026-08-02-polar-sepay-billing-design.md`

## Global constraints

- Branch: `feat/polar-sepay-billing` in worktree `D:/Project/eve-wt-polar-sepay`.
- After UI edits: `npm run doctor`. After code: eventually `graphify update .`
  on `main` after merge (final step).
- User-facing errors via `APP_ERROR_CODE` where applicable.
- i18n: update `messages/en.json` + `messages/vi.json` together.
- Merge to `main` → remove worktree → `graphify update .`.

---

### Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/20260802000001_polar_sepay_billing.sql`

- [ ] Add `billing_provider`, `billing_customer_id`, `billing_subscription_id`,
      `period_ends_at` on `workspaces`; drop `stripe_*`.
- [ ] Create `billing_payments` with RLS (owner read own workspace).
- [ ] unique `(provider, external_id)`.

### Task 2: Billing core + Polar + remove Stripe

**Files:**
- Rewrite: `lib/billing.ts`
- Create: `lib/billing/types.ts`, `lib/billing/polar.ts`,
  `lib/billing/apply-entitlement.ts`
- Create: `app/api/polar/webhook/route.ts`
- Create: `app/api/billing/portal/route.ts`
- Update: `app/api/billing/checkout/route.ts`
- Delete: `app/api/stripe/webhook/route.ts`
- Update: `.env.example`, `package.json` (no `stripe`)

### Task 3: SePay VietQR

**Files:**
- Create: `lib/billing/sepay.ts`
- Create: `app/api/sepay/webhook/route.ts`
- Create: `app/dashboard/billing/pay/page.tsx` (+ client if needed)
- Create: `app/api/billing/payment-status/route.ts` (poll)

### Task 4: UI + i18n + callers

**Files:**
- Update: `components/billing-plan-card.tsx`, `app/dashboard/billing/page.tsx`
- Update: `proxy.ts`, `lib/workspace.ts`, `lib/plan-features.ts`,
  settings page WorkspaceBilling stubs
- Update: `messages/en.json`, `messages/vi.json`
- Add: `PLAN_PRICE_VND` in `lib/plan-features.ts`

### Task 5: Tests + verify

- Update: `lib/billing.test.ts`, `lib/plan-features.test.ts`
- `npm test`, `npm run typecheck`, `npm run doctor`

### Task 6: Ship

- Commit on feature branch
- Merge into `main` from primary repo
- `git worktree remove` + delete branch
- `graphify update .` on main
