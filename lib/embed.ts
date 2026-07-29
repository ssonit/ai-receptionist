/** Public Site ID shown in dashboard / data-eve-id (`chat_<uuid>`). */
export function formatEmbedSiteId(workspaceId: string): string {
  const id = workspaceId.trim().toLowerCase();
  if (!id) return "";
  return id.startsWith("chat_") ? id : `chat_${id}`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EmbedWorkspaceKey =
  | { kind: "id"; id: string }
  | { kind: "slug"; slug: string };

/**
 * Parse `/embed/[key]` or data-eve-id / data-eve-slug values.
 * `chat_<uuid>` or bare UUID → id; otherwise slug (legacy).
 */
export function parseEmbedWorkspaceKey(raw: string): EmbedWorkspaceKey | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;

  const lower = cleaned.toLowerCase();
  const withoutPrefix = lower.startsWith("chat_") ? lower.slice(5) : lower;
  if (UUID_RE.test(withoutPrefix)) {
    return { kind: "id", id: withoutPrefix };
  }

  return { kind: "slug", slug: lower };
}

/** Strip scheme/path/port → hostname for allowlist matching. */
export function normalizeEmbedHost(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(withScheme);
    const host = url.hostname.replace(/\.$/, "");
    return host || null;
  } catch {
    const hostOnly = trimmed
      .replace(/^https?:\/\//i, "")
      .split("/")[0]
      ?.split(":")[0]
      ?.replace(/\.$/, "");
    return hostOnly || null;
  }
}

export function hostFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return normalizeEmbedHost(new URL(url).hostname);
  } catch {
    return normalizeEmbedHost(url);
  }
}

/**
 * Soft origin gate for embeds.
 * Empty allowlist → allow all. Missing Referer/Origin when allowlist set → deny.
 * Exact host or subdomain of an allowlisted apex (e.g. www.example.com vs example.com).
 */
export function isEmbedHostAllowed(
  requestHost: string | null,
  allowedOrigins: readonly string[],
): boolean {
  const allowed = allowedOrigins
    .map((o) => normalizeEmbedHost(o))
    .filter((h): h is string => Boolean(h));

  if (allowed.length === 0) return true;
  if (!requestHost) return false;

  const host = requestHost.toLowerCase();
  return allowed.some(
    (apex) => host === apex || host.endsWith(`.${apex}`),
  );
}

/** Parse textarea (one domain per line) into normalized unique hosts. */
export function parseEmbedAllowedOriginsInput(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/[\n,]+/)) {
    const host = normalizeEmbedHost(line);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    out.push(host);
  }
  return out;
}

export function buildEmbedSnippets(origin: string, siteId: string) {
  const src = `${origin}/embed.js`;
  const html = `<script src="${src}"\n        data-eve-id="${siteId}" async></script>`;

  return {
    html,
    react: `import { useEffect } from "react";\n\nexport function EveChat() {\n  useEffect(() => {\n    const s = document.createElement("script");\n    s.src = "${src}";\n    s.async = true;\n    s.setAttribute("data-eve-id", "${siteId}");\n    document.body.appendChild(s);\n    return () => {\n      s.remove();\n      document.getElementById("eve-embed-root")?.remove();\n    };\n  }, []);\n  return null;\n}`,
    nextjs: `import Script from "next/script";\n\nexport function EveChat() {\n  return (\n    <Script\n      src="${src}"\n      data-eve-id="${siteId}"\n      strategy="afterInteractive"\n    />\n  );\n}`,
    vue: `<script setup>\nimport { onMounted, onBeforeUnmount } from "vue";\n\nonMounted(() => {\n  const s = document.createElement("script");\n  s.src = "${src}";\n  s.async = true;\n  s.setAttribute("data-eve-id", "${siteId}");\n  document.body.appendChild(s);\n  onBeforeUnmount(() => {\n    s.remove();\n    document.getElementById("eve-embed-root")?.remove();\n  });\n});\n</script>`,
    wordpress: `<!-- Appearance → Widgets / Custom HTML, or a page block -->\n${html}`,
    shopify: `{% comment %} theme.liquid — before </body> {% endcomment %}\n${html}`,
  } as const;
}

export type EmbedSnippetPlatform = keyof ReturnType<typeof buildEmbedSnippets>;
