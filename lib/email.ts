/**
 * Transactional email via Resend (optional). Missing key → { ok: false }.
 */
export type SendTransactionalEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  locale?: "en" | "vi";
};

export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput,
): Promise<{ ok: boolean; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.EVE_MAIL_FROM?.trim() || "Eve <no-reply@localhost>";

  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY missing — skip send");
    return { ok: false };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[email] Resend failed", res.status, body.slice(0, 200));
      return { ok: false };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: json.id };
  } catch (error) {
    console.error("[email] send failed", error);
    return { ok: false };
  }
}

export function bookingOtpEmailCopy(input: {
  code: string;
  locale: "en" | "vi";
  workspaceName?: string;
}): { subject: string; html: string; text: string } {
  const name = input.workspaceName?.trim() || "Eve";
  if (input.locale === "vi") {
    return {
      subject: `${name}: mã xác minh lịch hẹn`,
      text: `Mã xác minh của bạn là ${input.code}. Có hiệu lực 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
      html: `<p>Mã xác minh của bạn là <strong>${input.code}</strong>.</p><p>Có hiệu lực 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>`,
    };
  }
  return {
    subject: `${name}: appointment verification code`,
    text: `Your verification code is ${input.code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
    html: `<p>Your verification code is <strong>${input.code}</strong>.</p><p>It expires in 10 minutes. If you did not request this, ignore this email.</p>`,
  };
}
