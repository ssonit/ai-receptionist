# Không quay lại được wizard setup — Implementation Plan

> **For agentic workers:** Thực thi task-by-task, đánh dấu checkbox (`- [ ]`) để theo dõi. Làm trên **nhánh feature thường**: `git switch -c feat/<tên>` → code → test → merge `main`.
>
> **Không tạo git worktree.** Chủ dự án đã quyết: repo này làm tuần tự, mỗi worktree phải `npm install` riêng và không copy được `.env.local` (gitignore), nên chỉ tổ nặng. Nếu bạn dùng `superpowers:executing-plans` hay `superpowers:subagent-driven-development`, **bỏ qua bước `using-git-worktrees`** của chúng — coi như đã có sự đồng ý rõ ràng để làm trên nhánh feature.
>
> Thuộc nhóm [Release Readiness](2026-07-26-release-readiness.md). **Chặn release. Làm trước mọi plan code khác.**

**Goal:** Tenant nào chưa nối Cal.com phải quay lại được wizard để nối — hôm nay họ bị kẹt vĩnh viễn.

**Architecture:** Sửa điều kiện chuyển hướng trong `proxy.ts` để nó dùng `bookingLive` chứ không dùng `setup_completed_at`. Không đụng wizard, không đụng schema.

**Tech Stack:** `proxy.ts`, Supabase.

## Vấn đề — đã lần từ code

`setup_completed_at` được set ở **cuối bước 1**, không phải cuối wizard:

| # | Nơi | Điều xảy ra |
|---|-----|-------------|
| 1 | `components/setup-wizard.tsx:303` | form bước 1 dùng `finishAction` khi `!profileSaved` |
| 2 | `app/dashboard/setup/actions.ts:232-239` | `finishSetupAction` = `saveSetupProfileAction` + `completeSetupAction` |
| 3 | `app/dashboard/setup/actions.ts:219` | `completeSetupAction` set `setup_completed_at` |
| 4 | `components/setup-wizard.tsx:163` | thành công → `setStep(2)` — **chỉ là state client**, chưa qua Cal.com |
| 5 | `proxy.ts:121-126` | `setup_completed_at` đã set + đang ở `/dashboard/setup` → redirect `/dashboard` |

Hệ quả: xong bước 1 (Profile) là `setup_completed_at` đã có. Bước 2 (Try agent), 3 (Cal.com), 4 (Meeting type) chỉ tồn tại trong state React. **Reload, đóng tab, hay bấm "Skip for now" là mất luôn** — quay lại `/dashboard/setup` bị proxy đá về `/dashboard`.

Đường thoát cũng đóng:

- `components/booking-live-banner.tsx:26` — CTA duy nhất "Connect Cal.com" trỏ `/dashboard/setup` → **bị chính proxy đó đá về** → vòng lặp chết.
- `cal_api_key_encrypted` chỉ được ghi bởi `app/dashboard/setup/actions.ts` (`saveCalApiKeyAction`). Không có đường nào khác trong `/dashboard/settings`.
- `SetupWizard` chỉ render từ `app/dashboard/setup/page.tsx`.

⇒ **Tenant skip Cal.com một lần là trang booking không bao giờ live được qua UI.**

Bằng chứng phụ cho thấy đây là bug chứ không phải thiết kế: `app/dashboard/setup/page.tsx:39-42` tính `initialStep = 4` cho user đã `setupCompleted` — nhánh đó hiện **không bao giờ chạy tới** vì proxy chặn trước.

Điều này cũng làm mục trong `docs/SMOKE.md` section "Auth / profiles" — "Đóng tab giữa setup → login lại → resume đúng step" — không chỉ lỗi thời mà **mô tả một hành vi đã hỏng**.

## Global Constraints

- Không có test runner — kiểm chứng bằng cách dựng lại đúng tình huống.
- Không sửa `completeSetupAction` để "hoãn" set `setup_completed_at`: nó đang là thứ mở khoá dashboard, và mở khoá sớm là **chủ đích** của `setup-wizard-reorder` (giá trị trước, Cal.com sau). Sửa nó là quay lại vách đá onboarding cũ.
- Không đụng schema.
- Sau khi sửa code: `graphify update .`.

---

### Task 1: Xác nhận bằng thực nghiệm trước khi sửa

**Files:** không sửa file.

**Interfaces:**
- Produces: xác nhận chuỗi lần từ code là đúng ở runtime. Nếu **không** tái hiện được, dừng plan và báo user — có thể có nhánh mình đọc sót.

- [x] **Bước 1: Môi trường sạch**

```bash
npx supabase db reset
npm run dev
```

- [x] **Bước 2: Đăng ký và chỉ làm bước 1**

Tạo tài khoản mới ở `/signup`. Ở bước 1 (Profile) bấm **Save & continue**. Dừng lại ở bước 2.

> **Runtime 2026-07-26:** signup `reentry-test@example.com` → Save & continue. Không kịp dừng ở bước 2 — ngay sau save URL thành `/dashboard` (proxy đá ra vì `setup_completed_at` vừa set). Bug nặng hơn mô tả tĩnh một chút: bước 2–4 không chỉ mất khi reload, mà còn bị đá ngay sau bước 1.

