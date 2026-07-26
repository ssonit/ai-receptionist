# Trang pháp lý `/terms` + `/privacy` — Implementation Plan

> **For agentic workers:** Thực thi task-by-task, đánh dấu checkbox (`- [ ]`) để theo dõi.
>
> **Sửa thẳng vào `main`.** Không tạo branch, không tạo git worktree — chủ dự án làm một mình một dự án và đã quyết vậy. Nếu bạn dùng `superpowers:executing-plans` hay `superpowers:subagent-driven-development`, **bỏ qua bước `using-git-worktrees`** của chúng và coi đây là sự đồng ý rõ ràng để làm trên `main`.
>
> Đổi lại: **commit từng task một**, message rõ ràng. Đó là cách quay lui khi hỏng (`git revert <sha>`) — thứ mà branch từng lo, giờ commit nhỏ lo.
>
> Thuộc nhóm [Release Readiness](2026-07-26-release-readiness.md).

**Goal:** Có trang Điều khoản và Chính sách bảo mật, liên kết từ footer, trước khi mở cho người dùng thật.

**Architecture:** Hai server component tĩnh dùng chung một shell trình bày. Không state, không client component, không i18n (landing page hiện hardcode tiếng Anh — bám theo).

**Tech Stack:** Next.js App Router server components, Tailwind.

**Vì sao chặn release:** app thu thập tên / SĐT / email của khách vãng lai ẩn danh, lưu vào `leads` + `bookings`, và gửi email nhắc lịch ra ngoài. Hiện không có `app/terms` lẫn `app/privacy`.

## Global Constraints

- Không có test runner — kiểm chứng bằng lệnh cụ thể + mở trình duyệt.
- Landing page (`app/_components/landing-page.tsx`) hardcode tiếng Anh; **không** i18n hoá trong plan này.
- Sau khi sửa React: `npm run doctor`, sửa hết error rồi mới commit.
- Sau khi sửa code: `graphify update .`.

## Chặn ở đâu

**Bước 5 cần user cung cấp email liên hệ.** Làm được bước 1-4 trước, nhưng **không commit** khi còn `REPLACE_WITH_CONTACT_EMAIL` trong cây nguồn.

## File Structure

- **Tạo:** `app/_components/legal-page.tsx` — shell dùng chung (tiêu đề, ngày cập nhật, link về trang chủ, typography). Một trách nhiệm: trình bày.
- **Tạo:** `app/terms/page.tsx` — nội dung điều khoản. Chỉ nội dung.
- **Tạo:** `app/privacy/page.tsx` — nội dung chính sách. Chỉ nội dung.
- **Sửa:** `app/_components/landing-page.tsx:496-519` — thêm link vào `SiteFooter`.

Tách shell khỏi nội dung để lần sau thêm trang pháp lý thứ ba (ví dụ DPA) không phải chép lại layout.

---

### Task 1: Shell dùng chung + hai trang nội dung

**Files:**
- Create: `app/_components/legal-page.tsx`
- Create: `app/privacy/page.tsx`
- Create: `app/terms/page.tsx`

**Interfaces:**
- Consumes: `Link` từ `next/link`, `Metadata` từ `next`
- Produces: `LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode })` — server component, không `"use client"`.

- [x] **Bước 1: Tạo shell**

Tạo `app/_components/legal-page.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-8">
      <Link className="text-sm text-zinc-500 hover:text-white" href="/">
        ← Eve
      </Link>
      <h1 className="mt-6 text-3xl font-semibold text-white">{title}</h1>
      <p className="mt-2 text-sm text-zinc-500">Last updated: {updated}</p>
      <div className="mt-8 space-y-6 text-sm leading-relaxed text-zinc-400 [&_h2]:pt-4 [&_h2]:text-lg [&_h2]:font-medium [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </main>
  );
}
```

- [x] **Bước 2: Tạo trang chính sách bảo mật**

Tạo `app/privacy/page.tsx`. Nội dung dưới đây mô tả **đúng những gì code đang làm** (chat lưu tin nhắn, cookie visitor, Cal.com giữ lịch, Resend gửi mail, link unsubscribe trong mail nhắc lịch) — không hứa thêm gì:

```tsx
import type { Metadata } from "next";
import { LegalPage } from "@/app/_components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy — Eve",
  description: "How Eve collects, uses and stores booking data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="2026-07-26">
      <h2>What we collect</h2>
      <p>
        When you chat with an Eve booking assistant we store the messages you
        send, plus any contact details you provide (name, phone number, email)
        and the appointments you book. We also set a first-party cookie to
        recognise your chat session so you can manage your own bookings without
        an account.
      </p>
      <h2>Why we collect it</h2>
      <ul>
        <li>To create, cancel and reschedule appointments on your behalf.</li>
        <li>To send appointment reminders, if the business enables them.</li>
        <li>To let the business you contacted follow up with you.</li>
      </ul>
      <h2>Who can see it</h2>
      <p>
        Your data is visible to the business whose booking page you used, and to
        our calendar provider (Cal.com) for the appointment itself. Reminder and
        verification emails are delivered by Resend. We do not sell your data.
      </p>
      <h2>How long we keep it</h2>
      <p>
        Chat sessions, leads and bookings are retained for as long as the
        business keeps its Eve account. You can ask us to delete your data using
        the contact address below.
      </p>
      <h2>Your choices</h2>
      <p>
        Every reminder email includes an unsubscribe link that stops further
        reminders for that booking. To request access to or deletion of your
        data, contact us.
      </p>
      <h2>Contact</h2>
      <p>REPLACE_WITH_CONTACT_EMAIL</p>
    </LegalPage>
  );
}
```

