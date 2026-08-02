# Plan Feature Gating — One Table for Copy and Enforcement

**Date:** 2026-08-02
**Status:** approved

## Context

The Starter ($19) and Pro ($49) tiers are functionally identical. Every feature
that supposedly distinguishes them is either ungated or nonexistent.

Evidence gathered 2026-08-02:

| Claim on the billing card | Reality in code |
|---|---|
| "50 bookings/mo" / "200 bookings/mo" | No booking counter anywhere. `countBookings`, `bookingsThisMonth`, `booking_count` → 0 matches repo-wide. Removed from copy earlier the same day. |
| "1 user" / "3 users" | `app/dashboard/settings/invite-actions.ts` never reads `plan_tier`. Invites are unlimited on every tier. |
| "Zalo / WhatsApp" (Pro) | Zalo appears only in comments (`lib/workspace.ts:804`, `20260801000001_channel_sessions.sql:1`). WhatsApp does not exist. Only Facebook Messenger is built. |
| "Email reminders" (Pro) | Real (`lib/booking-reminders.ts`) but available to every tier. |
| "Web embed" (Starter) | Real but ungated. Landing page contradicts the card by listing embed under Premium. |

Root cause: `plan_tier` is read in exactly one place — `proxy.ts:174`, passed to
`isSubActive()`, which uses it only to decide whether a `free` workspace is still
inside its trial. **No code path gates a feature by tier.**

The copy lives in three hand-written, mutually independent places, which is why it
drifted:

- `components/billing-plan-card.tsx:33` — hardcoded English feature arrays
- `app/_components/landing/sections.tsx:366` — `PLANS` with per-plan i18n keys
  (`landing.pricing.plans.<plan>.features.f1`)
- `docs/ceo-evaluation.md:83` — a third pricing table with different numbers again

Prices had already drifted the same way ($39/$89 on the landing page vs $19/$49 in
the dashboard) and were corrected by hand earlier on 2026-08-02. Correcting strings
by hand does not prevent the next drift; only a shared source does.

## Scope

**In scope:** define what actually separates the tiers, enforce it, and make all
user-facing plan copy derive from that definition.

**Out of scope — deliberately deferred:** deposit collection (VNPay/Momo) and any
transaction-fee revenue. Two independent reasons:

1. No payment infrastructure exists. Repo-wide search for
   `vnpay|momo|zalopay|payos|deposit` returns only false positives (`demoMode`).
   Stripe today serves SaaS subscriptions only (`20260731000001_billing.sql`).
2. Taking a percentage of money moving between a guest and a tenant requires the
   funds to pass through Eve's account, which in Vietnam needs an intermediary
   payment service licence from the State Bank. Stripe Connect, the usual
   mechanism, does not support Vietnamese merchants receiving payouts.

If deposits are built later, the viable structure is: funds go directly to the
tenant's own merchant account, Eve records the deposit event from the webhook it
already receives, and bills the fee as metered usage on the tenant's existing
Stripe subscription. That keeps Eve out of the money flow entirely. It is a
separate project with its own spec.

## Decisions

1. **Tiers separate by channel.** Starter = web embed. Pro = web embed + Facebook
   Messenger (and Zalo when it exists). Chosen because Messenger is the one
   differentiator that is both already built (so it can be enforced today) and
   genuinely wanted by the target customer.
2. **Trial grants Pro.** A `free` workspace inside its 14-day trial is treated as
   `pro`, so the trial demonstrates the feature that drives the upgrade.
3. **Expiry blocks new connections, never existing ones.** A Page already connected
   keeps receiving and answering messages after the trial ends on a Starter plan.
   Only connecting an additional channel is blocked.
4. **Tier names follow the backend:** `Starter` / `Pro`. The landing page's
   `Basic` / `Premium` labels change. The reverse direction would require a
   `plan_tier` migration plus rewriting `plan_tier` metadata on live Stripe
   subscriptions — more cost and more risk for no benefit.
5. **Embed belongs to Starter**, resolving the landing/dashboard contradiction.
   Under a channel-based model the embed is the base channel.
6. **No booking quota, no seat limit.** Both are dropped as tier boundaries. A
   booking cap is actively harmful here: it would cut off a tenant's own revenue at
   the moment their business is busiest, while costing Eve almost nothing to serve.
   Seat limits fail differently — the target customer is a solopreneur, so nearly
   everyone would sit on Starter forever and never upgrade.

## Design

### 1. `lib/plan-features.ts` (new)

