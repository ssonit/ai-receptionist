# Hoàn thiện PostHog analytics tracking — Implementation Plan

> **For agentic workers:** Thực thi task-by-task, đánh dấu checkbox (`- [ ]`) để theo dõi.
>
> **Sửa thẳng vào `main`.** Không tạo branch, không tạo git worktree.

**Goal:** Wire tất cả PostHog events còn thiếu + gọi `identifyUser` sau signup/login để gắn identity vào person profile.

**Hiện trạng:** `posthog-js` + `posthog-node` đã cài, provider đã wrap root layout, 4/17 event đã được gọi thực tế. Còn 13 event chỉ mới khai báo trong `lib/analytics-events.ts` nhưng chưa có caller. `identifyUser()` trong `lib/analytics-client.ts` đã define nhưng chưa được gọi ở đâu.

**Architecture:** Client events → `track()` (`lib/analytics-client.ts`, posthog-js). Server events → `trackServer()` (`lib/analytics-server.ts`, posthog-node). `identifyUserServer()` mới sẽ dùng posthog-node để identify server-side sau signup/login.

## Event wiring map

| Event | Nơi gọi | Client/Server |
|-------|---------|---------------|
| `landing_viewed` | `LandingPage` mount | Client |
| `signup_started` | `SignupForm` form submit | Client |
| `signup_completed` | `auth/actions.ts` `signUp()` | Server |
| `signin_completed` | `auth/actions.ts` `signIn()` | Server |
| `setup_opened` | `setup-wizard.tsx` mount | Client |
| `setup_profile_saved` | `setup/actions.ts` `saveSetupProfileAction()` | Server |
| `setup_cal_connected` | `setup/actions.ts` `saveCalApiKeyAction()` | Server |
| `setup_cal_skipped` | `setup/actions.ts` `completeSetupAction()` | Server |
| `setup_completed` | `setup/actions.ts` `completeSetupAction()` | Server |
| `chat_message_sent` | `agent-chat.tsx` `handleSubmit()` | Client |
| `booking_created` | Đã wire ✅ | Server |
| `booking_cancelled_by_guest` | `api/cal/webhook/route.ts` | Server |
| `booking_rescheduled_by_guest` | `api/cal/webhook/route.ts` | Server |
| `reminder_sent` | Đã wire ✅ | Server |
| `reminder_link_opened` | Đã wire ✅ | Server |
| `reminder_opted_out` | `b/[slug]/unsubscribe/actions.ts` | Server |
| `embed_loaded` | Đã wire ✅ | Client |
| `embed_opened` | `embed-chat.tsx` mount (iframe hiện luôn, không toggle — track khi iframe render) | Client |

Ngoài ra: `identifyUser` server-side trong `analytics-server.ts`, gọi sau signup + signin.

## Global Constraints

- Không có test runner — kiểm chứng từng event bằng cách trigger flow thật, xem PostHog dashboard.
- Sau mỗi task chạm code: `graphify update .`.
- Sau mỗi task chạm React/UI: `npm run doctor`.
- Tenant isolation: tất cả server events phải có `workspaceId` trong props.
- `NEXT_PUBLIC_POSTHOG_KEY` rỗng = silent no-op, app vẫn chạy bình thường.

---

### Task 1: Thêm `identifyUserServer()` + event `SIGNIN_COMPLETED`

**Files:**
- Modify: `lib/analytics-server.ts` — thêm `identifyUserServer()`
- Modify: `lib/analytics-events.ts` — thêm `SIGNIN_COMPLETED`

**Interfaces:**
- `identifyUserServer(distinctId: string, props?: Record<string, unknown>): Promise<void>` — gọi `posthog-node` identify + flush
- `ANALYTICS_EVENT.SIGNIN_COMPLETED = "signin_completed"`

- [ ] **Bước 1: Thêm `identifyUserServer` vào analytics-server.ts**

```ts
export async function identifyUserServer(
  distinctId: string,
  props?: Record<string, unknown>,
): Promise<void> {
  try {
    const ph = getClient();
    if (!ph) return;
    ph.identify({ distinctId, properties: props });
    await ph.flush();
  } catch (error) {
    console.error("[analytics] server identify failed", error);
  }
}
```

- [ ] **Bước 2: Thêm `SIGNIN_COMPLETED` vào ANALYTICS_EVENT**

```ts
SIGNIN_COMPLETED: "signin_completed",
```

- [ ] **Bước 3: Commit**

```bash
git add lib/analytics-server.ts lib/analytics-events.ts
git commit -m "feat(analytics): add identifyUserServer and SIGNIN_COMPLETED event"
```

---