- [x] **Bước 3: Tạo trang điều khoản**

Tạo `app/terms/page.tsx`:

```tsx
import type { Metadata } from "next";
import { LegalPage } from "@/app/_components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service — Eve",
  description: "Terms governing use of the Eve booking assistant.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="2026-07-26">
      <h2>The service</h2>
      <p>
        Eve provides an AI assistant that answers questions and books
        appointments on behalf of a business, using that business&apos;s own
        calendar. Eve is a scheduling tool. It does not provide medical, legal,
        financial or other professional advice.
      </p>
      <h2>Accounts</h2>
      <p>
        A business account owner is responsible for the accuracy of the
        information their assistant gives out, for the calendar credentials they
        connect, and for anyone they invite into their workspace.
      </p>
      <h2>Acceptable use</h2>
      <ul>
        <li>Do not use Eve to send unsolicited messages.</li>
        <li>Do not attempt to access another workspace&apos;s data.</li>
        <li>Do not abuse the public chat endpoints; usage is rate limited.</li>
      </ul>
      <h2>Availability</h2>
      <p>
        The service is provided as-is, without warranty. Appointments depend on
        third-party calendar and email providers; we are not liable for missed
        appointments caused by their outages.
      </p>
      <h2>Contact</h2>
      <p>REPLACE_WITH_CONTACT_EMAIL</p>
    </LegalPage>
  );
}
```

- [ ] **Bước 4: Kiểm chứng hai trang render**

```bash
npm run dev
```

Mở `http://localhost:3000/privacy` và `http://localhost:3000/terms`. Mong đợi: cả hai render, có link `← Eve` quay về trang chủ, tiêu đề tab đúng theo `metadata.title`.

- [x] **Bước 5: Điền email liên hệ**

**Hỏi user địa chỉ hỗ trợ — không đoán domain.** Rồi thay cả hai chỗ.

```bash
grep -rn "REPLACE_WITH_CONTACT_EMAIL" app/
```

Mong đợi sau khi sửa: không khớp gì.

- [x] **Bước 6: doctor + typecheck**

```bash
npm run doctor
npm run typecheck
```

Mong đợi: doctor không báo error trên file mới; typecheck exit 0.

- [x] **Bước 7: Commit**

```bash
git add app/terms app/privacy app/_components/legal-page.tsx
git commit -m "feat(legal): add terms and privacy pages"
```

---

### Task 2: Link từ footer trang chủ

**Files:**
- Modify: `app/_components/landing-page.tsx:496-519` (`SiteFooter`)

**Interfaces:**
- Consumes: `/terms` và `/privacy` từ Task 1
- Produces: không export mới.

- [x] **Bước 1: Thay khối link trong SiteFooter**

Trong `app/_components/landing-page.tsx`, thay khối `<div className="flex gap-4">` (dòng 502-515) bằng:

```tsx
        <div className="flex flex-wrap justify-center gap-4">
          <Link className="hover:text-white" href="/chat">
            Try it
          </Link>
          <Link className="hover:text-white" href="/signup">
            Sign up
          </Link>
          <Link className="hover:text-white" href="/login">
            Login
          </Link>
          <Link className="hover:text-white" href="/dashboard">
            Dashboard
          </Link>
          <Link className="hover:text-white" href="/terms">
            Terms
          </Link>
          <Link className="hover:text-white" href="/privacy">
            Privacy
          </Link>
        </div>
```

`flex-wrap` là cần thiết: 6 link không vừa một hàng trên màn hình hẹp.

- [ ] **Bước 2: Kiểm chứng, gồm cả mobile**

```bash
npm run dev
```

Mở `http://localhost:3000/`, cuộn xuống footer: 6 link, cả Terms và Privacy điều hướng đúng. Thu hẹp cửa sổ còn ~375px → link xuống dòng, **không** tràn ngang.

- [x] **Bước 3: doctor + typecheck**

```bash
npm run doctor
npm run typecheck
```

- [x] **Bước 4: Cập nhật graph và commit**

```bash
graphify update .
git add app/_components/landing-page.tsx graphify-out
git commit -m "feat(legal): link terms and privacy from the site footer"
```

---

## Self-review trước khi đóng plan

- [x] `grep -rn "REPLACE_WITH_CONTACT_EMAIL" app/` → không khớp
- [ ] Cả `/terms` và `/privacy` trả 200 khi chạy `npm run build && npm start`
- [ ] Footer không tràn ngang ở 375px
- [x] Nội dung không hứa hẹn thứ code không làm (ví dụ: không hứa "xoá trong 30 ngày" khi chưa có cơ chế xoá)
