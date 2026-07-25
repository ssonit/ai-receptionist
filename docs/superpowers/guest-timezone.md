# Guest timezone — hiển thị & đặt lịch đúng múi giờ khách

> Trạng thái: **plan, chưa code**. Viết ngày 2026-07-25.
> Bối cảnh: chuyển hướng sang thị trường **global**. Xem thêm `guest-booking-change.md`.

---

## 1. Vì sao cần

Hiện toàn bộ hệ thống chỉ biết **một** múi giờ: `workspaces.timezone`. Agent trình bày slot theo giờ doanh nghiệp, khách tự quy đổi.

Với tiệm nail / spa / phòng khám thì không sao — khách đến tận nơi, cùng múi giờ. **Nhưng phần lớn user Cal.com là consultant / coach / sales / agency họp online**, nơi khách và chủ khác múi giờ là **mặc định, không phải ngoại lệ**. Đây là nhóm khách hàng mà wedge "AI receptionist for Cal.com" nhắm tới.

Hậu quả hiện tại khi khách ở múi giờ khác:

- Agent nói "10:00 sáng thứ Ba" → khách hiểu là 10:00 giờ **của họ** → đặt nhầm, no-show.
- Không có cách nào để khách nói "tôi ở New York" và nhận lại giờ đã quy đổi.
- Email xác nhận của Cal.com hiển thị đúng giờ khách (Cal.com có xử lý), **mâu thuẫn với những gì agent vừa nói trong chat** → khách hoang mang, mất niềm tin.

Điểm cuối cùng là tệ nhất: sản phẩm tự mâu thuẫn với chính nó.

## 2. Đã sửa trước khi làm plan này

- ✅ `agent/tools/book_appointment.ts` hardcode `bookingConfig.timezone` (Asia/Ho_Chi_Minh) khi re-check slot — đã vá, giờ dùng `ws?.timezone`.
- ✅ `components/bookings-table.tsx` hardcode `bookingConfig.timezone` ở 3 chỗ + chuỗi literal `"(Indochina Time)"` + `bookingConfig.name` làm host — đã vá, nhận `timeZone` / `hostName` qua props từ `app/dashboard/bookings/page.tsx`.

Sau hai vá này, **phía doanh nghiệp** đã đúng múi giờ. Plan dưới đây lo **phía khách**.

## 3. Nguyên tắc thiết kế

1. **`start_time` trong DB luôn là UTC (`timestamptz`)** — không đổi. Mọi thứ ở đây chỉ là tầng hiển thị + tầng ý định của khách.
2. **Múi giờ doanh nghiệp vẫn là nguồn chân lý cho lịch trống.** Cal.com trả slot theo tz truyền vào; ta không tự tính lại.
3. **Không đoán bừa.** Nếu chưa biết tz khách → hiển thị giờ doanh nghiệp kèm nhãn rõ ràng, không im lặng giả định.
4. **Khách nói được bằng lời.** "tôi ở London" / "giờ Nhật" phải hoạt động, không bắt chọn dropdown.
5. **Dịch vụ tại chỗ thì không hỏi.** Tiệm nail không nên bị hỏi "bạn ở múi giờ nào" — vô nghĩa và gây khó chịu. Phải có công tắc.

## 4. Nguồn xác định múi giờ khách (theo thứ tự ưu tiên)

| # | Nguồn | Độ tin | Ghi chú |
|---|-------|--------|---------|
| 1 | Khách nói trong chat ("tôi ở Berlin") | cao nhất | Agent gọi tool để set |
| 2 | `Intl.DateTimeFormat().resolvedOptions().timeZone` từ trình duyệt | cao | Tự động, không hỏi han |
| 3 | `workspaces.timezone` | fallback | Khi cả 2 trên đều không có |

Nguồn 2 gửi lên qua header mới `x-eve-tz` → auth attribute `guestTimeZone`, đi cùng đường với `x-eve-locale` đã có sẵn.

## 5. Thay đổi cụ thể

