/**
 * SQL LIKE wildcard escaping.
 * Behaviour verified against Postgres:
 *   select 'johnXdoe@x.com' ilike 'john_doe@x.com';   -- t
 *   select 'johnXdoe@x.com' ilike 'john\_doe@x.com';  -- f
 *   select 'john_doe@x.com' ilike 'john\_doe@x.com';  -- t
 */
import { describe, expect, it } from "vitest";
import { containsLikePattern, escapeLikePattern } from "./sql-like";

/** Mirror of Postgres LIKE semantics, backslash as the escape character. */
function likeMatches(value: string, pattern: string): boolean {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\") {
      re += pattern[++i]?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") ?? "";
    } else if (ch === "%") re += ".*";
    else if (ch === "_") re += ".";
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i").test(value);
}

describe("escapeLikePattern", () => {
  it("escapes the wildcard characters", () => {
    expect(escapeLikePattern("john_doe@x.com")).toBe("john\\_doe@x.com");
    expect(escapeLikePattern("a%b")).toBe("a\\%b");
    expect(escapeLikePattern("back\\slash")).toBe("back\\\\slash");
  });

  it("leaves an ordinary value alone", () => {
    expect(escapeLikePattern("johndoe@x.com")).toBe("johndoe@x.com");
  });

  it("stops an underscore from matching a stranger's email", () => {
    const victim = "johnXdoe@x.com";
    const attacker = "john_doe@x.com";

    // The bug: an ordinary underscore acted as a single-character wildcard,
    // so tier A+ auto-claimed someone else's booking.
    expect(likeMatches(victim, attacker)).toBe(true);
    expect(likeMatches(victim, escapeLikePattern(attacker))).toBe(false);
    // …while still matching its own literal value, case-insensitively.
    expect(likeMatches("john_doe@x.com", escapeLikePattern(attacker))).toBe(true);
    expect(likeMatches("JOHN_DOE@X.COM", escapeLikePattern(attacker))).toBe(true);
  });

  it("stops a percent from matching every address on a domain", () => {
    expect(likeMatches("anyone@x.com", "a%@x.com")).toBe(true);
    expect(likeMatches("anyone@x.com", escapeLikePattern("a%@x.com"))).toBe(false);
  });
});

describe("containsLikePattern", () => {
  it("keeps substring search working", () => {
    expect(likeMatches("Nguyen Van A", containsLikePattern("van"))).toBe(true);
    expect(likeMatches("Nguyen Van A", containsLikePattern("xyz"))).toBe(false);
  });

  it("searches a literal underscore instead of blanking it out", () => {
    const pattern = containsLikePattern("john_doe");
    expect(likeMatches("mail: john_doe@x.com", pattern)).toBe(true);
    expect(likeMatches("mail: johnXdoe@x.com", pattern)).toBe(false);
  });
});
