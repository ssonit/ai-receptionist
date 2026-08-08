import { describe, expect, it } from "vitest";
import { isAwaitingStaffReply } from "@/lib/staff-reply-pending";

describe("isAwaitingStaffReply", () => {
  it("is false in AI mode", () => {
    expect(
      isAwaitingStaffReply("ai", [{ role: "user" }, { role: "assistant" }]),
    ).toBe(false);
  });

  it("is true when the guest spoke last in human mode", () => {
    expect(
      isAwaitingStaffReply("human", [
        { role: "assistant" },
        { role: "user" },
      ]),
    ).toBe(true);
  });

  it("is false when staff/assistant spoke last", () => {
    expect(
      isAwaitingStaffReply("human", [
        { role: "user" },
        { role: "assistant" },
      ]),
    ).toBe(false);
  });

  it("skips handoff notices and waits after a guest message", () => {
    expect(
      isAwaitingStaffReply("human", [
        { role: "user" },
        { role: "system", metadata: { handoff: true } },
      ]),
    ).toBe(true);
  });

  it("waits when human mode only has a handoff notice", () => {
    expect(
      isAwaitingStaffReply("human", [
        { role: "system", metadata: { handoff: true } },
      ]),
    ).toBe(true);
  });
});
