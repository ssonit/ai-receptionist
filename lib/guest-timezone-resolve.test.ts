import { describe, expect, it } from "vitest";
import { supabaseMock } from "../tests/helpers/supabase-mock";
import { resolveGuestTimeZone } from "./guest-timezone-resolve";

describe("guest-timezone-resolve", () => {
  describe("resolveGuestTimeZone", () => {
    it("returns session tz when chat_sessions.guest_timezone is set", async () => {
      supabaseMock.seed("chat_sessions", [
        { id: "session-1", guest_timezone: "Asia/Tokyo" },
      ]);

      const result = await resolveGuestTimeZone({ chatSessionId: "session-1" });
      expect(result.guestTimeZone).toBe("Asia/Tokyo");
      expect(result.source).toBe("session");
    });

    it("falls back to header when no session tz", async () => {
      supabaseMock.seed("chat_sessions", [
        { id: "session-2", guest_timezone: null },
      ]);

      const result = await resolveGuestTimeZone({
        chatSessionId: "session-2",
        auth: { attributes: { guestTimeZone: "America/New_York" } },
      });
      expect(result.guestTimeZone).toBe("America/New_York");
      expect(result.source).toBe("header");
    });

    it("falls back to header when no sessionId at all", async () => {
      const result = await resolveGuestTimeZone({
        auth: { attributes: { guestTimeZone: "Europe/Paris" } },
      });
      expect(result.guestTimeZone).toBe("Europe/Paris");
      expect(result.source).toBe("header");
    });

    it("returns null when no tz available", async () => {
      const result = await resolveGuestTimeZone({});
      expect(result.guestTimeZone).toBeNull();
      expect(result.source).toBeNull();
    });

    it("returns null when header tz is invalid", async () => {
      const result = await resolveGuestTimeZone({
        auth: { attributes: { guestTimeZone: "junk" } },
      });
      expect(result.guestTimeZone).toBeNull();
      expect(result.source).toBeNull();
    });

    it("reads chatSessionId from auth attributes when not provided directly", async () => {
      supabaseMock.seed("chat_sessions", [
        { id: "session-auth", guest_timezone: "Asia/Bangkok" },
      ]);

      const result = await resolveGuestTimeZone({
        auth: { attributes: { chatSessionId: "session-auth" } },
      });
      expect(result.guestTimeZone).toBe("Asia/Bangkok");
      expect(result.source).toBe("session");
    });
  });
});
