# Đồng bộ SMOKE.md với code hiện tại — Implementation Plan

> **For agentic workers:** Thực thi task-by-task, đánh dấu checkbox (`- [ ]`) để theo dõi.
>
> **Sửa thẳng vào `main`.** Không tạo branch, không tạo git worktree — chủ dự án làm một mình một dự án và đã quyết vậy. Nếu bạn dùng `superpowers:executing-plans` hay `superpowers:subagent-driven-development`, **bỏ qua bước `using-git-worktrees`** của chúng và coi đây là sự đồng ý rõ ràng để làm trên `main`.
>
> Đổi lại: **commit từng task một**, message rõ ràng. Đó là cách quay lui khi hỏng (`git revert <sha>`) — thứ mà branch từng lo, giờ commit nhỏ lo.
>
> Thuộc nhóm [Release Readiness](2026-07-26-release-readiness.md). Làm **sớm nhất** trong nhóm — mọi plan khác trích SMOKE.

**Goal:** Đưa `docs/SMOKE.md` về đúng với code trên `main` (`0bb1d5b`), để mọi kiểm chứng thủ công trong nhóm release dựa được vào nó.

> **Trạng thái 2026-07-26:** Nội dung viết lại **đã có trên `main`** (commit kèm setup-reentry). Plan này đóng bằng bước **chạy thật một phần** + nhật ký trong `docs/SMOKE.md`. Không cần viết lại section lần nữa trừ khi phát hiện lệch mới.

**Architecture:** Chỉ sửa docs. Không đụng code. Mỗi task dưới đây sửa một section và **phải kiểm chứng lại bằng cách chạy thật** — viết lại checklist mà không chạy thử thì chỉ đổi một tài liệu sai này lấy một tài liệu sai khác.

**Tech Stack:** Markdown. Nguồn chân lý là code, không phải các plan doc cũ.

## Global Constraints

- Không sửa code trong plan này. Nếu phát hiện code sai (không phải doc sai), ghi lại và báo user — đừng tiện tay sửa.
- Giữ nguyên định dạng hiện có của SMOKE.md: heading `##`, checkbox `- [ ]` cho danh sách phẳng, `1. [ ]` cho danh sách có thứ tự.
- SMOKE.md hiện trộn tiếng Anh và tiếng Việt. Giữ nguyên thói quen đó — không dịch lại toàn bộ file.
- Một commit duy nhất cuối plan (đây là một tài liệu, tách commit làm khó review).

## Bối cảnh — sai lệch đã xác minh

Đã đối chiếu SMOKE.md với code ngày 2026-07-26. Sai lệch tìm được:

| # | SMOKE.md nói | Code thật | Bằng chứng |
|---|--------------|-----------|------------|
| 1 | Liệt kê 11 migration | Có 13 file | thiếu `20260725000005_chat_messages_upsert_constraint.sql`, `20260726000001_workspace_invites_hardening.sql` |
| 2 | Setup: Cal key (b1) + meeting type (b2) **bắt buộc**, 3 bước | Wizard **4 bước**; `completeSetupAction` không còn đòi Cal key/meeting type | `app/dashboard/setup/page.tsx:39-42`, `actions.ts:187-229` |
| 3 | Không nhắc `bookingLive` | `bookingLive` (Cal key + AI meeting type) mới là thứ gate `/b/[slug]`, tách khỏi `setup_completed_at` (gate dashboard) | `lib/workspace.ts:166-167,220-224`; `proxy.ts:98-127` |
| 4 | Tạo invite "(optional email)" | Email **bắt buộc**; link mở không gắn email đã bị bỏ hẳn | `app/dashboard/settings/invite-actions.ts:132-135` |
| 5 | User đã có workspace dở dang → accept invite → "orphan workspace removed" | **Quyết định đã đảo**: từ chối, báo lý do, **không bao giờ xoá** workspace của họ | `docs/superpowers/plans/2026-07-26-workspace-invites.md` bảng "Quyết định đã chốt" |
| 6 | — | Thiếu hẳn: resend invite, gỡ thành viên, chuyển quyền owner, chặn email mismatch trước khi submit, TTL 7 ngày, sign-out trước switch-account | commits `8c16276`, `5f8e258`, `16997e8`, `a91b877`, `4e917df` |
| 7 | "Out of scope: owner transfer" | Đã ship | `app/dashboard/settings/invite-actions.ts` |
| 8 | — | Thiếu hẳn phase embed: `public/embed.js`, `/embed/[slug]`, `/dashboard/embed`, header `frame-ancestors`, cookie cross-site | `next.config.ts:9-34`, `proxy.ts:13-45`, commits `6c5806c`…`bd5c017` |
| 9 | — | Thiếu PostHog analytics | `lib/analytics-*.ts`, `app/layout.tsx` |
| 10 | — | Không nhắc các trang dashboard: `event-types`, `conversations`, `analytics`, `help`, `account`, `notifications` | `app/dashboard/*` |