Follows the `as const` pattern already used by `ROUTES` (`lib/routes.ts`) and
`APP_ERROR_CODE` (`lib/errors/app-codes.ts`), per `.claude/rules/code-structure.md`.

```ts
export const PLAN_FEATURE = {
  WEB_EMBED: "web_embed",
  CAL_BOOKING: "cal_booking",
  FAQ_INTAKE: "faq_intake",
  BILINGUAL_AGENT: "bilingual_agent",
  REMINDERS: "reminders",
  MESSENGER: "messenger",
} as const;

export type PlanFeature = (typeof PLAN_FEATURE)[keyof typeof PLAN_FEATURE];

export const PLAN_FEATURE_TIERS: Record<PlanFeature, readonly PlanTier[]> = {
  web_embed:       ["starter", "pro"],
  cal_booking:     ["starter", "pro"],
  faq_intake:      ["starter", "pro"],
  bilingual_agent: ["starter", "pro"],
  reminders:       ["starter", "pro"],
  messenger:       ["pro"],
};

export const PLAN_PRICE_USD: Record<Exclude<PlanTier, "free">, number> = {
  starter: 19,
  pro: 49,
};
```

Only features that exist in the codebase are listed. Zalo and WhatsApp are absent
because they are not built — their presence in the old copy is the bug this spec
exists to prevent.

`free` deliberately appears in no feature's tier list. This is not an omission: a
`free` workspace either has an active trial, in which case `effectiveTier` resolves
it to `pro` before any lookup happens, or its trial has expired, in which case
`assertWorkspaceSubscriptionActive` has already blocked it globally. There is no
state in which a bare `free` tier should grant a feature.

The `Record<PlanFeature, …>` type is the structural guarantee: adding a member to
`PLAN_FEATURE` without assigning it to tiers is a compile error, not a silent
omission discovered later by a customer.

Two functions:

```ts
effectiveTier(billing: WorkspaceBilling): PlanTier
canUseFeature(billing: WorkspaceBilling, feature: PlanFeature): boolean
```

`effectiveTier` returns `"pro"` when `planTier === "free"` and the trial is still
running, otherwise `planTier`. It reuses the trial-window logic already in
`isSubActive()` (`lib/billing.ts:85-91`) rather than reimplementing it, so a future
change to trial length or semantics happens in one place.

### 2. Enforcement

`assertWorkspaceFeature(workspaceId, feature)` in `lib/plan-features.ts` mirrors
`assertWorkspaceSubscriptionActive()` (`lib/workspace.ts:453`):

- Returns early for the Pilot/default workspace and when `BILLING_MODE` is `none`
  or `test`, matching the existing convention so local dev and the demo are
  unaffected.
- Reads billing through the admin client.
- **Fails closed** — an unreadable workspace row is treated as not entitled, same
  as the existing gate (`lib/workspace.ts:472-478`).
- Throws `AppError(APP_ERROR_CODE.PLAN_UPGRADE_REQUIRED)`.

**Single gate point:** `app/api/messenger/oauth/start/route.ts:13`, immediately
after `requireOwnerWorkspace()`. This is the only route that can build a Messenger
OAuth URL, so gating here cannot be bypassed by calling the API directly. Returns
403.

**Deliberately not gated:** `agent/channels/messenger.ts`, the inbound message
channel. This is a decision, not an oversight, and must be commented as such in the
code — a future contributor "fixing the gap" would cut off service to a paying
tenant's already-connected Page.

Interaction with the existing subscription gate — these are two different gates and
are easy to confuse:

| Situation | Gate that fires | Outcome |
|---|---|---|
| Trial over, not paying | `assertWorkspaceSubscriptionActive` (existing) | Agent stops answering on **all** channels. Unchanged behaviour. |
| Trial over, paying Starter | New feature gate | Connected Page keeps working; connecting another channel is blocked. |
| Starter connecting first Page | New feature gate | Blocked, upgrade CTA shown. |

So "never cut off a running service" applies specifically to the trial → Starter
path. A tenant who stops paying altogether is still stopped, exactly as today.

### 3. New error code

`PLAN_UPGRADE_REQUIRED` added to `lib/errors/app-codes.ts`, with copy in
`lib/errors/app-messages.ts`, per `.claude/rules/errors.md` — no raw provider
strings reach the user.

`app-messages.ts` is typed `Record<AppErrorCode, string>` and holds English only;
it is not a bilingual catalogue. The new code follows that existing shape rather
than introducing a parallel VI map, which would be a separate refactor affecting
all 80+ codes.

