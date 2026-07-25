# Đảo thứ tự setup wizard — giá trị trước, Cal.com sau

> Trạng thái: **plan, chưa code**. Viết ngày 2026-07-25.
> Mục tiêu: bỏ vách đá chuyển đổi ở bước đầu onboarding.

---

## 1. Vấn đề thật lớn hơn "thứ tự bước"

Ban đầu tôi mô tả đây là vấn đề thứ tự. Đọc kỹ thì nặng hơn: **người vừa đăng ký bị khóa khỏi toàn bộ dashboard cho tới khi dán được Cal.com API key.** Họ không xem được gì, không thử được gì.

Chuỗi khóa:

1. `proxy.ts:98-105` — `setup_completed_at` null → mọi đường `/dashboard/*` redirect về `/dashboard/setup`.
2. `app/dashboard/setup/page.tsx:42-44` — `initialStep` do `hasCalKey` quyết định → bước 1 luôn là Cal.com key.
3. `app/dashboard/setup/actions.ts:188-198` — `completeSetupAction` **bắt buộc** `has_cal_key` **và** `cal_event_type_id`, thiếu là trả lỗi.

Nên `setup_completed_at` **không thể** được set nếu chưa có Cal.com. Kết hợp với (1): không Cal.com = không dashboard. Người dùng chưa từng thấy sản phẩm đã bị đòi API key của một SaaS nước ngoài khác.

### Nhưng không được mở toang

`setup_completed_at` hiện làm **hai việc cùng lúc**:

| Việc | Nơi kiểm tra |
|------|--------------|
| Mở khóa dashboard | `proxy.ts:98` |
| Phát hành trang công khai `/b/[slug]` | `app/b/[slug]/page.tsx:18,35` + `getPublicBookingWorkspace` |

Nếu chỉ đơn giản bỏ điều kiện Cal.com trong `completeSetupAction`, trang `/b/[slug]` sẽ **live với một agent không đặt lịch được** — khách thật vào, hỏi giờ trống, `getCalApiKeyForWorkspace` ném lỗi ([lib/workspace.ts:374](lib/workspace.ts:374)). Tệ hơn tình trạng hiện tại.

**Vì thế lõi của plan này là tách một cờ thành hai khái niệm**, không phải chỉ hoán vị mấy bước.

## 2. Thiết kế

### Hai khái niệm tách bạch

| Khái niệm | Điều kiện | Kiểm soát |
|-----------|-----------|-----------|
| **Setup done** — `setup_completed_at` | Đã xong hồ sơ (tên, slug, timezone) | Mở khóa dashboard |
| **Booking live** — `booking_enabled` | `has_cal_key` **và** `cal_event_type_id` | Phát hành `/b/[slug]` + bật tool đặt lịch |

`booking_enabled` là **giá trị dẫn xuất**, không phải cột mới — tính từ dữ liệu đã có. Không cần migration cho phần này.

### Thứ tự wizard mới

| Bước | Nội dung | Bắt buộc |
|------|----------|----------|
| 1 | **Hồ sơ** — tên, slug, timezone, giới thiệu ngắn (nội dung bước 3 cũ) | ✅ |
| 2 | **Thử agent** — chat thử ngay trong wizard, dùng FAQ mặc định | — (chỉ xem) |
| 3 | **Kết nối Cal.com** — API key (bước 1 cũ) | ⏭️ bỏ qua được |
| 4 | **Chọn meeting type** (bước 2 cũ) | ⏭️ bỏ qua được |

Sau bước 1 là **đã có thể vào dashboard**. Bước 3–4 bỏ qua được, và dashboard nhắc lại bằng banner.

Bước 2 là điểm mấu chốt về chuyển đổi: người dùng **thấy sản phẩm chạy** trước khi bị đòi thứ khó. Đây là toàn bộ lý do làm plan này.

## 3. Thay đổi cụ thể

### 3a. `app/dashboard/setup/actions.ts`

**`completeSetupAction` (L188)** — bỏ hai guard Cal.com:

```ts
// XOÁ:
if (!ws?.has_cal_key) return { error: ... CAL_KEY_MISSING };
if (!ws.cal_event_type_id) return { error: ... AI_MEETING_TYPE_REQUIRED };
```

Giữ nguyên phần đảm bảo slug (L200-221) — vẫn cần trước khi mở trang công khai.

**`finishSetupAction` (L239)** giữ nguyên: lưu hồ sơ rồi `completeSetupAction`. Giờ nó chạy được từ bước 1.

### 3b. `lib/workspace.ts`

Thêm helper cạnh `isWorkspaceSetupComplete` (L378):

```ts
export async function isWorkspaceBookingLive(workspaceId: string): Promise<boolean> {
  const ws = await getWorkspaceById(workspaceId);
  return Boolean(ws?.has_cal_key && ws?.cal_event_type_id);
}
```

Thêm `bookingLive: boolean` vào `PublicBookingWorkspace` — `getPublicBookingWorkspace` (L174) cần select thêm `cal_api_key_encrypted, cal_event_type_id` để tính.

> **Lưu ý bảo mật:** chỉ trả về `boolean`, **tuyệt đối không** để `cal_api_key_encrypted` lọt vào object trả cho client component.

### 3c. `app/b/[slug]/page.tsx`

Đổi điều kiện gate ở L18 và L35: `setupCompletedAt` → `bookingLive`.

Trang công khai chỉ live khi thật sự đặt lịch được. Chưa có Cal.com thì vẫn 404 / trang "coming soon" như hiện tại — hành vi với khách vãng lai **không đổi**.

### 3d. `proxy.ts`

Không đổi logic (L98-105). Nhưng vì `setup_completed_at` giờ set được sau bước 1, khóa dashboard tự nhiên mở ra.

### 3e. `components/setup-wizard.tsx`

Phần nặng nhất.

- `STEPS` (L35-60): viết lại 4 mục theo bảng trên; `required` → chỉ bước 1.
- `initialStep` type `1 | 2 | 3` → `1 | 2 | 3 | 4`.
- Bỏ điều kiện `canGoStep2 = workspace.hasCalKey` / `canGoStep3` (L188-189) — điều hướng giờ tự do, trừ khi bước 1 chưa lưu hồ sơ.
- Bỏ effect "snap back" (L117-119) vì tiền đề Cal.com không còn.
- Nút chính bước 1 → **"Save & continue"** (chạy `finishSetupAction`, set `setup_completed_at`).
- Mỗi bước 3–4 có nút phụ **"Skip for now"** → `/dashboard`.
- Bước 4 hoàn tất → **"Go to dashboard"**.

### 3f. Bước 2 — khung chat thử

Cách rẻ nhất, không viết component mới: nhúng `/chat` (Eve Pilot demo) trong `<iframe>` ngay trong wizard, kèm dòng giải thích *"Đây là demo dùng lịch sandbox. Kết nối Cal.com ở bước sau để dùng lịch thật của bạn."*

Lý do chọn Pilot demo thay vì agent của chính workspace: workspace mới **chưa có** Cal.com key nên `check_availability` sẽ ném lỗi ngay ([lib/workspace.ts:374](lib/workspace.ts:374)). Dùng demo tránh được toàn bộ vấn đề đó mà vẫn cho thấy sản phẩm chạy.

> **Đánh đổi cần chốt:** demo không mang FAQ/branding của họ nên kém thuyết phục hơn. Phương án đắt hơn: cho agent của chính workspace chạy ở "chế độ preview" — tool đặt lịch trả thông báo thân thiện *"Booking chưa bật"* thay vì ném lỗi. Đẹp hơn nhưng phải sửa `check_availability` / `book_appointment` + prompt. **Đề xuất: làm iframe demo trước, preview mode sau nếu số liệu cho thấy bước 2 có tác dụng.**

### 3g. Banner nhắc kết nối Cal.com

Thiếu cái này thì người dùng bỏ qua Cal.com rồi không bao giờ quay lại.