### 5.1 Migration — `supabase/migrations/2026XXXXXXXXXX_guest_timezone.sql`

```sql
-- Chế độ dịch vụ: tại chỗ (không hỏi tz) hay online (cần tz khách)
alter table public.workspaces
  add column if not exists service_mode text not null default 'onsite'
    check (service_mode in ('onsite', 'online'));

comment on column public.workspaces.service_mode is
  'onsite = khách đến tận nơi (không hỏi timezone); online = họp từ xa (hỏi/dò timezone khách)';

-- Ghi lại tz khách đã dùng lúc đặt, để hiển thị lại đúng khi họ quay lại
alter table public.bookings
  add column if not exists guest_timezone text;

comment on column public.bookings.guest_timezone is
  'IANA tz của khách tại thời điểm đặt — hiển thị lại đúng giờ khi họ quay lại chat';

-- Nhớ tz trong suốt phiên chat
alter table public.chat_sessions
  add column if not exists guest_timezone text;
```

**Vì sao `service_mode` mặc định `onsite`:** tenant hiện tại đều là dịch vụ tại chỗ; không được đổi hành vi của họ khi migrate. Tenant online tự bật trong Settings.

### 5.2 `lib/timezones.ts` (đã tồn tại — mở rộng)

- `isValidIanaTimeZone(tz)` — validate bằng `Intl.supportedValuesOf("timeZone")` hoặc try/catch `Intl.DateTimeFormat`.
- `resolveTimeZoneFromText(text)` — map lời nói của khách → IANA. Xử lý: tên thành phố ("London", "New York", "Tokyo"), tên nước phổ biến, viết tắt ("PST", "CET", "JST", "ICT"), offset ("GMT+7"). Trả `null` nếu không chắc → agent hỏi lại, **không đoán**.
- `formatSlotForGuest(iso, guestTz, businessTz)` — trả cả hai: `"3:00 PM (your time) · 10:00 PM Hanoi"`. Khi trùng tz thì chỉ trả một.

### 5.3 Agent — kênh & prompt

**`agent/channels/eve.ts`** — thêm `x-eve-tz` → `attributes.guestTimeZone` (cùng chỗ đang stamp `locale` / `visitorId`).

**`app/_components/agent-chat.tsx`** — trong `tenantHeaders()`, thêm:
```ts
headers["x-eve-tz"] = Intl.DateTimeFormat().resolvedOptions().timeZone;
```
Client-side, không cần cookie, không cần permission.

**`agent/instructions.ts`** — block "Current time" hiện chỉ có giờ doanh nghiệp. Thêm:
- Khi `service_mode = 'online'` **và** đã biết tz khách: hiển thị **cả hai** múi giờ trong mọi lần nêu giờ.
- Khi `online` mà **chưa** biết tz khách: hỏi một lần, lịch sự, trước khi chốt slot.
- Khi `onsite`: **không bao giờ hỏi**, chỉ dùng giờ doanh nghiệp, nêu nhãn tz một lần ở lần đầu nhắc giờ.

### 5.4 Tool

