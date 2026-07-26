# Tool không ném lỗi khi thiếu Cal key — Implementation Plan

> **For agentic workers:** Thực thi task-by-task, đánh dấu checkbox (`- [ ]`) để theo dõi.
>
> **Sửa thẳng vào `main`.** Không tạo branch, không tạo git worktree — chủ dự án làm một mình một dự án và đã quyết vậy. Nếu bạn dùng `superpowers:executing-plans` hay `superpowers:subagent-driven-development`, **bỏ qua bước `using-git-worktrees`** của chúng và coi đây là sự đồng ý rõ ràng để làm trên `main`.
>
> Đổi lại: **commit từng task một**, message rõ ràng. Đó là cách quay lui khi hỏng (`git revert <sha>`) — thứ mà branch từng lo, giờ commit nhỏ lo.
>
> Thuộc nhóm [Release Readiness](2026-07-26-release-readiness.md).

**Goal:** Khi workspace không có Cal.com key, agent trả lời khách một cách tử tế thay vì để một `Error` tiếng Anh kiểu dashboard lọt ra ngoài ranh giới tool.

**Architecture:** Bọc bốn chỗ gọi `getCalApiKeyForWorkspace` bằng try/catch, trả về kết quả có cấu trúc đúng chuẩn từng file. Không đổi `lib/workspace.ts` — hàm đó ném lỗi là hợp lý cho người gọi phía dashboard; chỗ sai là tool không bắt.

**Tech Stack:** eve agent tools, `lib/errors`.

## Vì sao cần

`getCalApiKeyForWorkspace` (`lib/workspace.ts:359-387`) **ném lỗi** ở ba nhánh:

| Dòng | Tình huống | Thông điệp bị ném |
|------|-----------|-------------------|
| 366 | Pilot demo mà thiếu env `CALCOM_API_KEY` | `"Eve Pilot demo requires CALCOM_API_KEY in env (sandbox calendar)."` |
| 378 | Lỗi Supabase khi tra bảng | thông điệp thô của Postgres |
| 384 | Tenant chưa có key | `"Cal.com API key is not configured. Go to Setup / Settings to paste the workspace API key."` |

Cả ba đều vi phạm `.claude/rules/agent-tools.md` quy tắc 4 (không ném lỗi qua ranh giới tool) và `.claude/rules/errors.md` quy tắc 1 (không trả chuỗi thô ra UI). Nhánh 384 tệ nhất: nó bảo **khách vãng lai** đi vào Dashboard → Settings, nơi họ không có quyền và không hiểu là gì.

**Phạm vi:** cổng `bookingLive` (suy từ Cal key + meeting type AI, `lib/workspace.ts:220`) đã chặn workspace **chưa từng cấu hình** khỏi việc phát hành `/b/[slug]`. Plan này bịt phần còn lại: (a) key bị xoá/xoay **sau khi** đã live, (b) Pilot demo thiếu env key, (c) lỗi Supabase tạm thời.

## Global Constraints

- Không có test runner — kiểm chứng bằng cách dựng lại đúng tình huống lỗi.
- **Không sửa `lib/workspace.ts`.** Người gọi phía dashboard đang dựa vào việc nó ném lỗi.
- Copy lỗi trong `lib/errors/app-messages.ts` là **tiếng Anh** (record `APP_ERROR_MESSAGE`) — giữ đúng vậy.
- Sau khi sửa code: `graphify update .`.

## Ghi chú về hai kiểu trả lỗi trong repo

Bốn tool **không** dùng chung một helper — đừng ép chúng giống nhau trong plan này:

| Tool | Kiểu hiện tại |
|------|---------------|
| `cancel_appointment.ts`, `reschedule_appointment.ts` | `toolError(APP_ERROR_CODE.X)` từ `lib/agent-booking-auth.ts:500` → `{ ok: false, error, errorCode }` |
| `check_availability.ts`, `book_appointment.ts` | inline `return { ok: false as const, error }` kèm `logAgentToolEvent({ ok: false, … })` (xem `check_availability.ts:43-50`) |

Mỗi file theo kiểu của chính nó. Thống nhất hai kiểu là việc riêng, không nhét vào plan release.

---

### Task 1: Rà lại copy `CAL_NOT_CONFIGURED` cho đúng người đọc

**Files:**
- Modify: `lib/errors/app-messages.ts:33`

**Interfaces:**
- Consumes: `APP_ERROR_CODE.CAL_NOT_CONFIGURED` (đã có, `lib/errors/app-codes.ts:24`)
- Produces: copy dùng được cho khách vãng lai.

- [ ] **Bước 1: Kiểm tra code này đang được dùng ở đâu**

```bash
grep -rn "CAL_NOT_CONFIGURED" --include=*.ts --include=*.tsx .
```

Nếu nó **chỉ** xuất hiện trong `app-codes.ts` và `app-messages.ts` → chưa ai dùng, đổi copy tự do (Bước 2).
Nếu có chỗ dùng phía dashboard → **đừng đổi**, thay vào đó thêm một code mới `CAL_NOT_CONFIGURED_GUEST` và dùng code mới trong Task 2. Ghi lại lựa chọn đã dùng.

- [ ] **Bước 2: Sửa copy cho khách**

Copy hiện tại (dòng 33) là `"Cal.com is not configured."` — đúng cho dashboard, vô nghĩa với khách. Đổi thành:

```ts
  [APP_ERROR_CODE.CAL_NOT_CONFIGURED]:
    "Online booking is not available right now. Please contact the business directly.",
```

Câu này nói được điều khách cần biết và không hé lộ nhà cung cấp lịch.

