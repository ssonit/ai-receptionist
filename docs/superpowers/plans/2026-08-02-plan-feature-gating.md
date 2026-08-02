# Plan Feature Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Facebook Messenger a Pro-only channel, enforced server-side, with every user-facing plan description generated from the same table that does the enforcing.

**Architecture:** A new `lib/plan-features.ts` declares which plan tiers grant which features, typed as `Record<PlanFeature, readonly PlanTier[]>` so a feature with no tier assignment is a compile error. One guard function reads it (mirroring the existing `assertWorkspaceSubscriptionActive`), and both the dashboard billing card and the landing page pricing section render from it. No database migration is needed — `plan_tier` already exists.

**Tech Stack:** Next.js 16 (Turbopack), TypeScript, Supabase, vitest, next-intl.

**Source spec:** `docs/superpowers/specs/2026-08-02-plan-feature-gating-design.md`

## Global Constraints

- Branch is `feat/plan-feature-gating`, already created. Do not work on `main`.
- Run tests with `npm test` (= `vitest run`). Type check with `npm run typecheck`.
- After any change under `app/**/*.tsx` or `components/**/*.tsx`, run `npm run doctor` before committing that task.
- After any code edit, run `graphify update .` (AST-only, no API cost) — required by `AGENTS.md` item 10.
- Route paths must come from `lib/routes.ts` constants, never string literals (`.claude/rules/code-structure.md`).
- User-facing failures use `APP_ERROR_CODE` + `appErrorMessage`, never raw strings (`.claude/rules/errors.md`).
- `lib/errors/app-messages.ts` is `Record<AppErrorCode, string>`, English only. Do not add a VI map there.
- `components/billing-plan-card.tsx` is already internationalised via `useTranslations()` — its strings go to `messages/en.json` + `messages/vi.json` under `dashboard.billing.*`. Both catalogues must be updated together; a key present in one but not the other renders the raw key.
- `app/_components/messenger-connection-card.tsx` and `app/dashboard/settings/page.tsx` hardcode English today. Keep new strings in those two files as plain English to match. Do **not** wire them into next-intl in this plan.
- Never add a gate to `agent/channels/messenger.ts`. Inbound messages on an already-connected Page must keep working regardless of tier. This is deliberate; see Task 3.

---

### Task 1: The plan-features table

**Files:**
- Create: `lib/plan-features.ts`
- Test: `lib/plan-features.test.ts`

**Interfaces:**
- Consumes: `PlanTier`, `WorkspaceBilling` from `lib/billing.ts` (already exist; `PlanTier = "free" | "starter" | "pro"`).
- Produces:
  - `PLAN_FEATURE` — const object, values are snake_case strings
  - `type PlanFeature`
  - `PLAN_FEATURE_TIERS: Record<PlanFeature, readonly PlanTier[]>`
  - `PLAN_PRICE_USD: Record<Exclude<PlanTier, "free">, number>`
  - `effectiveTier(billing: WorkspaceBilling): PlanTier`
  - `canUseFeature(billing: WorkspaceBilling, feature: PlanFeature): boolean`
  - `featuresForTier(tier: PlanTier): readonly PlanFeature[]`

- [ ] **Step 1: Write the failing test**

Create `lib/plan-features.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { WorkspaceBilling } from "@/lib/billing";
import {
  PLAN_FEATURE,
  PLAN_PRICE_USD,
  canUseFeature,
  effectiveTier,
  featuresForTier,
} from "@/lib/plan-features";

function ws(overrides: Partial<WorkspaceBilling> = {}): WorkspaceBilling {
  return {
    planTier: "free",
    subscriptionStatus: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    trialEndsAt: null,
    ...overrides,
  };
}

function futureIso(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function pastIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

describe("effectiveTier", () => {
  it("promotes a free workspace inside its trial to pro", () => {
    expect(effectiveTier(ws({ planTier: "free", trialEndsAt: futureIso(3) }))).toBe("pro");
  });

  it("leaves a free workspace with an expired trial as free", () => {
    expect(effectiveTier(ws({ planTier: "free", trialEndsAt: pastIso(1) }))).toBe("free");
  });

  it("leaves a free workspace with no trial date as free", () => {
    expect(effectiveTier(ws({ planTier: "free", trialEndsAt: null }))).toBe("free");
  });

  it("never downgrades or promotes a paid tier", () => {
    expect(effectiveTier(ws({ planTier: "starter", trialEndsAt: futureIso(3) }))).toBe("starter");
    expect(effectiveTier(ws({ planTier: "pro", trialEndsAt: pastIso(9) }))).toBe("pro");
  });
});

describe("canUseFeature", () => {
  it("denies messenger on starter", () => {
    expect(canUseFeature(ws({ planTier: "starter" }), PLAN_FEATURE.MESSENGER)).toBe(false);
  });

  it("allows messenger on pro", () => {
    expect(canUseFeature(ws({ planTier: "pro" }), PLAN_FEATURE.MESSENGER)).toBe(true);
  });

  it("allows messenger during an active trial", () => {
    expect(
      canUseFeature(ws({ planTier: "free", trialEndsAt: futureIso(5) }), PLAN_FEATURE.MESSENGER),
    ).toBe(true);
  });

  it("denies messenger once the trial has expired", () => {
    expect(
      canUseFeature(ws({ planTier: "free", trialEndsAt: pastIso(1) }), PLAN_FEATURE.MESSENGER),
    ).toBe(false);
  });

  it("allows the web embed on starter", () => {
    expect(canUseFeature(ws({ planTier: "starter" }), PLAN_FEATURE.WEB_EMBED)).toBe(true);
  });
});

describe("featuresForTier", () => {
  it("gives pro every starter feature plus messenger", () => {
    const starter = featuresForTier("starter");
    const pro = featuresForTier("pro");

    for (const feature of starter) {
      expect(pro).toContain(feature);
    }
    expect(pro).toContain(PLAN_FEATURE.MESSENGER);
    expect(starter).not.toContain(PLAN_FEATURE.MESSENGER);
  });

  it("grants a bare free tier nothing", () => {
    expect(featuresForTier("free")).toEqual([]);
  });
});

describe("PLAN_PRICE_USD", () => {
  it("matches the advertised prices", () => {
    expect(PLAN_PRICE_USD.starter).toBe(19);
    expect(PLAN_PRICE_USD.pro).toBe(49);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/plan-features.test.ts`
