# Distribution & Growth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa eve-booking ra trước mặt người dùng thật (embed widget + Cal.com app store), đo được hiệu quả (analytics), và ngừng bán thứ chưa tồn tại (trang giá + Resend domain).

**Architecture:** Bốn phase độc lập, ship riêng được. Phase 0–1 là dọn nợ (ops + copy, gần như không có code). Phase 2 là instrumentation nền để đo mọi thứ sau đó. Phase 3 là widget nhúng — một script tĩnh không phụ thuộc build + một route chat tối giản chạy trong iframe. Phase 4 là quy trình submit PR vào monorepo Cal.com.

**Tech Stack:** Next.js 16 (App Router), Supabase, PostHog (`posthog-js` + `posthog-node`), vanilla JS cho `public/embed.js` (không build step).

## Global Constraints

- **Không có test runner trong repo.** Không có vitest/jest/playwright (`package.json`). Vòng kiểm chứng của mỗi task là: `npm run typecheck` → `npm run doctor` (nếu chạm React) → một bước kiểm tra thủ công cụ thể được ghi rõ trong task. **Không được** bịa ra `npm test`.
- **Sau mỗi task chạm React/UI:** `npm run doctor`. Điểm tụt hoặc có error → sửa trước khi commit.
- **Sau mỗi task chạm code:** `graphify update .` trước khi commit.
- **Tenant isolation:** mọi truy vấn dữ liệu tenant phải `.eq("workspace_id", workspaceId)`. Không bao giờ fallback về Eve Pilot khi đã có tenant hint. Xem `.claude/rules/tenant-isolation.md`.
- **Lỗi hiển thị cho người dùng:** dùng `APP_ERROR_CODE` + `appErrorMessage` trong `lib/errors/`. Không hardcode chuỗi lỗi tiếng Anh trong `actions.ts`. Xem `.claude/rules/errors.md`.
- **Chuỗi UI sản phẩm:** qua `messages/en.json` + `messages/vi.json`. Top-level namespace hiện có: `chat`, `dashboard`, `common`. Không hardcode tiếng Việt.
- **Migration:** file mới trong `supabase/migrations/`, timestamp sort sau `20260725000005`. Không sửa migration đã tồn tại. RLS bắt buộc trên mọi bảng tenant.
- **Commit thường xuyên,** mỗi task một commit.

## Bối cảnh repo (đọc trước khi bắt đầu)

Trạng thái hiện tại từ các plan đã hoàn thành:

| Doc | Đã ship | Liên quan |
|-----|---------|-----------|
| `guest-booking-change.md` | Hủy/đổi lịch không cần đăng nhập. Thang xác minh A1 (cùng phiên) / A2 (cùng `visitor_id` + 4 số cuối SĐT) / B (mã quản lý) / C (OTP email) / D (chuyển staff) | **Bậc A phụ thuộc cookie `eve_visitor_id`** — xem cảnh báo Task 8 |
| `guest-timezone.md` | `workspaces.service_mode` (`onsite`/`online`), `bookings.guest_timezone`, header `x-eve-tz` | Route embed phải gửi header này giống `/b/[slug]` |
| `outbound-reminders.md` | Vercel Cron `/api/cron/tick`, bảng `booking_reminders`, magic link `?mt=`, opt-out | Phase 0 (Resend) quyết định nó có hoạt động thật không |
| `setup-wizard-reorder.md` | Tách `setup_completed_at` (mở dashboard) khỏi `bookingLive` (phát hành trang công khai) | Route embed phải gate bằng `bookingLive`, **không** phải `setup_completed_at` |

Hàm/khái niệm sẽ dùng lại: `getPublicBookingWorkspace(slug)` → có field `bookingLive`; `isWorkspaceBookingLive(workspaceId)`; `publicBookingPath(slug)`.

## Scope note

**Billing (Stripe/Paddle + gói cước + giới hạn) KHÔNG nằm trong plan này.** Nó là subsystem riêng: schema gói cước, webhook, cổng thanh toán, enforcement giới hạn theo gói — đủ lớn cho một plan độc lập, và nó phụ thuộc vào dữ liệu từ Phase 2 (analytics) để biết nên đóng gói theo chiều nào. Viết plan riêng sau khi Phase 2 chạy được ~2 tuần.

## File Structure

**Tạo mới:**
- `public/embed.js` — script nhúng cho website bên thứ ba. Vanilla JS, không import, không build step, phục vụ tĩnh. Trách nhiệm: đọc data-attribute, dựng bubble + iframe, toggle.
- `app/embed/[slug]/page.tsx` — route chat tối giản chạy trong iframe. Không header/nav/footer. Gate bằng `bookingLive`.
- `app/embed/[slug]/embed-chat.tsx` — client shell bọc `AgentChat` cho ngữ cảnh iframe.
- `app/dashboard/embed/page.tsx` — trang dashboard hiện snippet để copy.
- `app/dashboard/embed/embed-snippet.tsx` — client component với nút copy.
- `lib/analytics-client.ts` — PostHog phía browser (`posthog-js`), khởi tạo + `track()`.
- `lib/analytics-server.ts` — PostHog phía server (`posthog-node`), `trackServer()` + `flush()`.
- `lib/analytics-events.ts` — hằng số tên event dùng chung cho cả hai phía. **Nguồn chân lý duy nhất** để tên event không lệch.
- `components/providers/posthog-provider.tsx` — provider gắn vào root layout.
- `docs/ops/resend-domain-setup.md` — runbook vận hành Resend.
- `docs/ops/calcom-app-submission.md` — runbook submit Cal.com app.

**Sửa:**
- `app/_components/landing-page.tsx:57-104` — mảng `plans`, gỡ/đánh dấu feature chưa có.
- `next.config.ts` — thêm `headers()` cho `frame-ancestors`.
- `app/layout.tsx` — bọc PostHogProvider.
- `.env.example` — biến PostHog.
- `messages/en.json`, `messages/vi.json` — chuỗi cho trang embed dashboard.
- `components/dashboard-sidebar.tsx` (hoặc file nav tương đương) — link tới `/dashboard/embed`.

---

# Phase 0 — Resend domain (ops, không code)

### Task 1: Runbook verify domain gửi mail

