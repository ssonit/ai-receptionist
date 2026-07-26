# Workspace Invites — Sửa & hoàn thiện

> Trạng thái: **đã triển khai** (2026-07-26). E2E manual runbook scenarios 2–12 with live Resend still recommended before merge.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa 5 bug trong luồng mời nhân viên (nặng nhất: owner tự hạ cấp mình xuống staff và khoá vĩnh viễn workspace), rồi hoàn thiện thành luồng chuẩn: mời bằng email thật, gỡ thành viên, chuyển quyền owner.

**Architecture:** Giữ nguyên Supabase Auth và mô hình `profiles.workspace_id` đơn trị (1 user = 1 workspace). Toàn bộ thay đổi quyền nằm trong các hàm SQL `security definer` — vì RLS trên `profiles` chỉ cho phép SELECT chéo thành viên, không cho UPDATE hồ sơ người khác. Email mời gửi qua `lib/email.ts` (Resend) đã có sẵn từ luồng OTP.

**Tech Stack:** Supabase (Postgres + RLS + security definer RPC), Next.js 16 Server Actions, Resend.

## Quyết định đã chốt

| Câu hỏi | Chốt |
|---|---|
| Mô hình thành viên | **Giữ 1 user = 1 workspace.** Không chuyển sang `workspace_members` |
| Nhà cung cấp auth | **Giữ Supabase Auth.** Không chuyển Clerk — xem "Vì sao không Clerk" bên dưới |
| Vai trò | **owner + staff, đúng một owner** |
| Kênh mời | **Gửi email thật qua Resend** |
| Link mở (không gắn email) | **Bỏ hẳn.** Mọi invite bắt buộc có email |
| Người được mời đã có workspace | **Từ chối, báo rõ lý do. Không bao giờ xoá workspace của họ** |

### Vì sao không dùng Clerk (ghi lại để khỏi bàn lại)

Đo trên repo: **29 RLS policy, 36 chỗ dùng `auth.uid()`, 3 khoá ngoại trỏ `auth.users`**. Chuyển sang Clerk buộc phải viết lại toàn bộ số đó cộng trigger `handle_new_user`, `proxy.ts`, và mọi helper auth — trong khi RLS theo `workspace_id` chính là bảo đảm an toàn cốt lõi của sản phẩm.

Giá trị lớn nhất của Clerk là **Organizations** (một user thuộc nhiều tổ chức, vai trò tuỳ biến). Ta vừa chốt mô hình ngược lại: 2 vai trò, 1 workspace mỗi user. Trả chi phí tích hợp mà không dùng tới thứ khiến nó đáng giá.

**Mốc nên quay lại cân nhắc:** cần một user thuộc nhiều workspace (agency quản nhiều tiệm) · cần SSO/SAML cho khách doanh nghiệp · thấy đang tốn nhiều thời gian bảo trì auth hơn làm sản phẩm.

## Global Constraints

- **Không có test runner trong repo** (không vitest/jest/playwright). Vòng kiểm chứng mỗi task: `npm run typecheck` → `npm run doctor` (nếu chạm React) → bước kiểm tra thủ công ghi rõ trong task. **Không được bịa ra `npm test`.**
- Migration mới trong `supabase/migrations/`, timestamp sort sau `20260725000005`. **Không sửa migration đã tồn tại.**
- Test migration bằng `npx supabase db reset` (áp lại toàn bộ + `seed.sql`).
- Lỗi hiển thị cho người dùng: `APP_ERROR_CODE` + `appErrorMessage` trong `lib/errors/`. **Không hardcode chuỗi lỗi tiếng Anh trong `actions.ts`.** Xem `.claude/rules/errors.md`.
- Chuỗi UI: `messages/en.json` + `messages/vi.json`. Namespace hiện có: `chat`, `dashboard`, `common`.
- Mọi hàm SQL đổi quyền phải là `security definer` + `set search_path = public`.
- Sau mỗi task chạm code: `graphify update .` trước khi commit. Mỗi task một commit.

## Bug đang có (đọc trước khi sửa)

Xác nhận bằng code trong `supabase/migrations/20260724000008_workspace_invites.sql`:

**Bug 1 🔴 — Owner tự hạ cấp, khoá vĩnh viễn workspace.** Trong `accept_workspace_invite`, nhánh người đã ở sẵn trong workspace chạy `update public.profiles set role = inv.role where id = uid` với `inv.role = 'staff'`. Owner bấm chính link mình tạo → thành staff. Nếu là owner duy nhất, workspace **không còn owner nào**; RLS `current_user_is_workspace_owner()` trả false nên không ai tạo được invite nữa — không có đường phục hồi qua UI.

**Bug 2 🔴 — Link mở.** `workspace_invites.email` nullable, UI ghi "(optional)". Bỏ trống → bỏ qua bước so email → bất kỳ ai đăng nhập mà có link đều join được.

**Bug 3 🟠 — Không gửi email.** `createWorkspaceInvite` chỉ trả `inviteUrl` cho owner tự copy. Đây là lý do owner cầm link rồi tự bấm (chính là Bug 1).

**Bug 4 🟠 — Xoá workspace âm thầm.** `delete from public.workspaces where id = old_ws` chạy khi workspace cũ chưa setup xong và rỗng. UI chỉ cảnh báo bằng một dòng chữ xám.

**Bug 5 🟡 — Team card chỉ đọc.** Không gỡ thành viên, không đổi vai trò, không chuyển quyền owner, không gửi lại invite.

