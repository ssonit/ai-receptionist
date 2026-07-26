# Resend — verify domain gửi mail

> Bắt buộc trước khi bật `booking_reminders_enabled` cho tenant thật.
> Chưa làm = reminder + OTP vào spam = tính năng coi như không tồn tại.

## Vì sao

`lib/email.ts` gửi qua Resend. Domain trong `EVE_MAIL_FROM` chưa verify thì
Resend vẫn có thể trả thành công nhưng Gmail/Outlook đẩy spam / chặn.
Không có lỗi rõ trong app log.

## Các bước

1. https://resend.com → **Domains → Add Domain**.
2. Dùng subdomain riêng (vd `mail.yourdomain.com`) để tách danh tiếng gửi mail.
3. Thêm DNS Resend hiện: SPF (TXT), DKIM (TXT/CNAME), MX (bounce).
4. Đợi Verified (vài phút → 48h).
5. Thêm DMARC thủ công tại `_dmarc.yourdomain.com`:
   `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com`
6. Cập nhật `EVE_MAIL_FROM=Eve <no-reply@mail.yourdomain.com>`
7. Set `RESEND_API_KEY` + `EVE_MAIL_FROM` trên Vercel (Preview + Production).

## Kiểm chứng

- [ ] Domain **Verified** trên Resend
- [ ] Gửi thử Gmail → Inbox (không Spam); Show original → SPF/DKIM/DMARC PASS
- [ ] Gửi thử Outlook/Hotmail
- [ ] https://www.mail-tester.com ≥ 8/10

## Cảnh báo

- Không dùng domain chính cho transactional lúc đầu.
- Không bật `booking_reminders_enabled` khi checklist chưa xanh.
- Kiểm tra hạn mức free tier trước khi bật nhiều tenant.