- [x] **Bước 3: Xác nhận `setup_completed_at` đã bị set sớm**

```bash
npx supabase db query "select slug, setup_completed_at, cal_api_key_encrypted is not null as has_cal from public.workspaces order by created_at desc limit 3;"
```

Mong đợi: workspace mới nhất có `setup_completed_at` **không null** và `has_cal` = `f`. Đây là mấu chốt của bug.

> **Runtime:** `reentry-test` → `setup_completed_at=2026-07-26T07:20:53Z`, `has_cal=false`. (`db execute` không còn; dùng `db query`.)

- [x] **Bước 4: Xác nhận bị đá ra**

Reload `http://localhost:3000/dashboard/setup`.

Mong đợi: bị chuyển về `/dashboard`, không vào lại được wizard.

> **Runtime:** navigate `/dashboard/setup` → URL cuối `/dashboard`.

- [x] **Bước 5: Xác nhận vòng lặp chết ở banner**

Trên `/dashboard`, banner vàng "Your booking page is not live yet" hiện ra. Bấm **Connect Cal.com**.

Mong đợi: quay lại `/dashboard`, không có gì thay đổi. Đây là vòng lặp chết.

> **Runtime:** CTA `href=/dashboard/setup`; click → vẫn `/dashboard`, banner còn. Dead loop confirmed.

- [x] **Bước 6: Xác nhận không có đường nào khác**

Mở `/dashboard/settings` và `/dashboard/meeting-types`, tìm ô nhập Cal.com API key.

Mong đợi: không có. Nếu **có**, mức nghiêm trọng giảm (còn đường vòng) — ghi lại và báo user trước khi làm tiếp.

> **Runtime:** Settings = identity/contact/team only. Meeting types = Sync/New, no API key field. Không đường vòng.

- [x] **Bước 7: Ghi lại kết quả**

Bốn bước trên đều tái hiện → tiếp Task 2. Bước nào không tái hiện → **dừng**, báo user cái gì khác với chuỗi đã lần.

> **Kết luận:** Bug tái hiện đủ. Tiếp Task 2.

---

### Task 2: Cho phép quay lại wizard khi trang booking chưa live

**Files:**
- Modify: `proxy.ts:98-127`

**Interfaces:**
- Consumes: `workspaces.setup_completed_at`, `cal_api_key_encrypted`, `cal_event_type_id`
- Produces: không export mới. Đổi điều kiện: `/dashboard/setup` chỉ đá ra khi setup xong **và** booking đã live.

- [x] **Bước 1: Xem cách `bookingLive` được tính**

```bash
grep -n "isPilotBookingLive" lib/workspace.ts
```

Đọc hàm đó. Nó nhận `{ workspaceId, hasEncryptedCalKey, calEventTypeId }` và có xử lý riêng cho workspace Pilot. Ghi lại chữ ký chính xác.

- [x] **Bước 2: Lấy thêm hai cột trong truy vấn có sẵn**

Trong `proxy.ts`, đổi truy vấn workspace (dòng 106-110):

```ts
      const { data: ws } = await supabase
        .from("workspaces")
        .select("setup_completed_at, cal_api_key_encrypted, cal_event_type_id")
        .eq("id", profile.workspace_id)
        .maybeSingle();
```

Cùng một truy vấn, thêm cột — không thêm round-trip.

- [x] **Bước 3: Đổi điều kiện chuyển hướng**

Thay khối dòng 112-126 bằng:

```ts
      const incomplete = !ws?.setup_completed_at;
      const onSetup = path === "/dashboard/setup";
      // Booking chỉ live khi có Cal key + meeting type AI. Giữ wizard mở
      // cho tới lúc đó, nếu không banner "Connect Cal.com" sẽ tự đá chính nó.
      const bookingLive = isPilotBookingLive({
        workspaceId: profile.workspace_id,
        hasEncryptedCalKey: Boolean(ws?.cal_api_key_encrypted),
        calEventTypeId: ws?.cal_event_type_id as number | null,
      });

      if (incomplete && !onSetup) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/dashboard/setup";
        redirectUrl.search = "";
        return NextResponse.redirect(redirectUrl);
      }
      if (!incomplete && bookingLive && onSetup) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        redirectUrl.search = "";
        return NextResponse.redirect(redirectUrl);
      }
```

Ba hành vi sau khi sửa:

| Trạng thái | `/dashboard/setup` |
|-----------|--------------------|
| setup chưa xong | ép vào wizard (như cũ) |
| setup xong, booking **chưa** live | **cho vào** — đây là phần sửa |
| setup xong, booking đã live | đá về `/dashboard` (như cũ, chống kẹt) |

- [x] **Bước 4: Thêm import**

```ts
import { isPilotBookingLive } from "@/lib/workspace";
```