**Đúng một luồng hiện tại đang chạy chuẩn — đừng phá:** đăng ký mới kèm `?invite=token`. `app/auth/actions.ts:44` đẩy `invite_token` vào `raw_user_meta_data`, `handle_new_user` bắt được và tạo profile staff **không** kèm workspace mới.

## Tham chiếu cách sản phẩm lớn làm

- Invite luôn gắn email cụ thể; link mở là tính năng riêng, mặc định tắt.
- Token dùng một lần, hết hạn ~7 ngày, có resend + revoke.
- Đăng nhập sai tài khoản → **chặn và nói rõ** invite dành cho email nào, kèm nút đổi tài khoản. Không bao giờ âm thầm chấp nhận.
- **Không bao giờ hạ cấp người đang có quyền cao hơn.** Nhận invite khi đã là thành viên = no-op.
- Luôn đảm bảo còn ít nhất một owner.

Nguồn: [PageFlows – invite teammates flow](https://pageflows.com/resources/invite-teammates-user-flow/), [EnterpriseReady – Team Management](https://www.enterpriseready.io/features/teams/), [SaaS invitation system implementation](https://codifysaas.com/blog/saas-features/saas-team-invitation-system-implementation/)

## File Structure

**Tạo mới:**
- `supabase/migrations/20260726000001_workspace_invites_hardening.sql` — schema + viết lại `accept_workspace_invite` + 2 RPC mới.

**Sửa:**
- `lib/errors/app-codes.ts`, `app-messages.ts`, `index.ts` — mã lỗi mới.
- `lib/email.ts` — thêm `workspaceInviteEmailCopy()`.
- `lib/workspace-invites.ts` — TTL 7 ngày, email bắt buộc, helper đếm owner.
- `app/dashboard/settings/invite-actions.ts` — gửi mail, resend, remove member, transfer ownership.
- `app/_components/workspace-team-card.tsx` — bỏ UI link mở, thêm quản lý thành viên.
- `app/_components/invite-accept-panel.tsx` — xử lý lệch email rõ ràng.
- `messages/en.json`, `messages/vi.json`.

---

### Task 1: Migration — schema + viết lại logic nhận invite

**Files:**
- Create: `supabase/migrations/20260726000001_workspace_invites_hardening.sql`

**Interfaces:**
- Consumes: bảng `workspace_invites`, `profiles`, hàm `current_user_is_workspace_owner()` / `current_user_workspace_id()` (đã có ở `20260724000008`)
- Produces:
  - `accept_workspace_invite(p_token text) → jsonb` — viết lại. Mã lỗi mới: `already_member`
  - `remove_workspace_member(p_user_id uuid) → jsonb` — mới
  - `transfer_workspace_ownership(p_to_user_id uuid) → jsonb` — mới
  - Cột mới: `workspace_invites.accepted_by`, `workspace_invites.last_sent_at`
  - `workspace_invites.email` thành `not null`
  - Task 3, 5 gọi các RPC này.

- [ ] **Step 1: Viết migration**

Tạo `supabase/migrations/20260726000001_workspace_invites_hardening.sql`:

```sql
-- Workspace invites hardening.
-- Fixes: owner self-demotion lockout, open (email-less) links, silent workspace
-- deletion. Adds member removal + ownership transfer.

-- -----------------------------------------------------------------------------
-- Schema
-- -----------------------------------------------------------------------------

alter table public.workspace_invites
  add column if not exists accepted_by uuid references auth.users (id) on delete set null,
  add column if not exists last_sent_at timestamptz;

comment on column public.workspace_invites.accepted_by is
  'User who accepted this invite (audit trail).';
comment on column public.workspace_invites.last_sent_at is
  'Last time the invite email was sent — used to rate-limit resend.';

-- Open links (email is null) are removed: anyone holding the URL could join.
-- Accepted rows are history only; nothing references this table.
delete from public.workspace_invites where email is null;

alter table public.workspace_invites
  alter column email set not null;

comment on column public.workspace_invites.email is
  'Required. Only this address may accept — open links are not supported.';

-- -----------------------------------------------------------------------------
-- accept_workspace_invite — rewritten
--
-- Rules:
--   1. Never change the role of someone already in this workspace (Bug 1).
--   2. Never consume an invite meant for someone else.
--   3. Never delete the caller's existing workspace (Bug 4).
-- -----------------------------------------------------------------------------

create or replace function public.accept_workspace_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.workspace_invites%rowtype;
  uid uuid := auth.uid();
  user_email text;
  old_ws uuid;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;

  if p_token is null or length(trim(p_token)) < 8 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into inv
  from public.workspace_invites
  where token = trim(p_token)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if inv.accepted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_accepted');
  end if;

  if inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  select email into user_email from auth.users where id = uid;

  -- Email is NOT NULL now, so this check always runs.
  if lower(trim(inv.email)) <> lower(trim(coalesce(user_email, ''))) then
    return jsonb_build_object(
      'ok', false,
      'error', 'email_mismatch',
      'inviteEmail', inv.email
    );
  end if;

  select workspace_id into old_ws from public.profiles where id = uid;

  -- Already a member of THIS workspace: no-op.
  -- Critically: do NOT touch role (an owner clicking their own link must stay
  -- owner), and do NOT consume the invite (it may be meant for someone else
  -- who shares the address, and burning it helps nobody).
  if old_ws is not null and old_ws = inv.workspace_id then
    return jsonb_build_object(
      'ok', false,
      'error', 'already_member',
      'workspaceId', inv.workspace_id
    );
  end if;

  -- Belongs to a different workspace: refuse. Never delete their data.
  if old_ws is not null then
    return jsonb_build_object('ok', false, 'error', 'already_in_workspace');
  end if;

  update public.profiles
  set workspace_id = inv.workspace_id,
      role = inv.role,
      updated_at = now()
  where id = uid;

  update public.workspace_invites
  set accepted_at = now(),
      accepted_by = uid
  where id = inv.id;

  return jsonb_build_object('ok', true, 'workspaceId', inv.workspace_id);
end;
$$;

grant execute on function public.accept_workspace_invite(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- remove_workspace_member — owner only, cannot remove an owner
-- -----------------------------------------------------------------------------

create or replace function public.remove_workspace_member(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  caller_ws uuid;
  caller_role text;
  target_ws uuid;
  target_role text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;

  select workspace_id, role into caller_ws, caller_role
  from public.profiles where id = uid;

  if caller_ws is null or caller_role <> 'owner' then
    return jsonb_build_object('ok', false, 'error', 'owner_required');
  end if;

  select workspace_id, role into target_ws, target_role
  from public.profiles where id = p_user_id;

  if target_ws is null or target_ws <> caller_ws then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- The only owner must never be removable: that would orphan the workspace.
  -- Transfer ownership first, then remove.
  if target_role = 'owner' then
    return jsonb_build_object('ok', false, 'error', 'cannot_remove_owner');
  end if;

  -- Detach from the workspace; the auth account itself is untouched.
  update public.profiles
  set workspace_id = null,
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.remove_workspace_member(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- transfer_workspace_ownership — atomic swap, keeps exactly one owner
-- -----------------------------------------------------------------------------

create or replace function public.transfer_workspace_ownership(p_to_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  caller_ws uuid;
  caller_role text;
  target_ws uuid;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;

  if p_to_user_id = uid then
    return jsonb_build_object('ok', false, 'error', 'invalid_target');
  end if;

  select workspace_id, role into caller_ws, caller_role
  from public.profiles where id = uid for update;

  if caller_ws is null or caller_role <> 'owner' then
    return jsonb_build_object('ok', false, 'error', 'owner_required');
  end if;

  select workspace_id into target_ws
  from public.profiles where id = p_to_user_id for update;

  if target_ws is null or target_ws <> caller_ws then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Promote first, then demote: at no instant does the workspace have zero owners.
  update public.profiles
  set role = 'owner', updated_at = now()
  where id = p_to_user_id;

  update public.profiles
  set role = 'staff', updated_at = now()
  where id = uid;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.transfer_workspace_ownership(uuid) to authenticated, service_role;
```

- [ ] **Step 2: Áp migration**

Run: `npx supabase db reset`
Expected: chạy hết, không lỗi cú pháp.

- [ ] **Step 3: Kiểm chứng Bug 1 đã chết**

Trong Supabase Studio SQL editor, giả lập owner bấm link của chính mình:

```sql
-- Lấy owner bất kỳ và workspace của họ
select id, email, role, workspace_id from public.profiles where role = 'owner' limit 1;
```

Tạo một invite cho workspace đó rồi gọi hàm với `auth.uid()` là owner đó (dùng `set local role` hoặc test qua UI ở Task 7). Kỳ vọng: trả `{"ok": false, "error": "already_member"}`, và **`profiles.role` vẫn là `owner`**, **`workspace_invites.accepted_at` vẫn `null`**.

- [ ] **Step 4: Kiểm chứng email NOT NULL**

```sql
insert into public.workspace_invites (workspace_id, email, token, expires_at)
values ((select id from public.workspaces limit 1), null, 'x'||gen_random_uuid()::text, now() + interval '7 days');
```
Expected: FAIL với lỗi not-null constraint.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260726000001_workspace_invites_hardening.sql
git commit -m "feat(invites): require invite email, stop owner self-demotion, add member removal and ownership transfer"
```

---

### Task 2: Mã lỗi mới

**Files:**
- Modify: `lib/errors/app-codes.ts`, `lib/errors/app-messages.ts`, `lib/errors/index.ts`

**Interfaces:**
- Produces: `APP_ERROR_CODE.INVITE_ALREADY_MEMBER`, `INVITE_EMAIL_REQUIRED`, `INVITE_SEND_FAILED`, `MEMBER_REMOVE_FAILED`, `CANNOT_REMOVE_OWNER`, `OWNERSHIP_TRANSFER_FAILED`, `INVITE_RESEND_TOO_SOON`; hàm `inviteEmailMismatchMessage(inviteEmail: string): string`. Task 3, 5, 6 dùng.

- [ ] **Step 1: Thêm mã lỗi**

Trong `lib/errors/app-codes.ts`, thêm vào object `APP_ERROR_CODE` (ngay sau `INVITE_ACCEPT_FAILED`):

```ts
  INVITE_ALREADY_MEMBER: "invite_already_member",
  INVITE_EMAIL_REQUIRED: "invite_email_required",
  INVITE_SEND_FAILED: "invite_send_failed",
  INVITE_RESEND_TOO_SOON: "invite_resend_too_soon",
  MEMBER_REMOVE_FAILED: "member_remove_failed",
  CANNOT_REMOVE_OWNER: "cannot_remove_owner",
  OWNERSHIP_TRANSFER_FAILED: "ownership_transfer_failed",
```

- [ ] **Step 2: Thêm nội dung lỗi**

Trong `lib/errors/app-messages.ts`, thêm vào `APP_ERROR_MESSAGE`:

```ts
  [APP_ERROR_CODE.INVITE_ALREADY_MEMBER]:
    "This account is already a member of that workspace. No changes were made.",
  [APP_ERROR_CODE.INVITE_EMAIL_REQUIRED]:
    "Enter the email address to invite. Open links are not supported.",
  [APP_ERROR_CODE.INVITE_SEND_FAILED]:
    "Invite was created but the email could not be sent. Copy the link and share it directly.",
  [APP_ERROR_CODE.INVITE_RESEND_TOO_SOON]:
    "An invite email was just sent. Wait a minute before resending.",
  [APP_ERROR_CODE.MEMBER_REMOVE_FAILED]:
    "Could not remove that member. Refresh and try again.",
  [APP_ERROR_CODE.CANNOT_REMOVE_OWNER]:
    "Transfer ownership to someone else before removing the owner.",
  [APP_ERROR_CODE.OWNERSHIP_TRANSFER_FAILED]:
    "Could not transfer ownership. Refresh and try again.",
```

Và thêm hàm động ở cuối file (cùng chỗ với `slugTakenMessage`):

```ts
export function inviteEmailMismatchMessage(inviteEmail: string): string {
  return `This invite is for ${inviteEmail}. Sign in with that account to accept it.`;
}
```

- [ ] **Step 3: Export**

Trong `lib/errors/index.ts`, thêm `inviteEmailMismatchMessage` vào danh sách export từ `@/lib/errors/app-messages`.

- [ ] **Step 4: Kiểm chứng**

Run: `npm run typecheck`
Expected: PASS. `APP_ERROR_MESSAGE` có `satisfies Record<AppErrorCode, string>` nên thiếu bất kỳ mã nào TS sẽ báo ngay.

- [ ] **Step 5: Commit**

```bash
git add lib/errors
git commit -m "feat(invites): add error codes for membership, send and ownership actions"
```

---

### Task 3: Email mời + TTL 7 ngày

**Files:**
- Modify: `lib/email.ts`
- Modify: `lib/workspace-invites.ts`

**Interfaces:**
- Consumes: `sendTransactionalEmail` (đã có trong `lib/email.ts`)
- Produces:
  - `workspaceInviteEmailCopy({ locale, workspaceName, inviterName, acceptUrl }) → { subject, html, text }`
  - `inviteExpiresAt()` đổi từ 14 → 7 ngày
  - Task 5 dùng cả hai.

- [ ] **Step 1: Thêm nội dung email**

Trong `lib/email.ts`, thêm cạnh `bookingReminderEmailCopy`:

```ts
export function workspaceInviteEmailCopy(input: {
  locale: "en" | "vi";
  workspaceName: string;
  inviterName: string | null;
  acceptUrl: string;
}): { subject: string; html: string; text: string } {
  const by = input.inviterName?.trim();

  if (input.locale === "vi") {
    const intro = by
      ? `${by} mời bạn tham gia workspace <strong>${input.workspaceName}</strong> trên Eve với vai trò nhân viên.`
      : `Bạn được mời tham gia workspace <strong>${input.workspaceName}</strong> trên Eve với vai trò nhân viên.`;
    return {
      subject: `Lời mời tham gia ${input.workspaceName}`,
      text:
        `${by ? `${by} mời` : "Bạn được mời"} tham gia workspace ${input.workspaceName} trên Eve.\n\n` +
        `Nhận lời mời: ${input.acceptUrl}\n\n` +
        `Liên kết có hiệu lực 7 ngày và chỉ dùng được với chính địa chỉ email này. ` +
        `Nếu bạn không mong đợi email này, hãy bỏ qua.`,
      html:
        `<p>${intro}</p>` +
        `<p><a href="${input.acceptUrl}">Nhận lời mời</a></p>` +
        `<p>Liên kết có hiệu lực 7 ngày và chỉ dùng được với chính địa chỉ email này.</p>` +
        `<p>Nếu bạn không mong đợi email này, hãy bỏ qua.</p>`,
    };
  }

  const intro = by
    ? `${by} invited you to join <strong>${input.workspaceName}</strong> on Eve as staff.`
    : `You've been invited to join <strong>${input.workspaceName}</strong> on Eve as staff.`;
  return {
    subject: `Invitation to join ${input.workspaceName}`,
    text:
      `${by ? `${by} invited you` : "You've been invited"} to join ${input.workspaceName} on Eve as staff.\n\n` +
      `Accept: ${input.acceptUrl}\n\n` +
      `This link expires in 7 days and only works for this email address. ` +
      `If you weren't expecting this, ignore this email.`,
    html:
      `<p>${intro}</p>` +
      `<p><a href="${input.acceptUrl}">Accept invitation</a></p>` +
      `<p>This link expires in 7 days and only works for this email address.</p>` +
      `<p>If you weren't expecting this, ignore this email.</p>`,
  };
}
```

- [ ] **Step 2: Đổi TTL sang 7 ngày**

Trong `lib/workspace-invites.ts`, sửa `inviteExpiresAt`:

```ts
/** Default invite TTL: 7 days (industry norm — long enough to act, short enough to limit leaked-link risk). */
export function inviteExpiresAt(from = new Date()): string {
  return new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
}
```

- [ ] **Step 3: Đổi kiểu `email` thành bắt buộc**

Trong `lib/workspace-invites.ts`, sửa type `WorkspaceInviteRow`: `email: string | null` → `email: string`. Cột giờ là NOT NULL.

Thêm `last_sent_at` vào type và vào chuỗi `.select(...)` của `listPendingInvites`:

```ts
export type WorkspaceInviteRow = {
  id: string;
  email: string;
  token: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  last_sent_at: string | null;
  created_at: string;
};
```

```ts
    .select("id, email, token, role, expires_at, accepted_at, last_sent_at, created_at")
```

- [ ] **Step 4: Kiểm chứng**

Run: `npm run typecheck`
Expected: PASS hoặc báo lỗi ở `workspace-team-card.tsx` chỗ `inv.email ?? "Open link"` — đó là đúng, Task 7 sẽ sửa. Ghi nhận rồi tiếp tục.

- [ ] **Step 5: Commit**

```bash
git add lib/email.ts lib/workspace-invites.ts
git commit -m "feat(invites): add invite email copy, shorten TTL to 7 days, require email"
```

---

### Task 4: Server actions — tạo, gửi lại, gỡ, chuyển quyền

**Files:**
- Modify: `app/dashboard/settings/invite-actions.ts`

**Interfaces:**
- Consumes: RPC từ Task 1, mã lỗi Task 2, `workspaceInviteEmailCopy` Task 3
- Produces:
  - `createWorkspaceInvite(prev, formData)` — email bắt buộc, gửi mail
  - `resendWorkspaceInvite(inviteId: string) → { error?, success? }`
  - `removeWorkspaceMember(userId: string) → { error?, success? }`
  - `transferWorkspaceOwnership(userId: string) → { error?, success? }`
  - Task 7 dùng cả bốn.

- [ ] **Step 1: Cập nhật `mapAcceptError`**

Thêm case cho mã lỗi mới:

```ts
    case "already_member":
      return appErrorMessage(APP_ERROR_CODE.INVITE_ALREADY_MEMBER);
    case "cannot_remove_owner":
      return appErrorMessage(APP_ERROR_CODE.CANNOT_REMOVE_OWNER);
    case "owner_required":
      return appErrorMessage(APP_ERROR_CODE.OWNER_REQUIRED);
```

- [ ] **Step 2: Bắt buộc email + gửi mail trong `createWorkspaceInvite`**

Thay phần đọc email và phần return cuối:

```ts
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVITE_EMAIL_REQUIRED) };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVALID_INPUT) };
  }
