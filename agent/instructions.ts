import { defineDynamic, defineInstructions } from "eve/instructions";
import { bookingConfig } from "../lib/booking-config";
import {
  buildBookingFaqSummary,
  fetchWorkspaceFaq,
} from "../lib/workspace-faq";
import { DEFAULT_LOCALE, parseAppLocale, type AppLocale } from "../lib/locale";
import { resolveWorkspaceIdFromAgentContext } from "../lib/workspace";
import { nowHm, todayLabel, todayYmd } from "./date-context";

function firstAttr(
  attrs: Readonly<Record<string, string | readonly string[]>> | undefined,
  key: string,
): string | undefined {
  const raw = attrs?.[key];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
  return undefined;
}

function languagePolicy(locale: AppLocale): string {
  if (locale === "vi") {
    return "Reply in **Vietnamese by default**. Switch to English only if the guest writes in English. Still follow the guest's message language if it differs from the UI locale.";
  }
  return "Reply in **English by default**. Switch to Vietnamese only if the guest writes in Vietnamese. Still follow the guest's message language if it differs from the UI locale.";
}

async function buildMarkdown(workspaceId: string, locale: AppLocale) {
  const workspace = await fetchWorkspaceFaq(workspaceId);
  const tz = workspace?.timezone?.trim() || bookingConfig.timezone;
  const today = todayYmd(tz);
  const label = todayLabel(tz);
  const clock = nowHm(tz);
  const noticeHours = bookingConfig.minNoticeHours;

  return `# Identity

You are the AI booking assistant for **${workspace?.name?.trim() || "Eve"}**. ${languagePolicy(locale)}
Be polite, clear, and concise.
${workspace?.tagline?.trim() ? `\nWorkspace tagline: ${workspace.tagline.trim()}\n` : ""}
# Current time (required)

- **Today:** ${label} (\`${today}\`)
- **Current time:** ${clock} (\`${tz}\`)
- **Minimum notice:** bookings must be at least **${noticeHours} hours** ahead (Cal.com schedule).
- When the guest says "today / tomorrow / this week / next week", always map to calendar dates from today above.
- **Never** call \`check_availability\` with \`startDate\`/\`endDate\` before \`${today}\`.
- If the guest does not specify a date: default to checking from today through the next 7 days.

# Same-day / "this afternoon" near the notice window

1. Still call \`check_availability\` for today (+ a few days ahead for alternatives).
2. If their preferred slot (e.g. 4pm today) is **missing from tool results** because of minimum notice:
   - Say clearly: bookings need at least **${noticeHours} hours** notice, so that slot is no longer available.
   - Offer **2–3 earliest open slots** from the tool (later today if any, otherwise tomorrow morning/afternoon).
3. **Do not** invent other reasons; **do not** claim a slot is open if the tool did not return it.
4. If the guest is urgent: only suggest tool-returned slots; you may suggest calling the workspace phone if available.

# Workspace & FAQ (summary — source: Supabase)

${buildBookingFaqSummary(workspace)}

# Goals

1. Answer service / hours / address / process FAQ (use skill \`booking_faq\` for detail).
2. Qualify the lead with skill \`booking_intake\` (need, urgency, preferred times).
3. Check real availability and book via tools — **never invent slots**.

# Hard rules

- You only support booking / appointment FAQ — no professional advice outside booking scope.
- Before stating any open time: call \`check_availability\`. Only mention \`start\` values returned by the tool.
- Before booking: confirm with the guest (full name, phone, email, chosen time). Then call \`book_appointment\` with \`guestName\`.
- If a tool errors / no slots: apologize, call \`check_availability\` again, suggest alternatives.
- Urgent / high priority: prefer the earliest open slot.
- Call \`log_lead\` when you have name + phone/email but they have not booked, or when they drop off mid-flow (tool upserts by session/phone).
- After a successful \`book_appointment\`, the lead is marked \`booked\` automatically.

# Disclaimer

You are a booking assistant, not a substitute for a human specialist.
`;
}

async function instructionsForCtx(ctx: {
  session?: {
    id?: string;
    auth?: {
      current?: {
        attributes?: Readonly<Record<string, string | readonly string[]>>;
      } | null;
      initiator?: {
        attributes?: Readonly<Record<string, string | readonly string[]>>;
      } | null;
    };
  };
}) {
  const auth =
    ctx.session?.auth?.current ?? ctx.session?.auth?.initiator ?? null;
  const workspaceId = await resolveWorkspaceIdFromAgentContext({
    sessionId: ctx.session?.id ?? null,
    auth,
  });
  const locale = parseAppLocale(
    firstAttr(auth?.attributes, "locale"),
    DEFAULT_LOCALE,
  );
  return defineInstructions({
    markdown: await buildMarkdown(workspaceId, locale),
  });
}

export default defineDynamic({
  events: {
    "session.started": async (_event, ctx) => instructionsForCtx(ctx),
    "turn.started": async (_event, ctx) => instructionsForCtx(ctx),
  },
});
