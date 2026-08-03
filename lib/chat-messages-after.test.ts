import { describe, expect, it } from "vitest";
import { decodeMessageCursor, encodeMessageCursor } from "./chat-sessions";

describe("message cursors", () => {
  it("round-trips a cursor", () => {
    const cursor = encodeMessageCursor({
      createdAt: "2026-08-03T10:00:00.000Z",
      id: "m1",
    });
    expect(decodeMessageCursor(cursor)).toEqual({
      createdAt: "2026-08-03T10:00:00.000Z",
      id: "m1",
    });
  });

  it("rejects a malformed cursor instead of throwing", () => {
    expect(decodeMessageCursor("not-a-cursor")).toBeNull();
  });
});
