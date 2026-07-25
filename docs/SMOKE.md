# Smoke checklist — Text-first MVP

## Prerequisites

- [ ] Node.js 24.x
- [ ] Docker running (for local Supabase)
- [ ] Copy `.env.example` → `.env.local` and fill keys
- [ ] At least one provider key: `DEEPSEEK_API_KEY` and/or `GOOGLE_GENERATIVE_AI_API_KEY` and/or `ANTHROPIC_API_KEY`
- [ ] On Windows: `npm run patch:eve` (also runs via postinstall) so Eve resolves its own `dist/` under Next `withEve`
- [ ] Cal.com API key + meeting type (or username + slug) for booking tests
- [ ] `npx supabase start` then paste URL/anon/service_role into `.env.local`
- [ ] `npx supabase db reset` applies migrations under `supabase/migrations/` then `supabase/seed.sql`, including:
  - `20260724000001_init_schema.sql`
  - `20260724000003_chat_branding.sql`
  - `20260724000004_slugify_vietnamese.sql`
  - `20260724000005_chat_messages_cursor.sql` (chat keyset pagination indexes)
  - `20260724000006_agent_reply_customs.sql` (tone / reply locale / handoff / placeholder)
  - `20260724000007_workspace_starter_defaults.sql` (signup AI/chat/FAQ defaults + backfill)
  - `20260724000008_workspace_invites.sql` (staff invite links + join path)
  - `20260725000001_guest_booking_manage.sql` (guest cancel ownership + OTP tables)
  - `20260725000002_guest_timezone.sql` / `20260725000003_onsite_clear_guest_timezone.sql`
  - `20260725000004_booking_reminders.sql` (cron reminders + manage_link + opt-out)
- [ ] Landing → **Dùng thử ngay** → `/chat` (Eve Pilot demo + banner)
- [ ] Tenant booking page: `/b/{slug}` (Settings copy link); pilot layout preview: `/b/eve-pilot`
- [ ] New signup workspaces get AI/chat/FAQ starter defaults; empty FAQ form also pre-fills starter Q&A until saved
- [ ] Eve Pilot `/chat` demo uses env `CALCOM_*` (sandbox calendar). Tenant workspaces use their own Setup API key only.

## Tenant happy path (ordered)

Run this path for a **real tenant workspace** — not Eve Pilot `/chat`.

1. [ ] `/signup` → account + **new** `workspaces` row (id ≠ pilot `00000000-0000-4000-8000-000000000001`) → redirect `/dashboard/setup`
2. [ ] Setup: Cal.com API key (step 1) + AI meeting type (step 2) required → Complete / Skip profile (step 3 optional)
3. [ ] Confirm starter defaults (or edit lightly): FAQ at `/dashboard/faq`, persona at `/dashboard/agent`, contact/tagline at `/dashboard/settings`
4. [ ] Settings → copy public booking link → open `/b/{your-slug}` (do **not** use `/chat` for this path)
5. [ ] On `/b/{slug}`: ask hours / services → agent stays in scope; ask availability → `check_availability`; confirm name + phone + email + slot → `book_appointment`
6. [ ] Cal.com shows the event; `/dashboard/bookings` syncs → row in Supabase `bookings`; lead status `booked` on `/dashboard/leads`
7. [ ] Separate incomplete chat (name + phone, no book) → `log_lead` → lead status `new`

## Cancel / reschedule via chat (guest ownership — no login)

1. [ ] Same chat after book → ask “what did I book?” → `list_my_appointments` shows row; cancel works (A1)
2. [ ] Agent reads one-time manage code after book; code redacted in scrollback after persist
3. [ ] New chat same browser → list may show `needsPhoneLast4`; last-4 phone → verify → cancel (A2)
4. [ ] Other browser → manage code or OTP email → verify → reschedule (B/C); without `RESEND_API_KEY`, OTP falls through to staff request
5. [ ] No proof → `request_booking_change` → dashboard notification; agent must not claim cancelled
6. [ ] Spoof `x-eve-chat-session` without matching visitor cookie → no claimable bookings
7. [ ] Settings toggles guest cancel/reschedule + cutoff; Pilot demo should refuse guest cancel

