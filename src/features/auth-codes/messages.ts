import type { Locale } from "@/i18n/translations";
import type { MailMessage } from "@/services/messaging/mail";
import { CODE_RULES } from "./codes";

/**
 * The words sent with a code. They are written here rather than in the
 * interface dictionary because they leave the product: an email or a text
 * message has to read correctly on its own, in the reader's language.
 */

const MINUTES = Math.round(CODE_RULES.lifetimeMs / 60_000);

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function layout(locale: Locale, heading: string, lines: string[], highlight: string | null, footer: string): string {
  const direction = locale === "ar" ? "rtl" : "ltr";
  const paragraphs = lines.map((line) => `<p style="margin:0 0 14px;font-size:15px;line-height:24px;color:#334155">${line}</p>`).join("");
  const box = highlight
    ? `<p dir="ltr" style="margin:6px 0 20px;padding:16px 20px;border-radius:12px;background:#f1f5f9;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:30px;letter-spacing:6px;font-weight:700;color:#0f172a;text-align:center">${escapeHtml(highlight)}</p>`
    : "";
  return `<!doctype html><html lang="${locale}" dir="${direction}"><body style="margin:0;padding:24px;background:#f3f5f2;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:480px;margin:0 auto;padding:28px;border-radius:16px;background:#ffffff;border:1px solid #e2e8f0">
<p style="margin:0 0 18px;font-size:13px;font-weight:700;color:#195a3f">CodeProof</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:28px;color:#0f172a">${heading}</h1>
${paragraphs}${box}
<p style="margin:0;font-size:12px;line-height:20px;color:#64748b">${footer}</p>
</div></body></html>`;
}

export function signInCodeEmail(locale: Locale, to: string, code: string): MailMessage {
  if (locale === "ar") {
    const footer = "إذا لم تطلب هذا الرمز فتجاهل هذه الرسالة. لا يستطيع أحد الدخول إلى حسابك من دونه.";
    return {
      to,
      subject: `${code} هو رمز الدخول إلى CodeProof`,
      text: `رمز الدخول إلى CodeProof هو ${code}.\nيصلح لمدة ${MINUTES} دقائق ولمرة واحدة فقط.\n\n${footer}`,
      html: layout("ar", "رمز الدخول إلى CodeProof", [`أدخل هذا الرمز لإكمال الدخول. يصلح لمدة ${MINUTES} دقائق ولمرة واحدة فقط.`], code, footer),
    };
  }
  const footer = "If you did not ask for this code, ignore this email. Nobody can sign in to your account without it.";
  return {
    to,
    subject: `${code} is your CodeProof sign-in code`,
    text: `Your CodeProof sign-in code is ${code}.\nIt works for ${MINUTES} minutes and only once.\n\n${footer}`,
    html: layout("en", "Your CodeProof sign-in code", [`Enter this code to finish signing in. It works for ${MINUTES} minutes and only once.`], code, footer),
  };
}

export function signInCodeSms(locale: Locale, code: string): string {
  return locale === "ar"
    ? `رمز CodeProof: ${code}. يصلح لمدة ${MINUTES} دقائق. لا تشاركه مع أحد.`
    : `CodeProof code: ${code}. It works for ${MINUTES} minutes. Do not share it.`;
}

export function invitationEmail(locale: Locale, input: { to: string; organization: string; inviter: string; link: string; days: number }): MailMessage {
  const organization = escapeHtml(input.organization);
  const inviter = escapeHtml(input.inviter);
  const link = escapeHtml(input.link);
  if (locale === "ar") {
    const footer = `يعمل هذا الرابط لمدة ${input.days} أيام. إذا لم تكن تتوقع هذه الدعوة فتجاهل الرسالة.`;
    return {
      to: input.to,
      subject: `دعوة للانضمام إلى ${input.organization} على CodeProof`,
      text: `دعاك ${input.inviter} للانضمام إلى ${input.organization} على CodeProof.\n\nافتح هذا الرابط وسجّل الدخول بهذا البريد الإلكتروني:\n${input.link}\n\n${footer}`,
      html: layout("ar", `دعوة للانضمام إلى ${organization}`, [
        `دعاك <bdi>${inviter}</bdi> للانضمام إلى <bdi>${organization}</bdi> على CodeProof.`,
        `افتح الرابط وسجّل الدخول بهذا البريد الإلكتروني:<br><a dir="ltr" href="${link}" style="color:#195a3f;word-break:break-all">${link}</a>`,
      ], null, footer),
    };
  }
  const footer = `This link works for ${input.days} days. If you were not expecting this invitation, ignore this email.`;
  return {
    to: input.to,
    subject: `You are invited to join ${input.organization} on CodeProof`,
    text: `${input.inviter} invited you to join ${input.organization} on CodeProof.\n\nOpen this link and sign in with this email address:\n${input.link}\n\n${footer}`,
    html: layout("en", `You are invited to join ${organization}`, [
      `${inviter} invited you to join ${organization} on CodeProof.`,
      `Open this link and sign in with this email address:<br><a href="${link}" style="color:#195a3f;word-break:break-all">${link}</a>`,
    ], null, footer),
  };
}
