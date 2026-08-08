/**
 * getAiBookingEventType phải trả bookingWindow từ cột chuyên dụng,
 * và fallback sang `raw` cho tenant chưa re-sync.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "../helpers/supabase-mock";

const WS_ID = "11111111-1111-4000-8000-111111111111";

function seedWorkspace() {
  supabaseMock.seed("workspaces", [
    {
      id: WS_ID,
      name: "Salon",
      slug: "salon",
      timezone: "Asia/Ho_Chi_Minh",
      cal_event_type_id: 555,
      cal_event_type_slug: "cut-30",
      cal_username: "salon-cal",
      cal_api_key_encrypted: null,
      service_mode: "onsite",
    },
  ]);
}

function seedEventType(extra: Record<string, unknown>) {
  supabaseMock.seed("workspace_event_types", [
    {
      id: "evt-1",
      workspace_id: WS_ID,
      cal_event_type_id: 555,
      title: "Cut",
      slug: "cut-30",
      length_minutes: 30,
      minimum_notice_minutes: 120,
      is_ai_booking: true,
      booking_window: null,
      raw: null,
      ...extra,
    },
  ]);
}

beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
});

describe("getAiBookingEventType bookingWindow", () => {
  it("reads the dedicated booking_window column", async () => {
    seedWorkspace();
    seedEventType({
      booking_window: { type: "calendarDays", value: 60, rolling: true },
    });

    const { getAiBookingEventType } = await import("@/lib/workspace-cal");
    const result = await getAiBookingEventType(WS_ID);

    expect(result?.bookingWindow).toEqual({
      type: "calendarDays",
      value: 60,
      rolling: true,
    });
  });

  it("falls back to raw.bookingWindow when the column is null", async () => {
    seedWorkspace();
    seedEventType({
      booking_window: null,
      raw: { bookingWindow: [{ type: "businessDays", value: 30, rolling: false }] },
    });

    const { getAiBookingEventType } = await import("@/lib/workspace-cal");
    const result = await getAiBookingEventType(WS_ID);

    expect(result?.bookingWindow).toEqual({
      type: "businessDays",
      value: 30,
      rolling: false,
    });
  });

  it("returns null bookingWindow when neither source has one", async () => {
    seedWorkspace();
    seedEventType({ booking_window: null, raw: { id: 555 } });

    const { getAiBookingEventType } = await import("@/lib/workspace-cal");
    const result = await getAiBookingEventType(WS_ID);

    expect(result?.bookingWindow).toBeNull();
  });
});