Nếu import này làm vỡ build của proxy (bundle nặng hoặc lệch runtime), **đừng** cố ép — thay bằng biểu thức nội tuyến trong `proxy.ts` và thêm comment trỏ về `lib/workspace.ts` như nguồn chân lý:

```ts
const bookingLive =
  Boolean(ws?.cal_api_key_encrypted) && ws?.cal_event_type_id != null;
```

Lưu ý biến thể nội tuyến **bỏ mất** xử lý riêng cho Pilot — chấp nhận được ở proxy (Pilot không phải tenant đăng nhập), nhưng phải ghi comment rõ.

- [x] **Bước 5: Typecheck**

```bash
npm run typecheck
```

Mong đợi: exit 0.

- [ ] **Bước 6: Kiểm chứng vòng lặp chết đã hết**

Dùng lại tài khoản dựng ở Task 1 (setup xong, không Cal):

```bash
npm run dev
```

- `/dashboard` → banner vẫn hiện
- Bấm **Connect Cal.com** → **vào được wizard**, không bị đá về
- `app/dashboard/setup/page.tsx:39-42` cho `initialStep = 3` hoặc `4` → wizard mở đúng ở bước Cal.com, không bắt làm lại Profile

- [ ] **Bước 7: Kiểm chứng nối được Cal và lên live**

Trong wizard vừa mở lại: dán Cal.com API key → chọn meeting type AI → **Go to dashboard**.

Mong đợi:
- banner biến mất
- `/b/{slug}` live, chat đặt được lịch

```bash
npx supabase db execute --sql "select slug, cal_api_key_encrypted is not null as has_cal, cal_event_type_id from public.workspaces order by created_at desc limit 1;"
```

Mong đợi: `has_cal` = `t`, `cal_event_type_id` không null.

- [ ] **Bước 8: Kiểm chứng chống kẹt vẫn còn**

Với workspace đã live, mở `/dashboard/setup`.

Mong đợi: đá về `/dashboard`. Nhánh này phải sống — mất nó thì user đã xong lại rơi lại vào wizard.

- [ ] **Bước 9: Kiểm chứng luồng người mới không đổi**

Đăng ký tài khoản mới hoàn toàn, đi hết 4 bước có Cal.com. Mong đợi: hệt như trước, không hồi quy.

- [x] **Bước 10: doctor, graph, commit**

```bash
npm run doctor
graphify update .
git add proxy.ts graphify-out
git commit -m "fix(setup): let owners reopen the wizard until booking is live"
```

> **Runtime:** doctor 100/100; graphify update xong. Commit chờ user confirm.
---

### Task 3: Ghi vào SMOKE.md

**Files:**
- Modify: `docs/SMOKE.md` — section "Tenant happy path" và "Auth / profiles"

> Nếu [smoke-refresh](2026-07-26-smoke-refresh.md) chạy trước, gộp vào bản viết lại của plan đó thay vì thêm hai lần.

**Interfaces:**
- Consumes: hành vi đã kiểm chứng ở Task 2
- Produces: mục checklist chống hồi quy.

- [ ] **Bước 1: Sửa mục "đóng tab giữa setup"**

Mục hiện tại trong "Auth / profiles" mô tả hành vi resume đã hỏng. Thay bằng:

```markdown
- [ ] `setup_completed_at` được set ngay cuối **bước 1 (Profile)** — dashboard mở khoá sớm là chủ đích
- [ ] Đóng tab sau bước 1 → `/dashboard/setup` **vẫn vào lại được** (vì booking chưa live), mở đúng bước còn dở
- [ ] Skip Cal.com → vào Dashboard, banner "booking page is not live" hiện, bấm **Connect Cal.com** → **vào được wizard** (không phải vòng lặp chết)
- [ ] Sau khi có Cal key + meeting type AI → banner mất, `/b/{slug}` live, `/dashboard/setup` từ đó đá về `/dashboard`
```

- [ ] **Bước 2: Commit**

```bash
git add docs/SMOKE.md
git commit -m "docs: cover setup re-entry in smoke checklist"
```

---

## Hai việc phát hiện thêm (không làm trong plan này)

1. **Comment sai** — `app/dashboard/setup/actions.ts:231` ghi "Save optional profile fields from **step 3**, then mark setup complete". Giờ là bước 1. Sửa một dòng, gộp vào commit khác.
2. **Không có đường nối Cal.com ngoài wizard.** Plan này khiến wizard đủ dùng, nhưng chỗ đúng về lâu dài cho việc xoay Cal key là `/dashboard/settings`. Đủ lớn để tách plan riêng, không chặn release.

## Self-review trước khi đóng plan

- [ ] Task 1 đã tái hiện bug **thật**, không chỉ suy từ đọc code
- [ ] Banner "Connect Cal.com" mở được wizard
- [ ] Workspace đã live vẫn bị đá ra khỏi `/dashboard/setup` (chống kẹt còn nguyên)
- [ ] Luồng đăng ký mới đi hết 4 bước không hồi quy
- [ ] `completeSetupAction` **không** bị đổi — mở khoá dashboard sớm vẫn là chủ đích