Expected: FAIL — cannot resolve module `@/lib/plan-features`.

- [ ] **Step 3: Write the implementation**

Create `lib/plan-features.ts`:

```ts
/**
 * Which plan tier grants which capability.
 *
 * This table is the single source for BOTH enforcement and the plan copy shown
 * to customers (dashboard billing card + landing page pricing). Adding a feature
 * here without assigning tiers is a compile error, and the pricing UI can only
 * advertise what appears here — so copy cannot drift away from what the code
 * actually enforces, which it repeatedly did before this module existed.
 *
 * Only capabilities that exist in the codebase belong here. Zalo and WhatsApp are
 * deliberately absent: they are not built.
 */
import type { PlanTier, WorkspaceBilling } from "@/lib/billing";

export const PLAN_FEATURE = {
  WEB_EMBED: "web_embed",
  CAL_BOOKING: "cal_booking",
  FAQ_INTAKE: "faq_intake",
  BILINGUAL_AGENT: "bilingual_agent",
  REMINDERS: "reminders",
  MESSENGER: "messenger",
} as const;

export type PlanFeature = (typeof PLAN_FEATURE)[keyof typeof PLAN_FEATURE];

/**
 * `free` intentionally appears in no list. A free workspace either has a live
 * trial — in which case `effectiveTier` resolves it to `pro` before any lookup —
 * or its trial expired, in which case `assertWorkspaceSubscriptionActive` has
 * already blocked it globally. There is no state where a bare `free` tier should
 * grant a feature.
 */
export const PLAN_FEATURE_TIERS: Record<PlanFeature, readonly PlanTier[]> = {
  web_embed: ["starter", "pro"],
  cal_booking: ["starter", "pro"],
  faq_intake: ["starter", "pro"],
  bilingual_agent: ["starter", "pro"],
  reminders: ["starter", "pro"],
  messenger: ["pro"],
};

/** Monthly USD list price. The landing page and billing card both read this. */
export const PLAN_PRICE_USD: Record<Exclude<PlanTier, "free">, number> = {
  starter: 19,
  pro: 49,
};

/** Display order for the pricing UI. */
const FEATURE_ORDER: readonly PlanFeature[] = [
  PLAN_FEATURE.WEB_EMBED,
  PLAN_FEATURE.CAL_BOOKING,
  PLAN_FEATURE.FAQ_INTAKE,
  PLAN_FEATURE.BILINGUAL_AGENT,
  PLAN_FEATURE.REMINDERS,
  PLAN_FEATURE.MESSENGER,
];

/**
 * The tier to evaluate entitlements against. A `free` workspace inside its trial
 * is treated as `pro` so the trial demonstrates the feature that drives upgrades.
 *
 * Mirrors the trial window used by `isSubActive` (`lib/billing.ts`).
 */
export function effectiveTier(billing: WorkspaceBilling): PlanTier {
  if (
    billing.planTier === "free" &&
    billing.trialEndsAt &&
    new Date(billing.trialEndsAt) > new Date()
  ) {
    return "pro";
  }
  return billing.planTier;
}

export function canUseFeature(
  billing: WorkspaceBilling,
  feature: PlanFeature,
): boolean {
  return PLAN_FEATURE_TIERS[feature].includes(effectiveTier(billing));
}

export function featuresForTier(tier: PlanTier): readonly PlanFeature[] {
  return FEATURE_ORDER.filter((feature) =>
    PLAN_FEATURE_TIERS[feature].includes(tier),
  );
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- lib/plan-features.test.ts`
Expected: PASS, 12 tests.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Update the graph and commit**

```bash
graphify update .
git add lib/plan-features.ts lib/plan-features.test.ts
git commit -m "feat(billing): add plan feature table with tier entitlements"
```

---

### Task 2: The error code

**Files:**
- Modify: `lib/errors/app-codes.ts:84` (add after `WEBHOOK_SECRET_FAILED`)
- Modify: `lib/errors/app-messages.ts:137` (add after the `WEBHOOK_SECRET_FAILED` entry)