---

### Task 1: Sửa Prerequisites — migration list + khái niệm bookingLive

**Files:**
- Modify: `docs/SMOKE.md:3-26` (section `## Prerequisites`)

**Interfaces:**
- Consumes: `supabase/migrations/` (danh sách thật)
- Produces: phần Prerequisites đúng — mọi task sau giả định người chạy đã dựng được môi trường từ đây.

- [x] **Bước 1: Lấy danh sách migration thật**
- [x] **Bước 2: Bổ sung hai migration thiếu** *(đã có trong SMOKE trên main)*
- [x] **Bước 3: Thêm giải thích bookingLive vào Prerequisites** *(đã có)*
- [x] **Bước 4: Kiểm chứng bằng cách chạy thật** — `npx supabase db reset` exit 0, 13 migration
- [x] **Bước 5: Kiểm chứng khẳng định về hai cổng** — đã verify qua setup-reentry (skip Cal → dashboard + wizard re-entry); `/b` chưa live khi thiếu Cal

---

### Task 2: Viết lại "Tenant happy path" và "Auth / profiles" theo wizard 4 bước

**Files:**
- Modify: `docs/SMOKE.md:28-38` (section `## Tenant happy path (ordered)`)
- Modify: `docs/SMOKE.md:59-68` (section `## Auth / profiles`)

**Interfaces:**
- Consumes: `app/dashboard/setup/page.tsx:39-42` (`initialStep` 1..4), `app/dashboard/setup/actions.ts:187-229` (`completeSetupAction`), `finishSetupAction` (line 232-239)
- Produces: đường đi chuẩn để [staging-smoke-run](2026-07-26-staging-smoke-run.md) chạy trên preview deploy.

- [ ] **Bước 1: Đọc wizard để biết 4 bước thật sự là gì**

```bash
graphify query "setup wizard steps and completeSetupAction requirements"
```

Rồi đọc `app/dashboard/setup/page.tsx` và component `SetupWizard` để lấy **tên và thứ tự thật** của 4 bước. Plan này cố tình không đoán tên bước — lấy từ code.

- [ ] **Bước 2: Chạy thật một lần, ghi lại từng màn hình**

```bash
npm run dev
```

Đăng ký tài khoản mới, đi hết wizard, ghi lại: bước nào bắt buộc, bước nào Skip được, sau mỗi bước redirect đi đâu, `setup_completed_at` được set ở đâu.

- [ ] **Bước 3: Viết lại section "Tenant happy path"**

Thay toàn bộ 7 mục đánh số hiện tại. Khung bắt buộc phải có (điền tên bước thật từ Bước 1):

