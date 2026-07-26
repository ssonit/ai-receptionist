# Smoke checklist

> **Đối chiếu với code:** 2026-07-26, `main` @ `0bb1d5b`.
> Nội dung dưới đây được **rà theo code**, chưa phải kết quả một lần chạy đầy đủ.
> Chạy xong lần nào thì ghi vào [Nhật ký chạy](#nhật-ký-chạy) bên dưới.
>
> **Sửa code trong các luồng ở [Bảo trì](#bảo-trì) thì sửa file này cùng commit.** Doc này đã trôi khỏi code ba lần; bảng ánh xạ ở cuối là để lần sau phát hiện được.

## Prerequisites

- [ ] Node.js 24.x
- [ ] Docker chạy (cho Supabase local)
- [ ] `.env.example` → `.env.local`, điền key
- [ ] Ít nhất một provider key: `DEEPSEEK_API_KEY` và/hoặc `GOOGLE_GENERATIVE_AI_API_KEY` và/hoặc `ANTHROPIC_API_KEY`
- [ ] Windows: `npm run patch:eve` (postinstall cũng chạy) để Eve resolve `dist/` của nó dưới Next `withEve`
- [ ] Cal.com API key + meeting type (hoặc username + slug) để test đặt lịch
- [ ] `npx supabase start`, rồi dán URL/anon/service_role vào `.env.local`
- [ ] `npx supabase db reset` — áp `supabase/migrations/*` rồi `supabase/seed.sql`. **13 migration** (`ls supabase/migrations/` để đối chiếu):

```
20260724000001_init_schema.sql              schema + RLS hợp nhất
20260724000003_chat_branding.sql
20260724000004_slugify_vietnamese.sql       slug tiếng Việt (unaccent)
20260724000005_chat_messages_cursor.sql     index phân trang keyset
20260724000006_agent_reply_customs.sql      tone / reply locale / handoff / placeholder
20260724000007_workspace_starter_defaults.sql   defaults AI/chat/FAQ khi signup
20260724000008_workspace_invites.sql        invite nhân viên
20260725000001_guest_booking_manage.sql     khách tự huỷ + bảng OTP
20260725000002_guest_timezone.sql
20260725000003_onsite_clear_guest_timezone.sql
20260725000004_booking_reminders.sql        cron nhắc lịch + manage_link + opt-out
20260725000005_chat_messages_upsert_constraint.sql  chống trùng tin nhắn khi retry
20260726000001_workspace_invites_hardening.sql  invite bắt buộc email, gỡ member, chuyển owner
```

### Hai cổng khác nhau — hiểu trước khi chạy

Nhầm hai cái này là hiểu sai nửa checklist:

| Cổng | Mở cái gì | Kiểm ở đâu |
|------|-----------|-----------|
| `setup_completed_at` | mở khoá `/dashboard/*` | [`proxy.ts`](../proxy.ts) |
| `bookingLive` (dẫn xuất: **có Cal key + có meeting type AI**) | phát hành `/b/{slug}`; giữ wizard mở tới khi live | [`lib/workspace.ts`](../lib/workspace.ts) (`isPilotBookingLive`), [`proxy.ts`](../proxy.ts) |

Workspace vào được dashboard nhưng `/b/{slug}` chưa live là **đúng thiết kế**, không phải bug. Đây là kết quả của `superpowers/setup-wizard-reorder.md` — cho thấy giá trị trước, đòi Cal.com sau.

### Ranh giới tenant

- [ ] `/chat` là **demo Eve Pilot**, luôn dùng env `CALCOM_*` (lịch sandbox). Không bao giờ là lịch của tenant thật.
- [ ] `/b/{slug}` là trang của tenant, dùng Cal key riêng đã mã hoá theo workspace.
- [ ] Signup mới sinh workspace mới (id ≠ pilot `00000000-0000-4000-8000-000000000001`).

---

## Tenant happy path (theo thứ tự)

Chạy cho **workspace tenant thật** — không phải `/chat`.

Wizard có **4 bước**: `1 Profile` → `2 Try agent` → `3 Cal.com` → `4 Meeting type` ([`setup-wizard.tsx:37`](../components/setup-wizard.tsx)).

1. [ ] `/signup` → tài khoản + workspace **mới** → redirect `/dashboard/setup`
2. [ ] Bước 1 Profile: tên + slug (có kiểm tra trùng live) → **Save & continue**
3. [ ] Bước 2 Try agent: thử chat ngay, chưa cần Cal.com
4. [ ] Bước 3 Cal.com: dán API key → **Save key**. Hoặc **Skip for now** (nhánh skip: xem [Auth / setup](#auth--setup))
5. [ ] Bước 4 Meeting type: chọn meeting type cho AI → **Go to dashboard**
6. [ ] Có Cal key + meeting type AI → banner "not live" biến mất, `/b/{slug}` live
7. [ ] Xác nhận starter defaults: FAQ `/dashboard/faq`, persona `/dashboard/agent`, liên hệ `/dashboard/settings`
8. [ ] Settings → copy link công khai → mở `/b/{your-slug}` (**không** dùng `/chat`)
9. [ ] Trên `/b/{slug}`: hỏi giờ/dịch vụ → agent giữ đúng phạm vi, không bịa
10. [ ] Hỏi lịch trống → gọi `check_availability`; chỉ chào slot Cal.com thật
11. [ ] Xác nhận tên + SĐT + email + slot → `book_appointment`
12. [ ] Cal.com hiện event; `/dashboard/bookings` sync → row trong `bookings`; lead `booked` ở `/dashboard/leads`
13. [ ] Chat khác chưa đặt xong (tên + SĐT, không book) → `log_lead` → lead `new`

---

## Auth / setup

- [ ] `/signup` tạo `profiles` row + workspace **mới**; setup chưa xong → ép về `/dashboard/setup`
- [ ] `EVE_SIGNUP_MODE=invite_only` → `/signup` redirect `/login`; submit không kèm invite → `SIGNUP_CLOSED`; `/signup?invite=…` và `/invite/{token}` vẫn chạy
- [ ] `/login` chạy, redirect `/dashboard` (hoặc setup)
- [ ] Chưa đăng nhập vào `/dashboard` → redirect `/login`
- [ ] `setup_completed_at` được set ngay cuối **bước 1 (Profile)** — mở khoá dashboard sớm là **chủ đích**
- [ ] Đóng tab sau bước 1 → `/dashboard/setup` **vẫn vào lại được** (vì booking chưa live), mở đúng bước còn dở
- [ ] Skip Cal.com → vào Dashboard, banner "booking page is not live" hiện, bấm **Connect Cal.com** → **vào được wizard** (không phải vòng lặp chết)
- [ ] Sau khi có Cal key + meeting type AI → banner mất, `/b/{slug}` live, `/dashboard/setup` từ đó đá về `/dashboard`
- [ ] Các trang dashboard mở được, không lỗi: `/dashboard`, `/analytics`, `/bookings`, `/meeting-types`, `/event-types`, `/embed`, `/conversations`, `/leads`, `/agent`, `/faq`, `/notifications`, `/settings`, `/account`, `/help`

---

## Agent FAQ + đặt lịch (pilot)

Ưu tiên **Tenant happy path** để nghiệm thu sản phẩm. Phần này kiểm nhanh trên pilot:

- [ ] `/chat` (demo) hiện banner demo; `/b/eve-pilot` không hiện
- [ ] Sửa FAQ ở `/dashboard/faq`; persona/tone/ngôn ngữ trả lời/meeting type ở `/dashboard/agent`
- [ ] Hỏi giá / dịch vụ → không bịa lời khuyên, giữ trong phạm vi đặt lịch
- [ ] "Còn trống tuần sau không?" → gọi `check_availability`, chỉ slot thật
- [ ] Đặt xong → event lên Cal.com, row vào `bookings`, lead → `booked`

---

## Khách tự huỷ / đổi lịch (không đăng nhập)

Thang xác minh A1 → D, từ `superpowers/guest-booking-change.md`.

1. [ ] Cùng phiên chat sau khi book → "tôi đã đặt gì?" → `list_my_appointments` ra row; huỷ được (**A1**)
2. [ ] Agent đọc mã quản lý một lần sau khi book; mã bị che trong scrollback sau khi lưu
3. [ ] Chat mới cùng trình duyệt → có thể đòi `needsPhoneLast4`; nhập 4 số cuối → xác minh → huỷ (**A2**)
4. [ ] Trình duyệt khác → mã quản lý (**B**) hoặc OTP email (**C**) → xác minh → đổi lịch được
5. [ ] Không có bằng chứng gì → `request_booking_change` → thông báo về dashboard; agent **không** được nói đã huỷ (**D**)
6. [ ] Giả mạo `x-eve-chat-session` mà không có cookie visitor khớp → không claim được booking nào
7. [ ] Settings bật/tắt cho khách huỷ/đổi + thời hạn cutoff; demo Pilot phải từ chối cho khách huỷ

---

## Mời nhân viên

Email **bắt buộc** — link mở không gắn email đã bỏ hẳn ([`invite-actions.ts:132`](../app/dashboard/settings/invite-actions.ts)).

1. [ ] Owner: `/dashboard/settings` → Team → tạo invite, **email bắt buộc**; sai định dạng → lỗi rõ
2. [ ] Email invite tới **Inbox** (không Spam) — Resend + domain đã verify, xem [`ops/resend-domain-setup.md`](./ops/resend-domain-setup.md)
3. [ ] Invite hết hạn sau **7 ngày** ([`lib/workspace-invites.ts:34`](../lib/workspace-invites.ts)); link quá hạn → `INVITE_EXPIRED`
4. [ ] Resend quá sớm → `INVITE_RESEND_TOO_SOON`; đủ thời gian → gửi lại được
5. [ ] Mở `/invite/{token}` bằng email **khác** email được mời → chặn **trước khi submit**, hiện `INVITE_EMAIL_MISMATCH`
6. [ ] Ẩn danh: mở invite → **Tạo tài khoản & tham gia** → vào thẳng `/dashboard` (không qua setup), vai **staff**, cùng `workspace_id` với owner
7. [ ] Staff thấy Team (chỉ đọc); **không** tạo được invite
8. [ ] Owner: Revoke invite chưa dùng
9. [ ] Owner: gỡ một staff → họ mất quyền vào workspace
10. [ ] Owner **không** tự hạ cấp mình → `CANNOT_REMOVE_OWNER`
11. [ ] Chuyển quyền owner cho staff → đúng một owner sau khi chuyển; owner cũ thành staff
12. [ ] Đang đăng nhập tài khoản khác mà mở invite → "đổi tài khoản" **sign out trước** rồi mới tới `/login`, không lặp redirect
13. [ ] Tài khoản **đã thuộc một workspace** mà accept invite → **từ chối, báo rõ lý do**. Workspace của họ **không bao giờ bị xoá**
14. [ ] `/signup` thường (không invite) vẫn tạo workspace **mới** + đi wizard

---

## Embed widget (bên thứ ba)

> **Không kiểm chứng đủ ở localhost** — cookie cross-site cần `SameSite=None; Secure`, tức HTTPS ([`proxy.ts:41`](../proxy.ts)). Mục 2–5 chạy trên preview deploy.

1. [ ] `/dashboard/embed` hiện snippet; nút copy chạy
2. [ ] Dán snippet vào trang HTTPS **khác domain** → bubble hiện, mở ra là chat
3. [ ] Chat trong iframe đặt lịch được (cùng luồng `/b/{slug}`)
4. [ ] Header `x-eve-tz` vẫn gửi từ iframe → agent biết timezone khách
5. [ ] Reload trang nhúng → phiên chat còn; giới hạn đã biết: [`superpowers/embed-cookie-limits.md`](./superpowers/embed-cookie-limits.md)
6. [ ] Workspace chưa `bookingLive` → route embed từ chối, không hiện chat chết
7. [ ] `curl -sI <host>/embed/{slug}` → `frame-ancestors *` — cấu hình ở [`next.config.ts`](../next.config.ts); **`next dev` (Turbopack) có thể không emit header này** → xác nhận trên preview / `next start`
8. [ ] `curl -sI <host>/` → `frame-ancestors 'none'` + `X-Frame-Options: DENY` — cùng lưu ý như mục 7

---

## Nhắc lịch (cron)

1. [ ] `CRON_SECRET` có trong `.env.local` (và env Vercel)
2. [ ] `GET /api/cron/tick` không Bearer → **401**
3. [ ] Settings → bật **Outbound reminders**; có booking sắp tới kèm email khách
4. [ ] Tick với `Authorization: Bearer $CRON_SECRET` → sync + sinh row reminder; gửi mail khi tới hạn
5. [ ] Mở manage link từ email → chat đã xác minh, `?mt=` bị gỡ khỏi URL; mở lần hai bị từ chối
6. [ ] Link unsubscribe → không nhắc booking đó nữa
7. [ ] Vercel → Crons: `/api/cron/tick` chạy 200 trong vòng 15 phút (lịch `*/15 * * * *`, [`vercel.json`](../vercel.json))

> Env production + 5 lệnh curl sau deploy: [`ops/production-env.md`](./ops/production-env.md)

---

## Analytics (PostHog)

1. [ ] Không có `NEXT_PUBLIC_POSTHOG_KEY` → app chạy bình thường, không lỗi console (no-op có chủ đích)
2. [ ] Có key → sự kiện đặt lịch thành công tới PostHog trong ~1 phút
3. [ ] Tên event khớp hằng số trong [`lib/analytics-events.ts`](../lib/analytics-events.ts) — không có tên tự chế
4. [ ] PostHog **không** nhận exception — xem [Ops](#ops--nơi-lỗi-hiện-ra)

---

## Ops — nơi lỗi hiện ra

- **Lỗi runtime server:** Vercel → Project → Logs. Lọc tiền tố `[cron/tick]`.
- **Cron fail:** non-200 của `/api/cron/tick` ở Vercel → Crons.
- **Lỗi build:** Vercel → Deployments.
- **PostHog chỉ nhận event sản phẩm, không bao giờ nhận exception.** Đừng tìm lỗi ở đó.
- **Lỗi client trong chat:** DevTools console của khách — hiện **không** thu thập tập trung. Đây là điểm mù đã biết.
- Deploy hỏng: [rollback + kill switch](./MIGRATIONS.md).

---

## Ngoài phạm vi (không chặn release)

- WhatsApp / Twilio, Retell voice
- Stripe billing / gói cước / giới hạn theo gói
- UI huỷ / đổi lịch trên dashboard (hiện agent-first)
- Multi-workspace cho một user, billing seats

---

## Bảo trì

**Sửa code ở cột trái thì sửa section ở cột phải, trong cùng commit.** Đây là thứ giữ file này không trôi khỏi code lần nữa.

| Đụng vào | Cập nhật section |
|----------|------------------|
| `supabase/migrations/*` | Prerequisites (danh sách migration) |
| `components/setup-wizard.tsx`, `app/dashboard/setup/*` | Tenant happy path, Auth / setup |
| `proxy.ts` (nhánh redirect) | Auth / setup |
| `lib/workspace.ts` (`bookingLive`, resolve tenant) | Hai cổng khác nhau, Ranh giới tenant |
| `app/dashboard/settings/invite-actions.ts`, `lib/workspace-invites.ts` | Mời nhân viên |
| `agent/tools/*` | Agent FAQ + đặt lịch, Khách tự huỷ / đổi lịch |
| `public/embed.js`, `app/embed/*`, `next.config.ts` (headers) | Embed widget |
| `app/api/cron/tick/route.ts`, `lib/booking-reminders.ts`, `vercel.json` | Nhắc lịch (cron) |
| `lib/analytics-events.ts` | Analytics |
| `components/app-sidebar.tsx` (thêm/bớt trang) | Auth / setup (danh sách trang) |

Cùng ràng buộc này nằm trong [`AGENTS.md`](../AGENTS.md) mục "Sau khi sửa code" để agent nào cũng thấy.

---

## Nhật ký chạy

Chạy đầy đủ xong thì thêm một dòng. Rỗng nghĩa là **chưa từng chạy hết** — đừng suy ra là đã pass.

| Ngày | Chạy trên | Kết quả | Ghi chú |
|------|-----------|---------|---------|
| 2026-07-26 | local (`localhost:3000` + `npx supabase db reset`) | **một phần** | `db reset`: 13 migration apply sạch. Dashboard routes (14 path trong Auth/setup) → 307→login khi chưa auth (không 404). Setup re-entry đã verify riêng (plan setup-reentry). Embed CSP mục 7–8: **không thấy header dưới `next dev`** — cần xác nhận preview. Invite email / Resend / happy-path Cal thật / guest manage: **chưa chạy** trong lần này. |
| — | — | — | chưa có lần chạy **đầy đủ** nào được ghi |

---

## Lệnh

```bash
npx supabase start
npx supabase db reset
npm run dev
# agent REPL không UI:
npm exec -- eve dev --no-ui
```
