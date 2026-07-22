# Smoke checklist — Text-first MVP

## Prerequisites

- [ ] Node.js 24.x
- [ ] Docker running (for local Supabase)
- [ ] Copy `.env.example` → `.env.local` and fill keys
- [ ] At least one provider key: `DEEPSEEK_API_KEY` and/or `GOOGLE_GENERATIVE_AI_API_KEY` and/or `ANTHROPIC_API_KEY`
- [ ] On Windows: `npm run patch:eve` (also runs via postinstall) so Eve resolves its own `dist/` under Next `withEve`
- [ ] Cal.com API key + event type (or username + slug) for booking tests
- [ ] `npx supabase start` then paste URL/anon/service_role into `.env.local`
- [ ] `npx supabase db reset` applies migrations + `supabase/seed.sql` (FAQ workspace)

## Auth / profiles

- [ ] Open `/signup`, create an account
- [ ] Confirm row in `profiles` (id, email, workspace_id = pilot)
- [ ] `/login` works and redirects to `/dashboard`
- [ ] `/dashboard` shows profile + stats; unauthenticated redirects to `/login`

## Text agent FAQ

- [ ] Open `/chat`
- [ ] Edit FAQ in Supabase Studio → `workspace_faq` (+ `workspaces` for phone/address)
- [ ] Ask giá / dịch vụ → no invented advice; stay in booking scope

## Availability + booking

- [ ] Ask “Còn trống tuần sau không?” → agent calls `check_availability`
- [ ] Only real Cal.com slots are offered
- [ ] Confirm name + phone + email + slot → `book_appointment` (`guestName`)
- [ ] Event appears on Cal.com calendar
- [ ] `/dashboard/bookings` syncs Cal.com → Supabase on load
- [ ] Row appears in Supabase `bookings` (+ optional `leads`)
- [ ] `/dashboard` lists the new booking

## Out of scope (do not block MVP)

- WhatsApp / Twilio
- Retell voice
- Multi-tenant onboarding / Stripe

## Commands

```bash
npx supabase start
npx supabase db reset
npm run dev
# optional agent REPL without UI:
npm exec -- eve dev --no-ui
```
