# Kịch bản chat test — lịch trống ngày xa

Kịch bản thủ công cho tính năng far-date availability (`outOfWindow`,
`daysWithSlots`, `bookableUntil`, `opensOn`, lưới giờ 1 ngày). Không thay thế
`docs/SMOKE.md` — bổ sung phần ngày xa mà mục "Agent FAQ + đặt lịch" ở đó
không đủ chi tiết.

Nguồn: [design](specs/2026-08-08-far-date-availability-design.md) ·
[plan](plans/2026-08-08-far-date-availability.md) Task 7.

## Trước khi chạy

- **Test trên `/b/[slug]` của một workspace tenant thật**, không phải `/chat`
  (Pilot demo dùng chung sandbox qua env `CALCOM_API_KEY` — khó chủ động đổi
  "Limit future bookings" riêng cho từng kịch bản mà không ảnh hưởng người
  khác đang dùng chung sandbox đó). Workspace cần đã nối Cal.com + đã chọn AI
  booking meeting type.
- **Đừng đổi "Limit future bookings" trên một event type khách hàng thật
  đang dùng** — dùng workspace/sandbox riêng cho việc test.
- Bật xem tool output thô, để đối chiếu field thật (`outOfWindow`,
  `daysWithSlots`, `bookableUntil`, `opensOn`, `truncated`) thay vì chỉ đoán
  qua lời agent. Thêm vào `.env.local`, restart `npm run dev`:

  ```
  NEXT_PUBLIC_EVE_SHOW_TOOL_CALLS=true
  ```

  Mỗi lần agent gọi `check_availability`, chat hiện khối "Tool" xổ ra được —
  mở để xem input/output JSON.
- Cấu hình "Limit future bookings" cần trên **event type Cal.com** đang làm
  AI booking type (Cal.com → Event Types → chọn event → tab **Limits**),
  tuỳ nhóm kịch bản:

  | Nhóm | Cần set trên Cal.com | Không set thì sao |
  |---|---|---|
  | A, B, E, F | Không cần (mặc định UNLIMITED) | — |
  | C | Bật → **Rolling**, ví dụ 60 calendar days | Không test được `outOfWindow` |
  | D | Bật → **Within a date range**, chọn khoảng cố định | Không test được `opensOn: null` |
  | G | Tắt hẳn (mặc định) | — |

- **Cách tính "một ngày ngoài cửa sổ":** hôm nay + số ngày đã set trên
  Cal.com + vài ngày dư ra. Ví dụ set 60 ngày, hôm nay 8/8/2026 → cửa sổ
  đóng ở 7/10/2026 → hỏi ngày sau đó, ví dụ **9/12/2026**, phải ra
  `outOfWindow: true`.

---

## Nhóm A — Regression: hỏi ngày gần

Đổi gì cũng không được hỏng luồng cũ.

Câu gõ:
> "Tuần này còn giờ nào trống không?"
> "Ngày mai có lịch không?"

Kỳ vọng:
- Agent gọi `check_availability`, không bịa slot.
- Lưới giờ hiện đúng **1 ngày**, có giờ để bấm.
- Không có `outOfWindow` trong tool output.

**Sai nếu:** agent liệt kê nhiều ngày bằng bullet list trong tin nhắn (lưới
chỉ nên 1 ngày, ngày khác nói bằng chữ ngắn nếu có).

## Nhóm B — Ngày cụ thể, xa nhưng còn trong cửa sổ

Rủi ro chính đã tìm thấy trong thiết kế: lưới chỉ hiện **1 ngày**
(`MAX_DAYS: 1`), lấy ngày sớm nhất trong kết quả tool — nếu agent quét rộng
thay vì hỏi đúng ngày, lưới có thể hiện nhầm sang hôm nay.

Câu gõ (đổi thành một thứ trong tuần sau, cách hôm nay 5–10 ngày):
> "Thứ 5 tuần sau có giờ nào không?"
> "Cho tôi xem lịch ngày 20/8 nhé" *(đổi 20/8 thành ngày thật)*

Kỳ vọng:
- Lưới giờ hiện **đúng ngày khách hỏi** — đối chiếu `dayLabel` trên UI với
  ngày đã gõ.
- Tool output: `startDate`/`endDate` sát ngày hỏi, không phải quét 7 ngày từ
  hôm nay.

**Sai nếu:** lưới hiện giờ của **hôm nay** thay vì ngày khách hỏi, hoặc
`startDate` trong tool output là hôm nay.

## Nhóm C — Ngày ngoài cửa sổ (rolling window)

Cần: Cal.com đã bật Rolling window (xem bảng setup).

Câu gõ:
> "Ngày 9/12/2026 còn trống giờ nào không?"

Kỳ vọng:
- Agent **không** nói "hết chỗ" / "đã kín lịch".
- Agent nói rõ lịch hiện chỉ mở tới một ngày nào đó (khớp `bookableUntil`),
  và khách có thể đặt đúng ngày họ hỏi kể từ ngày nào (khớp `opensOn`).