Toàn bộ tính năng outbound reminders vừa ship **vô dụng nếu chưa làm bước này** — mail vào spam. Đây là việc vận hành, không có code, nhưng phải có runbook để không ai quên.

**Files:**
- Create: `docs/ops/resend-domain-setup.md`

**Interfaces:**
- Consumes: `lib/email.ts` (`sendTransactionalEmail`), env `RESEND_API_KEY` + `EVE_MAIL_FROM` (đã có trong `.env.example`)
- Produces: không có code. Điều kiện tiên quyết cho mọi email thật.

- [ ] **Step 1: Viết runbook**

Tạo `docs/ops/resend-domain-setup.md`:

```markdown
# Resend — verify domain gửi mail

> Bắt buộc trước khi bật `booking_reminders_enabled` cho bất kỳ tenant thật nào.
> Chưa làm = mọi email nhắc lịch + OTP vào spam = tính năng coi như không tồn tại.

## Vì sao

`lib/email.ts` gửi qua Resend. Nếu domain trong `EVE_MAIL_FROM` chưa verify,
Resend vẫn trả 200 (code nghĩ là thành công) nhưng Gmail/Outlook đẩy vào spam
hoặc chặn thẳng. Không có lỗi nào xuất hiện trong log.

## Các bước

1. Tạo tài khoản tại https://resend.com, vào **Domains → Add Domain**.
2. Nhập domain gửi mail (khuyến nghị subdomain riêng, ví dụ `mail.yourdomain.com`,
   để danh tiếng gửi mail tách khỏi domain chính).
3. Resend hiện 3 bản ghi DNS — thêm hết vào nhà cung cấp DNS:
   - **SPF** (TXT) — cho phép Resend gửi thay mặt domain
   - **DKIM** (TXT/CNAME) — chữ ký mã hoá
   - **MX** (cho bounce/complaint feedback)
4. Đợi verify (thường vài phút, DNS có thể tới 48h).
5. **Thêm DMARC thủ công** — Resend không tự thêm. TXT record tại `_dmarc.yourdomain.com`:
   `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com`
   Bắt đầu `p=none` để quan sát, siết dần lên `p=quarantine` sau vài tuần.
6. Cập nhật `EVE_MAIL_FROM` khớp domain đã verify, ví dụ:
   `EVE_MAIL_FROM=Eve <no-reply@mail.yourdomain.com>`
7. Set biến trong Vercel env cho **cả Preview và Production**:
   - `RESEND_API_KEY`
   - `EVE_MAIL_FROM`

## Kiểm chứng

- [ ] Resend dashboard hiện domain **Verified**
- [ ] Gửi thử tới một địa chỉ Gmail: mail vào **Inbox**, không phải Spam
- [ ] Trong Gmail mở mail → **Show original** → `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`
- [ ] Gửi thử tới một địa chỉ Outlook/Hotmail (bộ lọc khác Gmail)
- [ ] Kiểm tra tại https://www.mail-tester.com — điểm ≥ 8/10

## Cảnh báo

- **Không dùng domain chính cho mail giao dịch lúc đầu.** Một đợt bị đánh spam
  sẽ ảnh hưởng cả mail công ty.
- **Không bật `booking_reminders_enabled` cho tenant** khi checklist trên chưa xanh hết.
- Resend free tier giới hạn gửi/ngày — kiểm tra hạn mức trước khi bật nhiều tenant.
```

- [ ] **Step 2: Thực hiện runbook trên tài khoản thật**

Chạy hết mục "Các bước", tick hết mục "Kiểm chứng". Đây là việc tay ngoài repo.

- [ ] **Step 3: Commit**

```bash
git add docs/ops/resend-domain-setup.md
git commit -m "docs: add Resend sending-domain setup runbook"
```

---

# Phase 1 — Trang giá ngừng bán thứ chưa có

### Task 2: Đánh dấu / gỡ feature chưa tồn tại khỏi bảng giá

**Files:**
- Modify: `app/_components/landing-page.tsx:57-104` (mảng `plans`)

**Interfaces:**
- Consumes: không
- Produces: mảng `plans` với mỗi feature là object `{ label: string; comingSoon?: boolean }` thay vì `string`. Task khác không phụ thuộc.

**Bối cảnh:** Hiện `plans` liệt kê các feature chưa xây: `"Retell voice agent"` (Ultimate $199), `"Multi-location roadmap"` (Enterprise $149), `"WhatsApp (coming soon)"` (Premium — cái này đã đánh dấu đúng). `"Outbound reminders"` (Premium $89) **giờ đã thật** sau `outbound-reminders.md`, giữ nguyên không cần đánh dấu.

- [ ] **Step 1: Đổi kiểu feature từ string sang object**

Trong `app/_components/landing-page.tsx`, thay mảng `plans` (dòng 57–104) bằng:

```tsx
type PlanFeature = { label: string; comingSoon?: boolean };

const plans: {
  name: string;
  price: number;
  description: string;
  features: PlanFeature[];
  cta: string;
  href: string;
  popular: boolean;
}[] = [
  {
    name: "Basic",
    price: 39,
    description: "For teams just getting started with booking chat.",
    features: [
      { label: "Web chat" },
      { label: "Cal.com booking" },
      { label: "FAQ + intake" },
      { label: "Basic dashboard" },
    ],
    cta: "Get started",
    href: "/signup",
    popular: false,
  },
  {
    name: "Premium",
    price: 89,
    description: "For teams growing leads and needing reminders.",
    features: [
      { label: "Everything in Basic" },
      { label: "Outbound reminders" },
      { label: "Embed widget" },
      { label: "WhatsApp", comingSoon: true },
    ],
    cta: "Choose Premium",
    href: "/signup",
    popular: true,
  },
  {
    name: "Enterprise",
    price: 149,
    description: "Higher limits for teams that are scaling up.",
    features: [
      { label: "Everything in Premium" },
      { label: "Higher limits" },
      { label: "Custom FAQ" },
      { label: "1:1 support" },
    ],
    cta: "Get started",
    href: "/signup",
    popular: false,
  },
  {
    name: "Ultimate",
    price: 199,
    description: "Full suite for multiple workspaces and ops teams.",
    features: [
      { label: "Everything in Enterprise" },
      { label: "Priority SLA" },
      { label: "Brand-customized agent" },
      { label: "Voice agent", comingSoon: true },
      { label: "Multi-location", comingSoon: true },
    ],
    cta: "Get started",
    href: "/signup",
    popular: false,
  },
];
```

