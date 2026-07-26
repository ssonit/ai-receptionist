# `robots.txt` + noindex embed/invite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Thuộc nhóm [Release Readiness](2026-07-26-release-readiness.md).

**Goal:** Không để công cụ tìm kiếm index các bề mặt không dành cho tìm kiếm — nhất là `/invite/{token}` (chứa bí mật) và `/embed/{slug}` (nội dung nhúng trong iframe của bên thứ ba).

**Architecture:** Một file `app/robots.ts` (Next sinh `/robots.txt`) cộng với metadata `robots` trên hai route nhạy cảm. Hai lớp là có chủ đích: `robots.txt` là lời đề nghị, thẻ meta mạnh hơn với các bot chịu tuân thủ.

**Tech Stack:** Next.js App Router metadata API.

**Vì sao cần:** repo không có `app/robots.ts` lẫn `app/sitemap.ts`. Token invite nằm trong URL (`/invite/{token}`) — một token bị index là một lối vào workspace.

## Global Constraints

- Không có test runner — kiểm chứng bằng `curl`.
- Sau khi sửa code: `graphify update .`.
- Không thêm `sitemap.ts` trong plan này: trang công khai duy nhất đáng index là `/b/{slug}` của từng tenant, và việc quyết định tenant nào được vào sitemap phụ thuộc `bookingLive` — đủ lớn để tách riêng, và không chặn release.

## File Structure

- **Tạo:** `app/robots.ts` — chỉ khai báo rule cấp site.
- **Sửa:** route invite — thêm metadata `robots`.
- **Sửa:** route embed — thêm metadata `robots`.

---

### Task 1: `robots.txt`

**Files:**
- Create: `app/robots.ts`

**Interfaces:**
- Consumes: `MetadataRoute` từ `next`
- Produces: `/robots.txt` do Next phục vụ.

- [ ] **Bước 1: Tạo file**

```ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard/", "/console/", "/embed/", "/invite/"],
    },
  };
}
```

`/b/` **không** nằm trong danh sách chặn — đó là trang công khai của tenant, index được là điều tốt.

- [ ] **Bước 2: Kiểm chứng**

```bash
npm run dev
```

```bash
curl -s http://localhost:3000/robots.txt
```

Mong đợi: có `User-Agent: *`, `Allow: /`, và năm dòng `Disallow:` ở trên. Không được có `Disallow: /b/`.

- [ ] **Bước 3: Commit**

```bash
git add app/robots.ts
git commit -m "feat(seo): serve robots.txt disallowing private surfaces"
```

---

### Task 2: noindex cho invite và embed

**Files:**
- Modify: `app/invite/[token]/page.tsx`
- Modify: `app/embed/[slug]/page.tsx` (hoặc `layout.tsx` nếu có)

**Interfaces:**
- Consumes: Next metadata API
- Produces: thẻ `<meta name="robots" content="noindex, nofollow">` trên hai route.

- [ ] **Bước 1: Xem hai route đang export gì**

```bash
ls app/invite/*/ app/embed/*/
grep -n "metadata\|generateMetadata" app/invite/*/page.tsx app/embed/*/page.tsx app/embed/*/layout.tsx
```

Kết quả quyết định Bước 2 là **thêm** export mới hay **gộp** vào cái đã có. Hai export `metadata` trong một file là lỗi biên dịch.

- [ ] **Bước 2: Thêm metadata cho trang invite**

Nếu file **chưa** export `metadata` hay `generateMetadata`:

```ts
export const metadata = {
  robots: { index: false, follow: false },
};
```

Nếu file **đã** export `metadata`, thêm field vào object có sẵn:

```ts
  robots: { index: false, follow: false },
```

Nếu file dùng `generateMetadata()`, thêm `robots: { index: false, follow: false }` vào object nó trả về.

- [ ] **Bước 3: Làm tương tự cho route embed**

Ưu tiên `app/embed/[slug]/layout.tsx` nếu tồn tại (phủ mọi trang con). Không có thì đặt vào `page.tsx`. Dùng đúng ba biến thể ở Bước 2 tuỳ file đang có gì.

- [ ] **Bước 4: Kiểm chứng**

```bash
npm run dev
```

```bash
curl -s http://localhost:3000/embed/eve-pilot | grep -i "name=\"robots\""
```

Mong đợi: khớp một thẻ chứa `noindex`.

Với trang invite cần một token thật. Tạo invite từ `/dashboard/settings` → Team, rồi:

```bash
curl -s http://localhost:3000/invite/PASTE_TOKEN | grep -i "name=\"robots\""
```

Mong đợi: cũng khớp `noindex`.

- [ ] **Bước 5: Kiểm chứng không làm hỏng hai route**

Mở `http://localhost:3000/embed/eve-pilot` trên trình duyệt → chat vẫn render.
Mở link invite → trang chấp nhận lời mời vẫn render.

Thêm metadata không được đổi hành vi — nếu đổi, nhiều khả năng đã ghi đè một export sẵn có.

- [ ] **Bước 6: typecheck, doctor, graph, commit**

```bash
npm run typecheck
npm run doctor
graphify update .
git add app/invite app/embed graphify-out
git commit -m "feat(seo): noindex invite and embed routes"
```

---

## Self-review trước khi đóng plan

- [ ] `curl -s <host>/robots.txt` chặn `/invite/` và `/embed/`, **không** chặn `/b/`
- [ ] Cả hai route đều phát `noindex` trong HTML
- [ ] Không file nào có hai export `metadata`
- [ ] Trang embed và trang invite vẫn hoạt động y như trước
