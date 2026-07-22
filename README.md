# AI Booking Agent — Text-first MVP

Eve + Next.js agent that answers FAQ, checks Cal.com availability, and creates bookings. Auth uses Supabase (`profiles` trigger on `auth.users`).

## Routes

| Path | Purpose |
|------|---------|
| `/` | Landing |
| `/chat` | Public booking chat |
| `/login` `/signup` | Auth |
| `/dashboard` | Booking management (bookings, leads, stats) |

## Data model (pilot)

- `workspaces` — single-tenant seed workspace
- `profiles.workspace_id` — linked on signup
- `leads` / `bookings` / `conversation_logs` — agent mirrors

## Env

Copy `.env.example` → `.env.local`.

**Models (per-provider keys — not AI Gateway):**

| Env | Provider | Slots |
|-----|----------|--------|
| `DEEPSEEK_API_KEY` | DeepSeek | `deepseekFlash`, `deepseekPro` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google | `geminiFlash` |
| `ANTHROPIC_API_KEY` | Anthropic | `claudeHaiku` |

Also set Cal.com keys for real booking, and Supabase keys for auth/dashboard.