Thay đổi thực chất:
- `"Retell voice agent"` → `{ label: "Voice agent", comingSoon: true }` (bỏ tên vendor, đánh dấu rõ)
- `"Multi-location roadmap"` → `{ label: "Multi-location", comingSoon: true }`
- `"WhatsApp (coming soon)"` → `{ label: "WhatsApp", comingSoon: true }` (dùng cơ chế chung thay vì nhét vào chuỗi)
- Thêm `{ label: "Embed widget" }` vào Premium — sẽ thật sau Phase 3
- **CTA của Enterprise/Ultimate đổi từ `"Try demo"` / `href: "/chat"` sang `"Get started"` / `href: "/signup"`** — hai gói đắt nhất đang có lời kêu gọi yếu nhất

- [ ] **Step 2: Render nhãn coming soon**

Trong `Pricing()`, thay block `<ul>` render feature (khoảng dòng 379–394) bằng:

```tsx
<ul className="mb-8 flex flex-1 flex-col gap-2.5 text-sm">
  {plan.features.map((item) => (
    <li className="flex items-start gap-2" key={item.label}>
      <CheckIcon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          plan.popular ? "text-black" : "text-zinc-300",
          item.comingSoon && "opacity-40",
        )}
        weight="bold"
      />
      <span
        className={cn(
          plan.popular ? "text-zinc-700" : "text-zinc-300",
          item.comingSoon && "opacity-60",
        )}
      >
        {item.label}
        {item.comingSoon ? (
          <span
            className={cn(
              "ml-1.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
              plan.popular
                ? "border-zinc-300 text-zinc-500"
                : "border-white/15 text-zinc-500",
            )}
          >
            Coming soon
          </span>
        ) : null}
      </span>
    </li>
  ))}
</ul>
```

- [ ] **Step 3: Kiểm chứng bằng typecheck**

Run: `npm run typecheck`
Expected: PASS, không lỗi. (Nếu còn chỗ nào coi `plan.features` là `string[]` thì TS sẽ báo — sửa hết.)

- [ ] **Step 4: Kiểm chứng bằng react-doctor**

Run: `npm run doctor`
Expected: không có error mới ở `landing-page.tsx`. Warning có sẵn từ trước thì bỏ qua.

- [ ] **Step 5: Kiểm chứng thủ công**

Run: `npm run dev`, mở `http://localhost:3000/#pricing`
Expected:
- Gói Ultimate hiện "Voice agent" và "Multi-location" với badge xám "Coming soon"
- Gói Premium hiện "Outbound reminders" **không** có badge (đã thật)
- Cả 4 gói CTA đều dẫn tới `/signup`

- [ ] **Step 6: Commit**

```bash
git add app/_components/landing-page.tsx
git commit -m "fix(pricing): mark unbuilt features as coming soon, route all CTAs to signup"
```

---

# Phase 2 — Analytics

### Task 3: Cài PostHog + hằng số event

**Files:**
- Create: `lib/analytics-events.ts`
- Modify: `package.json`, `.env.example`

**Interfaces:**
- Consumes: không
- Produces:
  - `ANALYTICS_EVENT` — object `as const`, mọi tên event.
  - `type AnalyticsEvent = (typeof ANALYTICS_EVENT)[keyof typeof ANALYTICS_EVENT]`
  - Task 4, 5, 9 đều import từ đây. **Không task nào được tự viết chuỗi tên event.**

- [ ] **Step 1: Cài dependency**

```bash
npm install posthog-js posthog-node
```

- [ ] **Step 2: Thêm biến môi trường**

Thêm vào cuối `.env.example`:

```bash
# ── Analytics (PostHog) ───────────────────────────────────────────────────
# https://posthog.com — free tier đủ cho giai đoạn đầu.
# Thiếu key = analytics tắt êm, app vẫn chạy bình thường.
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

- [ ] **Step 3: Tạo hằng số event**

Tạo `lib/analytics-events.ts`:

```ts
/**
 * Single source of truth for analytics event names.
 * Client and server both import from here so names never drift.
 */
export const ANALYTICS_EVENT = {
  // Acquisition
  LANDING_VIEWED: "landing_viewed",
  SIGNUP_STARTED: "signup_started",
  SIGNUP_COMPLETED: "signup_completed",

  // Onboarding (setup wizard — see setup-wizard-reorder.md)
  SETUP_OPENED: "setup_opened",
  SETUP_PROFILE_SAVED: "setup_profile_saved",
  SETUP_CAL_CONNECTED: "setup_cal_connected",
  SETUP_CAL_SKIPPED: "setup_cal_skipped",
  SETUP_COMPLETED: "setup_completed",

  // Core product
  CHAT_MESSAGE_SENT: "chat_message_sent",
  BOOKING_CREATED: "booking_created",
  BOOKING_CANCELLED_BY_GUEST: "booking_cancelled_by_guest",
  BOOKING_RESCHEDULED_BY_GUEST: "booking_rescheduled_by_guest",

  // Outbound reminders (see outbound-reminders.md)
  REMINDER_SENT: "reminder_sent",
  REMINDER_LINK_OPENED: "reminder_link_opened",
  REMINDER_OPTED_OUT: "reminder_opted_out",

  // Embed widget (see Phase 3)
  EMBED_LOADED: "embed_loaded",
  EMBED_OPENED: "embed_opened",
} as const;

export type AnalyticsEvent =
  (typeof ANALYTICS_EVENT)[keyof typeof ANALYTICS_EVENT];
```

- [ ] **Step 4: Kiểm chứng**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example lib/analytics-events.ts
git commit -m "feat(analytics): add posthog deps and shared event-name constants"
```

---

### Task 4: Analytics client + provider

**Files:**
- Create: `lib/analytics-client.ts`
- Create: `components/providers/posthog-provider.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `ANALYTICS_EVENT` từ `lib/analytics-events.ts`
- Produces:
  - `track(event: AnalyticsEvent, props?: Record<string, unknown>): void` — no-op khi thiếu key
  - `identifyUser(id: string, props?: Record<string, unknown>): void`
  - `<PostHogProvider>` — bọc children trong root layout
  - Task 9 dùng `track()`

- [ ] **Step 1: Viết analytics client**

Tạo `lib/analytics-client.ts`:

```ts
"use client";

