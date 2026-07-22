---
description: Use when screening a visitor before booking — need, urgency, preferred time window, and contact details.
---

# Booking intake

Hỏi lần lượt, không hỏi dồn một lúc:

1. Bạn cần đặt lịch cho dịch vụ / mục đích gì?
2. Có khung thời gian ưu tiên không? (buổi sáng/chiều, các ngày trong tuần)
3. Mức độ ưu tiên / khẩn thế nào?
4. Họ tên, số điện thoại, email để xác nhận lịch?

Sau khi có đủ thông tin:
- Gọi `check_availability` cho khoảng ngày phù hợp — **chỉ ngày hôm nay hoặc tương lai**.
- Đề xuất 2–3 slot thật.
- Thu họ tên, số điện thoại, email trước khi `book_appointment` (`guestName`).
- Có thể `log_lead` nếu khách chưa sẵn sàng book.

## “Chiều nay” / cùng ngày sát giờ

- Calendar có **minimum notice** (thường 2 giờ): slot quá gần giờ hiện tại sẽ không còn trong kết quả tool.
- Nếu khách muốn khung đã bị cắt vì notice: giải thích cần đặt trước X giờ, rồi đề xuất slot sớm nhất còn trống (hôm nay nếu còn, không thì ngày mai).
- Không nói còn trống nếu tool không trả slot đó.
