### Guest chat realtime — hiện trạng và hướng sau này

**Trạng thái: hoãn có chủ đích (2026-08-08).** Chưa có khách hàng thật; chi phí làm bây giờ lớn hơn lợi ích. Ghi lại ở đây để khỏi tra cứu lại từ đầu khi tới lúc cần.

## Hiện trạng

Cả hai chiều đều dùng poll 10s, không phải push:

- Khách → thấy tin nhân viên: poll 10s ([`app/_components/agent-chat.tsx:730`](../../app/_components/agent-chat.tsx)).
- Nhân viên → thấy tin khách (đang mở sẵn hội thoại): poll 10s ([`components/conversation-detail-sheet.tsx:335`](../../components/conversation-detail-sheet.tsx)).
- Nhân viên **không** bị mù tin nhắn khi đóng hội thoại: `conversation_needs_reply` bắn qua Supabase Realtime tới chuông thông báo ([`components/notifications-bell.tsx:76`](../../components/notifications-bell.tsx)), debounce 5 phút/hội thoại.
- Trả lời của agent (chiều AI) **không** dính poll — vẫn stream token-by-token qua SSE của lượt chat đang mở.

Nên "chậm" chỉ xảy ra khi **có người thật đang cầm hội thoại** và hai bên gõ qua lại nhanh — một lượt hỏi–đáp có thể mất tới ~20s chờ cộng dồn. Đây là ca hẹp, không phải trải nghiệm mặc định.

## Vì sao chưa làm

0 khách = 0 thiệt hại thật từ 10s. Làm realtime đúng cho khách ẩn danh tốn một endpoint ký JWT + một RLS policy + xử lý refresh token — công sức không nhỏ để đổi lấy một vấn đề chưa ai gặp phải.

**Mốc quay lại làm** (chạm một trong ba là đủ lý do):

1. Nhân viên bắt đầu dùng tính năng tiếp quản (`reply_mode: "human"`) thường xuyên, không chỉ occasionally.
2. Có người phàn nàn chat cảm giác "đơ" / chậm.
3. Một lượt trả lời chậm làm mất một booking thật.

## Spec cũ nói gì — và chỗ thiếu

[`specs/2026-08-03-staff-reply-handoff-design.md`](specs/2026-08-03-staff-reply-handoff-design.md) mục "Web delivery: polling" kết luận **Supabase Realtime bất khả thi cho khách**: khách ẩn danh (`visitor_id`, không có `auth.uid()`) → muốn subscribe `chat_messages` phải mở policy anon → đụng luật cấm `using (true)` trên bảng tenant ([`.claude/rules/architecture.md`](../../.claude/rules/architecture.md)).

**Lập luận đó đúng, nhưng chỉ đúng cho `postgres_changes`.** Nó không tính tới cơ chế thứ hai của Supabase Realtime: **Broadcast + private channel**. Kết luận "bất khả thi" trong spec cũ nên đọc là "bất khả thi với cách làm đã xét", không phải "không có cách nào".

## Hướng dài hạn: Broadcast private channel

Khác biệt cốt lõi so với `postgres_changes`:

- RLS đặt trên bảng `realtime.messages`, **không phải** trên `chat_messages` — khách không bao giờ có quyền đọc trực tiếp bảng tenant nào. Không đụng luật `using (true)`.
- Policy đọc **claim tuỳ ý** trong JWT qua `current_setting('request.jwt.claims')`, không cần `auth.uid()`. Ký một JWT ngắn hạn chứa `chat_session_id`, policy so khớp với `realtime.topic()`.
- Client: `supabase.realtime.setAuth(token)` rồi `channel({ config: { private: true } })`. JWT bắt buộc có `exp` và `role`.
- Poll hiện tại giữ làm fallback khi realtime rớt — đúng khuôn mẫu đã chạy ở `notifications-bell.tsx`: Realtime là chính, poll chậm là lưới an toàn, không phải phát minh thêm.

**Bài học từ Crisp** (áp dụng trực tiếp): họ không mở WebSocket cho mọi khách ghé trang — chỉ mở cho khách **đã thật sự chat**. Map vào đây: chỉ subscribe Broadcast channel khi `reply_mode === "human"`, không phải cho mọi phiên `/b/[slug]`.

**Cần verify trước khi bắt tay implement** (chưa kiểm chứng — làm việc này đầu tiên, đừng để phát hiện giữa chừng lúc code):

- Supabase local (`npx supabase start`) và project production có bảng `realtime.messages` + hỗ trợ private channel không.
- Nếu không có: phương án lùi là chỉ rút ngắn poll phía khách xuống ~2s, và chỉ khi `reply_mode === "human"` — không đụng RLS, không cần JWT riêng.

## Nguồn tham khảo

- [Crisp — WebSocket per visitor, suy giảm ở traffic cao](https://help.crisp.chat/en/article/what-happens-to-my-chatbox-if-my-website-is-high-traffic-1dt73od/)
- [Intercom — định danh khách ẩn danh qua cookie](https://www.intercom.com/help/en/articles/167-install-intercom-for-visitors-and-leads-on-web)
- [Supabase — Realtime Authorization (Broadcast private channel)](https://supabase.com/docs/guides/realtime/authorization)
- [Supabase — Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
