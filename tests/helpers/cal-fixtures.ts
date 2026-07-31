/** Fixture response for GET /v2/slots — string entries. */
export function slotsResponseStr(slots: string[]) {
  return {
    status: "success",
    data: Object.fromEntries(
      slots.map((s) => [s, { time: s, attendees: 0, bookingUid: null }]),
    ),
  };
}

/** Fixture response for GET /v2/slots — object entries with {start, end}. */
export function slotsResponseObj(
  slots: { start: string; end: string }[],
) {
  return {
    status: "success",
    data: Object.fromEntries(
      slots.map((s) => [
        s.start,
        { ...s, attendees: 0, bookingUid: null },
      ]),
    ),
  };
}

/** Fixture response for POST /v2/bookings. */
export function bookingCreatedResponse(uid: string) {
  return {
    status: "success",
    data: {
      id: 12345,
      uid,
      status: "confirmed",
      startTime: "2026-08-05T09:00:00.000Z",
      endTime: "2026-08-05T09:30:00.000Z",
      meetingUrl: `https://cal.com/meeting/${uid}`,
      attendees: [
        {
          name: "Test Guest",
          email: "guest@example.com",
          phoneNumber: "+84123456789",
        },
      ],
      metadata: {},
    },
  };
}

/** Paginated bookings list — single page, no next cursor. */
export function listBookingsPage(
  bookings: Array<{
    id: number;
    uid: string;
    status: string;
    startTime: string;
  }>,
  nextCursor: string | null = null,
) {
  return {
    status: "success",
    data: {
      bookings,
      pagination: { nextCursor, count: bookings.length },
    },
  };
}