```

Sau khi insert thành công, gửi mail trước khi return:

```ts
  const sent = await sendInviteEmail({
    supabase: auth.supabase,
    userId: auth.userId,
    workspaceId: auth.workspaceId,
    email,
    token,
  });

  revalidatePath("/dashboard/settings");
  return {
    success: sent
      ? `Invite sent to ${email}.`
      : undefined,
    error: sent ? undefined : appErrorMessage(APP_ERROR_CODE.INVITE_SEND_FAILED),
    inviteUrl: invitePath(token),
  };
```

- [ ] **Step 3: Thêm helper gửi mail**

Thêm vào cùng file, phía trên các action:

```ts
async function sendInviteEmail(input: {
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;
  userId: string;
  workspaceId: string;
  email: string;
  token: string;
}): Promise<boolean> {
  const [{ data: workspace }, { data: inviter }] = await Promise.all([
    input.supabase
      .from("workspaces")
      .select("name, agent_reply_locale")
      .eq("id", input.workspaceId)
      .maybeSingle(),
    input.supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", input.userId)
      .maybeSingle(),
  ]);

  const origin = appOrigin();
  const acceptUrl = `${origin}${invitePath(input.token)}`;
  const locale = workspace?.agent_reply_locale === "vi" ? "vi" : "en";

  const copy = workspaceInviteEmailCopy({
    locale,
    workspaceName: workspace?.name ?? "Eve workspace",
    inviterName: inviter?.full_name?.trim() || inviter?.email || null,
    acceptUrl,
  });

  const result = await sendTransactionalEmail({
    to: input.email,
    subject: copy.subject,
    html: copy.html,
    text: copy.text,
    locale,
  });

  if (result.ok) {
    const admin = createAdminClient();
    await admin
      .from("workspace_invites")
      .update({ last_sent_at: new Date().toISOString() })
      .eq("token", input.token);
  }

  return result.ok;
}
```

Thêm import cần thiết ở đầu file:

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail, workspaceInviteEmailCopy } from "@/lib/email";
```

