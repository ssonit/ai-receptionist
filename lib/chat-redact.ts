/**
 * Redact manage codes / OTPs from persisted chat transcripts (S5).
 * Manage codes: 6 chars from A-HJ-NP-Z2-9 (no I/O/0/1).
 */
const CODE_RE = /\b[A-HJ-NP-Z2-9]{6}\b/g;
const OTP_RE = /\b\d{6}\b/g;
const MANAGE_LABEL_RE =
  /(manage\s*code|mã\s*quản\s*lý|verification\s*code|mã\s*xác\s*minh)\s*[:=]?\s*[A-HJ-NP-Z0-9]{4,8}/gi;

export function redactBookingSecrets(text: string): string {
  if (!text) return text;
  let out = text.replace(MANAGE_LABEL_RE, (m) => {
    const prefix = m.replace(/[A-HJ-NP-Z0-9]{4,8}\s*$/i, "").trimEnd();
    return `${prefix} ••••••`;
  });
  out = out.replace(
    /(code|otp|mã)\s*[:=]?\s*\d{6}\b/gi,
    (m) => m.replace(/\d{6}/, "••••••"),
  );
  // Mask standalone manage-code alphabet tokens (tool results / agent copy).
  out = out.replace(CODE_RE, "••••••");
  // Mask remaining standalone 6-digit OTPs (times use colons; phones are longer).
  out = out.replace(OTP_RE, "••••••");
  return out;
}

export function redactBookingSecretsDeep(value: unknown): unknown {
  if (typeof value === "string") return redactBookingSecrets(value);
  if (Array.isArray(value)) {
    return value.map((v) => redactBookingSecretsDeep(v));
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (
        k === "manageCode" ||
        k === "manage_code" ||
        k === "otp" ||
        k === "code"
      ) {
        out[k] = typeof v === "string" ? "••••••" : v;
      } else {
        out[k] = redactBookingSecretsDeep(v);
      }
    }
    return out;
  }
  return value;
}
