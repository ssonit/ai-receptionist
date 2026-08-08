# AI Booking Agent — Text-first MVP

Eve + Next.js agent that answers FAQ, checks Cal.com availability, and creates bookings. Auth uses Supabase (`profiles` trigger on `auth.users`).

## Routes

| Path | Purpose |
|------|---------|
| `/` | SaaS marketing landing |
| `/chat` | **Product demo** — always Eve Pilot sandbox (seeded FAQ / persona) |
| `/b/[slug]` | Real tenant booking page (brand + chat) |
| `/login` `/signup` | Auth |
| `/dashboard` | Booking management (bookings, leads, stats) |

## Data model

- Multi-tenant: signup creates a **new** `workspaces` row; `profiles.workspace_id` links the owner
- Marketing demo: Eve Pilot from `supabase/seed.sql` (`slug = eve-pilot`) — used only by `/chat`
- Tenant public link: `/b/{slug}` (copy from Settings after setup)
- Core tables: `leads`, `bookings`, `conversation_logs`, FAQ, event types, chat, notifications

**Ops:** `/chat` (Eve Pilot) uses `CALCOM_API_KEY` / event type from **env** (your sandbox). Real workspaces use their own API key from Setup — never the shared env key.

Migrations / baseline / seed workflow: [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md).
Deploy lên production: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Env

Copy `.env.example` → `.env.local`.

**Models (per-provider keys — not AI Gateway):**

| Env | Provider | Slots |
|-----|----------|--------|
| `DEEPSEEK_API_KEY` | DeepSeek | `deepseekFlash`, `deepseekPro` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google | `geminiFlash` |
| `ANTHROPIC_API_KEY` | Anthropic | `claudeHaiku` |

Also set Cal.com keys for real booking, and Supabase keys for auth/dashboard.
