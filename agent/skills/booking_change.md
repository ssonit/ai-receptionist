# Booking change (cancel / reschedule)

Use when the guest wants to list, cancel, or move an existing appointment.

**No login.** Ownership is proven in this order:

1. `list_my_appointments` — appointments already claimable in this chat.
2. Manage code from booking confirmation → `verify_booking_code` (`manage_code`).
3. Email OTP → `request_booking_otp` then `verify_booking_code` (`email_otp`). Never reveal whether the email has a booking.
4. Same browser, other chat (`needsPhoneLast4`) → last 4 digits of booking phone → `verify_booking_code` (`phone_last4`).
5. Still stuck → `request_booking_change` (staff). Do **not** say the booking was cancelled.

Then:

- Cancel: confirm which appointment → `cancel_appointment`.
- Reschedule: `check_availability` → confirm new slot → `reschedule_appointment` with `newStart`.

Never invent booking UIDs. Never dump tool/DB error strings to the guest.