/**
 * Browser-side analytics. Missing key → every call is a silent no-op,
 * so local dev and self-hosters never see errors.
 */
import posthog from "posthog-js";
import type { AnalyticsEvent } from "@/lib/analytics-events";

let initialized = false;

export function initAnalytics(): void {
  if (initialized || typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return;

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com",
    capture_pageview: true,
    capture_pageleave: true,
    // Guests are anonymous by design (see guest-booking-change.md) —
    // never create a person profile until someone actually signs in.
    person_profiles: "identified_only",
  });
  initialized = true;
}

export function track(
  event: AnalyticsEvent,
  props?: Record<string, unknown>,
): void {
  if (!initialized) return;
  posthog.capture(event, props);
}

export function identifyUser(
  id: string,
  props?: Record<string, unknown>,
): void {
  if (!initialized) return;
  posthog.identify(id, props);
}
```

- [ ] **Step 2: Viết provider**

Tạo `components/providers/posthog-provider.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/analytics-client";

export function PostHogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    initAnalytics();
  }, []);

  return <>{children}</>;
}
```

- [ ] **Step 3: Gắn vào root layout**

Trong `app/layout.tsx`, import và bọc children:

```tsx
import { PostHogProvider } from "@/components/providers/posthog-provider";
```

Bọc nội dung trong `<body>`:

```tsx
<PostHogProvider>{children}</PostHogProvider>
```

Giữ nguyên mọi provider đang có — **bọc thêm bên ngoài**, không thay thế.

- [ ] **Step 4: Kiểm chứng typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Kiểm chứng react-doctor**

Run: `npm run doctor`
Expected: không error mới.

- [ ] **Step 6: Kiểm chứng thủ công — không có key thì phải im lặng**

Đảm bảo `NEXT_PUBLIC_POSTHOG_KEY` **rỗng** trong `.env.local`, chạy `npm run dev`, mở `http://localhost:3000`.
Expected: trang chạy bình thường, **không có lỗi nào trong console**, không có request nào tới posthog.

- [ ] **Step 7: Commit**

```bash
git add lib/analytics-client.ts components/providers/posthog-provider.tsx app/layout.tsx
git commit -m "feat(analytics): add posthog browser client and root provider"
```

---

### Task 5: Analytics server + gắn event vào luồng có sẵn

**Files:**
- Create: `lib/analytics-server.ts`
- Modify: `agent/tools/book_appointment.ts`
- Modify: `lib/booking-reminders.ts`
- Modify: `app/b/[slug]/page.tsx`

**Interfaces:**
- Consumes: `ANALYTICS_EVENT` từ `lib/analytics-events.ts`
- Produces: `trackServer(event: AnalyticsEvent, distinctId: string, props?: Record<string, unknown>): Promise<void>` — no-op khi thiếu key, không bao giờ throw

**Vì sao đo phía server:** booking và reminder xảy ra trong agent tool / cron, không có browser. Đo phía client sẽ bỏ sót hoàn toàn — mà đây chính là hai thứ cần đo nhất.

- [ ] **Step 1: Viết analytics server**

Tạo `lib/analytics-server.ts`:

```ts
/**
 * Server-side analytics (agent tools, cron, route handlers).
 * Missing key → silent no-op. Never throws: analytics must not break bookings.
 */
import { PostHog } from "posthog-node";
import type { AnalyticsEvent } from "@/lib/analytics-events";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, {
      host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ||
        "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

export async function trackServer(
  event: AnalyticsEvent,
  distinctId: string,
  props?: Record<string, unknown>,
): Promise<void> {
  try {
    const ph = getClient();
    if (!ph) return;
    ph.capture({ distinctId, event, properties: props });
    await ph.flush();
  } catch (error) {
    console.error("[analytics] server capture failed", error);
  }
}
```

- [ ] **Step 2: Đo booking_created**

Trong `agent/tools/book_appointment.ts`, thêm import:

```ts
import { ANALYTICS_EVENT } from "@/lib/analytics-events";
import { trackServer } from "@/lib/analytics-server";
```

Ngay sau `createNotification({ type: "booking_created", ... })` thành công, thêm:

```ts
await trackServer(ANALYTICS_EVENT.BOOKING_CREATED, workspaceId, {
  workspaceId,
  service: service ?? aiEvent.title ?? null,
  source: "chat",
});
```

Dùng `workspaceId` làm `distinctId` — khách là ẩn danh, ta đo theo tenant chứ không theo cá nhân (nhất quán với `person_profiles: "identified_only"` ở Task 4).

- [ ] **Step 3: Đo reminder_sent**

Trong `lib/booking-reminders.ts`, thêm import giống Step 2. Trong `sendOneReminder`, ngay trước `await mark("sent");` ở cuối, thêm:

```ts
await trackServer(ANALYTICS_EVENT.REMINDER_SENT, workspace.id, {
  workspaceId: workspace.id,
  kind: row.kind,
  channel: "email",
});
```

- [ ] **Step 4: Đo reminder_link_opened**

Trong `app/b/[slug]/page.tsx`, trong nhánh `if (result.ok)` của `consumeManageLink` (chỗ set `preferChatSessionId`), thêm:

```ts
await trackServer(ANALYTICS_EVENT.REMINDER_LINK_OPENED, workspace.id, {
  workspaceId: workspace.id,
});
```

Đây là chỉ số quan trọng nhất của toàn bộ phase reminder: **tỉ lệ `reminder_link_opened` / `reminder_sent`** cho biết email nhắc lịch có thật sự đưa khách quay lại hay không.

- [ ] **Step 5: Kiểm chứng typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Kiểm chứng thủ công — booking vẫn chạy khi analytics tắt**

Với `NEXT_PUBLIC_POSTHOG_KEY` rỗng, chạy `npm run dev` và đặt một lịch qua `/chat`.
Expected: đặt lịch thành công, không lỗi console. Analytics im lặng.

- [ ] **Step 7: Commit**