```markdown
## Tenant happy path (ordered)

Chạy path này cho **workspace tenant thật** — không phải Eve Pilot `/chat`.

1. [ ] `/signup` → tài khoản + workspace **mới** (id ≠ pilot `00000000-0000-4000-8000-000000000001`) → redirect `/dashboard/setup`
2. [ ] Wizard 4 bước: <TÊN BƯỚC 1..4 TỪ CODE>. Ghi rõ bước nào bắt buộc, bước nào Skip được
3. [ ] Hoàn tất setup **không** dán Cal key → vào được `/dashboard`, nhưng `/b/{slug}` **chưa** live (`bookingLive` false)
4. [ ] Quay lại dán Cal key + chọn meeting type AI → `/b/{slug}` live
5. [ ] Xác nhận starter defaults: FAQ `/dashboard/faq`, persona `/dashboard/agent`, liên hệ `/dashboard/settings`
6. [ ] Settings → copy link công khai → mở `/b/{your-slug}` (**không** dùng `/chat` cho path này)
7. [ ] Trên `/b/{slug}`: hỏi giờ/dịch vụ → agent giữ đúng phạm vi; hỏi lịch trống → `check_availability`; xác nhận tên + SĐT + email + slot → `book_appointment`
8. [ ] Cal.com hiện event; `/dashboard/bookings` sync → row trong `bookings`; lead `booked` ở `/dashboard/leads`
9. [ ] Chat riêng chưa đặt xong (tên + SĐT, không book) → `log_lead` → lead `new`
```

Mục 3 và 4 là mục **mới** — chúng là thứ chứng minh việc tách `setup_completed_at` / `bookingLive` hoạt động.

- [ ] **Bước 4: Sửa section "Auth / profiles"**

Ba dòng sau đang sai (chúng mô tả wizard 3 bước cũ, Cal bắt buộc):

```
- [ ] Setup: bước 1 Cal + bước 2 meeting type **bắt buộc**; bước 3 hồ sơ **tuỳ chọn** (Skip dùng mặc định từ signup)
- [ ] Đóng tab giữa setup (sau khi đã lưu Cal/type) → login lại → resume đúng step; không vào `/dashboard` đến khi Hoàn tất hoặc Skip hồ sơ
- [ ] Skip hồ sơ (đủ Cal+type) → vào Dashboard; `/b/{slug}` mở được với slug signup
```

Thay bằng (điền tên bước thật):

```markdown
- [ ] Setup 4 bước; **không bước nào đòi Cal.com để hoàn tất** — `completeSetupAction` chỉ set slug + `setup_completed_at`
- [ ] Đóng tab giữa chừng → login lại → resume đúng step (`initialStep` suy từ `setup_completed_at` + `hasCalKey` + meeting type AI)
- [ ] Hoàn tất setup không Cal → vào Dashboard được; `/b/{slug}` chưa live cho tới khi có Cal key + meeting type AI
```

- [ ] **Bước 5: Kiểm chứng lại checklist vừa viết**

Chạy lại đúng các bước vừa viết trên môi trường sạch (`npx supabase db reset` + tài khoản mới). Mọi mục phải tick được. Mục nào không tick được → sửa lời văn, hoặc nếu là bug thật thì ghi lại và báo user.

---

### Task 3: Viết lại section "Invite staff"

**Files:**
- Modify: `docs/SMOKE.md:50-57` (section `## Invite staff (Phase 3)`)
- Modify: `docs/SMOKE.md:90-96` (section `## Out of scope`) — bỏ dòng owner transfer

**Interfaces:**
- Consumes: `app/dashboard/settings/invite-actions.ts`, `supabase/migrations/20260726000001_workspace_invites_hardening.sql`
- Produces: runbook invite khớp với luồng đã ship.

- [ ] **Bước 1: Đọc lại các action invite thật sự tồn tại**

```bash
graphify query "workspace invite actions: create, resend, revoke, remove member, transfer ownership"
```

Rồi đọc `app/dashboard/settings/invite-actions.ts` để lấy danh sách export và điều kiện của từng cái. Đối chiếu với "Quyết định đã chốt" trong `docs/superpowers/plans/2026-07-26-workspace-invites.md`.

- [ ] **Bước 2: Thay toàn bộ section bằng bản đúng**

