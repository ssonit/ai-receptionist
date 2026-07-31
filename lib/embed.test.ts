import { describe, expect, it } from "vitest";
import {
  buildEmbedSnippets,
  formatEmbedSiteId,
  isEmbedHostAllowed,
  normalizeEmbedHost,
  parseEmbedAllowedOriginsInput,
  parseEmbedWorkspaceKey,
} from "./embed";

describe("embed", () => {
  describe("formatEmbedSiteId", () => {
    it("prepends chat_ to a bare UUID", () => {
      const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
      expect(formatEmbedSiteId(id)).toBe(`chat_${id}`);
    });

    it("keeps chat_ prefix when already present", () => {
      expect(formatEmbedSiteId("chat_hello")).toBe("chat_hello");
    });

    it("lowercases the input", () => {
      expect(formatEmbedSiteId("ABCD-1234")).toBe("chat_abcd-1234");
    });

    it("returns empty string for empty input", () => {
      expect(formatEmbedSiteId("")).toBe("");
      expect(formatEmbedSiteId("   ")).toBe("");
    });
  });

  describe("parseEmbedWorkspaceKey", () => {
    it("parses chat_<uuid> as id kind", () => {
      const uuid = "aaaaaaaa-bbbb-4000-8000-eeeeeeeeeeee";
      const r = parseEmbedWorkspaceKey(`chat_${uuid}`);
      expect(r).toEqual({ kind: "id", id: uuid });
    });

    it("parses bare uuid as id kind", () => {
      const uuid = "bbbbbbbb-bbbb-4000-8000-eeeeeeeeeeee";
      const r = parseEmbedWorkspaceKey(uuid);
      expect(r).toEqual({ kind: "id", id: uuid });
    });

    it("parses non-uuid as slug (legacy)", () => {
      const r = parseEmbedWorkspaceKey("my-spa-workspace");
      expect(r).toEqual({ kind: "slug", slug: "my-spa-workspace" });
    });

    it("lowercases slug input", () => {
      const r = parseEmbedWorkspaceKey("My-Spa");
      expect(r).toEqual({ kind: "slug", slug: "my-spa" });
    });

    it("returns null for empty/whitespace", () => {
      expect(parseEmbedWorkspaceKey("")).toBeNull();
      expect(parseEmbedWorkspaceKey("   ")).toBeNull();
    });
  });

  describe("normalizeEmbedHost", () => {
    it("extracts hostname from https URL", () => {
      expect(normalizeEmbedHost("https://example.com/page")).toBe("example.com");
    });

    it("extracts hostname from bare domain", () => {
      expect(normalizeEmbedHost("example.com")).toBe("example.com");
    });

    it("adds https:// scheme for bare domain", () => {
      expect(normalizeEmbedHost("www.example.com")).toBe("www.example.com");
    });

    it("strips trailing dot", () => {
      expect(normalizeEmbedHost("example.com.")).toBe("example.com");
    });

    it("removes port", () => {
      expect(normalizeEmbedHost("example.com:8080")).toBe("example.com");
      expect(normalizeEmbedHost("https://example.com:3000")).toBe("example.com");
    });

    it("returns null for empty input", () => {
      expect(normalizeEmbedHost("")).toBeNull();
      expect(normalizeEmbedHost("   ")).toBeNull();
    });
  });

  describe("isEmbedHostAllowed", () => {
    it("allows all when allowlist is empty", () => {
      expect(isEmbedHostAllowed("anything.com", [])).toBe(true);
      expect(isEmbedHostAllowed(null, [])).toBe(true);
    });

    it("denies when request host is missing but allowlist is set", () => {
      expect(isEmbedHostAllowed(null, ["example.com"])).toBe(false);
      expect(isEmbedHostAllowed("", ["example.com"])).toBe(false);
    });

    it("allows exact host match", () => {
      expect(isEmbedHostAllowed("example.com", ["example.com"])).toBe(true);
    });

    it("allows subdomain of allowlisted apex", () => {
      expect(
        isEmbedHostAllowed("www.example.com", ["example.com"]),
      ).toBe(true);
      expect(
        isEmbedHostAllowed("booking.example.com", ["example.com"]),
      ).toBe(true);
    });

    it("denies unrelated host", () => {
      expect(
        isEmbedHostAllowed("evil.com", ["example.com"]),
      ).toBe(false);
    });

    it("denies partial suffix match (not a subdomain)", () => {
      expect(
        isEmbedHostAllowed("notexample.com", ["example.com"]),
      ).toBe(false);
    });

    it("handles multiple allowed origins", () => {
      const allowed = ["example.com", "mysite.io"];
      expect(isEmbedHostAllowed("www.example.com", allowed)).toBe(true);
      expect(isEmbedHostAllowed("mysite.io", allowed)).toBe(true);
      expect(isEmbedHostAllowed("other.com", allowed)).toBe(false);
    });

    it("normalizes allowlist entries", () => {
      expect(
        isEmbedHostAllowed("example.com", [
          "https://example.com/path",
        ]),
      ).toBe(true);
    });
  });

  describe("parseEmbedAllowedOriginsInput", () => {
    it("splits by newline and comma", () => {
      const r = parseEmbedAllowedOriginsInput(
        "example.com\nother.com,third.com",
      );
      expect(r).toEqual(["example.com", "other.com", "third.com"]);
    });

    it("deduplicates", () => {
      const r = parseEmbedAllowedOriginsInput("a.com\na.com\nb.com");
      expect(r).toEqual(["a.com", "b.com"]);
    });

    it("filters invalid entries", () => {
      const r = parseEmbedAllowedOriginsInput("  \n example.com \n ");
      expect(r).toEqual(["example.com"]);
    });
  });

  describe("buildEmbedSnippets", () => {
    const origin = "https://eve.example.com";
    const siteId = "chat_abc-123";

    it("includes origin and siteId in HTML snippet", () => {
      const snippets = buildEmbedSnippets(origin, siteId);
      expect(snippets.html).toContain(origin);
      expect(snippets.html).toContain(siteId);
    });

    it("generates snippets for all platforms", () => {
      const snippets = buildEmbedSnippets(origin, siteId);
      expect(snippets.html).toBeTruthy();
      expect(snippets.react).toBeTruthy();
      expect(snippets.nextjs).toBeTruthy();
      expect(snippets.vue).toBeTruthy();
      expect(snippets.wordpress).toBeTruthy();
      expect(snippets.shopify).toBeTruthy();
    });
  });
});