- Agent đề nghị lưu lại để nhắc (`log_lead`).
- Tool output: `outOfWindow: true`.

**Sai nếu:** agent nói "hết chỗ rồi", bịa lý do khác, hoặc mời khách chọn
giờ hôm nay/mai (lạc đề với câu hỏi tháng 12).

## Nhóm D — Ngày ngoài cửa sổ, cửa sổ cố định (range)

Cần: Cal.com set "Within a date range" (không lăn).

Câu gõ: hỏi một ngày sau `endDate` đã cấu hình trên Cal.com.

Kỳ vọng:
- Agent nói rõ ngày xa nhất đặt được (`bookableUntil`).
- Agent **không** hứa "sẽ mở lại vào ngày X" — cửa sổ range không tự lăn,
  `opensOn` phải là `null`.

**Sai nếu:** agent bịa ra một ngày "sẽ mở" trong khi cửa sổ là range cố định.

## Nhóm E — Hỏi cả khoảng ngày, không chỉ 1 ngày

Câu gõ:
> "Tuần sau còn ngày nào trống không?"
> "Tháng sau bên mình còn lịch trống không?"

Kỳ vọng:
- Agent trả lời **bằng chữ** những ngày còn trống (dựa trên
  `daysWithSlots`), không dump toàn bộ slot thành danh sách dài.
- Agent hỏi lại khách muốn chọn ngày nào.
- Khách chọn 1 ngày → agent gọi lại `check_availability` cho đúng ngày đó →
  lưới mới hiện ra.

**Sai nếu:** agent liệt kê giờ của nhiều ngày trong text (đáng lẽ phải hỏi
lại trước), hoặc lưới hiện ra ngay mà không hỏi chọn ngày nào.

## Nhóm F — Sát giờ / trong ngày (regression logic cũ)

Câu gõ (test lúc gần cuối giờ làm việc):
> "Chiều nay còn giờ nào không?"

Kỳ vọng: agent giải thích quy tắc báo trước tối thiểu nếu giờ khách muốn đã
quá sát, gợi ý giờ sớm nhất còn lại. Logic này không đổi trong lần này — test
để chắc thay đổi mới không phá nó.

## Nhóm G — Không giới hạn gì trên Cal.com, hỏi rất xa

Cần: Cal.com **tắt** Limit future bookings (mặc định).

Câu gõ:
> "Cho tôi hỏi lịch ngày 1/1/2028 được không?" *(hơn 1 năm nữa)*

Kỳ vọng: agent clamp về trần 60 ngày mặc định của hệ thống (không phải của
Cal.com) — hành vi giống nhóm C: `outOfWindow: true`, `bookableUntil` ≈ hôm
nay + 60 ngày. `opensOn` phải là `null` (đây là trần tự đặt của Eve, không
phải cấu hình lăn thật trên Cal).

**Sai nếu:** agent nói "hết chỗ" thay vì "lịch chỉ mở trước tới ngày X", hoặc
hứa "sẽ mở vào ngày Y".

## Nhóm H — (Nâng cao, không bắt buộc) Cal.com trả sai range

Bug đang mở của Cal.com: event type bật rolling window đôi khi khiến
endpoint slots bỏ qua `start`, trả về cả slot từ hôm nay. App đã có hàng rào
lọc lại trong `agent/tools/check_availability.ts`, nhưng chỉ quan sát được
nếu Cal thật sự trả sai — không tự ép xảy ra qua chat được.

Nếu tình cờ thấy trong khối Tool (đã bật ở bước setup) một ghi chú kiểu
`Filtered N slots outside ... (Cal.com returned days beyond the requested
range)` — đó là hàng rào đang hoạt động đúng, không phải lỗi của app.

## Kênh Messenger / Zalo

Không test qua trình duyệt được (không có lưới bấm giờ, chỉ liệt kê 2–3 slot
bằng text). Dùng `npm run zalo:sim` + mục "Zalo OA" trong
`.claude/skills/test-feature/SKILL.md`.

## Biến thể tiếng Anh (locale)

Đổi cookie `eve_guest_locale` hoặc gõ thẳng tiếng Anh, để chắc agent trả lời
tiếng Anh và câu `outOfWindow` đọc tự nhiên:
> "Do you have anything open on December 9th, 2026?"

---

## Nhật ký chạy

| Ngày | Nhóm đã chạy | Kết quả | Ghi chú |
|---|---|---|---|
| — | — | — | chưa có lần chạy nào được ghi |

## Liên quan

- Design: [`specs/2026-08-08-far-date-availability-design.md`](specs/2026-08-08-far-date-availability-design.md)
- Plan: [`plans/2026-08-08-far-date-availability.md`](plans/2026-08-08-far-date-availability.md)
- Smoke checklist tổng: [`../SMOKE.md`](../SMOKE.md) — mục "Agent FAQ + đặt lịch"