```bash
git add lib/analytics-server.ts agent/tools/book_appointment.ts lib/booking-reminders.ts "app/b/[slug]/page.tsx"
git commit -m "feat(analytics): track booking, reminder send and reminder link open server-side"
```

---

# Phase 3 — Embed widget

### Task 6: Route chat tối giản cho iframe

**Files:**
- Create: `app/embed/[slug]/page.tsx`
- Create: `app/embed/[slug]/embed-chat.tsx`

**Interfaces:**
- Consumes: `getPublicBookingWorkspace(slug)` (có `bookingLive`), `AgentChat`, `resolveChatBranding`, `readGuestLocale`
- Produces: route `GET /embed/{slug}` render chat không có chrome. Task 7 (CSP) và Task 9 (`embed.js`) phụ thuộc route này.

**Tham chiếu:** `app/b/[slug]/page.tsx` là bản đầy đủ. Route embed là bản rút gọn: **không** header, **không** nav, **không** info sheet, **không** locale toggle.

- [ ] **Step 1: Viết client shell**

Tạo `app/embed/[slug]/embed-chat.tsx`:

```tsx
"use client";

import { AgentChat } from "@/app/_components/agent-chat";
import type { PublicBookingWorkspace } from "@/lib/workspace";
import { resolveChatBranding } from "@/lib/chat-branding";
import type { AppLocale } from "@/lib/locale";

export function EmbedChat({
  workspace,
  initialLocale,
}: {
  workspace: PublicBookingWorkspace;
  initialLocale: AppLocale;
}) {
  const branding = resolveChatBranding(workspace);

  return (
    <div className="flex h-dvh flex-col bg-zinc-950">
      <AgentChat
        branding={branding}
        initialLocale={initialLocale}
        user={null}
        workspace={workspace}
      />
    </div>
  );
}
```

> **Lưu ý cho người thực hiện:** props chính xác của `AgentChat` phải đọc từ
> `app/_components/workspace-booking-page.tsx` — nó đang gọi `AgentChat` với bộ
> props thật. Copy đúng bộ đó, bỏ các props chỉ dành cho chrome (info sheet,
> locale toggle, user menu). Không đoán tên props.

- [ ] **Step 2: Viết route**

Tạo `app/embed/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getPublicBookingWorkspace } from "@/lib/workspace";
import { readGuestLocale } from "@/lib/read-locale-cookie";
import { EmbedChat } from "./embed-chat";

type PageProps = {
  params: Promise<{ slug: string }>;
};

/**
 * Chrome-less chat for third-party embedding via public/embed.js.
 * Gated on bookingLive (not setup_completed_at) — see setup-wizard-reorder.md.
 */
export default async function EmbedPage({ params }: PageProps) {
  const { slug } = await params;
  const workspace = await getPublicBookingWorkspace(slug);

  if (!workspace) notFound();

  if (!workspace.bookingLive) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-2 bg-zinc-950 px-6 text-center">
        <p className="text-sm text-zinc-400">
          Booking isn&apos;t available right now.
        </p>
      </div>
    );
  }

  const locale = await readGuestLocale();

  return <EmbedChat initialLocale={locale} workspace={workspace} />;
}
```

> Kiểm tra tên export thật của `readGuestLocale` trong `lib/read-locale-cookie.ts`
> trước khi import — dùng đúng tên file đang export.

- [ ] **Step 3: Kiểm chứng typecheck**

Run: `npm run typecheck`
Expected: PASS. Nếu props `AgentChat` sai → TS báo, sửa theo signature thật.

- [ ] **Step 4: Kiểm chứng react-doctor**

Run: `npm run doctor`
Expected: không error mới.

- [ ] **Step 5: Kiểm chứng thủ công**

Chạy `npm run dev`, mở `http://localhost:3000/embed/eve-pilot`.
Expected:
- Chat hiện full chiều cao, **không** có header/nav/footer
- Gõ tin nhắn → agent trả lời
- Mở `/embed/slug-khong-ton-tai` → 404

- [ ] **Step 6: Commit**

```bash
git add "app/embed/[slug]"
git commit -m "feat(embed): add chrome-less chat route for iframe embedding"
```

---

### Task 7: Header CSP — cho nhúng `/embed/*`, chặn nhúng phần còn lại

**Files:**
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: route `/embed/[slug]` từ Task 6
- Produces: `/embed/*` nhúng được từ mọi origin; `/dashboard/*` không nhúng được từ đâu cả.

**Bối cảnh bảo mật:** hiện `next.config.ts` **không set header khung nào**. Nghĩa là `/dashboard/*` đang có thể bị nhúng vào iframe của bất kỳ ai → nguy cơ clickjacking. Task này vừa mở đường cho widget vừa **vá lỗ hổng sẵn có**.

- [ ] **Step 1: Thêm headers()**

Sửa `next.config.ts`:

```ts
import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  // vercel-react-best-practices: bundle-barrel-imports
  experimental: {
    optimizePackageImports: ["lucide-react", "@tabler/icons-react"],
  },
  async headers() {
    return [
      {
        // Widget must be embeddable anywhere — that is the whole point.
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
      {
        // Everything else must NOT be framable (clickjacking).
        // Previously unset, so the dashboard was framable by anyone.
        source: "/((?!embed).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
        ],
      },
    ];
  },
};

export default withEve(nextConfig);
```

- [ ] **Step 2: Kiểm chứng header trên route embed**

Chạy `npm run dev`, rồi:

```bash
curl -sI http://localhost:3000/embed/eve-pilot | grep -i "content-security-policy\|x-frame-options"
```

Expected: `content-security-policy: frame-ancestors *`, và **không** có `x-frame-options`.

- [ ] **Step 3: Kiểm chứng header trên dashboard**

```bash
curl -sI http://localhost:3000/login | grep -i "content-security-policy\|x-frame-options"
```

Expected: `content-security-policy: frame-ancestors 'none'` và `x-frame-options: DENY`.

- [ ] **Step 4: Kiểm chứng app vẫn chạy bình thường**

Mở `http://localhost:3000/dashboard` trong trình duyệt.
Expected: đăng nhập/dashboard hoạt động như cũ, không có lỗi CSP trong console.

- [ ] **Step 5: Commit**

