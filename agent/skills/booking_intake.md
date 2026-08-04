# Booking intake

Use this skill when the guest wants to book or you need contact details.

Ask one question at a time:

1. What service / purpose are they booking for?
2. Do they have preferred times? (morning/afternoon, days of week)
3. How urgent is it?
4. Full name and phone always. Email too if they're willing — it lets them self-serve cancel/reschedule later from another device.

After you have enough information:

- Call `check_availability` for a suitable date range — **today or future only**.
- Offer 2–3 real slots.
- Collect full name and phone before `book_appointment`; ask for email as well, but only insist on it if the tool returns an error saying this business requires it (`guestName`).
- **Required:** call `log_lead` when you have name + (phone or email) and they have not booked / dropped off.

- `urgency` should be one of: `low` | `normal` | `high` | `urgent`.
- After a successful `book_appointment`, the lead for the same session/phone is marked `booked` — no extra `log_lead` needed.
- After a successful book, the tool returns a one-time **manage code** (`manageCode`). Tell the guest that code once so they can cancel/reschedule later from another chat or device. Do not invent a code if the tool did not return one.

## Cancel / reschedule

- Guests do **not** need to sign in. Follow skill `booking_change` (list → manage code → OTP → staff request).
- Confirm the appointment (time / service) before calling tools. Use `bookingUid` when known; never invent one.

## Same-day / near the notice window

- The calendar has a **minimum notice** (often 2 hours): slots too close to now will not appear in tool results.
- If the guest wants a slot cut by notice: explain they must book at least X hours ahead, then offer the earliest open slot (today if any, otherwise tomorrow).
- Never say a slot is open if the tool did not return it.