Và helper `appOrigin()` — **dùng lại** bản đã có trong `lib/booking-reminders.ts`. Trích nó ra `lib/app-origin.ts` và import ở cả hai nơi thay vì chép lại:

```ts
// lib/app-origin.ts
/** Public origin for links in outbound email. */
export function appOrigin(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (fromEnv) {
    const withProto = fromEnv.startsWith("http") ? fromEnv : `https://${fromEnv}`;
    return withProto.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}
```

Sửa `lib/booking-reminders.ts` để import từ đây và xoá bản cục bộ.

- [ ] **Step 4: Thêm `resendWorkspaceInvite`**

```ts
export async function resendWorkspaceInvite(
  inviteId: string,
): Promise<{ error?: string; success?: string }> {
  const auth = await requireOwnerWorkspace();
  if (!auth.ok) {
    return {
      error:
        auth.error === "owner_required"
          ? appErrorMessage(APP_ERROR_CODE.OWNER_REQUIRED)
          : appErrorMessage(APP_ERROR_CODE.SIGN_IN_REQUIRED),
    };
  }

  const { data: invite } = await auth.supabase
    .from("workspace_invites")
    .select("id, email, token, last_sent_at, accepted_at, expires_at")
    .eq("id", inviteId.trim())
    .eq("workspace_id", auth.workspaceId)
    .maybeSingle();

  if (!invite || invite.accepted_at) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVITE_INVALID) };
  }
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVITE_EXPIRED) };
  }
  if (
    invite.last_sent_at &&
    Date.now() - new Date(invite.last_sent_at).getTime() < 60_000
  ) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVITE_RESEND_TOO_SOON) };
  }

  const sent = await sendInviteEmail({
    supabase: auth.supabase,
    userId: auth.userId,
    workspaceId: auth.workspaceId,
    email: invite.email as string,
    token: invite.token as string,
  });

  if (!sent) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVITE_SEND_FAILED) };
  }

  revalidatePath("/dashboard/settings");
  return { success: `Invite resent to ${invite.email}.` };
}
```

- [ ] **Step 5: Thêm `removeWorkspaceMember` và `transferWorkspaceOwnership`**

```ts
export async function removeWorkspaceMember(
  userId: string,
): Promise<{ error?: string; success?: string }> {
  const supabase = await (await import("@/lib/supabase/server")).createClient();
  const { data, error } = await supabase.rpc("remove_workspace_member", {
    p_user_id: userId.trim(),
  });

  if (error) {
    return { error: formatDbError(error, APP_ERROR_CODE.MEMBER_REMOVE_FAILED) };
  }
  const row = data as { ok?: boolean; error?: string } | null;
  if (!row?.ok) {
    return { error: mapAcceptError(String(row?.error ?? "member_remove_failed")) };
  }

  revalidatePath("/dashboard/settings");
  return { success: "Member removed." };
}

