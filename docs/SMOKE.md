# Smoke checklist — Text-first MVP

## Prerequisites

- [ ] Node.js 24.x
- [ ] Docker running (for local Supabase)
- [ ] Copy `.env.example` → `.env.local` and fill keys
- [ ] At least one provider key: `DEEPSEEK_API_KEY` and/or `GOOGLE_GENERATIVE_AI_API_KEY` and/or `ANTHROPIC_API_KEY`
- [ ] On Windows: `npm run patch:eve` (also runs via postinstall) so Eve resolves its own `dist/` under Next `withEve`
- [ ] Cal.com API key + meeting type (or username + slug) for booking tests
- [ ] `npx supabase start` then paste URL/anon/service_role into `.env.local`
- [ ] `npx supabase db reset` applies `20260724000001_init_schema.sql` + `supabase/seed.sql`
- [ ] Landing → **Dùng thử ngay** → `/chat` (Eve Pilot demo + banner)
- [ ] Tenant booking page: `/b/{slug}` (Settings copy link); pilot layout preview: `/b/eve-pilot`
- [ ] New signup workspaces get AI/chat/FAQ starter defaults; empty FAQ form also pre-fills starter Q&A until saved
- [ ] Eve Pilot `/chat` demo uses env `CALCOM_*` (sandbox calendar). Tenant workspaces use their own Setup API key only.

## Auth / profiles

- [ ] Open `/signup`, create an account
- [ ] Confirm `profiles` row + **new** `workspaces` row (not the pilot id); incomplete setup → `/dashboard/setup`
- [ ] Setup: bước 1 Cal + bước 2 meeting type **bắt buộc**; bước 3 hồ sơ **tuỳ chọn** (Skip dùng mặc định từ signup)
- [ ] Đóng tab giữa setup (sau khi đã lưu Cal/type) → login lại → resume đúng step; không vào `/dashboard` đến khi Hoàn tất hoặc Skip hồ sơ
- [ ] Skip hồ sơ (đủ Cal+type) → vào Dashboard; `/b/{slug}` mở được với slug signup
- [ ] `/login` works and redirects to `/dashboard` (or setup)
- [ ] `/dashboard` shows profile + stats; unauthenticated redirects to `/login`
- [ ] Marketing demo `/chat` always uses Eve Pilot; your bookings appear under `/b/{your-slug}`

## Text agent FAQ

- [ ] Open `/chat` (demo) or `/b/eve-pilot` (booking-page layout of pilot)
- [ ] Demo banner visible on `/chat` only
- [ ] Edit FAQ at `/dashboard/faq` (or Supabase Studio → `workspace_faq_items`); workspace contact at `/dashboard/settings`; AI greeting / persona / tone / reply language / meeting type at `/dashboard/agent`
- [ ] Ask giá / dịch vụ → no invented advice; stay in booking scope

## Availability + booking

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

## Commands

```bash
npx supabase start
npx supabase db reset
npm run dev
# optional agent REPL without UI:
npm exec -- eve dev --no-ui
```