### Task 2: Wire landing page — `landing_viewed`

**Files:**
- Modify: `app/_components/landing-page.tsx`

**Interfaces:**
- Gọi `track(ANALYTICS_EVENT.LANDING_VIEWED)` trong `useEffect` khi LandingPage mount

- [ ] **Bước 1: Thêm useEffect + import**

Import `useEffect` từ React, `ANALYTICS_EVENT` từ analytics-events, `track` từ analytics-client. Gọi trong useEffect rỗng dependencies.

- [ ] **Bước 2: `npm run doctor` + commit**

---

### Task 3: Wire signup flow — `signup_started` + `signup_completed` + identify

**Files:**
- Modify: `app/login/signup-form.tsx` — thêm `track(SIGNUP_STARTED)` khi submit form
- Modify: `app/auth/actions.ts` — thêm `identifyUserServer()` + `trackServer(SIGNUP_COMPLETED)` trong `signUp()`

**Interfaces:**
- SignupForm: track trước khi server action chạy (form `onSubmit` handler gọi track rồi để form submit tự nhiên)
- signUp action: sau `supabase.auth.signUp()` thành công → lấy `data.user?.id` → identify + track trước redirect

- [ ] **Bước 1: SignupForm — thêm `onSubmit` handler**

Thêm `handleSubmit` callback vào `<form>`: gọi `track(ANALYTICS_EVENT.SIGNUP_STARTED)` rồi để form submit tự nhiên (không preventDefault).

- [ ] **Bước 2: signUp action — identifyUserServer + trackServer**

Destructure `data` từ `supabase.auth.signUp()`. Nếu có `data.user`, gọi:

```ts
const userId = data.user.id;
await identifyUserServer(userId, {
  email: data.user.email,
  name: fullName,
});
await trackServer(ANALYTICS_EVENT.SIGNUP_COMPLETED, userId, {
  isInvite: Boolean(inviteToken),
  plan: "starter",
});
```

- [ ] **Bước 3: `npm run doctor` + commit**

---

### Task 4: Wire signin — `signin_completed` + identify

**Files:**
- Modify: `app/auth/actions.ts` — thêm `identifyUserServer()` + `trackServer(SIGNIN_COMPLETED)` trong `signIn()`

- [ ] **Bước 1: signIn action — identify + track**

Destructure `data` từ `supabase.auth.signInWithPassword()`. Nếu có `data.user`, gọi identify + track.

- [ ] **Bước 2: Commit**

---

### Task 5: Wire setup wizard events

**Files:**
- Modify: `components/setup-wizard.tsx` — thêm `track(SETUP_OPENED)` trong useEffect mount
- Modify: `app/dashboard/setup/actions.ts` — thêm `trackServer()` trong các action tương ứng

**Events cần wire:**
- `setup_opened` → client, useEffect trong setup-wizard.tsx
- `setup_profile_saved` → server, trong `saveSetupProfileAction()` trước return success
- `setup_cal_connected` → server, trong `saveCalApiKeyAction()` trước return success
- `setup_cal_skipped` → server, trong `completeSetupAction()` khi workspace không có cal_api_key_encrypted
- `setup_completed` → server, trong `completeSetupAction()` trước return success

- [ ] **Bước 1: setup_opened — client track trong setup-wizard.tsx**

Thêm import + `useEffect(() => { track(ANALYTICS_EVENT.SETUP_OPENED, { workspaceId }) }, [workspaceId])` vào SetupWizard component.

- [ ] **Bước 2: setup_profile_saved — server track trong saveSetupProfileAction**

Sau khi update workspace thành công, trước `return { success: ... }`:

```ts
await trackServer(ANALYTICS_EVENT.SETUP_PROFILE_SAVED, auth.workspaceId);
```

- [ ] **Bước 3: setup_cal_connected — server track trong saveCalApiKeyAction**

Sau khi encrypt + update thành công:

```ts
await trackServer(ANALYTICS_EVENT.SETUP_CAL_CONNECTED, auth.workspaceId, {
  calUsername: me.username,
});
```

- [ ] **Bước 4: setup_cal_skipped + setup_completed — server track trong completeSetupAction**

Trước `return { success: ... }`:

```ts
const hasCal = Boolean(ws?.cal_api_key_encrypted);
if (!hasCal) {
  await trackServer(ANALYTICS_EVENT.SETUP_CAL_SKIPPED, auth.workspaceId);
}
await trackServer(ANALYTICS_EVENT.SETUP_COMPLETED, auth.workspaceId, {
  hasCalKey: hasCal,
});
```