export async function transferWorkspaceOwnership(
  userId: string,
): Promise<{ error?: string; success?: string }> {
  const supabase = await (await import("@/lib/supabase/server")).createClient();
  const { data, error } = await supabase.rpc("transfer_workspace_ownership", {
    p_to_user_id: userId.trim(),
  });

  if (error) {
    return {
      error: formatDbError(error, APP_ERROR_CODE.OWNERSHIP_TRANSFER_FAILED),
    };
  }
  const row = data as { ok?: boolean; error?: string } | null;
  if (!row?.ok) {
    return {
      error: mapAcceptError(String(row?.error ?? "ownership_transfer_failed")),
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { success: "Ownership transferred. You are now staff." };
}
```

- [ ] **Step 6: Kiểm chứng**

Run: `npm run typecheck`
Expected: PASS (trừ lỗi ở `workspace-team-card.tsx` sẽ sửa ở Task 7).

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/settings/invite-actions.ts lib/app-origin.ts lib/booking-reminders.ts
git commit -m "feat(invites): send invite emails, add resend, member removal and ownership transfer actions"
```

---

### Task 5: Trang nhận invite — xử lý lệch email rõ ràng

**Files:**
- Modify: `app/_components/invite-accept-panel.tsx`

**Interfaces:**
- Consumes: `acceptWorkspaceInviteAction`, `inviteEmailMismatchMessage` (Task 2), `InvitePreview`
- Produces: không có gì cho task sau.

**Vấn đề đang có:** khi đăng nhập bằng tài khoản khác email được mời, người dùng chỉ thấy nút "Accept invite", bấm xong mới nhận lỗi. Sản phẩm lớn chặn **trước**, nói rõ invite dành cho ai, kèm đường đổi tài khoản.

- [ ] **Step 1: Chặn trước khi hiện nút Accept**

Trong nhánh `signedIn`, thay toàn bộ khối bằng:

```tsx
{signedIn ? (
  preview.email &&
  userEmail &&
  preview.email.trim().toLowerCase() !== userEmail.trim().toLowerCase() ? (
    <>
      <p
        className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100"
        role="alert"
      >
        {inviteEmailMismatchMessage(preview.email)}
      </p>
      <p className="text-sm text-zinc-400">
        Signed in as <span className="text-white">{userEmail}</span>.
      </p>
      <Link
        className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-sm text-zinc-300 transition hover:border-white/20 hover:text-white"
        href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
      >
        Sign in with a different account
      </Link>
    </>
  ) : (
    <>
      <p className="text-sm text-zinc-400">
        Signed in as{" "}
        <span className="text-white">{userEmail ?? "your account"}</span>.
      </p>
      {error ? (
        <p
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <RainbowButton
        className={cn(
          "h-11 w-full rounded-full font-semibold",
          pending && "opacity-70",
        )}
        disabled={pending}
        onClick={onAccept}
        size="lg"
        type="button"
      >
        {pending ? "Joining…" : "Accept invite"}
      </RainbowButton>
    </>
  )
) : (
  /* ...giữ nguyên nhánh chưa đăng nhập... */
)}
```

Thêm import: `import { inviteEmailMismatchMessage } from "@/lib/errors";`

**Bỏ hẳn** câu *"Accepting joins this workspace (empty unfinished workspaces are removed)"* — sau Task 1 không còn workspace nào bị xoá nữa, câu đó thành sai.

- [ ] **Step 2: Kiểm chứng typecheck + doctor**

Run: `npm run typecheck && npm run doctor`
Expected: PASS, không error mới.

- [ ] **Step 3: Kiểm chứng thủ công**

Đăng nhập tài khoản A. Tạo invite cho `b@example.com`. Mở link invite khi vẫn đang đăng nhập A.
Expected: hiện cảnh báo *"This invite is for b@example.com…"* + nút đổi tài khoản. **Không** có nút "Accept invite".

- [ ] **Step 4: Commit**

```bash
git add app/_components/invite-accept-panel.tsx
git commit -m "feat(invites): block acceptance on email mismatch before submit"
```

---

### Task 6: Team card — quản lý thành viên

**Files:**
- Modify: `app/_components/workspace-team-card.tsx`
- Modify: `messages/en.json`, `messages/vi.json`

**Interfaces:**
- Consumes: `resendWorkspaceInvite`, `removeWorkspaceMember`, `transferWorkspaceOwnership` (Task 4)
- Produces: không có gì cho task sau.

- [ ] **Step 1: Thêm chuỗi i18n**

Thêm vào namespace `dashboard` của `messages/en.json`:

```json
"teamInviteEmailLabel": "Invite email",
"teamInviteEmailHint": "Only this address can accept the invite. It expires in 7 days.",
"teamSendInvite": "Send invite",
"teamSending": "Sending…",
"teamResend": "Resend",
"teamRemove": "Remove",
"teamMakeOwner": "Make owner",
"teamConfirmRemove": "Remove this member from the workspace?",
"teamConfirmTransfer": "Transfer ownership? You will become staff and cannot undo this yourself."
```

Và `messages/vi.json`:

```json
"teamInviteEmailLabel": "Email người được mời",
"teamInviteEmailHint": "Chỉ địa chỉ này nhận được lời mời. Liên kết hết hạn sau 7 ngày.",
"teamSendInvite": "Gửi lời mời",
"teamSending": "Đang gửi…",
"teamResend": "Gửi lại",
"teamRemove": "Gỡ",
"teamMakeOwner": "Chuyển quyền owner",
"teamConfirmRemove": "Gỡ thành viên này khỏi workspace?",
"teamConfirmTransfer": "Chuyển quyền owner? Bạn sẽ thành staff và không thể tự hoàn tác."
```

- [ ] **Step 2: Bỏ UI link mở, đổi form thành gửi email**

Sửa khối form (dòng ~119–137):

```tsx
<form action={action} className="space-y-3">
  <div className="space-y-2">
    <Label htmlFor="invite-email">{t("dashboard.teamInviteEmailLabel")}</Label>
    <Input
      autoComplete="email"
      id="invite-email"
      name="email"
      placeholder="staff@example.com"
      required
      type="email"
    />
    <p className="text-muted-foreground text-xs">
      {t("dashboard.teamInviteEmailHint")}
    </p>
  </div>
  <Button disabled={pending} type="submit">
    {pending ? t("dashboard.teamSending") : t("dashboard.teamSendInvite")}
  </Button>
</form>
```

Thêm `const t = useTranslations();` và import `useTranslations` từ `next-intl`.

Sửa mô tả đầu section: `Invite links expire in 14 days` → `7 days`.

- [ ] **Step 3: Thêm nút quản lý thành viên**

Trong `<li>` của mỗi member, thay `<Badge>` đơn lẻ bằng badge + nút (chỉ hiện khi `isOwner` và không phải chính mình):

```tsx
<div className="flex items-center gap-2">
  <Badge variant={m.role === "owner" ? "default" : "secondary"}>
    {m.role}
  </Badge>
  {isOwner && m.id !== currentUserId ? (
    <>
      <Button
        onClick={() => onTransfer(m.id)}
        size="sm"
        type="button"
        variant="ghost"
      >
        {t("dashboard.teamMakeOwner")}
      </Button>
      <Button
        onClick={() => onRemove(m.id)}
        size="sm"
        type="button"
        variant="ghost"
      >
        {t("dashboard.teamRemove")}
      </Button>
    </>
  ) : null}
</div>
```

Thêm prop `currentUserId: string` vào component. Cập nhật nơi render nó (`app/dashboard/settings/page.tsx`) để truyền vào — lấy từ `getDashboardUser()`.

Thêm handler:

```tsx
function onRemove(userId: string) {
  if (!window.confirm(t("dashboard.teamConfirmRemove"))) return;
  startTransition(async () => {
    const result = await removeWorkspaceMember(userId);
    if (result.error) toast.error(result.error);
    else {
      toast.success(result.success ?? "Member removed.");
      router.refresh();
    }
  });
}

function onTransfer(userId: string) {
  if (!window.confirm(t("dashboard.teamConfirmTransfer"))) return;
  startTransition(async () => {
    const result = await transferWorkspaceOwnership(userId);
    if (result.error) toast.error(result.error);
    else {
      toast.success(result.success ?? "Ownership transferred.");
      router.refresh();
    }
  });
}
```

- [ ] **Step 4: Thêm nút Resend, sửa hiển thị "Open link"**

Trong danh sách pending invite, `inv.email ?? "Open link"` → `inv.email` (giờ luôn có). Thêm nút Resend cạnh Copy/Revoke:

```tsx
<Button
  onClick={() => onResend(inv.id)}
  size="sm"
  type="button"
  variant="outline"
>
  {t("dashboard.teamResend")}
</Button>
```

Với handler tương ứng gọi `resendWorkspaceInvite`.

- [ ] **Step 5: Kiểm chứng typecheck + doctor**

Run: `npm run typecheck && npm run doctor`
Expected: PASS. Mọi lỗi còn tồn từ Task 3 (`inv.email ?? "Open link"`) giờ phải hết.

- [ ] **Step 6: Commit**

```bash
git add app/_components/workspace-team-card.tsx app/dashboard/settings/page.tsx messages/en.json messages/vi.json
git commit -m "feat(invites): email-only invite form, resend, member removal and ownership transfer UI"
```

---

### Task 7: Chạy runbook kiểm chứng đầu-cuối

**Files:**
- Không sửa file nào. Đây là bước xác nhận trước khi coi là xong.

- [ ] **Step 1: Chuẩn bị**

```bash
npx supabase db reset
npm run dev
```

Cần 2 địa chỉ email thật khác nhau (hoặc dùng alias `+`). `RESEND_API_KEY` phải được set, và domain đã verify theo `docs/ops/resend-domain-setup.md` — nếu chưa, email sẽ vào spam và bước 3 sẽ không kiểm chứng được.

- [ ] **Step 2: Chạy bảng kiểm chứng**

| # | Kịch bản | Kỳ vọng |
|---|----------|---------|
| 1 | Owner tạo invite, **bỏ trống email** | Form chặn (`required`), server cũng từ chối |
| 2 | Owner tạo invite cho `b@…` | Nhận được email tại `b@…`, có link nhận lời mời |
| 3 | **Owner bấm chính link đó khi đang đăng nhập** | Hiện cảnh báo lệch email, **không** có nút Accept. Role của owner **vẫn là owner**. Invite **vẫn pending** |
| 4 | `b@…` chưa có tài khoản → bấm link → tạo tài khoản | Vào thẳng dashboard với vai trò staff, **không** tạo workspace mới |
| 5 | `b@…` bấm lại link cũ | Báo "already used" |
| 6 | Owner mời `c@…`, nhưng `c@…` đã có workspace riêng | Báo "already in workspace". Workspace của `c@…` **còn nguyên** |
| 7 | Owner bấm "Resend" hai lần liên tiếp | Lần hai báo "wait a minute" |
| 8 | Owner gỡ staff `b@…` | `b@…` biến khỏi danh sách; đăng nhập lại bị đá về setup (không còn workspace) |
| 9 | Owner thử gỡ **chính mình** | Không có nút (đã ẩn), và nếu gọi thẳng RPC thì trả `cannot_remove_owner` |
| 10 | Owner chuyển quyền cho staff | Staff thành owner, owner cũ thành staff. Vẫn đúng **một** owner |
| 11 | Sau khi chuyển quyền, owner cũ mở Settings | Không còn form tạo invite (chỉ owner mới có) |
| 12 | Gỡ `RESEND_API_KEY` rồi tạo invite | Invite **vẫn được tạo**, báo lỗi gửi mail + vẫn copy link được |

- [ ] **Step 3: Cập nhật trạng thái plan**

Sửa header file này thành `> Trạng thái: **đã triển khai** (ngày hoàn thành)`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-07-26-workspace-invites.md
git commit -m "docs: mark workspace invites plan as implemented"
```

---

## Ngoài phạm vi (ghi lại, đừng làm bây giờ)

- **Nhiều workspace cho một user** — cần bảng `workspace_members`, viết lại 29 RLS policy. Chỉ làm khi có nhu cầu agency thật.
- **Vai trò `admin`** — chỉ thêm khi có tenant thật yêu cầu.
- **Rời workspace tự nguyện (staff tự rời)** — hiện chỉ owner gỡ được. Thêm khi có người hỏi.
- **Xoá workspace** — hiện không có luồng nào xoá workspace một cách chủ ý. Task 1 đã bỏ việc xoá ngầm; nếu sau này cần thì làm thành hành động riêng, có xác nhận bằng cách gõ tên workspace.

## Self-Review

**Bug coverage:**

| Bug | Task xử lý |
|---|---|
| 1 — Owner tự hạ cấp | Task 1 (nhánh `already_member` không đụng role, không tiêu thụ invite) + Task 5 (chặn ở UI trước) |
| 2 — Link mở | Task 1 (`email set not null`) + Task 4 (action bắt buộc) + Task 6 (form `required`) |
| 3 — Không gửi email | Task 3 (nội dung mail) + Task 4 (`sendInviteEmail`) |
| 4 — Xoá workspace ngầm | Task 1 (bỏ hẳn nhánh `delete`) + Task 5 (bỏ câu mô tả sai) |
| 5 — Team card chỉ đọc | Task 1 (2 RPC mới) + Task 4 (3 action) + Task 6 (UI) |

**Nhất quán kiểu:**
- `WorkspaceInviteRow.email` đổi `string | null` → `string` ở Task 3; Task 6 sửa nơi tiêu thụ. Task 3 Step 4 đã báo trước là typecheck sẽ đỏ tạm ở giữa.
- `appOrigin()` gom về `lib/app-origin.ts`, `lib/booking-reminders.ts` import lại thay vì giữ bản chép.
- Mã lỗi khai báo ở Task 2 trước khi Task 4/5 dùng.

**Rủi ro cần biết trước khi chạy Task 1:** migration `delete from public.workspace_invites where email is null` **xoá dữ liệu**. Trên môi trường local thì không sao. Nếu đã có prod, kiểm tra trước bằng `select count(*) from public.workspace_invites where email is null;` — chúng đều là link mở không an toàn nên xoá là đúng, nhưng hãy biết mình đang xoá bao nhiêu.