```bash
git add next.config.ts
git commit -m "feat(embed): allow framing /embed/*, deny framing everywhere else"
```

---

### Task 8: Cookie phiên khách trong iframe (bên thứ ba)

**Files:**
- Modify: `lib/visitor.ts`
- Create: `docs/superpowers/embed-cookie-limits.md`

**Interfaces:**
- Consumes: `visitorCookieOptions()` trong `lib/visitor.ts`
- Produces: `visitorCookieOptions(opts?: { crossSite?: boolean })` — trả `SameSite=None; Secure` khi `crossSite`

> ## ⚠️ ĐỌC KỸ — đây là hạn chế thật, không phải bug sửa được
>
> `eve_visitor_id` hiện là `SameSite=lax` (`lib/visitor.ts`). Trong iframe
> **cross-site**, trình duyệt **không gửi** cookie `SameSite=lax`. Đổi sang
> `SameSite=None; Secure` giúp Chrome hoạt động, nhưng **Safari (ITP) và
> Firefox (TCP) vẫn chặn cookie bên thứ ba theo mặc định.**
>
> **Hệ quả trực tiếp lên `guest-booking-change.md`:**
> - **Bậc A1/A2 (claim theo cookie) không đáng tin trong widget.** Khách nhúng
>   widget vẫn **đặt được lịch**, nhưng khi quay lại để hủy/đổi thì cookie có
>   thể đã mất.
> - **Bậc B (mã quản lý) và C (OTP email) vẫn chạy bình thường** vì không phụ
>   thuộc cookie. Đây là đường thoát.
>
> **Kết luận thiết kế:** widget hoạt động ở chế độ suy giảm có chủ đích. Đặt
> lịch là luồng chính; hủy/đổi lịch trong widget dựa vào mã quản lý / OTP.
> **Không cố "sửa" bằng cách nới lỏng xác minh** — đó là đánh đổi bảo mật lấy
> tiện lợi, và `guest-booking-change.md` đã bác bỏ hướng đó.

- [ ] **Step 1: Cho phép cookie cross-site có điều kiện**

Sửa `visitorCookieOptions` trong `lib/visitor.ts`:

```ts
export function visitorCookieOptions(opts?: { crossSite?: boolean }) {
  // Third-party iframe (embed widget) needs SameSite=None; Secure.
  // Best-effort only: Safari ITP and Firefox TCP still block it —
  // see docs/superpowers/embed-cookie-limits.md.
  const crossSite = opts?.crossSite === true;
  return {
    httpOnly: true,
    secure: crossSite || process.env.NODE_ENV === "production",
    sameSite: crossSite ? ("none" as const) : ("lax" as const),
    path: "/",
    maxAge: MAX_AGE_SEC,
  };
}
```

Mọi lời gọi hiện tại không truyền tham số → hành vi **không đổi**. Chỉ đường embed mới truyền `{ crossSite: true }`.

- [ ] **Step 2: Ghi lại hạn chế**

Tạo `docs/superpowers/embed-cookie-limits.md` chép nguyên nội dung khối cảnh báo ở đầu task này, cộng thêm:

```markdown
## Nếu sau này cần bậc A hoạt động trong widget

Hai hướng, cả hai đều là dự án riêng:

1. **Storage Access API** — khách phải bấm cho phép; UX kém, hỗ trợ trình duyệt
   không đồng đều.
2. **Widget cùng origin** — hướng dẫn tenant nhúng qua reverse proxy trên chính
   domain của họ (`salon.com/eve` → app). Cookie thành first-party, mọi bậc
   hoạt động đầy đủ. Đây là hướng đúng về lâu dài nhưng cần tenant có khả năng
   kỹ thuật.

Đừng nới lỏng thang xác minh để lách hạn chế này.
```

- [ ] **Step 3: Kiểm chứng typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Kiểm chứng hành vi cũ không đổi**

Chạy `npm run dev`, mở `http://localhost:3000/chat`, gửi một tin nhắn, mở DevTools → Application → Cookies.
Expected: `eve_visitor_id` vẫn `SameSite=Lax` (vì không truyền `crossSite`).

- [ ] **Step 5: Commit**

```bash
git add lib/visitor.ts docs/superpowers/embed-cookie-limits.md
git commit -m "feat(embed): opt-in cross-site visitor cookie, document 3p-cookie limits"
```

---

### Task 9: Script nhúng `public/embed.js`

**Files:**
- Create: `public/embed.js`

**Interfaces:**
- Consumes: route `/embed/{slug}` (Task 6), header CSP (Task 7)
- Produces: file tĩnh tại `/embed.js`. Task 10 hiện snippet trỏ tới nó.

**Ràng buộc:** vanilla JS thuần, **không** TypeScript, **không** import, **không** build step. File này được nhúng vào website người khác — mọi dependency đều là rủi ro và làm chậm trang của họ.

- [ ] **Step 1: Viết script**

Tạo `public/embed.js`:

```js
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var slug = script.getAttribute("data-eve-slug");
  if (!slug) {
    console.error("[eve] missing data-eve-slug on embed script");
    return;
  }

  var origin = new URL(script.src, window.location.href).origin;
  var position = script.getAttribute("data-eve-position") === "left" ? "left" : "right";
  var color = script.getAttribute("data-eve-color") || "#18181b";
  var label = script.getAttribute("data-eve-label") || "Chat";

  if (document.getElementById("eve-embed-root")) return; // guard double-include

  var root = document.createElement("div");
  root.id = "eve-embed-root";
  root.style.cssText = "position:fixed;z-index:2147483000;bottom:20px;" + position + ":20px;";

  var panel = document.createElement("div");
  panel.style.cssText =
    "display:none;width:min(400px,calc(100vw - 40px));height:min(620px,calc(100vh - 120px));" +
    "margin-bottom:12px;border-radius:16px;overflow:hidden;background:#09090b;" +
    "box-shadow:0 12px 48px rgba(0,0,0,.32);border:1px solid rgba(255,255,255,.08);";

  var iframe = document.createElement("iframe");
  iframe.src = origin + "/embed/" + encodeURIComponent(slug);
  iframe.title = "Booking chat";
  iframe.style.cssText = "width:100%;height:100%;border:0;display:block;";
  iframe.setAttribute("allow", "clipboard-write");
  panel.appendChild(iframe);

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-expanded", "false");
  button.style.cssText =
    "display:flex;align-items:center;justify-content:center;gap:8px;height:52px;" +
    "min-width:52px;padding:0 18px;border:0;border-radius:26px;cursor:pointer;" +
    "background:" + color + ";color:#fff;font:600 14px/1 system-ui,sans-serif;" +
    "box-shadow:0 6px 20px rgba(0,0,0,.24);" + (position === "left" ? "" : "margin-left:auto;");
  button.textContent = label;

  var open = false;
  button.addEventListener("click", function () {
    open = !open;
    panel.style.display = open ? "block" : "none";
    button.setAttribute("aria-expanded", open ? "true" : "false");
    if (open && !button.dataset.eveOpened) {
      button.dataset.eveOpened = "1";
    }
  });

  root.appendChild(panel);
  root.appendChild(button);

  function mount() {
    document.body.appendChild(root);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
```

