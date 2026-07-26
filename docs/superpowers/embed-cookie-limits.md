### Embed visitor cookies: limits and design

`eve_visitor_id` mặc định đang dùng `SameSite=Lax`. Khi khách vào qua iframe nhúng cross-site, trình duyệt **không** gửi cookie Lax cho các request trong iframe.

Để iframe hoạt động được trong Chrome và phần lớn trình duyệt hiện đại, embed `/embed` chuyển sang:

- `eve_visitor_id`: `SameSite=None; Secure` (chỉ cho `/embed` và các route proxy liên quan).
- `eve_w`: mirror lại `SameSite=None; Secure` khi chạy trong chế độ embed.
- `/chat` và các đường dẫn gốc khác vẫn giữ `SameSite=Lax` để tránh nới lỏng bảo mật toàn hệ thống.

Ngay cả với cấu hình này, **Safari ITP / Firefox TCP** có thể vẫn chặn hoặc làm suy giảm hành vi cookie trong iframe cross-site. Đây là **giới hạn kỹ thuật của trình duyệt**, không phải lỗi riêng của app.

#### Hướng dài hạn

- **Storage Access API**: cho phép yêu cầu quyền truy cập cookie trong context nhúng, tương thích dần với các giới hạn privacy mới.
- **Reverse proxy same-origin**: phục vụ widget từ cùng origin với trang chứa, biến luồng nhúng thành same-site để tránh hoàn toàn các chặn cookie bên thứ ba.

Trong mọi trường hợp, **không nới lỏng verification ladder**: các bước xác minh A/B/C (mã quản lý, OTP, v.v.) vẫn là hàng rào bảo vệ chính cho huỷ/đổi lịch và các hành động nhạy cảm. Embed chỉ giúp đặt/hỏi lịch thuận tiện hơn, không được phép “đặc quyền” hơn so với khách truy cập trực tiếp.