```markdown
## Invite staff

1. [ ] Owner: `/dashboard/settings` → Team → tạo invite — **email bắt buộc** (không còn link mở); email sai định dạng → lỗi rõ ràng
2. [ ] Email invite tới hộp thư thật (cần `RESEND_API_KEY` + domain đã verify — xem [ops/resend-domain-setup.md](./ops/resend-domain-setup.md))
3. [ ] Invite hết hạn sau **7 ngày**; mở link quá hạn → `INVITE_EXPIRED`, không cho tạo tài khoản
4. [ ] Resend invite: quá sớm → `INVITE_RESEND_TOO_SOON`; đủ thời gian → gửi lại được
5. [ ] Mở `/invite/{token}` bằng email **khác** email được mời → chặn **trước khi submit**, hiện `INVITE_EMAIL_MISMATCH`
6. [ ] Incognito: mở invite → **Tạo tài khoản & tham gia** → vào thẳng `/dashboard` (không qua setup) với vai **staff**, cùng `workspace_id` với owner
7. [ ] Staff thấy danh sách Team (chỉ đọc); **không** tạo được invite
8. [ ] Owner: danh sách pending → Revoke invite chưa dùng
9. [ ] Owner: gỡ một thành viên staff → họ mất quyền truy cập workspace
10. [ ] Owner **không** tự hạ cấp mình xuống staff được (`CANNOT_REMOVE_OWNER`)
11. [ ] Chuyển quyền owner cho một staff → đúng một owner sau khi chuyển; owner cũ thành staff
12. [ ] Đang đăng nhập bằng tài khoản khác mà mở invite → "đổi tài khoản" **sign out trước** rồi mới tới `/login`, không lặp vòng redirect
13. [ ] Tài khoản **đã thuộc một workspace** mà accept invite → **từ chối, báo rõ lý do**. Workspace hiện tại của họ **không bao giờ bị xoá**
14. [ ] `/signup` thường (không invite) vẫn tạo workspace **mới** + đi wizard setup
```

Mục 13 là điểm đảo ngược so với bản cũ — bản cũ ghi "orphan workspace removed", giờ là cấm xoá.

- [ ] **Bước 3: Bỏ owner transfer khỏi "Out of scope"**

Trong section `## Out of scope (do not block MVP)`, dòng:

```
- Multi-workspace per user, owner transfer, billing seats
```

sửa thành:

```
- Multi-workspace per user, billing seats
```

- [ ] **Bước 4: Kiểm chứng**

Chạy các mục 1, 5, 6, 8, 10, 13 (những mục rẻ nhất mà bao được các quyết định quan trọng). Mục 2 và 4 cần Resend thật — nếu chưa có domain verify, đánh dấu `(cần Resend)` và để [staging-smoke-run](2026-07-26-staging-smoke-run.md) chạy.

---

### Task 4: Thêm section Embed (đang thiếu hoàn toàn)

**Files:**
- Modify: `docs/SMOKE.md` — thêm section mới sau `## Availability + booking`

**Interfaces:**
- Consumes: `public/embed.js`, `app/embed/[slug]/page.tsx`, `app/dashboard/embed/page.tsx`, `next.config.ts:9-34`, `proxy.ts:13-45`, `docs/superpowers/embed-cookie-limits.md`
- Produces: runbook cho path duy nhất **không thể test trên localhost**.

- [ ] **Bước 1: Đọc giới hạn đã biết**

```bash
cat docs/superpowers/embed-cookie-limits.md
```

Section viết ra phải phản ánh đúng các giới hạn đó, không hứa hẹn quá.

- [ ] **Bước 2: Thêm section**

```markdown
## Embed widget (bên thứ ba)

> Path này **không kiểm chứng đủ trên localhost** — cookie cross-site cần `SameSite=None; Secure`, tức là HTTPS ([proxy.ts:41-43](../proxy.ts)). Chạy trên preview deploy.

1. [ ] `/dashboard/embed` hiện snippet; nút copy hoạt động
2. [ ] Dán snippet vào một trang HTTPS **khác domain** → bubble hiện, mở ra là chat
3. [ ] Chat trong iframe đặt lịch được (cùng luồng như `/b/{slug}`)
4. [ ] Header `x-eve-tz` vẫn gửi từ iframe → agent biết timezone khách
5. [ ] Reload trang nhúng → phiên chat còn (cookie visitor sống sót) — xem giới hạn ở [embed-cookie-limits.md](./superpowers/embed-cookie-limits.md)
6. [ ] Workspace chưa `bookingLive` → route embed từ chối, không hiện chat chết
7. [ ] `curl -sI <domain>/embed/{slug}` → `frame-ancestors *`
8. [ ] `curl -sI <domain>/` → `frame-ancestors 'none'` + `X-Frame-Options: DENY`
```