- [ ] **Bước 3: Typecheck + commit**

```bash
npm run typecheck
git add lib/errors
git commit -m "fix(errors): make CAL_NOT_CONFIGURED copy readable by guests"
```

---

### Task 2: Bọc bốn chỗ gọi

**Files:**
- Modify: `agent/tools/check_availability.ts:96`
- Modify: `agent/tools/book_appointment.ts:73`
- Modify: `agent/tools/cancel_appointment.ts:76`
- Modify: `agent/tools/reschedule_appointment.ts` (chỗ gọi tương ứng)

**Interfaces:**
- Consumes: `APP_ERROR_CODE.CAL_NOT_CONFIGURED`, `appErrorMessage` từ `@/lib/errors`; `toolError` từ `@/lib/agent-booking-auth` (chỉ hai tool cancel/reschedule)
- Produces: không export mới — chỉ đổi lỗi ném thành lỗi có cấu trúc.

- [ ] **Bước 1: Định vị chính xác bốn chỗ gọi**

```bash
grep -rn "getCalApiKeyForWorkspace(" agent/tools/
```

Ghi lại số dòng và tên biến workspace ở mỗi chỗ (`workspaceId` vs `actor.workspaceId`) — chúng không giống nhau.

- [ ] **Bước 2: Sửa `cancel_appointment.ts` và `reschedule_appointment.ts`**

Hai file này đã có `toolError`. Thay:

```ts
      const apiKey = await getCalApiKeyForWorkspace(actor.workspaceId);
```

bằng:

```ts
      let apiKey: string;
      try {
        apiKey = await getCalApiKeyForWorkspace(actor.workspaceId);
      } catch {
        return toolError(APP_ERROR_CODE.CAL_NOT_CONFIGURED);
      }
```

`cancel_appointment.ts:14` đã import `APP_ERROR_CODE`. Kiểm tra `reschedule_appointment.ts` có chưa, thiếu thì thêm.

- [ ] **Bước 3: Sửa `check_availability.ts`**

File này dùng kiểu inline kèm log. Thay dòng 96:

```ts
      const apiKey = await getCalApiKeyForWorkspace(workspaceId);
```

bằng:

```ts
      let apiKey: string;
      try {
        apiKey = await getCalApiKeyForWorkspace(workspaceId);
      } catch {
        const error = appErrorMessage(APP_ERROR_CODE.CAL_NOT_CONFIGURED);
        await logAgentToolEvent({
          toolName: "check_availability",
          ok: false,
          error,
          sessionId,
          workspaceId,
        });
        return { ok: false as const, error };
      }
```

Khối này bám theo đúng mẫu đã có ở dòng 43-50 của chính file. Thêm `APP_ERROR_CODE` và `appErrorMessage` vào import từ `@/lib/errors`.

- [ ] **Bước 4: Sửa `book_appointment.ts`**

Cùng cách, đổi `toolName` thành `"book_appointment"` và dùng đúng biến workspace của file (dòng 73).

- [ ] **Bước 5: Typecheck**

```bash
npm run typecheck
```

Mong đợi: exit 0. Nếu báo "used before assigned" ở `apiKey`, nghĩa là `catch` chưa `return` — sửa lại.

- [ ] **Bước 6: Dựng lại tình huống (a) — key bị gỡ sau khi live**

```bash
npx supabase db execute --sql "update public.workspaces set cal_api_key_encrypted = null where slug = 'eve-pilot';"
```

Bỏ `CALCOM_API_KEY` khỏi `.env.local`, rồi:

```bash
npm run dev
```

Mở `http://localhost:3000/b/eve-pilot`, hỏi "còn trống tuần sau không?". Mong đợi: agent trả lời bằng copy mới ("Online booking is not available right now…") và đề nghị lấy thông tin liên hệ (`log_lead`). **Không** stack trace, **không** unhandled rejection trong log server, **không** câu "Go to Setup / Settings".

- [ ] **Bước 7: Kiểm chứng cả bốn tool**

Cùng trạng thái đó, thử tiếp: đặt lịch (`book_appointment`), rồi huỷ / đổi lịch trên một booking cũ (`cancel_appointment` / `reschedule_appointment`). Cả bốn phải trả lỗi tử tế, không ném.

- [ ] **Bước 8: Khôi phục**

```bash
npx supabase db reset
```

Trả `CALCOM_API_KEY` về `.env.local`.

- [ ] **Bước 9: graph + commit**

```bash
graphify update .
git add agent/tools graphify-out
git commit -m "fix(agent): return CAL_NOT_CONFIGURED instead of throwing when a workspace has no Cal key"
```

---

## Việc phát hiện thêm (không làm trong plan này)

`check_availability.ts:42` hardcode một chuỗi tiếng Anh cho tình huống "chưa chọn meeting type AI", cũng bảo khách đi vào Dashboard → Setup. Cùng loại lỗi, khác nguyên nhân. `APP_ERROR_CODE.AI_MEETING_TYPE_REQUIRED` đã tồn tại.

Không gộp vào plan này để diff nhỏ. Nếu muốn xử luôn, báo user và làm thành một commit riêng.

## Self-review trước khi đóng plan

- [ ] `grep -rn "getCalApiKeyForWorkspace(" agent/tools/` → mọi kết quả đều nằm trong `try`
- [ ] `lib/workspace.ts` **không** đổi
- [ ] Không tool nào ném lỗi ra ngoài trong tình huống dựng ở Bước 6
- [ ] Copy khách nhìn thấy không nhắc Dashboard, Settings, hay Cal.com