- `components/dashboard-shell.tsx`: banner cố định khi `!bookingLive` — *"Trang đặt lịch của bạn chưa hoạt động. Kết nối Cal.com để nhận booking."* + link `/dashboard/setup`.
- `app/dashboard/page.tsx`: thẻ nổi bật cùng nội dung.
- Đã có sẵn hệ thống AI health alerts trong `lib/analytics.ts` (`AiHealthAlert`) — cân nhắc phát một alert `ai_config` thay vì dựng UI mới.

### 3h. Analytics theo bước

Không có cái này thì không biết plan có tác dụng hay không — mà đó là toàn bộ lý do làm.

Bắn event ở: mở wizard, xong bước 1, xem bước 2, bỏ qua Cal.com, kết nối Cal.com, chọn meeting type, hoàn tất. Tối thiểu ghi vào `logAgentToolEvent`-style bảng riêng, hoặc PostHog nếu đã cài.

## 4. Thứ tự triển khai

1. **3b** helper + `bookingLive` trong `getPublicBookingWorkspace`
2. **3c** đổi gate `/b/[slug]` sang `bookingLive` ← **làm trước 3a**, nếu không sẽ có khoảng thời gian trang công khai live mà không đặt lịch được
3. **3a** bỏ guard Cal.com khỏi `completeSetupAction`
4. **3e** viết lại wizard 4 bước
5. **3f** iframe demo bước 2
6. **3g** banner nhắc
7. **3h** analytics
8. `npm run typecheck` → `npm run doctor` → `graphify update .`

Thứ tự 2 trước 3 là bắt buộc — đảo lại sẽ hở một cửa sổ nguy hiểm.

## 5. Test

| # | Kịch bản | Kỳ vọng |
|---|----------|---------|
| 1 | Đăng ký mới → xong bước 1 → bấm Skip | Vào được dashboard, **không** bị đá ngược về setup |
| 2 | Workspace đó, mở `/b/{slug}` | Vẫn chưa live (404 / coming soon) — khách không gặp agent hỏng |
| 3 | Dashboard của workspace chưa có Cal.com | Có banner nhắc kết nối |
| 4 | Kết nối Cal.com + chọn meeting type | `/b/{slug}` live, banner biến mất |
| 5 | Workspace **cũ** đã `setup_completed_at` + có Cal.com | Không đổi gì — không regression |
| 6 | Workspace cũ có `setup_completed_at` nhưng Cal.com key bị xoá | `/b/{slug}` chuyển về chưa live + hiện banner (đúng ý đồ) |
| 7 | Bước 2 iframe demo | Chat được, ghi rõ là lịch sandbox |
| 8 | Quay lại `/dashboard/setup` sau khi đã xong | Không bị khóa, sửa lại được từng bước |
| 9 | Guest đang chat với workspace vừa mất Cal.com key | Tool trả lỗi thân thiện, không phơi chuỗi lỗi kỹ thuật |

## 6. Rủi ro

- **Ca #6 là thay đổi hành vi có chủ đích:** workspace đã hoàn tất nhưng key bị xoá thì trang công khai tự ngắt. Đúng hơn hiện tại (đang để live với agent hỏng), nhưng phải nêu rõ trong changelog.
- **Không đụng `handle_new_user`.** Signup vẫn tạo workspace như cũ.
- **Không thêm cột.** `booking_enabled` là dẫn xuất — nếu sau này cần cho phép chủ tiệm chủ động tắt trang công khai thì mới thêm cột, không phải bây giờ.
- **`isWorkspaceSetupComplete` (L378)** giờ mang nghĩa hẹp hơn (chỉ là "xong hồ sơ"). Rà mọi call site để chắc không nơi nào đang ngầm hiểu nó là "đặt lịch được".
- Bước 2 dùng iframe demo là **giải pháp tạm**. Nếu analytics cho thấy người dùng dừng lại ở bước 2 rồi bỏ, cân nhắc nâng lên preview mode thật (3f, phương án đắt).
