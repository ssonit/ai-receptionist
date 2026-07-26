# Cổng đăng ký công khai `EVE_SIGNUP_MODE` — Implementation Plan

> **For agentic workers:** Thực thi task-by-task, đánh dấu checkbox (`- [ ]`) để theo dõi.
>
> **Sửa thẳng vào `main`.** Không tạo branch, không tạo git worktree — chủ dự án làm một mình một dự án và đã quyết vậy. Nếu bạn dùng `superpowers:executing-plans` hay `superpowers:subagent-driven-development`, **bỏ qua bước `using-git-worktrees`** của chúng và coi đây là sự đồng ý rõ ràng để làm trên `main`.
>
> Đổi lại: **commit từng task một**, message rõ ràng. Đó là cách quay lui khi hỏng (`git revert <sha>`) — thứ mà branch từng lo, giờ commit nhỏ lo.
>
> Thuộc nhóm [Release Readiness](2026-07-26-release-readiness.md).

**Goal:** Có công tắc env để đóng `/signup` công khai mà không cần deploy code mới, trong khi luồng invite vẫn chạy bình thường.

**Architecture:** Một biến env, một helper thuần, hai chỗ chặn — server action (chống submit trực tiếp) và `proxy.ts` (chống hiện form). Không schema, không UI mới.

**Tech Stack:** Next.js server actions + `proxy.ts` (bản thay thế middleware trong repo này).

**Vì sao chặn release:** `/signup` ai có URL cũng vào được. `app/auth/actions.ts:16` `signUp()` tạo workspace **mới** cho mọi lần đăng ký không kèm invite. Đây là gap đã ghi trong `.claude/rules/architecture.md`.

## Global Constraints

- Không có test runner — kiểm chứng bằng lệnh + trình duyệt.
- Copy lỗi vào `lib/errors/app-messages.ts`. **File này toàn tiếng Anh** (`APP_ERROR_MESSAGE` là record keyed theo code, xem dòng 10-40) — viết copy tiếng Anh cho khớp, đừng chèn tiếng Việt vào giữa.
- Không đổi hành vi luồng invite. Invite đã được validate với bảng `workspace_invites`.
- Sau khi sửa code: `graphify update .`.

## Chặn ở đâu

**Chế độ mặc định lúc ra mắt là quyết định của user** (`open` hay `invite_only`). Plan này để mặc định `open` (giữ nguyên hành vi hiện tại) — hỏi user trước khi đổi giá trị trong Vercel env.

## File Structure

- **Tạo:** `lib/signup-mode.ts` — chỉ đọc env và trả boolean. Đặt ở `lib/` để cả server action lẫn `proxy.ts` dùng chung, không chép logic.
- **Sửa:** `lib/errors/app-codes.ts` — thêm một code.
- **Sửa:** `lib/errors/app-messages.ts` — thêm một dòng copy.
- **Sửa:** `app/auth/actions.ts:16-54` — chặn ở server action.
- **Sửa:** `proxy.ts:130` — chặn ở tầng route.
- **Sửa:** `.env.example` — tài liệu hoá biến.

---

### Task 1: Helper + mã lỗi

**Files:**
- Create: `lib/signup-mode.ts`
- Modify: `lib/errors/app-codes.ts:71`
- Modify: `lib/errors/app-messages.ts`

**Interfaces:**
- Produces:
  - `isPublicSignupOpen(): boolean` từ `@/lib/signup-mode`
  - `APP_ERROR_CODE.SIGNUP_CLOSED` = `"signup_closed"`
  - `APP_ERROR_MESSAGE[APP_ERROR_CODE.SIGNUP_CLOSED]`

- [ ] **Bước 1: Tạo helper**

Tạo `lib/signup-mode.ts`:

```ts
/**
 * Public signup gate. `open` (default) keeps /signup self-serve;
 * `invite_only` restricts new accounts to workspace invite tokens.
 */
export function isPublicSignupOpen(): boolean {
  const mode = process.env.EVE_SIGNUP_MODE?.trim().toLowerCase();
  return mode !== "invite_only";
}
```

Mặc định "mở" là có chủ đích: env thiếu hoặc gõ sai không được âm thầm khoá đăng ký.

- [ ] **Bước 2: Thêm mã lỗi**

Trong `lib/errors/app-codes.ts`, thêm ngay sau dòng `WORKSPACE_RESOLVE_FAILED: "workspace_resolve_failed",` (dòng 71):

```ts
  SIGNUP_CLOSED: "signup_closed",
```

- [ ] **Bước 3: Thêm copy**

Trong `lib/errors/app-messages.ts`, thêm vào record `APP_ERROR_MESSAGE`, cạnh các mục invite:

```ts
  [APP_ERROR_CODE.SIGNUP_CLOSED]:
    "Public signup is closed. You need an invite from a workspace owner.",
```

- [ ] **Bước 4: Typecheck**

```bash
npm run typecheck
```

Mong đợi: exit 0. Nếu `APP_ERROR_MESSAGE` được khai báo với kiểu `Record<AppErrorCode, string>`, quên copy sẽ báo lỗi ngay tại đây — đó là cơ chế bắt lỗi thay cho test.

- [ ] **Bước 5: Commit**

```bash
git add lib/signup-mode.ts lib/errors
git commit -m "feat(auth): add signup mode helper and SIGNUP_CLOSED error code"
```

---

### Task 2: Chặn ở server action

**Files:**
- Modify: `app/auth/actions.ts:1-54`

**Interfaces:**
- Consumes: `isPublicSignupOpen()`, `APP_ERROR_CODE.SIGNUP_CLOSED`, `appErrorMessage`
- Produces: `signUp()` trả `{ error }` thay vì tạo tài khoản khi cổng đóng.