Lưu ý: `getWorkspaceById` trả về workspace với `cal_api_key_encrypted` — đảm bảo field này có trong select. Hiện tại `getWorkspaceById` đã select field này, nhưng kiểm tra lại trước khi dùng `ws?.cal_api_key_encrypted`.

- [ ] **Bước 5: `npm run doctor` + commit**

---

### Task 6: Wire chat — `chat_message_sent`

**Files:**
- Modify: `app/_components/agent-chat.tsx`

- [ ] **Bước 1: Thêm track trong handleSubmit**

Trong `handleSubmit`, sau khi `agent.send()` thành công (trong try block), gọi:

```ts
track(ANALYTICS_EVENT.CHAT_MESSAGE_SENT, {
  workspaceSlug: workspaceSlug ?? undefined,
  hasFiles: message.files.length > 0,
  messageLength: text.length,
});
```

Lưu ý: `workspaceSlug` đã có sẵn trong props của AgentChat component. `embedMode` cũng có thể thêm để phân biệt chat embed vs chat public.

- [ ] **Bước 2: `npm run doctor` + commit**

---

### Task 7: Wire booking webhook — `booking_cancelled_by_guest` + `booking_rescheduled_by_guest`

**Files:**
- Modify: `app/api/cal/webhook/route.ts`

- [ ] **Bước 1: Thêm trackServer trong processEvent**

Trong `processEvent()`, sau khi parse event payload:

```ts
if (event.triggerEvent === "BOOKING_CANCELLED") {
  await trackServer(ANALYTICS_EVENT.BOOKING_CANCELLED_BY_GUEST, workspaceId, {
    bookingUid: event.payload.uid,
  });
}
if (event.triggerEvent === "BOOKING_RESCHEDULED") {
  await trackServer(ANALYTICS_EVENT.BOOKING_RESCHEDULED_BY_GUEST, workspaceId, {
    bookingUid: event.payload.uid,
  });
}
```

Đặt trước khi gọi `upsertCalBookings` để đảm bảo event được track ngay cả khi upsert fail.

- [ ] **Bước 2: Commit**

---

### Task 8: Wire reminder opt-out — `reminder_opted_out`

**Files:**
- Modify: `app/b/[slug]/unsubscribe/actions.ts`

- [ ] **Bước 1: Thêm trackServer trong confirmReminderOptOutAction**

Sau khi update booking (set `reminders_opt_out: true`) thành công, trước return success:

```ts
await trackServer(ANALYTICS_EVENT.REMINDER_OPTED_OUT, workspace.id, {
  bookingId,
});
```

- [ ] **Bước 2: Commit**

---

### Task 9: Wire embed — `embed_opened`

**Files:**
- Modify: `app/embed/[slug]/embed-chat.tsx`

**Note:** Embed chat hiện tại luôn hiển thị (không có toggle bubble) — iframe load là chat mở. Track `embed_opened` cùng lúc với `embed_loaded` trong cùng useEffect.

- [ ] **Bước 1: Thêm track EMBED_OPENED**

Trong useEffect hiện có (cùng chỗ gọi `EMBED_LOADED`), thêm:

```ts
track(ANALYTICS_EVENT.EMBED_OPENED, {
  workspaceId: workspace.id,
  slug: workspace.slug,
});
```

- [ ] **Bước 2: Commit**

---

### Task 10: graphify update + final check

- [ ] **Bước 1: Chạy graphify update**

```bash
graphify update .
```

- [ ] **Bước 2: Chạy typecheck + doctor**

```bash
npm run typecheck
npm run doctor
```

Sửa nếu có lỗi.

- [ ] **Bước 3: Commit final**

```bash
git add graphify-out/
git commit -m "chore(graphify): update knowledge graph after PostHog wiring"
```

---

## Verification

Sau khi deploy, kiểm tra từng event xuất hiện trong PostHog dashboard:

1. Vào landing page → `landing_viewed`
2. Submit signup form → `signup_started` → sau redirect setup → `signup_completed`
3. Login → `signin_completed`
4. Vào setup wizard → `setup_opened` → save profile → `setup_profile_saved` → connect Cal → `setup_cal_connected` → complete → `setup_completed`
5. Gửi message trong chat → `chat_message_sent`
6. Tạo booking → `booking_created` (đã có)
7. Hủy/reschedule booking từ Cal.com → webhook fires → `booking_cancelled_by_guest` / `booking_rescheduled_by_guest`
8. Gửi reminder → `reminder_sent` (đã có) → guest click link → `reminder_link_opened` (đã có)
9. Guest opt-out reminder → `reminder_opted_out`
10. Mở embed → `embed_loaded` + `embed_opened`

Person profile sau signup/login phải có email + name (kiểm tra trong PostHog → People).