## Invite staff (Phase 3)

1. [ ] Owner: `/dashboard/settings` → Team → create invite (optional email) → copy `/invite/{token}`
2. [ ] Incognito / other browser: open invite → **Create account & join** → signup with invite token → lands `/dashboard` (not setup) as **staff**, same `workspace_id` as owner
3. [ ] Staff sees Team members (read-only); cannot create invites
4. [ ] Owner pending list → Revoke unused invite
5. [ ] Normal `/signup` (no invite) still creates a **new** workspace + setup flow
6. [ ] Logged-in user with incomplete empty workspace can Accept invite → orphan workspace removed; account already in a completed workspace is refused

## Auth / profiles

- [ ] Open `/signup`, create an account
- [ ] Confirm `profiles` row + **new** `workspaces` row (not the pilot id); incomplete setup → `/dashboard/setup`
- [ ] Setup: bước 1 Cal + bước 2 meeting type **bắt buộc**; bước 3 hồ sơ **tuỳ chọn** (Skip dùng mặc định từ signup)
- [ ] Đóng tab giữa setup (sau khi đã lưu Cal/type) → login lại → resume đúng step; không vào `/dashboard` đến khi Hoàn tất hoặc Skip hồ sơ
- [ ] Skip hồ sơ (đủ Cal+type) → vào Dashboard; `/b/{slug}` mở được với slug signup
- [ ] `/login` works and redirects to `/dashboard` (or setup)
- [ ] `/dashboard` shows profile + stats; unauthenticated redirects to `/login`
- [ ] Marketing demo `/chat` always uses Eve Pilot; your bookings appear under `/b/{your-slug}`

## Text agent FAQ (demo / pilot)

- [ ] Open `/chat` (demo) or `/b/eve-pilot` (booking-page layout of pilot)
- [ ] Demo banner visible on `/chat` only
- [ ] Edit FAQ at `/dashboard/faq`; workspace contact at `/dashboard/settings`; AI greeting / persona / tone / reply language / meeting type at `/dashboard/agent`
- [ ] Ask giá / dịch vụ → no invented advice; stay in booking scope

## Availability + booking (demo or tenant)

Prefer **Tenant happy path** above for product sign-off. Pilot checks:

- [ ] Ask “Còn trống tuần sau không?” → agent calls `check_availability`
- [ ] Only real Cal.com slots are offered
- [ ] Confirm name + phone + email + slot → `book_appointment` (`guestName`)
- [ ] Event appears on Cal.com calendar
- [ ] `/dashboard/bookings` syncs Cal.com → Supabase on load
- [ ] Row appears in Supabase `bookings`; lead → status `booked` on `/dashboard/leads`
- [ ] `/dashboard` lists the new booking; `/dashboard/leads` shows chat leads
- [ ] Incomplete chat with name+phone → `log_lead` creates/updates lead (`new`)

## Out of scope (do not block MVP)

- WhatsApp / Twilio
- Retell voice
- Stripe billing / WhatsApp production channels
- Dashboard cancel / reschedule UI (agent-first only in Phase 2)
- Multi-workspace per user, owner transfer, billing seats

## Outbound reminders (cron)

1. [ ] Set `CRON_SECRET` in `.env.local` (and Vercel project env)
2. [ ] Migration `20260725000004_booking_reminders.sql` applied
3. [ ] `GET /api/cron/tick` without Bearer → **401**
4. [ ] Settings → enable **Outbound reminders**; upcoming booking with guest email
5. [ ] Tick with `Authorization: Bearer $CRON_SECRET` → sync + reminder rows; email when due (`RESEND_API_KEY`)
6. [ ] Open manage link from email → chat verified, `?mt=` stripped; second open refused
7. [ ] Unsubscribe link → no further reminders for that booking

## Commands

```bash
npx supabase start
npx supabase db reset
npm run dev
# optional agent REPL without UI:
npm exec -- eve dev --no-ui
```
