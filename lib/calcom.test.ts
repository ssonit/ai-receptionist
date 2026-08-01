/**
 * Cal.com API client integration tests.
 * Stubs global `fetch` to assert URL/payload/headers and error handling.
 * vi.resetModules() before each test gives every case a fresh module instance.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("calcom", () => {
  describe("flattenSlots", () => {
    async function getFlattenSlots() {
      return (await import("./calcom")).flattenSlots;
    }

    it("flattens string entries", async () => {
      const { flattenSlots } = await import("./calcom");
      const slots = flattenSlots({
        data: {
          "2026-08-05": ["2026-08-05T09:00:00Z", "2026-08-05T09:30:00Z"],
          "2026-08-06": ["2026-08-06T10:00:00Z"],
        },
      });
      expect(slots).toEqual([
        { start: "2026-08-05T09:00:00Z" },
        { start: "2026-08-05T09:30:00Z" },
        { start: "2026-08-06T10:00:00Z" },
      ]);
    });

    it("flattens {start,end} object entries", async () => {
      const { flattenSlots } = await import("./calcom");
      const slots = flattenSlots({
        data: {
          "2026-08-05": [{ start: "2026-08-05T09:00:00Z", end: "2026-08-05T09:30:00Z" }],
        },
      });
      expect(slots).toEqual([
        { start: "2026-08-05T09:00:00Z", end: "2026-08-05T09:30:00Z" },
      ]);
    });

    it("handles nested {data: {slots: ...}} shape", async () => {
      const { flattenSlots } = await import("./calcom");
      const slots = flattenSlots({
        data: {
          slots: { "2026-08-05": ["2026-08-05T09:00:00Z"] },
        },
      });
      expect(slots).toHaveLength(1);
    });

    it("handles empty data", async () => {
      const { flattenSlots } = await import("./calcom");
      expect(flattenSlots(null)).toEqual([]);
      expect(flattenSlots({})).toEqual([]);
      expect(flattenSlots({ data: {} })).toEqual([]);
    });

    it("skips invalid entries", async () => {
      const { flattenSlots } = await import("./calcom");
      const slots = flattenSlots({
        data: {
          "2026-08-05": [
            "",
            { start: "valid" },
            { noStart: true },
            "another-valid",
          ],
        },
      });
      expect(slots).toEqual([
        { start: "valid" },
        { start: "another-valid" },
      ]);
    });

    it("returns sorted by day", async () => {
      const { flattenSlots } = await import("./calcom");
      const slots = flattenSlots({
        data: {
          "2026-08-06": ["2026-08-06T10:00:00Z"],
          "2026-08-05": ["2026-08-05T09:00:00Z"],
        },
      });
      expect(slots[0]?.start).toContain("2026-08-05");
      expect(slots[1]?.start).toContain("2026-08-06");
    });
  });

  describe("toUtcBookingStart", () => {
    it("converts ISO with offset to UTC", async () => {
      const { toUtcBookingStart } = await import("./calcom");
      const utc = toUtcBookingStart("2026-08-05T09:00:00.000Z");
      expect(utc).toBe("2026-08-05T09:00:00Z");
    });

    it("throws on invalid date", async () => {
      const { toUtcBookingStart } = await import("./calcom");
      expect(() => toUtcBookingStart("not-a-date")).toThrow("Invalid booking start time");
    });
  });

  describe("getAvailableSlots", () => {
    it("constructs correct URL and headers", async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          status: "success",
          data: { "2026-08-05": ["2026-08-05T09:00:00Z"] },
        }), { status: 200 }),
      );
      vi.stubGlobal("fetch", fetchSpy);

      const { getAvailableSlots } = await import("./calcom");
      const slots = await getAvailableSlots({
        startDate: "2026-08-05",
        endDate: "2026-08-10",
        eventTypeId: 123,
      });

      expect(slots).toHaveLength(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("/slots?");
      expect(url).toContain("eventTypeId=123");
      expect(url).toContain("start=2026-08-05");
      expect(url).toContain("end=2026-08-10");
      expect(url).toContain("format=time");

      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(init.headers).toBeDefined();
    });

    it("falls back to username+slug when eventTypeId not set in config", async () => {
      // bookingConfig reads env at import time, so override before import
      vi.stubEnv("CALCOM_EVENT_TYPE_ID", "");
      vi.resetModules();

      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          status: "success",
          data: { "2026-08-05": [] },
        }), { status: 200 }),
      );
      vi.stubGlobal("fetch", fetchSpy);

      const { getAvailableSlots } = await import("./calcom");
      await getAvailableSlots({
        startDate: "2026-08-05",
        endDate: "2026-08-10",
        eventTypeSlug: "consultation-30",
        username: "testuser",
      });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("username=testuser");
      expect(url).toContain("eventTypeSlug=consultation-30");
    });

    it("handles non-OK response", async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Event type not found" }), { status: 404 }),
      );
      vi.stubGlobal("fetch", fetchSpy);

      const { getAvailableSlots } = await import("./calcom");
      await expect(
        getAvailableSlots({
          startDate: "2026-08-05",
          endDate: "2026-08-10",
          eventTypeId: 999,
        }),
      ).rejects.toThrow("Event type not found");
    });

    it("handles fetch abort (timeout)", async () => {
      const abortError = new DOMException("The operation was aborted", "AbortError");
      const fetchSpy = vi.fn().mockRejectedValue(abortError);
      vi.stubGlobal("fetch", fetchSpy);

      const { getAvailableSlots } = await import("./calcom");
      await expect(
        getAvailableSlots({ startDate: "2026-08-05", endDate: "2026-08-10" }),
      ).rejects.toThrow("timed out after 12s");
    });
  });

  describe("createBooking", () => {
    it("returns parsed booking result on success", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          status: "success",
          data: {
            id: 12345,
            uid: "uid_abc_123",
            status: "confirmed",
            start: "2026-08-05T09:00:00.000Z",
            meetingUrl: "https://cal.com/meeting/uid_abc_123",
            attendees: [{ name: "Test Guest", email: "guest@example.com", phoneNumber: "+84123456789" }],
            metadata: {},
          },
        }), { status: 201 }),
      ));

      const { createBooking } = await import("./calcom");
      const result = await createBooking({
        start: "2026-08-05T09:00:00Z",
        attendeeName: "Test Guest",
        attendeeEmail: "guest@example.com",
        attendeePhone: "+84123456789",
        notes: "Please call before",
        eventTypeId: 123,
      });

      expect(result.uid).toBe("uid_abc_123");
      expect(result.status).toBe("accepted");
      expect(result.meetingUrl).toContain("cal.com");

      const fetchSpy = vi.mocked(globalThis.fetch as unknown as ReturnType<typeof vi.fn>);
      const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit)?.body as string);
      expect(body.attendee.name).toBe("Test Guest");
      expect(body.attendee.email).toBe("guest@example.com");
      expect(body.attendee.phoneNumber).toBe("+84123456789");
      expect(body.metadata.notes).toBe("Please call before");
    });

    it("throws when response missing uid", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "success", data: {} }), { status: 201 }),
      ));

      const { createBooking } = await import("./calcom");
      await expect(
        createBooking({
          start: "2026-08-05T09:00:00Z",
          attendeeName: "Guest",
          attendeeEmail: "g@e.com",
        }),
      ).rejects.toThrow("missing uid");
    });
  });

  describe("retry policy", () => {
    /** Keep backoff sub-millisecond so these stay fast. */
    function stubFastBackoff() {
      vi.stubEnv("CAL_RETRY_BASE_DELAY_MS", "1");
      vi.stubEnv("CAL_RETRY_MAX_DELAY_MS", "2");
    }

    it("retries a GET on 5xx and resolves once upstream recovers", async () => {
      stubFastBackoff();
      const fetchSpy = vi
        .fn()
        .mockResolvedValueOnce(new Response("{}", { status: 500 }))
        .mockResolvedValueOnce(new Response("{}", { status: 503 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ status: "success", data: { "2026-08-05": ["2026-08-05T09:00:00Z"] } }),
            { status: 200 },
          ),
        );
      vi.stubGlobal("fetch", fetchSpy);

      const { getAvailableSlots } = await import("./calcom");
      const slots = await getAvailableSlots({
        startDate: "2026-08-05",
        endDate: "2026-08-05",
        eventTypeId: 123,
      });

      expect(slots).toHaveLength(1);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it("does not retry a GET on 4xx and preserves the upstream message", async () => {
      stubFastBackoff();
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Event type not found" }), { status: 404 }),
      );
      vi.stubGlobal("fetch", fetchSpy);

      const { getAvailableSlots } = await import("./calcom");
      const rejection = await getAvailableSlots({
        startDate: "2026-08-05",
        endDate: "2026-08-05",
        eventTypeId: 999,
      }).catch((error: unknown) => error);

      // Regression guard: p-retry hands its callbacks a context object, not the
      // error — a callback that rethrows its argument rejects with a plain
      // object and callers lose `.message`.
      expect(rejection).toBeInstanceOf(Error);
      expect((rejection as Error).message).toBe("Event type not found");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("honours CAL_RETRY_MAX_ATTEMPTS=1 as 'no retry' instead of falling back to the default", async () => {
      stubFastBackoff();
      vi.stubEnv("CAL_RETRY_MAX_ATTEMPTS", "1");
      const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 500 }));
      vi.stubGlobal("fetch", fetchSpy);

      const { getAvailableSlots } = await import("./calcom");
      await expect(
        getAvailableSlots({ startDate: "2026-08-05", endDate: "2026-08-05", eventTypeId: 1 }),
      ).rejects.toThrow("Cal.com request failed (500)");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("clamps CAL_RETRY_MAX_ATTEMPTS=0 instead of handing p-retry a negative count", async () => {
      stubFastBackoff();
      vi.stubEnv("CAL_RETRY_MAX_ATTEMPTS", "0");
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "success", data: {} }), { status: 200 }),
      );
      vi.stubGlobal("fetch", fetchSpy);

      const { getAvailableSlots } = await import("./calcom");
      // `retries: -1` would make p-retry throw "Expected `retries` to be a
      // non-negative number" on every single Cal.com GET.
      await expect(
        getAvailableSlots({ startDate: "2026-08-05", endDate: "2026-08-05", eventTypeId: 1 }),
      ).resolves.toEqual([]);
    });

    it("never retries a booking POST — a duplicate booking is worse than a failure", async () => {
      stubFastBackoff();
      const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 500 }));
      vi.stubGlobal("fetch", fetchSpy);

      const { createBooking } = await import("./calcom");
      await expect(
        createBooking({
          start: "2026-08-05T09:00:00Z",
          attendeeName: "Guest",
          attendeeEmail: "g@e.com",
          eventTypeId: 123,
        }),
      ).rejects.toThrow("Cal.com request failed (500)");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("cancelCalBooking", () => {
    it("cancels with correct URL and returns updated status", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          status: "success",
          data: { uid: "uid_abc", status: "cancelled", start: "2026-08-05T09:00:00.000Z" },
        }), { status: 200 }),
      ));

      const { cancelCalBooking } = await import("./calcom");
      const result = await cancelCalBooking({
        bookingUid: "uid_abc",
        cancellationReason: "double booked",
      });

      expect(result.status).toBe("cancelled");
      expect(result.uid).toBe("uid_abc");

      const fetchSpy = vi.mocked(globalThis.fetch as unknown as ReturnType<typeof vi.fn>);
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain("/bookings/uid_abc/cancel");
    });

    it("throws on empty bookingUid", async () => {
      const { cancelCalBooking } = await import("./calcom");
      await expect(cancelCalBooking({ bookingUid: "" })).rejects.toThrow("bookingUid is required");
    });
  });

  describe("rescheduleCalBooking", () => {
    it("reschedules with new start time", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          status: "success",
          data: { uid: "uid_abc", start: "2026-08-06T10:00:00.000Z" },
        }), { status: 200 }),
      ));

      const { rescheduleCalBooking } = await import("./calcom");
      const result = await rescheduleCalBooking({
        bookingUid: "uid_abc",
        start: "2026-08-06T10:00:00.000Z",
        reschedulingReason: "availability changed",
      });

      // parseBookingPayload returns data.start as-is (trimmed) — keep .000Z from fixture
      expect(result.start).toBe("2026-08-06T10:00:00.000Z");

      const fetchSpy = vi.mocked(globalThis.fetch as unknown as ReturnType<typeof vi.fn>);
      const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit)?.body as string);
      expect(body.reschedulingReason).toBe("availability changed");
    });
  });

  describe("withCalApiKey", () => {
    it("sets and restores the override key", async () => {
      const { requireCalApiKey, withCalApiKey } = await import("./calcom");

      const keyWithOverride = "cal_live_override_key";

      await withCalApiKey(keyWithOverride, async () => {
        const { apiKey } = requireCalApiKey();
        expect(apiKey).toBe(keyWithOverride);
      });

      // After withCalApiKey, should be back to config default
      const { apiKey } = requireCalApiKey();
      expect(apiKey).toBe(process.env.CALCOM_API_KEY);
    });

    it("restores override even on throw", async () => {
      const { requireCalApiKey, withCalApiKey } = await import("./calcom");

      await expect(
        withCalApiKey("override-key", async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");

      const { apiKey } = requireCalApiKey();
      expect(apiKey).toBe(process.env.CALCOM_API_KEY);
    });
  });
});