**Interfaces:**
- Produces: `APP_ERROR_CODE.PLAN_UPGRADE_REQUIRED` (value `"plan_upgrade_required"`), consumed by Task 3.

No separate test: `app-messages.ts` ends with `satisfies Record<AppErrorCode, string>`, so omitting the message is a compile error. `npm run typecheck` is the test.

- [ ] **Step 1: Add the code**

In `lib/errors/app-codes.ts`, add as the last entry before the closing `} as const;`:

```ts
  PLAN_UPGRADE_REQUIRED: "plan_upgrade_required",
```

- [ ] **Step 2: Verify typecheck now fails**

Run: `npm run typecheck`
Expected: FAIL — `app-messages.ts` no longer satisfies `Record<AppErrorCode, string>` because `plan_upgrade_required` has no message.

This failure is the point: it proves the `satisfies` constraint is doing its job.

- [ ] **Step 3: Add the message**

In `lib/errors/app-messages.ts`, add as the last entry before `} as const satisfies Record<AppErrorCode, string>;`:

```ts
  [APP_ERROR_CODE.PLAN_UPGRADE_REQUIRED]:
    "That channel is included in the Pro plan. Upgrade in Billing to connect it.",
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Update the graph and commit**

```bash
graphify update .
git add lib/errors/app-codes.ts lib/errors/app-messages.ts
git commit -m "feat(errors): add PLAN_UPGRADE_REQUIRED code"
```

---

### Task 3: The server-side guard

**Files:**
- Modify: `lib/plan-features.ts` (append the guard)
- Modify: `lib/plan-features.test.ts` (append a describe block)
- Modify: `app/api/messenger/oauth/start/route.ts:12-25`

**Interfaces:**
- Consumes: `canUseFeature`, `PLAN_FEATURE` (Task 1); `APP_ERROR_CODE.PLAN_UPGRADE_REQUIRED` (Task 2).
- Produces: `assertWorkspaceFeature(workspaceId: string, feature: PlanFeature): Promise<void>` — throws `AppError(APP_ERROR_CODE.PLAN_UPGRADE_REQUIRED)`.

Read `lib/workspace.ts:443-495` (`assertWorkspaceSubscriptionActive`) before writing this. The new guard mirrors it: same skip conditions, same fail-closed posture, same admin-client read.

- [ ] **Step 1: Write the failing test**

Append to `lib/plan-features.test.ts`. Note the new imports — `supabaseMock` and the error helpers — matching `lib/subscription-gate.test.ts`:

```ts
// Add to the imports at the top of the file:
//   import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
//   import { supabaseMock } from "../tests/helpers/supabase-mock";
//   import { APP_ERROR_CODE, isAppError } from "./errors";
//   import { assertWorkspaceFeature } from "@/lib/plan-features";

const PILOT_ID = "00000000-0000-4000-8000-000000000001";
const TENANT_ID = "11111111-1111-4111-8111-111111111111";

