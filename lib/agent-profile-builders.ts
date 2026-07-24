/**
 * Loose parse/serialize for business_hours + services_summary.
 * Builders prefer bullet lines; unknown freeform stays editable as raw text.
 */

export function parseBulletLines(raw: string | null | undefined): string[] {
  const text = (raw ?? "").trim();
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

export function serializeBulletLines(items: string[]): string {
  const cleaned = items.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  return cleaned.map((line) => `- ${line}`).join("\n");
}

/**
 * True when every non-empty line looks like a short bullet/plain line
 * (not a long prose paragraph). Used to decide builder vs raw textarea.
 */
export function looksLikeBulletList(raw: string | null | undefined): boolean {
  const text = (raw ?? "").trim();
  if (!text) return true;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return true;
  // Single long paragraph without bullets → raw mode
  if (lines.length === 1 && lines[0].length > 120 && !/^[-*•]/.test(lines[0])) {
    return false;
  }
  return lines.every((line) => line.length <= 160);
}

export function parseServiceTags(raw: string | null | undefined): string[] {
  const text = (raw ?? "").trim();
  if (!text) return [];
  const lines = parseBulletLines(text);
  if (lines.length > 1) return lines;
  // Single line may be comma-separated
  if (lines.length === 1 && lines[0].includes(",")) {
    return lines[0]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return lines;
}

export function serializeServiceTags(tags: string[]): string {
  return serializeBulletLines(tags);
}