| Tool | Thay đổi |
|------|----------|
| `set_guest_timezone.ts` **(mới)** | Nhận `timeZone` (IANA) hoặc `location` (lời khách). Validate qua `lib/timezones.ts`. Ghi `chat_sessions.guest_timezone`. Trả về nhãn tz để agent xác nhận lại với khách. Không hợp lệ → trả lỗi + gợi ý, **không tự chọn bừa**. |
| `check_availability.ts` | Kết quả kèm `guestTimeZone` + mỗi slot có thêm trường đã format theo giờ khách. Vẫn gọi Cal.com bằng tz doanh nghiệp (nguyên tắc #2). |
| `book_appointment.ts` | Ghi `bookings.guest_timezone`. Xác nhận cuối cùng nêu **cả hai** giờ. |
| `list_my_appointments.ts` | Hiển thị theo `bookings.guest_timezone` nếu có, fallback tz phiên hiện tại. |
| `reschedule_appointment.ts` | Như `check_availability` + giữ nguyên `guest_timezone` cũ khi tạo row mới sau khi Cal.com đổi uid. |

### 5.5 Dashboard

- `app/dashboard/settings` — thêm chọn **Service mode** (`onsite` / `online`), giải thích ngắn: *"Online sẽ hỏi múi giờ của khách và hiển thị giờ theo cả hai bên."*
- `components/bookings-table.tsx` — khi `booking.guest_timezone` khác tz workspace, hiển thị thêm dòng phụ *"Guest saw: 3:00 PM GMT+1"*. Giúp chủ hiểu vì sao khách nhớ nhầm giờ.

### 5.6 i18n

`messages/en.json` + `vi.json`: nhãn service mode, câu hỏi múi giờ, chuỗi "your time" / "giờ của bạn".

## 6. Thứ tự triển khai

1. Migration (`service_mode`, `bookings.guest_timezone`, `chat_sessions.guest_timezone`) → `npx supabase db reset`
2. Mở rộng `lib/timezones.ts` (validate + parse + format song song)
3. `x-eve-tz`: `agent-chat.tsx` → `agent/channels/eve.ts` → attribute
4. `set_guest_timezone` tool
5. `instructions.ts` — logic phân nhánh theo `service_mode`
6. `check_availability` + `book_appointment` trả/ghi giờ khách
7. `list_my_appointments` + `reschedule_appointment`
8. Dashboard Settings + cột phụ trong bookings-table → `npm run doctor`
9. i18n → `graphify update .`

## 7. Test

| # | Kịch bản | Kỳ vọng |
|---|----------|---------|
| 1 | Workspace `onsite`, khách ở múi giờ khác | **Không** hỏi timezone; giờ hiển thị theo doanh nghiệp, có nhãn tz |
| 2 | Workspace `online`, khách chưa khai tz, trình duyệt gửi `x-eve-tz` | Tự dùng tz trình duyệt, không cần hỏi |
| 3 | Workspace `online`, không có header (curl / kênh khác) | Hỏi một lần trước khi chốt slot |
| 4 | Khách gõ "tôi ở London" | Đặt `Europe/London`, xác nhận lại bằng lời |
| 5 | Khách gõ "múi giờ sao Hỏa" | Từ chối lịch sự, hỏi lại — **không** tự chọn |
| 6 | Đặt lịch xuyên múi giờ | Xác nhận nêu cả hai giờ; `bookings.guest_timezone` đúng; email Cal.com khớp với những gì agent nói |
| 7 | Khách quay lại `list_my_appointments` từ múi giờ khác | Hiển thị theo tz lúc đặt, không nhảy giờ |
| 8 | Đổi lịch qua ranh giới DST | Giờ hiển thị đúng sau khi DST đổi (dùng IANA, không dùng offset cứng) |
| 9 | Chủ tiệm xem dashboard | Giờ theo tz doanh nghiệp; nếu khách khác tz thì thấy dòng phụ |

## 8. Rủi ro / lưu ý

- **DST là chỗ dễ sai nhất.** Luôn lưu và truyền **IANA tz** (`Europe/London`), tuyệt đối không lưu offset (`GMT+1`) — offset đổi hai lần mỗi năm.
- **Đừng tự tính lại slot.** Cal.com đã xử lý DST + lịch làm việc; ta chỉ đổi cách *hiển thị*. Tự tính là tự chuốc bug.
- **`resolveTimeZoneFromText` phải conservative.** Thà hỏi lại còn hơn đoán sai — đoán sai múi giờ = khách đến sai ngày.
- **Không hỏi tz ở workspace `onsite`.** Đây là lỗi UX kinh điển của các booking tool đa dụng; tránh được là điểm cộng.
- `bookings.guest_timezone` chỉ là **lịch sử** (khách thấy gì lúc đặt), không phải nguồn chân lý cho việc tính giờ — nguồn chân lý luôn là `start_time` UTC.
