# eve-booking — Đánh giá CEO & Chiến lược ra thị trường

Ngày đánh giá: 2026-07-31 | Cập nhật: 2026-07-31

## Tổng quan sản phẩm

eve-booking là SaaS multi-tenant AI booking agent. Khách hàng chat với AI để đặt lịch, doanh nghiệp quản lý qua dashboard. Backend kết nối Cal.com để quản lý lịch thực. Hệ thống cho phép nhúng chat vào website bên thứ 3 qua embed script.

---

## Thế mạnh hiện tại — Điểm bán chính

### 1. AI-first booking flow hoàn chỉnh
Agent làm gần như toàn bộ quy trình: check availability → qualify lead → book → xác nhận manage code → cancel/reschedule → OTP xác minh. Không cần người vận hành.

### 2. Multi-tenant đúng chuẩn
Tenant isolation sạch — mỗi workspace có encrypted Cal key riêng, RLS scoped đúng. Có thể scale mà không sợ cross-tenant bug.

### 3. Embed script — distribution channel
Nhúng widget chat vào WordPress, Shopify, React, Next.js, Vue. Mỗi tenant tự động thành distribution channel.

### 4. Cost-first model routing
Agent tự chọn model rẻ nhất đủ khả năng (DeepSeek → Gemini → Claude). Chi phí inference thấp là yếu tố sống còn cho SaaS AI.

### 5. i18n sẵn — EN/VI
VI-aware slugify, locale riêng cho guest vs dashboard. Thị trường Việt Nam là vertical tốt vì đối thủ quốc tế hiếm khi làm VI tốt.

### 6. Analytics + monitoring
PostHog, Sentry, dashboard analytics nội bộ (AI health, funnel conversion, trend charts).

---

## Blockers — Phải làm trước khi bán

| # | Vấn đề | Impact | Fix | Status |
|---|--------|--------|-----|--------|
| 1 | **Không có automated test** — không unit, integration, e2e | Critical | Vitest + Playwright, ít nhất smoke test booking flow | ✅ Done — 200 tests, 15 files, typecheck sạch |
| 2 | **Không có billing/pricing engine** — landing page có Pricing section nhưng không có Stripe/Paddle/Momo, không subscription tiers, không trial | Critical | Tích hợp Stripe + subscription model | ✅ Done — Stripe Checkout + Customer Portal + BILLING_MODE=test + 14-day trial |
| 3 | **Onboarding quá manual** — mỗi tenant phải tự tạo Cal.com account, lấy API key, cấu hình meeting type | High | Cal.com OAuth hoặc auto-provision sandbox | ✅ Done — Cal.com OAuth flow hoàn chỉnh (authorize → token → auto-refresh) |
| 4 | **Không có retry/circuit breaker** — nếu Cal.com API down, khách không thể book | High | Retry queue + dead letter + alert | ⬜ Chưa làm |
| 5 | **Không rate limit guest booking** — spam booking không bị chặn | Medium | Rate limit per IP/session | ✅ Đã có `agent-rate-limit.ts` + `checkAgentRateLimit` |

---

## Feature gaps nên làm sớm

| # | Tính năng | Giá trị |
|---|-----------|---------|
| 1 | **Team/Staff accounts** — invite vào workspace hiện có | Solopreneur → SMB | ✅ Done — invite email + accept + role-scoped dashboard |
| 2 | **WhatsApp/Zalo channel** — phần lớn booking ở VN đến từ đây | Mở rộng TAM 10x |
| 3 | **Multi-language agent** — FAQ auto-translate cho khách quốc tế | Tăng conversion |
| 4 | **CRM export** — Google Sheets / Zapier webhook | Giảm churn, owner không cần login dashboard |
| 5 | **Voice booking** — AI voice agent qua điện thoại | Premium tier upsell |
| 6 | **Payment upfront** — VNPay/Momo/Stripe cọc khi book | Giảm no-show, tăng giá trị booking |

---

## Nên loại bỏ hoặc giản lược

| # | Vấn đề | Lý do | Status |
|---|--------|-------|--------|
| 1 | **Agent tools generic** (`bash`, `glob`, `grep`, `read_file`, `write_file`) | Security risk — agent booking không cần quyền write file | Xóa file, không còn trong discovery | ✅ Done — 5 files removed, agent chỉ còn 11 booking tools |
| 2 | **Landing page Pricing section** — static, không có backend | Gây misleading, bỏ đến khi có billing thật | ⬜ Chưa làm |
| 3 | **`sync-cal-bookings.ts` pull-based sync** — mirror Cal.com về Supabase | Overhead cron job, thay bằng Cal.com webhook | ⬜ Chưa làm |
| 4 | **Magic UI / GSAP landing animations** — tăng bundle size | Landing SaaS cần load nhanh hơn animation | ⬜ Chưa làm |
| 5 | **`log_lead` flow nửa vời** — logic phức tạp nhưng leads UI quá đơn giản | Làm mạnh CRM hoặc giản lược | ⬜ Chưa làm |

---

## Chiến lược ra thị trường

### Target customer
**Solopreneur dịch vụ** — spa, clinic, salon, photographer, consultant, tutor.
- Cần booking nhưng không muốn tốn người trả lời
- Dùng Zalo/Facebook Messenger là chính
- Ngân sách $20-50/tháng
- Thị trường ban đầu: **Việt Nam**, sau đó Đông Nam Á

### Pricing model

| Tier | Giá | Features |
|------|-----|----------|
| Starter | $19/tháng | 50 bookings/tháng, 1 user, web embed, EN/VI AI |
| Pro | $49/tháng | 200 bookings/tháng, 3 users, Zalo/WhatsApp, email reminders |
| Business | $99/tháng | Unlimited bookings, 10 users, voice booking, custom branding, priority support |

### Timeline

- **Tháng 1**: Fix blockers (test, billing, onboarding) → private beta 5-10 spa/clinic VN
- **Tháng 2-3**: Public launch + Zalo integration → target 50 paying tenants
- **Tháng 4-6**: WhatsApp + voice booking → mở rộng Đông Nam Á

### Moat

- **Vertical depth**: VI-first, Zalo, VNPay — không phải "Cal.com clone" generic
- **Data network effect**: Càng nhiều tenant, agent càng hiểu booking pattern của vertical
- **Embed distribution**: Mỗi tenant embed widget → distribution miễn phí

---

## Kết luận

Sản phẩm đang ở giai đoạn **product beta — sẵn sàng bán**. Code tốt, multi-tenant đúng, AI flow hoàn chỉnh (book + cancel + reschedule). Tất cả critical blockers đã được giải quyết.

### Tiến độ 2026-07-31

✅ **Test suite** — 220 tests, 15 files, vitest
✅ **Rate limit** — `agent-rate-limit.ts`
✅ **Onboarding tự động** — Cal.com OAuth (authorize → token → auto-refresh → disconnect)
✅ **Billing** — Stripe Checkout + Customer Portal + `BILLING_MODE=test` (free full access) + 14-day trial + subscription guard trên proxy

Sẵn sàng bán. Việc còn lại: bỏ agent tools generic khỏi production, giản lược landing page sections chưa có backend, chốt vertical "local service businesses ở VN", tạo Stripe products/prices trên dashboard.
