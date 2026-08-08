/**
 * Cửa sổ đặt lịch của Cal.com ("Limit future bookings").
 * Pure math — không DB, không network, để test rẻ.
 *
 * @see https://cal.com/help/event-types/limit-future-bookings
 */
import { addDaysYmd, compareYmd } from "@/agent/date-context";

/**
 * Shape của field `bookingWindow` trong Cal.com API v2 event type.
 * `rolling` phân biệt ROLLING_WINDOW ("always N days available") với ROLLING.
 * Mình coi cả hai như nhau — ROLLING_WINDOW thực tế có thể vươn xa hơn N ngày,
 * nên cách hiểu này chỉ khiến `bookableUntil` **sớm hơn** thực tế (bảo thủ, không hứa quá).
 */
export type CalBookingWindow =
  | { type: "businessDays"; value: number; rolling: boolean }
  | { type: "calendarDays"; value: number; rolling: boolean }
  | { type: "range"; startDate: string; endDate: string };

/** Trần tự đặt của Eve khi Cal không giới hạn (UNLIMITED). */
export const DEFAULT_MAX_ADVANCE_DAYS = 60;

/** Chỉ bỏ T7/CN. Cal.com có thể tính ngày lễ khác — sai lệch nghiêng về phía bảo thủ. */
function isWeekend(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}

function shiftBusinessDays(
  ymd: string,
  days: number,
  timeZone: string,
  direction: 1 | -1,
): string {
  let cursor = ymd;
  let remaining = days;
  while (remaining > 0) {
    cursor = addDaysYmd(cursor, direction, timeZone);
    if (!isWeekend(cursor)) remaining -= 1;
  }
  return cursor;
}

/** Ngày xa nhất khách có thể đặt, tính từ `today` (YYYY-MM-DD, giờ business). */
export function bookableUntil(
  window: CalBookingWindow | null,
  today: string,
  timeZone: string,
): string {
  if (!window) return addDaysYmd(today, DEFAULT_MAX_ADVANCE_DAYS, timeZone);
  if (window.type === "range") return window.endDate;
  if (window.type === "calendarDays") {
    return addDaysYmd(today, window.value, timeZone);
  }
  return shiftBusinessDays(today, window.value, timeZone, 1);
}

/**
 * Ngày sớm nhất mà cửa sổ vươn tới `target` — tức ngày khách quay lại đặt được.
 * `null` khi cửa sổ không lăn (range) hoặc không giới hạn.
 */
export function opensOn(
  window: CalBookingWindow | null,
  target: string,
  timeZone: string,
): string | null {
  if (!window || window.type === "range") return null;

  let candidate =
    window.type === "calendarDays"
      ? addDaysYmd(target, -window.value, timeZone)
      : shiftBusinessDays(target, window.value, timeZone, -1);

  // `bookableUntil` không giảm khi `today` tăng, nên chỉnh hai chiều là tìm được
  // đúng ngày sớm nhất. Giới hạn vòng lặp phòng dữ liệu Cal dị thường.
  const MAX_ADJUST = 14;
  for (let i = 0; i < MAX_ADJUST; i++) {
    if (compareYmd(bookableUntil(window, candidate, timeZone), target) >= 0) break;
    candidate = addDaysYmd(candidate, 1, timeZone);
  }
  for (let i = 0; i < MAX_ADJUST; i++) {
    const earlier = addDaysYmd(candidate, -1, timeZone);
    if (compareYmd(bookableUntil(window, earlier, timeZone), target) < 0) break;
    candidate = earlier;
  }
  return candidate;
}