- [ ] **Step 2: Tạo trang test cục bộ**

Tạo file tạm `public/embed-test.html` (không commit):

```html
<!doctype html>
<html>
  <head><title>Embed test</title></head>
  <body style="font-family:system-ui;padding:40px">
    <h1>Trang giả lập website khách hàng</h1>
    <p>Widget phải hiện ở góc dưới bên phải.</p>
    <script src="http://localhost:3000/embed.js" data-eve-slug="eve-pilot" async></script>
  </body>
</html>
```

- [ ] **Step 3: Kiểm chứng thủ công**

Chạy `npm run dev`, mở `http://localhost:3000/embed-test.html`.
Expected:
- Nút bong bóng "Chat" ở góc dưới phải
- Bấm → panel mở, chat load trong iframe
- Gõ tin nhắn → agent trả lời
- Bấm lại → panel đóng
- Console **không** có lỗi CSP (nhờ Task 7)

- [ ] **Step 4: Kiểm chứng data attribute**

Sửa thẻ script trong `embed-test.html` thành:

```html
<script src="http://localhost:3000/embed.js" data-eve-slug="eve-pilot"
        data-eve-position="left" data-eve-color="#7c3aed" data-eve-label="Đặt lịch" async></script>
```

Expected: nút ở góc dưới **trái**, màu tím, chữ "Đặt lịch".

- [ ] **Step 5: Xoá file test và commit**

```bash
rm public/embed-test.html
git add public/embed.js
git commit -m "feat(embed): add dependency-free embed script with bubble widget"
```

---

### Task 10: Trang dashboard hiện snippet

**Files:**
- Create: `app/dashboard/embed/page.tsx`
- Create: `app/dashboard/embed/embed-snippet.tsx`
- Modify: `messages/en.json`, `messages/vi.json`
- Modify: file nav sidebar dashboard

**Interfaces:**
- Consumes: `getDashboardUser()`, `isWorkspaceBookingLive(workspaceId)`, `public/embed.js` (Task 9)
- Produces: route `/dashboard/embed`

- [ ] **Step 1: Thêm chuỗi i18n**

Thêm vào `messages/en.json`, trong namespace `dashboard`:

```json
"embedTitle": "Embed on your website",
"embedBody": "Paste this snippet before the closing </body> tag on any page. The chat bubble appears in the corner.",
"embedCopy": "Copy snippet",
"embedCopied": "Copied",
"embedNotLive": "Connect Cal.com and pick a meeting type first — the widget won't accept bookings until then."
```

Và `messages/vi.json`:

```json
"embedTitle": "Nhúng vào website của bạn",
"embedBody": "Dán đoạn mã này ngay trước thẻ </body> ở bất kỳ trang nào. Bong bóng chat sẽ hiện ở góc màn hình.",
"embedCopy": "Sao chép mã",
"embedCopied": "Đã sao chép",
"embedNotLive": "Hãy kết nối Cal.com và chọn loại lịch hẹn trước — widget chưa nhận đặt lịch được cho tới lúc đó."
```

- [ ] **Step 2: Viết client component**

Tạo `app/dashboard/embed/embed-snippet.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function EmbedSnippet({ snippet }: { snippet: string }) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-3">
      <pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-xs">
        <code>{snippet}</code>
      </pre>
      <Button
        onClick={() => {
          void navigator.clipboard.writeText(snippet).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        type="button"
        variant="outline"
      >
        {copied ? t("dashboard.embedCopied") : t("dashboard.embedCopy")}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Viết trang**

Tạo `app/dashboard/embed/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { getDashboardUser } from "@/lib/dashboard-user";
import { createClient } from "@/lib/supabase/server";
import { isWorkspaceBookingLive } from "@/lib/workspace";
import { EmbedSnippet } from "./embed-snippet";

