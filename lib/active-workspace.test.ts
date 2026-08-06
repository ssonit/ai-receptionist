/**
 * The pure half of active-workspace resolution. No database, no cookies —
 * this is where the security rule lives: the picker can only ever return a
 * workspace present in the caller's membership list.
 */
import { describe, expect, it } from "vitest";
import { pickActiveWorkspace, type WorkspaceMembership } from "./active-workspace";

const ALPHA = "11111111-1111-4111-8111-111111111111";
const BRAVO = "22222222-2222-4222-8222-222222222222";
const STRANGER = "33333333-3333-4333-8333-333333333333";

const memberships: WorkspaceMembership[] = [
  { workspaceId: ALPHA, role: "owner" },
  { workspaceId: BRAVO, role: "staff" },
];

describe("pickActiveWorkspace", () => {
  it("honours a cookie naming a workspace the user belongs to", () => {
    expect(pickActiveWorkspace(BRAVO, ALPHA, memberships)).toEqual({
      workspaceId: BRAVO,
      role: "staff",
    });
  });

  it("ignores a cookie naming a workspace the user does not belong to", () => {
    // The whole security property: a forged or stale cookie must never grant
    // access. It falls back rather than being honoured.
    expect(pickActiveWorkspace(STRANGER, ALPHA, memberships)).toEqual({
      workspaceId: ALPHA,
      role: "owner",
    });
  });

  it("falls back to the last-used workspace when there is no cookie", () => {
    expect(pickActiveWorkspace(null, BRAVO, memberships)).toEqual({
      workspaceId: BRAVO,
      role: "staff",
    });
  });

  it("falls back to the first membership when neither cookie nor last-used is usable", () => {
    expect(pickActiveWorkspace(null, STRANGER, memberships)).toEqual({
      workspaceId: ALPHA,
      role: "owner",
    });
    expect(pickActiveWorkspace("", null, memberships)).toEqual({
      workspaceId: ALPHA,
      role: "owner",
    });
  });

  it("returns null when the user belongs to nothing", () => {
    expect(pickActiveWorkspace(ALPHA, ALPHA, [])).toBeNull();
  });

  it("tolerates surrounding whitespace in the cookie", () => {
    expect(pickActiveWorkspace(` ${BRAVO} `, null, memberships)).toEqual({
      workspaceId: BRAVO,
      role: "staff",
    });
  });
});
