# Rerun

## Mission
Create implementation-ready, token-driven UI guidance for Rerun that is optimized for consistency, accessibility, and fast delivery across marketing site.

## Brand
- Product/brand: Rerun
- URL: https://rerun.build/?ref=producthunt#pricing
- Audience: authenticated users and operators
- Product surface: marketing site

## Style Foundations
- Visual style: structured, tokenized, content-first
- Main font style: `font.family.primary=Inter`, `font.family.stack=Inter, Inter Fallback`, `font.size.base=16px`, `font.weight.base=400`, `font.lineHeight.base=24px`
- Typography scale: `font.size.xs=11px`, `font.size.sm=12px`, `font.size.md=12.8px`, `font.size.lg=14px`, `font.size.xl=16px`, `font.size.2xl=18px`, `font.size.3xl=20px`, `font.size.4xl=24px`
- Color palette: `color.text.primary=lab(98.26 0 0)`, `color.text.secondary=lab(84.92 0 -0.0000119209)`, `color.text.tertiary=lab(96.52 -0.0000298023 0.0000119209)`, `color.text.inverse=lab(66.128 -0.0000298023 0.0000119209)`, `color.surface.base=#000000`, `color.surface.muted=oklab(0.1702 -0.00000168182 0.00000399299)`, `color.surface.raised=lab(7.78201 -0.0000149012 0)`, `color.surface.strong=oklab(0.999998 -0.00000980496 0.0000234246 / 0.045)`, `color.border.default=lab(100 0 0 / 0.1)`, `color.border.muted=lab(15.204 0 -0.00000596046)`
- Spacing scale: `space.1=4px`, `space.2=6px`, `space.3=8px`, `space.4=10px`, `space.5=12px`, `space.6=14px`, `space.7=16px`, `space.8=24px`
- Radius/shadow/motion tokens: `radius.xs=8px`, `radius.sm=10px`, `radius.md=14px`, `radius.lg=33554400px` | `shadow.1=rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, oklab(0.268999 -0.00000260025 0.00000627339 / 0.8) 0px 0px 0px 1px, rgba(0, 0, 0, 0) 0px 0px 0px 0px`, `shadow.2=rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.25) 0px 25px 50px -12px`, `shadow.3=rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px` | `motion.duration.instant=150ms`, `motion.duration.fast=200ms`, `motion.duration.normal=300ms`

## Accessibility
- Target: WCAG 2.2 AA
- Keyboard-first interactions required.
- Focus-visible rules required.
- Contrast constraints required.

## Writing Tone
Concise, confident, implementation-focused.

## Note for Eve booking app
Use these dark, tokenized surfaces for chat/auth UI: black base, muted raised panels, light primary text, subtle borders. Prefer Inter. Keep components state-complete (default/hover/focus/disabled/error).