export default async function EmbedPage() {
  const dashboard = await getDashboardUser();
  if (!dashboard) redirect("/login?next=/dashboard/embed");

  const workspaceId = dashboard.workspaceId;
  if (!workspaceId) redirect("/dashboard/setup");

  const supabase = await createClient();
  const [{ data: workspace }, bookingLive, h, t] = await Promise.all([
    supabase
      .from("workspaces")
      .select("slug")
      .eq("id", workspaceId)
      .maybeSingle(),
    isWorkspaceBookingLive(workspaceId),
    headers(),
    getTranslations(),
  ]);

  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const slug = workspace?.slug ?? "";

  const snippet = `<script src="${proto}://${host}/embed.js"\n        data-eve-slug="${slug}" async></script>`;

  return (
    <DashboardShell title={t("dashboard.embedTitle")} user={dashboard.navUser}>
      <div className="flex flex-col gap-4 px-4 py-6 lg:px-6">
        <p className="text-sm text-muted-foreground">
          {t("dashboard.embedBody")}
        </p>
        {bookingLive ? null : (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
            {t("dashboard.embedNotLive")}
          </p>
        )}
        <EmbedSnippet snippet={snippet} />
      </div>
    </DashboardShell>
  );
}
```

- [ ] **Step 4: Thêm link vào sidebar**

Tìm file định nghĩa nav dashboard:

```bash
grep -rln "dashboard/bookings" components/ app/ --include=*.tsx | grep -i "sidebar\|nav\|shell"
```

Thêm một mục `/dashboard/embed` vào mảng nav, theo đúng shape của các mục đang có (icon từ `@tabler/icons-react`, ví dụ `IconCode`).

- [ ] **Step 5: Kiểm chứng typecheck + doctor**

Run: `npm run typecheck && npm run doctor`
Expected: PASS, không error mới.

- [ ] **Step 6: Kiểm chứng thủ công**

Đăng nhập, mở `http://localhost:3000/dashboard/embed`.
Expected:
- Snippet hiện với đúng slug của workspace
- Bấm "Copy snippet" → đổi thành "Copied", clipboard có nội dung đúng
- Với workspace chưa có Cal.com → hiện banner cảnh báo màu hổ phách

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/embed messages/en.json messages/vi.json
git add components/  # file sidebar đã sửa
git commit -m "feat(embed): add dashboard page with copyable embed snippet"
```

---

# Phase 4 — Cal.com App Store

### Task 11: Runbook submit app vào Cal.com

**Files:**
- Create: `docs/ops/calcom-app-submission.md`

**Interfaces:**
- Consumes: `public/embed.js` (Task 9) — app Cal.com trỏ người dùng tới Eve
- Produces: không có code trong repo này. Công việc diễn ra ở fork của monorepo `calcom/cal.com`.

> **Kỳ vọng thực tế:** đây **không** phải form submit và duyệt trong ngày. App Cal.com sống trong `packages/app-store/` của monorepo mã nguồn mở, tạo bằng CLI, và **submit bằng Pull Request**. Thời gian review phụ thuộc maintainer — tính bằng tuần, không phải giờ. Hãy coi đây là kênh phân phối dài hạn, đừng chặn kế hoạch khác vì nó.

- [ ] **Step 1: Viết runbook**

Tạo `docs/ops/calcom-app-submission.md`:

```markdown
# Submit Eve lên Cal.com App Store

> Cal.com là mã nguồn mở. App nằm trong `packages/app-store/` của monorepo và
> được submit qua **Pull Request**, không phải form. Review tính bằng tuần.

## Vì sao đáng làm

Người dùng Cal.com **đã** onboard xong — có tài khoản, có event type, hiểu API
key là gì. Toàn bộ ma sát onboarding lớn nhất của Eve biến mất với nhóm này.
App store của họ là kênh phân phối không mất phí.

## Chuẩn bị trước khi mở PR

- [ ] Domain production chạy được, `/embed.js` phục vụ công khai
- [ ] Trang giá không còn bán thứ chưa tồn tại (Task 2 đã xong)
- [ ] Có logo SVG vuông, nền trong suốt
- [ ] Có mô tả ngắn (1 câu) và dài (1 đoạn)
- [ ] Có ảnh chụp màn hình widget đang chạy trên một website thật
- [ ] Có trang chính sách quyền riêng tư và điều khoản sử dụng công khai

## Các bước

1. Fork `https://github.com/calcom/cal.com`, clone về máy.
2. Cài dependency theo `README.md` của họ (yarn, không phải npm).
3. Chạy CLI tạo app:
   ```bash
   yarn create-app
   ```
   CLI sinh thư mục dưới `packages/app-store/` gồm: `config.json`,
   `api/add.ts`, `components/`, `static/icon.svg`, `index.ts`, `package.json`,
   `.env.example`, `README.mdx`.
4. Sửa `config.json`: tên, slug, mô tả, category, publisher, URL.
5. Thay `static/icon.svg` bằng logo Eve.
6. Viết `README.mdx` — CLI sinh bản mẫu, phải viết lại bằng tay.
7. Chạy `yarn app-store:watch` trong lúc phát triển để file autogenerated luôn cập nhật.
8. Test cục bộ: cài app trong instance Cal.com chạy local, xác nhận nó dẫn
   người dùng sang Eve đúng cách.
9. Mở PR vào `calcom/cal.com`. Ghi rõ trong mô tả PR: app làm gì, ai dùng,
   ảnh chụp màn hình.
10. Theo dõi PR, phản hồi review. Dùng GitHub Discussions của họ nếu bí.

## Kênh song song (nhanh hơn, làm ngay được)

Đừng chờ PR được merge mới bắt đầu tiếp cận người dùng Cal.com:

- **Affiliate program** của Cal.com — hoa hồng 20% trong 12 tháng cho khách giới thiệu
- **GitHub Discussions** của Cal.com — trả lời câu hỏi thật về đặt lịch qua chat
- **Cộng đồng indie hacker / freelancer** — nơi ICP thật sự sinh hoạt

Ba kênh này không cần ai duyệt và cho phản hồi người dùng sớm hơn PR rất nhiều.
```

- [ ] **Step 2: Commit**

```bash
git add docs/ops/calcom-app-submission.md
git commit -m "docs: add Cal.com app store submission runbook"
```

- [ ] **Step 3: Thực hiện runbook**

Chạy phần "Chuẩn bị" và "Các bước". Đây là việc tay ngoài repo, không có bước verify trong codebase.

---

## Self-Review

**Spec coverage:**

| Yêu cầu người dùng | Task |
|---|---|
| (1) Embed widget | Task 6, 7, 8, 9, 10 |
| (1) Cal.com app store | Task 11 |
| (2) Analytics | Task 3, 4, 5 |
| (3) Billing | **Ngoài phạm vi** — nêu rõ ở mục Scope note, cần plan riêng |
| (4) Trang giá | Task 2 |
| (5) Verify domain Resend | Task 1 |

**Ghi chú nhất quán:**
- Tên event chỉ định nghĩa một chỗ (`lib/analytics-events.ts`, Task 3), Task 4/5 import từ đó
- `track()` (client) vs `trackServer()` (server) — hai tên khác nhau có chủ đích, không lẫn
- `visitorCookieOptions(opts?)` giữ tương thích ngược: mọi call site hiện tại không truyền tham số nên hành vi không đổi
- Route embed gate bằng `bookingLive` (không phải `setup_completed_at`) — khớp `setup-wizard-reorder.md`

**Rủi ro lớn nhất đã ghi rõ trong plan:** cookie bên thứ ba trong iframe (Task 8). Người thực hiện phải đọc khối cảnh báo trước khi code, nếu không sẽ ship widget mà bậc A1/A2 im lặng không hoạt động và không hiểu tại sao.
