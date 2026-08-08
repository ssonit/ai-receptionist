# Trả lời câu hỏi lịch trống cho ngày xa

**Ngày:** 2026-08-08
**Trạng thái:** Đã chốt thiết kế, chờ viết plan
**Phạm vi:** `agent/tools/check_availability.ts`, `agent/instructions.ts`, `lib/calcom.ts`, `lib/workspace-cal.ts`, sync event type

---

## 1. Vấn đề

Khách hỏi một ngày cách xa hôm nay ("9/12/2026 còn trống ngày nào?") thì Eve trả lời không đáng tin. Bốn nguyên nhân, đều đã xác minh trong code:

### P1 — Tool không lọc slot theo khoảng đã hỏi (nghiêm trọng nhất)

Cal.com có bug đang mở [calcom/cal.com#25405](https://github.com/calcom/cal.com/issues/25405): khi event type bật rolling window, `GET /v2/slots` **bỏ qua tham số `start`** và trả slot từ **hôm nay** đến `end`.

`check_availability` tin tuyệt đối vào Cal — `flattenSlots` gom mọi ngày trong response ([lib/calcom.ts:305](../../../lib/calcom.ts)), rồi tool cắt 40 slot đầu ([agent/tools/check_availability.ts:132](../../../agent/tools/check_availability.ts)) mà không lọc lại theo `[start, end]`.

Hệ quả: khách hỏi 9/12, agent truyền `start=2026-12-09` **đúng**, nhưng grid hiện slot **hôm nay** — có nút bấm được, cho câu hỏi tháng 12.

Rủi ro này vừa tăng lên vì picker đã đổi sang `MAX_DAYS: 1`: `dayKeys = allDayKeys.slice(0, 1)` ([lib/availability-slot-ui.ts:185](../../../lib/availability-slot-ui.ts)) lấy **ngày sớm nhất trong payload**, không phải ngày khách hỏi. Trước đây cap 3 ngày còn có cơ hội lọt ngày đúng vào ô thứ 2–3.

### P2 — Không biết cửa sổ đặt lịch thật của tenant

Cal.com có tính năng "Limit future bookings" per event type (`UNLIMITED` / `ROLLING` / `ROLLING_WINDOW` / `RANGE`), và API v2 trả về qua field `bookingWindow`.

`AiBookingEventType` ([lib/workspace-cal.ts:4](../../../lib/workspace-cal.ts)) chỉ có `minimumNoticeMinutes` — app hoàn toàn không đọc `bookingWindow`. Nếu tenant chỉ cho đặt trước 30 ngày, Eve vẫn hồn nhiên đi hỏi tháng 12 và diễn giải kết quả rỗng thành "hết chỗ" thay vì "chưa mở lịch".

Trần cứng 60 ngày trong tool ([check_availability.ts:85](../../../agent/tools/check_availability.ts)) là con số tự chế, không liên quan gì tới cấu hình thật.

### P3 — Cap 40 slot làm câu "còn trống ngày nào" trả lời thiếu

`slots.slice(0, 40)` chạy trước khi build `slotsByDay`, và Cal trả slot theo thứ tự ngày tăng dần. Hỏi range rộng thì 40 slot bị ngày sớm ăn hết, ngày sau biến mất khỏi cả `slots` lẫn `slotsByDay`.

Tool có trả `truncated: true` nhưng instructions **không hề nhắc tới field này** → agent liệt kê 2–3 ngày đầu như thể đó là toàn bộ.

### P4 — Instructions dạy quét rộng kể cả khi khách đã nói ngày cụ thể

[instructions.ts:218](../../../agent/instructions.ts): "default to checking from today through the next 7 days".
[instructions.ts:222](../../../agent/instructions.ts): "Still call `check_availability` for today (+ a few days ahead for alternatives)".

Không có dòng nào nói "khách nói ngày cụ thể thì hỏi đúng ngày đó". Kết hợp với `MAX_DAYS: 1`, agent quét 8/8→15/8 khi khách hỏi 13/8 sẽ khiến grid hiện **hôm nay**.

### Đã xong (không thuộc phạm vi spec này)

Picker chỉ hiện 1 ngày + hint "+N ngày nữa còn trống" đã làm xong: `MAX_DAYS: 1`, `otherDaysWithSlots`, copy `moreDays` (en + vi), instructions web chat đã nói "grid một ngày". 543 test pass.

---

## 2. Nguyên tắc thiết kế

Rút ra từ cách Calendly và Cal.com thực sự vận hành:

1. **Không sản phẩm lớn nào trả lời "tháng 12 còn ngày nào".** Họ giới hạn tầm nhìn đặt lịch (Calendly mặc định 60 ngày lăn) rồi để lịch xám ngày ngoài cửa sổ. Eve cũng vậy — giới hạn trước, giải thích sau.
2. **Cal.com là nguồn sự thật duy nhất về cửa sổ đặt lịch.** Không thêm setting `maxAdvanceDays` trong app — hai nguồn sự thật sẽ lệch nhau. Chủ tiệm chỉnh một chỗ trên Cal.
3. **Chữ trả lời "ngày nào", nút trả lời "giờ nào".** Số nút không bao giờ nở ra theo số ngày. Agent nói "tuần đó còn 10, 12, 13" bằng text; khách chọn ngày; grid mới hiện giờ của **một** ngày.
4. **Không tin dữ liệu bên ngoài.** Cal có bug đang mở; tool phải tự lọc lại kết quả về đúng khoảng đã hỏi.

---

## 3. Thiết kế

### 3.1 `lib/calcom.ts` — parse `bookingWindow`

Thêm type và parse trong `parseCalEventType` ([calcom.ts:493](../../../lib/calcom.ts)):

```ts
export type CalBookingWindow =
  | { type: "businessDays"; value: number; rolling: boolean }
  | { type: "calendarDays"; value: number; rolling: boolean }
  | { type: "range"; startDate: string; endDate: string };

export type CalEventType = {
  // ...hiện có
  bookingWindow?: CalBookingWindow;
};
```

API v2 trả `bookingWindow` dạng **mảng** (`oneOf` ba schema). Parse phần tử đầu hợp lệ; shape lạ hoặc thiếu → `undefined` (nghĩa là `UNLIMITED`).

Hàm parse phải là **pure và export được** (`parseBookingWindow(input: unknown): CalBookingWindow | undefined`) để test không cần network.

### 3.2 Lưu trữ — không cần migration bắt buộc

`workspace_event_types.raw` (jsonb) đã lưu **nguyên payload** event type từ Cal (`raw: item`, [calcom.ts:513](../../../lib/calcom.ts)), và `mirrorRow` ghi `raw: et.raw` mỗi lần sync ([meeting-types/actions.ts:40](<../../../app/dashboard/(main)/meeting-types/actions.ts>)). Nên `bookingWindow` **đã nằm sẵn trong DB** với mọi workspace đã sync gần đây.

Quyết định: thêm cột chuyên dụng, đọc `raw` làm fallback.

- Migration mới: `alter table public.workspace_event_types add column booking_window jsonb;`
- `mirrorRow` ghi thêm `booking_window: et.bookingWindow ?? null` (cả `app/dashboard/setup/actions.ts` và `app/dashboard/(main)/meeting-types/actions.ts` — hai chỗ, giữ đồng bộ).
- `getAiBookingEventType` đọc `booking_window`; nếu `null` thì thử `parseBookingWindow(raw?.bookingWindow)`.

Lý do có cột riêng dù `raw` đã đủ: nhất quán với tiền lệ `minimum_notice_minutes`, có kiểu rõ ràng, và không phụ thuộc vào shape jsonb không kiểm soát. Fallback `raw` để tenant cũ không phải re-sync thủ công — không cần backfill job.

### 3.3 `lib/booking-window.ts` (mới) — logic thuần

Module mới, không phụ thuộc DB hay network, để test dễ:

```ts
/** Ngày xa nhất có thể đặt, theo giờ business timezone. */
export function bookableUntil(
  window: CalBookingWindow | null,
  today: string,        // YYYY-MM-DD
  timeZone: string,
): string;

/** Với cửa sổ lăn: ngày mà `target` bắt đầu đặt được. null nếu không lăn. */
export function opensOn(
  window: CalBookingWindow | null,
  target: string,
  timeZone: string,
): string | null;
```

- `businessDays` phải đếm **bỏ thứ 7 / chủ nhật** (đúng nghĩa Cal.com), `calendarDays` đếm thẳng.
- `window = null` (UNLIMITED) → `bookableUntil` = `today + 60 ngày` (giữ trần cứng hiện tại làm fallback, có comment giải thích đây là giới hạn tự đặt của Eve chứ không phải của Cal).
- `range` → `bookableUntil` = `endDate`, `opensOn` = `null`.

Tái dùng `addDaysYmd` / `compareYmd` / `toYmd` sẵn có trong [agent/date-context.ts](../../../agent/date-context.ts).

### 3.4 `check_availability` — bốn thay đổi

Giữ nguyên contract `{ ok: true, ... } | { ok: false, error }` theo `.claude/rules/agent-tools.md`.

**(a) Clamp theo cửa sổ thật.** Thay `maxEnd = addDaysYmd(start, 60, tz)` bằng `bookableUntil(aiEvent.bookingWindow, today, tz)`.

**(b) Đường thoát `outOfWindow`.** Nếu `start > bookableUntil` → **không gọi Cal**, trả về ngay:

```ts
{
  ok: true,
  outOfWindow: true,
  bookableUntil: "2026-10-07",
  opensOn: "2026-10-10" | null,   // ngày khách quay lại đặt được ngày họ hỏi
  requestedDate: "2026-12-09",
  slots: [], slotsByDay: {}, count: 0,
  // ...các field mô tả sẵn có (timezone, eventType, ...)
}
```

Tiết kiệm một round-trip tới Cal, và làm câu trả lời tất định thay vì phụ thuộc Cal trả rỗng.

**(c) Lọc phòng thủ.** Sau `getAvailableSlots`, **trước** khi cắt 40:

```ts
const inRange = slots.filter((s) => {
  const day = calendarDayInTimeZone(s.start, businessTz);
  return compareYmd(day, start) >= 0 && compareYmd(day, end) <= 0;
});
```

Nếu `inRange.length !== slots.length` → push note `Filtered N slots outside the requested range (Cal.com returned days outside start/end).` Note này để debug, không đọc cho khách.

Đây là hàng rào cho P1. Nó cũng bảo đảm `allDayKeys[0]` mà picker lấy luôn nằm trong khoảng khách hỏi — điều kiện tiên quyết để `MAX_DAYS: 1` an toàn.

**(d) `daysWithSlots`.** Tính trên **toàn bộ** `inRange`, không phải 40 slot đầu:

```ts
daysWithSlots: string[]   // ["2026-08-10", "2026-08-12", "2026-08-13"]
```

Trả lời trực tiếp câu "còn trống ngày nào" mà không phải bỏ cap 40 và không đẩy thêm nút lên UI.

`count` giữ nguyên nghĩa "tổng slot trong khoảng" nhưng đổi nguồn sang `inRange.length` (hiện đang là `slots.length` chưa lọc — sau khi lọc thì đây mới là con số đúng). `truncated` cũng đổi sang `inRange.length > 40` để hai field không lệch nhau. `formattedSlots` cắt 40 từ `inRange`, không từ `slots`.

### 3.5 `agent/instructions.ts`

Thêm vào khối "Current time (required)":

- Khách nói **ngày cụ thể** → gọi `check_availability` **đúng ngày đó** (tối đa ±1 ngày). Không quét 7 ngày.
- Chỉ dùng mặc định today → +7 khi khách **không** nói ngày.
- Khách hỏi **khoảng dài** (cả tuần / cả tháng) → dùng `daysWithSlots` để trả lời bằng **chữ**, hỏi khách chọn ngày, rồi mới `check_availability` lại cho đúng ngày đó.
- `truncated: true` → nói rõ "còn nhiều giờ nữa", cấm liệt kê như thể đó là tất cả.

Khối mới cho `outOfWindow`:

- `outOfWindow: true` → nói lịch chỉ mở trước bao lâu, ngày xa nhất đặt được là `bookableUntil`.
- Có `opensOn` → nói thêm: từ ngày đó khách đặt được đúng ngày họ cần. Gọi `log_lead` để chủ tiệm nhắc lại.
- Không đề xuất slot gần bừa. Khách hỏi tháng 12 mà mời đặt ngày mai là lạc đề — chỉ hỏi lại nếu khách tỏ ý linh động.
- **Không** bịa lý do "hết chỗ" khi thực chất là chưa mở lịch.

Copy hiển thị cho khách đi qua `messages/en.json` + `messages/vi.json` theo `.claude/rules/i18n.md`; instructions chỉ mô tả ý, không hardcode tiếng Việt.

---

## 4. Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| `bookingWindow` shape lạ / parse fail | Coi như `UNLIMITED`, dùng fallback 60 ngày. Không throw. |
| `booking_window` null và `raw` cũng không có | Như trên. Tenant chưa re-sync vẫn chạy được. |
| Cal trả slot ngoài range (bug #25405) | Lọc bỏ, ghi note. Không báo lỗi cho khách. |
| Cal trả rỗng **trong** cửa sổ | Đúng nghĩa "hết chỗ" — giữ nguyên copy hiện tại. |
| `start` ngoài cửa sổ | `outOfWindow: true`, không gọi Cal. |
| Cal API lỗi | Giữ nguyên đường `{ ok: false, error }` + `logAgentToolEvent` hiện có. |

Không lộ chuỗi lỗi thô của Cal ra khách (`.claude/rules/errors.md`).

---

## 5. Test

Vitest đã có sẵn (543 test / 61 file). Thêm test thuần, không cần network:

**`lib/booking-window.test.ts` (mới)**
- `calendarDays` 60 → `bookableUntil` = today + 60.
- `businessDays` 60 → bỏ cuối tuần, kết quả xa hơn calendar 60.
- `range` → trả `endDate`, `opensOn` = null.
- `null` → fallback 60 ngày.
- `opensOn`: target 2026-12-09, cửa sổ lăn 60 ngày calendar → 2026-10-10.

**`lib/calcom.test.ts` (bổ sung)**
- `parseBookingWindow` cho cả 3 `type`, mảng rỗng, shape lạ, `undefined`.

**`tests/agent-tools/check_availability.test.ts` (bổ sung)**
- **Bug #25405:** mock Cal trả slot từ hôm nay khi hỏi 9–11/12 → tool chỉ trả slot 9–11/12, `count` đúng, note đã ghi.
- `outOfWindow`: `start` vượt cửa sổ → không gọi Cal (assert fetch không được gọi), trả `bookableUntil` + `opensOn`.
- `daysWithSlots` đếm đủ ngày kể cả khi tổng slot > 40.
- Tenant chưa re-sync (`booking_window` null, `raw.bookingWindow` có) → vẫn đọc được.

**`lib/availability-slot-ui.test.ts`** — không đổi. Việc lọc range xảy ra ở tool, picker không cần biết.

Sau khi sửa: `npm run typecheck`, `npx vitest run`, và `graphify update .` theo `AGENTS.md`.

---

## 6. Ngoài phạm vi

- **Không** thêm setting giới hạn đặt lịch trong app (Cal là nguồn sự thật duy nhất — nguyên tắc 2).
- **Không** đổi `MAX_DAYS` / `MAX_SLOTS_PER_DAY` (đã chốt 1 ngày × 12 giờ; nhiều hơn làm bong bóng chat thành bức tường).
- **Không** bỏ cap 40 slot — `daysWithSlots` đã giải quyết nhu cầu mà không phải tăng payload.
- **Không** làm UI lịch tháng cho khách chọn ngày. Kênh này là chat; chọn ngày bằng câu nói.
- **Không** sửa hay workaround gì thêm cho Cal bug #25405 ngoài việc lọc phòng thủ. Nếu Cal fix, lọc trở thành no-op vô hại.

---

## 7. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| `businessDays` của Cal có thể tính ngày nghỉ lễ khác cách hiểu của mình | Chỉ bỏ T7/CN. Sai lệch làm `bookableUntil` **bảo thủ hơn** (sớm hơn), không hứa quá tay. Ghi rõ trong comment. |
| Cal fix #25405 và đổi shape response | Lọc theo ngày là kiểm tra thuần trên `start` ISO — không phụ thuộc shape. |
| Tenant đổi cửa sổ trên Cal, DB chưa sync | Fallback `raw` giúp phần nào; ngoài ra `outOfWindow` chỉ sai theo hướng bảo thủ. Không đặt nhầm được vì Cal vẫn chặn ở `book_appointment`. |
| Agent vẫn quét range rộng dù đã sửa instructions | Lọc phòng thủ + `daysWithSlots` làm câu trả lời vẫn đúng, chỉ kém tối ưu. Không có đường nào ra câu trả lời sai. |

---

## Tham khảo

- [Cal.com — Limit future bookings](https://cal.com/help/event-types/limit-future-bookings)
- [Cal.com API v2 — get an event type](https://cal.com/docs/api-reference/v2/event-types/get-an-event-type)
- [calcom/cal.com#25405 — v2 get slots for event with rolling window](https://github.com/calcom/cal.com/issues/25405)
- [Calendly — fine-tune availability settings](https://calendly.com/help/how-to-fine-tune-your-availability-settings)
