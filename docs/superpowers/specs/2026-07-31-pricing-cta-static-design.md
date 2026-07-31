# Landing Page Pricing — Static CTA Rework

**Date:** 2026-07-31
**Status:** approved

## Context

The landing page pricing section (`app/_components/landing/sections.tsx` `Pricing()`) shows three plan tiers (Basic $39, Premium $89, Enterprise $199) with per-plan CTA buttons all linking to `/signup`. This is misleading because:

- No plan selection exists at signup — every signup gets a free workspace
- The billing backend (`app/dashboard/billing/`) only supports "free" tier currently
- Paid plans aren't chargeable yet

## Decision

Keep pricing static and informational. Change only the CTAs so visitors aren't misled into thinking they're purchasing a specific plan.

### Changes

**1. i18n strings** (`messages/en.json`, `messages/vi.json`):

| Plan | Old CTA | New CTA |
|------|---------|---------|
| Basic | "Get started" | "Start free trial" |
| Premium | "Choose Premium" | "Start free trial" |
| Enterprise | "Get started" | "Coming soon" |

**2. CTA rendering** (`app/_components/landing/sections.tsx` `Pricing()`):

- Basic & Premium: `<a href="/signup">` with "Start free trial" — unchanged href, just new label
- Enterprise: `<span>` non-interactive, muted styling (opacity-50, cursor-default) — no href, no hover

**3. No changes to:** layout, prices, feature lists, monthly/annual toggle, "Popular" badge, plan descriptions.

## Rationale

- Basic/Premium → `/signup` is honest: signup is free, trial exists, no credit card required
- Enterprise → "Coming soon" is honest: no Enterprise infrastructure exists yet, and Enterprise is typically sales-led anyway
- Minimal diff — only strings + one conditional, no structural refactor