- [ ] **Bước 3: Kiểm chứng phần làm được tại local**

```bash
npm run dev
```

Mục 1, 6 và biến thể localhost của 7, 8:

```bash
curl -sI http://localhost:3000/embed/eve-pilot | grep -i content-security-policy
curl -sI http://localhost:3000/ | grep -i -E "x-frame-options|content-security-policy"
```

Mong đợi: lần lượt `frame-ancestors *`, và `frame-ancestors 'none'` + `X-Frame-Options: DENY`. Mục 2-5 đánh dấu `(preview only)`.

---

### Task 5: Thêm mục còn thiếu — analytics, các trang dashboard, và commit

**Files:**
- Modify: `docs/SMOKE.md` — thêm mục vào section sẵn có + section Analytics mới

**Interfaces:**
- Consumes: `lib/analytics-events.ts`, `app/dashboard/*`
- Produces: bản SMOKE.md hoàn chỉnh, sẵn cho [staging-smoke-run](2026-07-26-staging-smoke-run.md).

- [ ] **Bước 1: Lấy danh sách event analytics thật**

```bash
cat lib/analytics-events.ts
```

Đây là nguồn chân lý duy nhất cho tên event (theo `docs/superpowers/distribution-and-growth.md`).

- [ ] **Bước 2: Thêm section Analytics**

```markdown
## Analytics (PostHog)

1. [ ] Không có `NEXT_PUBLIC_POSTHOG_KEY` → app chạy bình thường, không lỗi console (no-op có chủ đích)
2. [ ] Có key → sự kiện đặt lịch thành công tới PostHog trong ~1 phút
3. [ ] Tên event khớp hằng số trong `lib/analytics-events.ts` — không có tên tự chế
4. [ ] PostHog **không** nhận exception; lỗi server xem ở [ops](#ops--nơi-lỗi-hiện-ra)
```

- [ ] **Bước 3: Thêm các trang dashboard còn thiếu**

Section `## Auth / profiles` hiện chỉ nhắc `/dashboard`. Thêm một mục bao quát:

```markdown
- [ ] Các trang dashboard mở được, không lỗi: `/dashboard/bookings`, `/leads`, `/conversations`, `/faq`, `/agent`, `/meeting-types`, `/event-types`, `/embed`, `/analytics`, `/notifications`, `/settings`, `/account`, `/help`
```

- [ ] **Bước 4: Kiểm chứng**

```bash
npm run dev
```

Mở lần lượt 13 đường dẫn trên. Trang nào 404/500 → **đó là phát hiện thật**, ghi lại và báo user thay vì bỏ mục khỏi checklist.

- [ ] **Bước 5: Cập nhật tiêu đề và ghi ngày rà soát**

Ngay dưới `# Smoke checklist — Text-first MVP`, thêm:

```markdown
> Rà soát lần cuối với code: 2026-07-26 (`main` @ `0bb1d5b`). Sửa file này cùng lúc với code, đừng để lệch.
```

- [ ] **Bước 6: Commit**

```bash
git add docs/SMOKE.md
git commit -m "docs: sync smoke checklist with setup wizard, invites, embed and analytics"
```

---

## Self-review trước khi đóng plan

- [ ] 10 dòng trong bảng "Sai lệch đã xác minh" đều đã được xử lý bởi một task ở trên
- [ ] Không còn mục nào trong SMOKE.md mô tả wizard 3 bước hay invite link mở
- [ ] `grep -n "owner transfer" docs/SMOKE.md` → không khớp trong section Out of scope
- [ ] Mọi mục mới thêm đều đã được **chạy thật** ít nhất một lần, hoặc đánh dấu rõ `(preview only)` / `(cần Resend)`
