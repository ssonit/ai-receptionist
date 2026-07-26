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

export function bookingReminderEmailCopy(input: {
  locale: "en" | "vi";
  workspaceName: string;
  serviceLabel: string;
  whenLabel: string;
  locationLine?: string | null;
  manageUrl: string;
  unsubscribeUrl: string;
}): { subject: string; html: string; text: string } {
  const name = input.workspaceName.trim() || "Eve";
  const service = input.serviceLabel.trim() || "appointment";
  const location = input.locationLine?.trim() || null;

  if (input.locale === "vi") {
    const loc = location ? `\n${location}` : "";
    return {
      subject: `${name}: nhắc lịch hẹn — ${input.whenLabel}`,
      text: [
        `Xin chào,`,
        ``,
        `Nhắc bạn về lịch hẹn tại ${name}:`,
        `${service}`,
        input.whenLabel,
        location ?? "",
        ``,
        `Cần đổi hoặc hủy? Mở liên kết này (dùng một lần):`,
        input.manageUrl,
        ``,
        `Không muốn nhận nhắc lịch cho cuộc hẹn này:`,
        input.unsubscribeUrl,
      ]
        .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
        .join("\n"),
      html: `<p>Xin chào,</p>
<p>Nhắc bạn về lịch hẹn tại <strong>${escapeHtml(name)}</strong>:</p>
<p><strong>${escapeHtml(service)}</strong><br/>${escapeHtml(input.whenLabel)}${location ? `<br/>${escapeHtml(location)}` : ""}</p>
<p><a href="${escapeAttr(input.manageUrl)}">Cần đổi hoặc hủy? Bấm vào đây.</a></p>
<p style="font-size:12px;color:#666">Không muốn nhận nhắc lịch cho cuộc hẹn này? <a href="${escapeAttr(input.unsubscribeUrl)}">Từ chối nhắc</a>.</p>`,
    };
  }

  return {
    subject: `${name}: appointment reminder — ${input.whenLabel}`,
    text: [
      `Hi,`,
      ``,
      `This is a reminder for your appointment with ${name}:`,
      `${service}`,
      input.whenLabel,
      location ?? "",
      ``,
      `Need to change or cancel? Open this one-time link:`,
      input.manageUrl,
      ``,
      `Don't want reminders for this appointment:`,
      input.unsubscribeUrl,
    ]
      .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
      .join("\n"),
    html: `<p>Hi,</p>
<p>This is a reminder for your appointment with <strong>${escapeHtml(name)}</strong>:</p>
<p><strong>${escapeHtml(service)}</strong><br/>${escapeHtml(input.whenLabel)}${location ? `<br/>${escapeHtml(location)}` : ""}</p>
<p><a href="${escapeAttr(input.manageUrl)}">Need to change or cancel? Click here.</a></p>
<p style="font-size:12px;color:#666">Don't want reminders for this appointment? <a href="${escapeAttr(input.unsubscribeUrl)}">Unsubscribe</a>.</p>`,
  };
}

export function workspaceInviteEmailCopy(input: {
  locale: "en" | "vi";
  workspaceName: string;
  inviterName: string | null;
  acceptUrl: string;
}): { subject: string; html: string; text: string } {
  const by = input.inviterName?.trim();
  const workspaceName = escapeHtml(input.workspaceName);
  const acceptUrl = escapeAttr(input.acceptUrl);
  const byHtml = by ? escapeHtml(by) : null;

  if (input.locale === "vi") {
    const intro = byHtml
      ? `${byHtml} mời bạn tham gia workspace <strong>${workspaceName}</strong> trên Eve với vai trò nhân viên.`
      : `Bạn được mời tham gia workspace <strong>${workspaceName}</strong> trên Eve với vai trò nhân viên.`;
    return {
      subject: `Lời mời tham gia ${input.workspaceName}`,
      text:
        `${by ? `${by} mời` : "Bạn được mời"} tham gia workspace ${input.workspaceName} trên Eve.\n\n` +
        `Nhận lời mời: ${input.acceptUrl}\n\n` +
        `Liên kết có hiệu lực 7 ngày và chỉ dùng được với chính địa chỉ email này. ` +
        `Nếu bạn không mong đợi email này, hãy bỏ qua.`,
      html:
        `<p>${intro}</p>` +
        `<p><a href="${acceptUrl}">Nhận lời mời</a></p>` +
        `<p>Liên kết có hiệu lực 7 ngày và chỉ dùng được với chính địa chỉ email này.</p>` +
        `<p>Nếu bạn không mong đợi email này, hãy bỏ qua.</p>`,
    };
  }

  const intro = byHtml
    ? `${byHtml} invited you to join <strong>${workspaceName}</strong> on Eve as staff.`
    : `You've been invited to join <strong>${workspaceName}</strong> on Eve as staff.`;
  return {
    subject: `Invitation to join ${input.workspaceName}`,
    text:
      `${by ? `${by} invited you` : "You've been invited"} to join ${input.workspaceName} on Eve as staff.\n\n` +
      `Accept: ${input.acceptUrl}\n\n` +
      `This link expires in 7 days and only works for this email address. ` +
      `If you weren't expecting this, ignore this email.`,
    html:
      `<p>${intro}</p>` +
      `<p><a href="${acceptUrl}">Accept invitation</a></p>` +
      `<p>This link expires in 7 days and only works for this email address.</p>` +
      `<p>If you weren't expecting this, ignore this email.</p>`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