Localisation boundary, which differs by file and must not be homogenised in this
change:

- `components/billing-plan-card.tsx` already uses `useTranslations()`, so its
  feature labels and plan names become keys under `dashboard.billing.*`.
- `app/_components/messenger-connection-card.tsx` and
  `app/dashboard/settings/page.tsx` hardcode English throughout today. The new
  upgrade CTA there is written as plain English to match its file. Wiring those
  two files into next-intl is a worthwhile but separate change; doing it here
  would balloon the diff against `.claude/rules/code-structure.md` ("small
  diffs", no drive-by refactors).

### 4. UI

`app/dashboard/settings/page.tsx` (server component) computes entitlement and
passes a **single boolean prop** to `MessengerConnectionCard`
(`app/_components/messenger-connection-card.tsx:16`) rather than the billing
object, per `.claude/rules/react-ui.md` (minimise props into client components).

Card states:

- Not connected, not entitled → upgrade CTA linking to `ROUTES.DASHBOARD_BILLING`
  in place of the Connect button.
- Not connected, entitled → Connect button (current behaviour).
- Connected, tier since dropped to Starter → keep the connected state and the
  Disconnect button, plus a note that the channel belongs to Pro. Never
  auto-disconnect on the tenant's behalf.

### 5. Copy derives from the table

**Billing card** (`components/billing-plan-card.tsx`): delete the hardcoded
`PLAN_FEATURES` array at line 33 and the `PLAN_PRICES` map at line 27; render from
`PLAN_FEATURE_TIERS` and `PLAN_PRICE_USD` instead. Feature labels move to i18n keys
`billing.features.<feature>` in `messages/en.json` and `messages/vi.json` — the card
currently hardcodes English strings while the rest of the component already uses
`useTranslations()`, which violates `.claude/rules/i18n.md`.

**Landing page** (`app/_components/landing/sections.tsx`): `PLANS` entries bind to a
real `PlanTier` and derive their feature lists from `PLAN_FEATURE_TIERS`, reusing
the same `billing.features.*` labels. Prices read from `PLAN_PRICE_USD`. The
existing per-plan i18n structure (`landing.pricing.plans.<plan>.features.f1`) is what
allowed the drift and is replaced. Plan display names in both message catalogues
change from Basic/Premium to Starter/Pro.

One feature, one label, two rendering sites. Advertising something absent from the
table becomes impossible rather than merely discouraged.

**Accepted exception — Enterprise $199.** Not a real `PlanTier`, so there is nothing
to derive from. It stays a hand-written static "Coming soon" card on the landing
page only, carrying a comment stating it is marketing-only with no backend. Without
that comment someone will later "align" it by adding it to the table, creating a
sellable tier the system cannot honour.

**Docs:** update the pricing table in `docs/ceo-evaluation.md:79-85`, which still
lists three tiers with booking quotas. Left alone it becomes the next source of
drift.

### 6. No migration

`plan_tier` already exists with the correct check constraint
(`supabase/migrations/20260731000001_billing.sql`). Nothing about this change
touches the schema.

## Testing

New `lib/plan-features.test.ts` (vitest), following the shape of
`lib/billing.test.ts` and `lib/subscription-gate.test.ts`:

| Case | Expected |
|---|---|
| `starter` + `messenger` | false |
| `pro` + `messenger` | true |
| `starter` + `web_embed` | true |
| `free`, trial active | `effectiveTier` = `pro`; `messenger` true |
| `free`, trial expired | `effectiveTier` = `free`; `messenger` false |
| `BILLING_MODE=none` / `test` | gate open regardless of tier |
| Pilot workspace | gate open |
| Billing row unreadable | throws (fails closed) |

The route is a thin caller, so the logic is tested at the `lib` level where it
lives. After UI edits run `npm run doctor` per `.claude/rules/react-doctor.md`, and
verify by hand with the `.claude/skills/test-feature` runbook.

## Risks

- **Existing paying tenants on Starter with a connected Page.** Under decision 3
  they keep the connection, so no one loses service. Worth confirming against
  production data before deploy that no Starter workspace would be surprised.
- **Landing refactor touches both message catalogues.** EN and VI must stay in sync;
  a missing VI key renders the raw key to Vietnamese visitors. Covered by review,
  not by a test, since next-intl resolves keys at render time.
- **Messenger becomes a paid feature.** If most trial conversions are driven by
  Messenger, gating it behind Pro may suppress Starter signups instead of upselling
  them. This is a pricing hypothesis, not a technical risk, and should be revisited
  once there is conversion data.