describe("assertWorkspaceFeature", () => {
  beforeEach(() => {
    // No vi.resetModules(): a fresh module graph would mint a second AppError
    // class and break the instanceof checks. BILLING_MODE is read per call.
    vi.unstubAllEnvs();
    vi.stubEnv("BILLING_MODE", "live");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows messenger for a pro workspace", async () => {
    supabaseMock.seed("workspaces", [
      {
        id: TENANT_ID,
        plan_tier: "pro",
        subscription_status: "active",
        trial_ends_at: pastIso(30),
      },
    ]);

    await expect(
      assertWorkspaceFeature(TENANT_ID, PLAN_FEATURE.MESSENGER),
    ).resolves.toBeUndefined();
  });

  it("blocks messenger for a starter workspace", async () => {
    supabaseMock.seed("workspaces", [
      {
        id: TENANT_ID,
        plan_tier: "starter",
        subscription_status: "active",
        trial_ends_at: pastIso(30),
      },
    ]);

    const rejection = await assertWorkspaceFeature(
      TENANT_ID,
      PLAN_FEATURE.MESSENGER,
    ).catch((error: unknown) => error);
    expect(isAppError(rejection, APP_ERROR_CODE.PLAN_UPGRADE_REQUIRED)).toBe(true);
  });

  it("allows messenger during an active trial", async () => {
    supabaseMock.seed("workspaces", [
      {
        id: TENANT_ID,
        plan_tier: "free",
        subscription_status: null,
        trial_ends_at: futureIso(4),
      },
    ]);

    await expect(
      assertWorkspaceFeature(TENANT_ID, PLAN_FEATURE.MESSENGER),
    ).resolves.toBeUndefined();
  });

  it("fails closed when the workspace row cannot be read", async () => {
    supabaseMock.seed("workspaces", []);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const rejection = await assertWorkspaceFeature(
      TENANT_ID,
      PLAN_FEATURE.MESSENGER,
    ).catch((error: unknown) => error);
    expect(isAppError(rejection, APP_ERROR_CODE.PLAN_UPGRADE_REQUIRED)).toBe(true);
  });

  it("never gates the Pilot demo workspace", async () => {
    supabaseMock.seed("workspaces", []);

    await expect(
      assertWorkspaceFeature(PILOT_ID, PLAN_FEATURE.MESSENGER),
    ).resolves.toBeUndefined();
  });

  it("never gates when BILLING_MODE=test", async () => {
    vi.stubEnv("BILLING_MODE", "test");
    supabaseMock.seed("workspaces", []);

    await expect(
      assertWorkspaceFeature(TENANT_ID, PLAN_FEATURE.MESSENGER),
    ).resolves.toBeUndefined();
  });

  it("never gates when BILLING_MODE=none", async () => {
    vi.stubEnv("BILLING_MODE", "none");
    supabaseMock.seed("workspaces", []);

    await expect(
      assertWorkspaceFeature(TENANT_ID, PLAN_FEATURE.MESSENGER),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/plan-features.test.ts`
Expected: FAIL — `assertWorkspaceFeature` is not exported.

- [ ] **Step 3: Implement the guard**

Append to `lib/plan-features.ts`. Add these imports at the top of the file:

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingMode, type SubscriptionStatus } from "@/lib/billing";
import { AppError, APP_ERROR_CODE } from "@/lib/errors";
import { getDefaultWorkspaceId, PILOT_WORKSPACE_ID } from "@/lib/workspace";
```

Then append:

```ts
/**
 * Feature gate for paid capabilities. Pilot demo, `BILLING_MODE=none` and
 * `BILLING_MODE=test` always pass, matching `assertWorkspaceSubscriptionActive`.
 *
 * Fails **closed**: a workspace row we cannot read is treated as not entitled.
 *
 * This gate belongs only on paths that CONNECT a channel. It must never be added
 * to `agent/channels/messenger.ts`: a Page that is already connected keeps being
 * answered even after the workspace drops to Starter. Cutting off a live channel
 * would break the tenant's own customer conversations, which is not what a
 * downgrade should do. A tenant who stops paying entirely is already stopped by
 * `assertWorkspaceSubscriptionActive`.
 *
 * @throws AppError PLAN_UPGRADE_REQUIRED
 */
export async function assertWorkspaceFeature(
  workspaceId: string,
  feature: PlanFeature,
): Promise<void> {
  if (
    workspaceId === getDefaultWorkspaceId() ||
    workspaceId === PILOT_WORKSPACE_ID ||
    getBillingMode() === "none" ||
    getBillingMode() === "test"
  ) {
    return;
  }

  const supabase = createAdminClient();
  const { data: ws, error } = await supabase
    .from("workspaces")
    .select("plan_tier, subscription_status, trial_ends_at")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error || !ws) {
    console.error(
      `[plan-features] could not read billing state for workspace ${workspaceId} — blocking ${feature}`,
      error,
    );
    throw new AppError(APP_ERROR_CODE.PLAN_UPGRADE_REQUIRED);
  }

  const allowed = canUseFeature(
    {
      planTier: (ws.plan_tier as PlanTier) ?? "free",
      subscriptionStatus:
        (ws.subscription_status as SubscriptionStatus | null) ?? null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      trialEndsAt: (ws.trial_ends_at as string | null) ?? null,
    },
    feature,
  );

  if (!allowed) {
    throw new AppError(APP_ERROR_CODE.PLAN_UPGRADE_REQUIRED);
  }
}
```

If `getDefaultWorkspaceId` or `PILOT_WORKSPACE_ID` is not exported from `lib/workspace.ts`, export it there rather than duplicating the constant.

- [ ] **Step 4: Run tests**

Run: `npm test -- lib/plan-features.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Wire the guard into the OAuth start route**

In `app/api/messenger/oauth/start/route.ts`, add the import:

```ts
import { assertWorkspaceFeature, PLAN_FEATURE } from "@/lib/plan-features";
import { appErrorMessage, isAppError, APP_ERROR_CODE } from "@/lib/errors";
```

Then insert directly after the `requireOwnerWorkspace()` block (currently lines 13-16), before `validateMessengerEnv()`:

```ts
  try {
    await assertWorkspaceFeature(auth.workspaceId, PLAN_FEATURE.MESSENGER);
  } catch (error) {
    if (isAppError(error, APP_ERROR_CODE.PLAN_UPGRADE_REQUIRED)) {
      return NextResponse.json(
        { error: appErrorMessage(APP_ERROR_CODE.PLAN_UPGRADE_REQUIRED) },
        { status: 403 },
      );
    }
    throw error;
  }
```

- [ ] **Step 6: Verify the whole suite and typecheck**

Run: `npm test`
Expected: all pre-existing tests still pass, plus the 19 new ones.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Update the graph and commit**

```bash
graphify update .
git add lib/plan-features.ts lib/plan-features.test.ts app/api/messenger/oauth/start/route.ts
git commit -m "feat(billing): gate Messenger connection behind the Pro plan"
```

---

### Task 4: Settings UI reflects entitlement

**Files:**
- Modify: `app/dashboard/settings/page.tsx:162-166`
- Modify: `app/_components/messenger-connection-card.tsx:10-20, 70-95`

**Interfaces:**
- Consumes: `canUseFeature`, `PLAN_FEATURE` (Task 1).
- Produces: `MessengerConnectionCard` gains a required `canConnect: boolean` prop.

Both files hardcode English today. Keep it that way (see Global Constraints).

- [ ] **Step 1: Add the prop to the card**

In `app/_components/messenger-connection-card.tsx`, extend the `Props` type and the destructured parameters:

```ts
type Props = {
  workspaceId: string;
  messengerPageId: string | null;
  messengerPageName: string | null;
  canConnect: boolean;
};

export function MessengerConnectionCard({
  workspaceId,
  messengerPageId,
  messengerPageName,
  canConnect,
}: Props) {
```

- [ ] **Step 2: Add the Pro note to the connected branch**

Inside the `messengerPageId ?` branch, directly after the `<p>` showing `messengerPageName` (currently line 56), add:

```tsx
              {!canConnect ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Messenger is part of the Pro plan. This Page stays connected.
                </p>
              ) : null}
```

This is the downgrade case: a Starter workspace whose Page is already connected. It keeps working, and the note explains why there is no way to add another.

- [ ] **Step 3: Swap the Connect button for an upgrade CTA**

Add the routes import at the top of the file:

```ts
import { ROUTES } from "@/lib/routes";
```

In the not-connected branch, replace the existing `<Button asChild size="sm" type="button">…</Button>` block (currently lines 86-93) with:

```tsx
          {canConnect ? (
            <Button asChild size="sm" type="button">
              <a href={`/api/messenger/oauth/start?returnTo=${ROUTES.DASHBOARD_SETTINGS}`}>
                <ChatCircleIcon className="size-4" weight="fill" />
                <span className="ml-2">Connect Messenger</span>
              </a>
            </Button>
          ) : (
            <Button asChild size="sm" type="button" variant="outline">
              <a href={ROUTES.DASHBOARD_BILLING}>
                <span>Upgrade to Pro to connect</span>
              </a>
            </Button>
          )}
```

Note this also replaces the hardcoded `/dashboard/settings` literal with `ROUTES.DASHBOARD_SETTINGS`, required by `.claude/rules/code-structure.md`.

- [ ] **Step 4: Compute entitlement in the server page**

In `app/dashboard/settings/page.tsx`, add imports:

```ts
import { canUseFeature, PLAN_FEATURE } from "@/lib/plan-features";
```

The page already loads the dashboard user. Load the workspace billing columns alongside the existing workspace query, then pass the boolean down. At the `MessengerConnectionCard` call site (line 162), add the prop:

```tsx
                  <MessengerConnectionCard
                    workspaceId={dashboard.workspaceId}
                    messengerPageId={messengerPageId}
                    messengerPageName={messengerPageName}
                    canConnect={canConnectMessenger}
                  />
```

And compute `canConnectMessenger` earlier in the component body, after the workspace row is loaded:

```ts
  const canConnectMessenger = canUseFeature(
    {
      planTier: (workspaceRow?.plan_tier as PlanTier) ?? "free",
      subscriptionStatus: (workspaceRow?.subscription_status as SubscriptionStatus | null) ?? null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      trialEndsAt: (workspaceRow?.trial_ends_at as string | null) ?? null,
    },
    PLAN_FEATURE.MESSENGER,
  );
```

Read the existing workspace select in this file first and add `plan_tier, subscription_status, trial_ends_at` to it rather than issuing a second query — `.claude/rules/vercel-react-conventions.md` prioritises avoiding waterfalls. Import `PlanTier` and `SubscriptionStatus` types from `@/lib/billing`.

- [ ] **Step 5: Verify**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run doctor`
Expected: no new errors versus the pre-change baseline. Pre-existing findings in `app/_components/agent-chat.tsx` are unrelated to this task and stay.

- [ ] **Step 6: Update the graph and commit**

```bash
graphify update .
git add app/dashboard/settings/page.tsx app/_components/messenger-connection-card.tsx
git commit -m "feat(settings): show upgrade CTA when Messenger is not in the plan"
```

---

### Task 5: Billing card renders from the table

**Files:**
- Modify: `components/billing-plan-card.tsx:21-53, 76-102`
- Modify: `messages/en.json` (under `dashboard.billing`, around line 149-161)
- Modify: `messages/vi.json` (matching section)

**Interfaces:**
- Consumes: `featuresForTier`, `PLAN_PRICE_USD` (Task 1).

The component already calls `useTranslations()` with no namespace and uses full key paths like `t("dashboard.billing.currentPlan")`. Follow that.

- [ ] **Step 1: Add the i18n keys**

In `messages/en.json`, inside the `dashboard.billing` object, add:

```json
      "planNames": {
        "starter": "Starter",
        "pro": "Pro"
      },
      "features": {
        "web_embed": "Website chat widget",
        "cal_booking": "Real calendar booking",
        "faq_intake": "FAQ + client intake",
        "bilingual_agent": "English & Vietnamese agent",
        "reminders": "Appointment reminders",
        "messenger": "Facebook Messenger"
      }
```

In `messages/vi.json`, inside the matching `dashboard.billing` object, add:

```json
      "planNames": {
        "starter": "Starter",
        "pro": "Pro"
      },
      "features": {
        "web_embed": "Chat widget trên website",
        "cal_booking": "Đặt lịch trên lịch thật",
        "faq_intake": "FAQ + thu thập thông tin khách",
        "bilingual_agent": "Trợ lý song ngữ Anh–Việt",
        "reminders": "Nhắc lịch hẹn",
        "messenger": "Facebook Messenger"
      }
```

Both files must be edited in the same commit. A key in one catalogue but not the other renders the raw key string to that locale's users.

- [ ] **Step 2: Replace the hardcoded maps**

In `components/billing-plan-card.tsx`, delete `PLAN_LABELS` (line 21), `PLAN_PRICES` (line 27) and `PLAN_FEATURES` (line 33) entirely. Add the import:

```ts
import { featuresForTier, PLAN_PRICE_USD } from "@/lib/plan-features";
```

- [ ] **Step 3: Render from the table**

Inside the `tiers.map((tier) => {` body, replace the `price` lookup and the two places using `PLAN_LABELS[tier]` / `PLAN_FEATURES[tier]`:

```tsx
        const isCurrent = currentTier === tier;
        const price = `$${PLAN_PRICE_USD[tier]}`;
        const planName = t(`dashboard.billing.planNames.${tier}`);
        const features = featuresForTier(tier);
```

Then in the JSX use `{planName}` where `PLAN_LABELS[tier]` was (the `CardTitle` and the `upgradeTo` interpolation), and render features as:

```tsx
                {features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <IconCheck className="h-4 w-4 text-primary" />
                    {t(`dashboard.billing.features.${feature}`)}
                  </li>
                ))}
```

The `price ? … : null` conditional around `/mo` can be dropped — `PLAN_PRICE_USD` has no nullable entries, since `tiers` is `["starter", "pro"] as const` and the record excludes `free`.

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: all green.

Run: `npm run doctor`
Expected: no new errors.

- [ ] **Step 5: Verify in the browser**

Start the dev server with the `preview_start` tool (never `npm run dev` in a shell), open `/dashboard/billing`, and confirm: Starter shows five features without Messenger, Pro shows six including Facebook Messenger, prices read $19 and $49. Toggle the dashboard locale to VI and confirm no raw keys like `dashboard.billing.features.web_embed` appear.

- [ ] **Step 6: Update the graph and commit**

```bash
graphify update .
git add components/billing-plan-card.tsx messages/en.json messages/vi.json
git commit -m "refactor(billing): render plan card from the feature table"
```

---

### Task 6: Landing page renders from the same table

**Files:**
- Modify: `app/_components/landing/sections.tsx:364-393` (the `PLANS` const) and the `Pricing()` feature list rendering around lines 436-512
- Modify: `messages/en.json` (`landing.pricing.plans`, around line 268-302)
- Modify: `messages/vi.json` (`landing.pricing.plans`, around line 271-305)

**Interfaces:**
- Consumes: `featuresForTier`, `PLAN_PRICE_USD` (Task 1); the `dashboard.billing.features.*` and `dashboard.billing.planNames.*` keys (Task 5).

- [ ] **Step 1: Rebind the plan list to real tiers**

Replace the `PlanId` type and `PLANS` const (lines 364-393) with:

```ts
/**
 * Starter and Pro mirror the real `PlanTier` values and derive their feature
 * lists from `lib/plan-features.ts`, so landing copy cannot advertise something
 * the backend does not grant.
 *
 * Enterprise is marketing-only: there is no `enterprise` PlanTier, no Stripe
 * price, and no backend. Its feature list stays hand-written because there is
 * nothing to derive it from. Do NOT "fix" this by adding it to
 * PLAN_FEATURE_TIERS — that would create a tier the system cannot honour.
 */
const PAID_PLANS = [
  { tier: "starter", popular: false },
  { tier: "pro", popular: true },
] as const;

const ENTERPRISE_PRICE = 199;
const ENTERPRISE_FEATURE_KEYS = ["f1", "f2", "f3", "f4", "f5"] as const;
const ENTERPRISE_SOON_KEYS = ["f5"] as const;
```

Add the import:

```ts
import { featuresForTier, PLAN_PRICE_USD } from "@/lib/plan-features";
```

- [ ] **Step 2: Update the i18n catalogues**

In `messages/en.json`, replace the `landing.pricing.plans` object with:

```json
      "plans": {
        "starter": {
          "description": "Website chat and real calendar booking.",
          "cta": "Start free trial"
        },
        "pro": {
          "description": "Adds Facebook Messenger so you catch clients where they already are.",
          "cta": "Start free trial"
        },
        "enterprise": {
          "name": "Enterprise",
          "description": "Higher limits, brand control, and priority support.",
          "cta": "Coming soon",
          "features": {
            "f1": "Everything in Pro",
            "f2": "Higher limits + custom FAQ",
            "f3": "1:1 support + priority SLA",
            "f4": "Brand-customized agent",
            "f5": "Voice + multi-location"
          }
        }
      }
```

In `messages/vi.json`, the matching replacement:

```json
      "plans": {
        "starter": {
          "description": "Chat trên website và đặt lịch trên lịch thật.",
          "cta": "Dùng thử miễn phí"
        },
        "pro": {
          "description": "Thêm Facebook Messenger để bắt khách ngay nơi họ đang nhắn.",
          "cta": "Dùng thử miễn phí"
        },
        "enterprise": {
          "name": "Enterprise",
          "description": "Giới hạn cao hơn, brand riêng, hỗ trợ ưu tiên.",
          "cta": "Sắp ra mắt",
          "features": {
            "f1": "Mọi thứ trong Pro",
            "f2": "Giới hạn cao + FAQ tùy chỉnh",
            "f3": "Hỗ trợ 1:1 + SLA ưu tiên",
            "f4": "Agent theo brand",
            "f5": "Voice + đa địa điểm"
          }
        }
      }
```

Starter and Pro no longer carry a `name` or a `features` block — those come from `dashboard.billing.planNames.*` and `dashboard.billing.features.*`, the same keys the dashboard card uses.

- [ ] **Step 3: Render the two real plans from the table**

`Pricing()` currently calls `useTranslations("landing.pricing")`, which is scoped. Add a second unscoped translator for the shared keys, right after the existing one:

```ts
const tRoot = useTranslations();
```

Replace the whole `<div className="grid gap-4 md:grid-cols-3">{PLANS.map(...)}</div>` block with the two paid cards derived from the table, followed by the hand-written Enterprise card:

```tsx
        <div className="grid gap-4 md:grid-cols-3">
          {PAID_PLANS.map((plan, i) => {
            const monthly = PLAN_PRICE_USD[plan.tier];
            const price = annual ? monthly * 10 : monthly;
            const period = annual ? t("perYear") : t("perMonth");
            const features = featuresForTier(plan.tier);
            return (
              <BlurFade delay={0.06 * i} inView key={plan.tier}>
                <article
                  className={cn(
                    "flex h-full flex-col rounded-[1.5rem] border p-6",
                    plan.popular
                      ? "border-white/30 bg-white text-black"
                      : "border-white/10 bg-zinc-950 text-white",
                  )}
                >
                  <div className="mb-6">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold">
                        {tRoot(`dashboard.billing.planNames.${plan.tier}`)}
                      </h3>
                      {plan.popular ? (
                        <span className="rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold text-white">
                          {t("popular")}
                        </span>
                      ) : null}
                    </div>
                    <p
                      className={cn(
                        "mt-2 text-sm",
                        plan.popular ? "text-zinc-600" : "text-zinc-400",
                      )}
                    >
                      {t(`plans.${plan.tier}.description`)}
                    </p>
                    <p className="mt-5 text-4xl font-semibold tracking-tight">
                      ${price}
                      <span className="text-base font-normal text-zinc-500">
                        {period}
                      </span>
                    </p>
                  </div>
                  <ul className="mb-8 flex flex-1 flex-col gap-2.5 text-sm">
                    {features.map((feature) => (
                      <li className="flex items-start gap-2" key={feature}>
                        <CheckIcon
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            plan.popular ? "text-black" : "text-zinc-300",
                          )}
                          weight="bold"
                        />
                        <span
                          className={cn(
                            plan.popular ? "text-zinc-700" : "text-zinc-300",
                          )}
                        >
                          {tRoot(`dashboard.billing.features.${feature}`)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    className={cn(
                      "inline-flex h-10 items-center justify-center rounded-full text-sm font-semibold transition",
                      plan.popular
                        ? "bg-black text-white hover:bg-zinc-800"
                        : "border border-white/15 bg-white/5 text-white hover:bg-white/10",
                    )}
                    href={ROUTES.SIGNUP}
                  >
                    {t(`plans.${plan.tier}.cta`)}
                  </Link>
                </article>
              </BlurFade>
            );
          })}

          <BlurFade delay={0.12} inView>
            <article className="flex h-full flex-col rounded-[1.5rem] border border-white/10 bg-zinc-950 p-6 text-white">
              <div className="mb-6">
                <h3 className="text-lg font-semibold">
                  {t("plans.enterprise.name")}
                </h3>
                <p className="mt-2 text-sm text-zinc-400">
                  {t("plans.enterprise.description")}
                </p>
                <p className="mt-5 text-4xl font-semibold tracking-tight">
                  ${annual ? ENTERPRISE_PRICE * 10 : ENTERPRISE_PRICE}
                  <span className="text-base font-normal text-zinc-500">
                    {annual ? t("perYear") : t("perMonth")}
                  </span>
                </p>
              </div>
              <ul className="mb-8 flex flex-1 flex-col gap-2.5 text-sm">
                {ENTERPRISE_FEATURE_KEYS.map((fk) => {
                  const soon = ENTERPRISE_SOON_KEYS.includes(
                    fk as (typeof ENTERPRISE_SOON_KEYS)[number],
                  );
                  return (
                    <li className="flex items-start gap-2" key={fk}>
                      <CheckIcon
                        className={cn(
                          "mt-0.5 size-4 shrink-0 text-zinc-300",
                          soon && "opacity-40",
                        )}
                        weight="bold"
                      />
                      <span className={cn("text-zinc-300", soon && "opacity-60")}>
                        {t(`plans.enterprise.features.${fk}`)}
                        {soon ? (
                          <span className="ml-1.5 rounded-full border border-white/15 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                            {t("comingSoon")}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <span className="inline-flex h-10 cursor-default items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-zinc-500 opacity-60">
                {t("plans.enterprise.cta")}
              </span>
            </article>
          </BlurFade>
        </div>
```

Two behavioural notes on this rewrite:

- The `soonKeys` mechanism no longer applies to Starter or Pro. Every feature in the table is built, so nothing on those two cards can be "Soon" — that is the entire point of deriving from the table. `soon` handling survives only on the Enterprise card.
- Enterprise keeps its non-interactive `<span>` CTA and its own price constant, unchanged from today's behaviour.

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run doctor`
Expected: no new errors.

- [ ] **Step 5: Verify in the browser**

Using `preview_start`, load `/` and scroll to `#pricing`. Confirm with `read_page`:
- Card headings read **Starter** and **Pro**, not Basic/Premium
- Monthly toggle shows $19 and $49; annual shows $190 and $490
- Starter lists five features and does **not** list Facebook Messenger
- Pro lists six features including Facebook Messenger
- Enterprise still shows $199 with a non-interactive "Coming soon"

Then click the VI language toggle and confirm no raw keys render.

- [ ] **Step 6: Update the graph and commit**

```bash
graphify update .
git add app/_components/landing/sections.tsx messages/en.json messages/vi.json
git commit -m "refactor(landing): derive pricing copy from the feature table"
```

---

### Task 7: Align the strategy doc

**Files:**
- Modify: `docs/ceo-evaluation.md:79-85`

The pricing table there still lists three tiers with booking quotas (Starter $19 / Pro $49 / Business $99, "50 bookings/mo" etc.). Left as-is it becomes the next source of drift — it is already the third conflicting pricing table found during this work.

- [ ] **Step 1: Replace the pricing table**

Replace the `### Pricing model` table with:

```markdown
| Tier | Giá | Ranh giới |
|------|-----|-----------|
| Starter | $19/tháng | Web chat widget, đặt lịch Cal.com, FAQ + intake, agent song ngữ, nhắc lịch |
| Pro | $49/tháng | Toàn bộ Starter + Facebook Messenger (Zalo khi xây xong) |

Không giới hạn số booking và không giới hạn số nhân viên — xem
`docs/superpowers/specs/2026-08-02-plan-feature-gating-design.md`. Quota booking
bị bỏ vì nó chặn doanh thu của chính khách hàng đúng lúc họ đông khách nhất,
trong khi chi phí biên mỗi booking gần bằng 0. Ranh giới thật giữa hai gói là
**kênh chat**, khai báo trong `lib/plan-features.ts`.
```

- [ ] **Step 2: Update the feature-gap row**

In the "Feature gaps nên làm sớm" table, row 2 (`WhatsApp/Zalo channel`), append to the value column: `— Facebook Messenger đã xong và là ranh giới Starter/Pro; Zalo vẫn chưa có.`

- [ ] **Step 3: Commit**

```bash
git add docs/ceo-evaluation.md
git commit -m "docs: align pricing model with enforced plan features"
```

---

### Task 8: Full verification

**Files:** none modified.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: every test passes, including the 19 in `lib/plan-features.test.ts`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Full react-doctor scan**

Run: `npm run doctor:full`
Expected: score not lower than the pre-change baseline of 66/100.

- [ ] **Step 4: Confirm no stale copy remains**

Run a search for strings that should no longer exist anywhere outside the spec and this plan:

```bash
grep -rn "bookings/mo\|Basic\b.*Premium\|50 bookings\|200 bookings" --include=*.ts --include=*.tsx --include=*.json .
```

Expected: no hits in `app/`, `components/`, `lib/`, or `messages/`.

- [ ] **Step 5: Manual end-to-end check**

Follow `.claude/skills/test-feature` for the Messenger connection path. With `BILLING_MODE=live` and a test workspace set to `plan_tier = 'starter'`, confirm:
- `/dashboard/settings` shows "Upgrade to Pro to connect" instead of the Connect button
- Hitting `/api/messenger/oauth/start` directly returns 403 with the `PLAN_UPGRADE_REQUIRED` message, not a redirect to Facebook
- Setting the workspace to `plan_tier = 'pro'` restores the Connect button and the redirect

- [ ] **Step 6: Final commit if anything was fixed**

```bash
graphify update .
git add -A
git commit -m "chore: verification fixes for plan feature gating"
```

---

## Self-Review Notes

Checked against `docs/superpowers/specs/2026-08-02-plan-feature-gating-design.md`:

| Spec section | Task |
|---|---|
| §1 `lib/plan-features.ts` table + `effectiveTier` / `canUseFeature` | Task 1 |
| §2 Enforcement, gate point, deliberate non-gate on `agent/channels/messenger.ts` | Task 3 |
| §3 New error code | Task 2 |
| §4 UI states (three cases) | Task 4 |
| §5 Copy derives — billing card | Task 5 |
| §5 Copy derives — landing, Enterprise exception, docs | Tasks 6, 7 |
| §6 No migration | n/a — asserted, nothing to do |
| Testing table | Task 1 (pure logic) + Task 3 (guard, DB-backed) |

Deviations from the spec, both discovered while reading the code to write this plan and both since corrected in the spec itself:

1. The spec originally said the new error code gets "EN and VI copy". `lib/errors/app-messages.ts` is English-only (`Record<AppErrorCode, string>`); a VI map does not exist there.
2. The spec's §4 implied the upgrade CTA would be internationalised. `messenger-connection-card.tsx` and `settings/page.tsx` hardcode English throughout, so the CTA follows suit and next-intl wiring for those two files is explicitly out of scope.