- [ ] **Bước 1: Sửa import**

Ở đầu `app/auth/actions.ts`, thay khối import từ `@/lib/errors` (dòng 4-8) bằng:

```ts
import {
  APP_ERROR_CODE,
  AUTH_ERROR_CODE,
  appErrorMessage,
  authErrorMessage,
  formatAuthError,
} from "@/lib/errors";
import { isPublicSignupOpen } from "@/lib/signup-mode";
```

- [ ] **Bước 2: Thêm guard**

Trong `signUp()`, ngay sau kiểm tra `password.length < 6` (dòng 30-32) và **trước** `const supabase = await createClient();`:

```ts
  if (!inviteToken && !isPublicSignupOpen()) {
    return { error: appErrorMessage(APP_ERROR_CODE.SIGNUP_CLOSED) };
  }
```

Đặt sau các kiểm tra định dạng là có chủ ý: người có invite hợp lệ không bao giờ chạm vào guard này, và form vẫn báo lỗi định dạng trước.

- [ ] **Bước 3: Kiểm chứng cổng mở (hành vi hiện tại không đổi)**

Bỏ `EVE_SIGNUP_MODE` khỏi `.env.local`:

```bash
npm run dev
```

Đăng ký tài khoản mới tại `http://localhost:3000/signup` → vào `/dashboard/setup` như cũ (SMOKE.md section "Tenant happy path", bước đầu).

- [ ] **Bước 4: Kiểm chứng cổng đóng chặn submit trực tiếp**

Đặt `EVE_SIGNUP_MODE=invite_only` trong `.env.local`, restart dev server. Vì Task 3 chưa làm, form vẫn hiện — submit thử → mong đợi lỗi "Public signup is closed…", **không** tạo tài khoản.

Xác nhận không có row mới:

```bash
npx supabase db execute --sql "select count(*) from auth.users;"
```

So với số trước khi submit — phải bằng nhau.

- [ ] **Bước 5: Commit**

```bash
git add app/auth/actions.ts
git commit -m "feat(auth): refuse public signup when EVE_SIGNUP_MODE=invite_only"
```

---

### Task 3: Chặn ở tầng route + tài liệu env

**Files:**
- Modify: `proxy.ts:1-4` (import) và `proxy.ts:130` (chèn trước khối redirect user đã đăng nhập)
- Modify: `.env.example`

**Interfaces:**
- Consumes: `isPublicSignupOpen()`
- Produces: `/signup` redirect về `/login` khi cổng đóng và không có `?invite=`.

- [ ] **Bước 1: Thêm import vào proxy.ts**

```ts
import { isPublicSignupOpen } from "@/lib/signup-mode";
```

- [ ] **Bước 2: Chèn khối redirect**

Trong `proxy.ts`, chèn **ngay trước** dòng 130 `if ((path === "/login" || path === "/signup") && user) {`:

```ts
  if (path === "/signup" && !isPublicSignupOpen()) {
    const invite = request.nextUrl.searchParams.get("invite")?.trim();
    if (!invite) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }
```

Giữ `?invite=` đi qua là bắt buộc: `proxy.ts:137-139` đã có sẵn nhánh chuyển `/signup?invite=…` sang `/invite/{token}`, và người được mời phải đăng ký được.

`/signup` đã nằm trong `config.matcher` (dòng 155) — không cần sửa matcher.

- [ ] **Bước 3: Tài liệu hoá biến env**

Trong `.env.example`, thêm phía trên khối `# ── Analytics (PostHog) ──`:

```
# Public signup gate: open (default) | invite_only
EVE_SIGNUP_MODE=open
```

- [ ] **Bước 4: Kiểm chứng cổng đóng**

Với `EVE_SIGNUP_MODE=invite_only`, restart `npm run dev`:

- `http://localhost:3000/signup` → redirect `/login`
- `http://localhost:3000/signup?invite=abc` → **không** redirect về `/login` (đi tiếp theo nhánh invite sẵn có)

- [ ] **Bước 5: Kiểm chứng luồng invite còn nguyên**

Vẫn với `invite_only`: owner tạo invite tại `/dashboard/settings` → Team → mở `/invite/{token}` ở cửa sổ ẩn danh → **Tạo tài khoản & tham gia** → vào `/dashboard` với vai staff, cùng `workspace_id` với owner (SMOKE.md section "Invite staff").

Đây là bước quan trọng nhất của plan: cổng đóng mà chặn luôn invite thì workspace không tuyển được người.

- [ ] **Bước 6: Kiểm chứng cổng mở vẫn bình thường**

Đổi lại `EVE_SIGNUP_MODE=open`, restart, mở `/signup` → form hiện, đăng ký được.

- [ ] **Bước 7: typecheck, graph, commit**

```bash
npm run typecheck
graphify update .
git add proxy.ts .env.example graphify-out
git commit -m "feat(auth): redirect /signup to /login when public signup is closed"
```

---

## Self-review trước khi đóng plan

- [ ] `EVE_SIGNUP_MODE` không set → hành vi y hệt trước plan này
- [ ] `invite_only` → cả form lẫn server action đều chặn (chặn hai tầng, không chỉ ẩn UI)
- [ ] `invite_only` → luồng invite đầy đủ vẫn chạy hết
- [ ] Không hardcode chuỗi lỗi tiếng Anh trong `actions.ts` — dùng `appErrorMessage`
- [ ] `.env.example` có biến mới; [production-env](2026-07-26-production-env.md) đã liệt kê nó
