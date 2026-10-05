// إرسال البريد عبر SMTP — يعمل مع أي مزوّد (Gmail بكلمة مرور تطبيق، Zoho، Brevo، SendGrid…).
//
// الإعداد من متغيرات البيئة (راجع COMPLIANCE_MODULE_AR.md):
//   SMTP_HOST, SMTP_PORT (افتراضي 587), SMTP_SECURE ("true" للمنفذ 465),
//   SMTP_USER, SMTP_PASS (سرّ في Secret Manager), MAIL_FROM (افتراضيًا SMTP_USER),
//   MAIL_REPLY_TO (اختياري), APP_URL (رابط مَسار داخل الرسائل، اختياري).
// إن نقص أي من HOST/USER/PASS يبقى البريد معطّلًا ولا يتغير سلوك النظام.

import nodemailer, { type Transporter } from "nodemailer";

type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  replyTo: string | null;
};

function readConfig(): MailConfig | null {
  const host = (process.env.SMTP_HOST || "").trim();
  const user = (process.env.SMTP_USER || "").trim();
  const pass = process.env.SMTP_PASS || "";
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  return {
    host,
    port,
    secure: (process.env.SMTP_SECURE || "").trim() === "true" || port === 465,
    user,
    pass,
    from: (process.env.MAIL_FROM || "").trim() || user,
    replyTo: (process.env.MAIL_REPLY_TO || "").trim() || null,
  };
}

let cached: { key: string; transporter: Transporter } | null = null;

function transporterFor(config: MailConfig) {
  const key = `${config.host}:${config.port}:${config.user}`;
  if (!cached || cached.key !== key) {
    cached = {
      key,
      transporter: nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user, pass: config.pass },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
      }),
    };
  }
  return cached.transporter;
}

export function isMailConfigured() {
  return readConfig() !== null;
}

export function appUrl(): string | null {
  return (process.env.APP_URL || "").trim() || null;
}

export async function sendMail(message: { to: string; subject: string; text: string; html: string; replyTo?: string | null }) {
  const config = readConfig();
  if (!config) throw new Error("البريد غير مفعّل: إعدادات SMTP ناقصة.");
  const info = await transporterFor(config).sendMail({
    from: config.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: message.replyTo ?? config.replyTo ?? undefined,
  });
  return { messageId: info.messageId };
}
