// تسليم تنبيهات الامتثال بالبريد — منطق خالص بلا Firebase ولا SMTP.
//
// القواعد:
// - يُسلَّم بالبريد فقط ما تحمل قناته "email" (المستوى 1 داخل التطبيق فقط).
// - لا يُسلَّم قبل موعده: scheduledFor ("YYYY-MM-DD" أو "YYYY-MM-DD HH:00") يُقارن نصيًا
//   بطابع الرياض الحالي، فالتنبيه المؤجل حتى 07:00 لا يخرج في 05:00.
// - رسالة واحدة لكل مستقبِل في كل تشغيل (ملخّص)، الأخطر أولًا — لا سيل رسائل.
// - المحاولات محدودة: بعد MAX_DELIVERY_ATTEMPTS يبقى «فشل الإرسال» ظاهرًا للمالك.

export const ALERT_STATUS = {
  ready: "جاهز للإرسال",
  deferred: "مؤجل حتى الصباح",
  aggregated: "مجمّع",
  sending: "قيد الإرسال",
  sent: "تم الإرسال",
  failed: "فشل الإرسال",
} as const;

export const PENDING_ALERT_STATUSES: string[] = [
  ALERT_STATUS.ready, ALERT_STATUS.deferred, ALERT_STATUS.aggregated, ALERT_STATUS.failed, ALERT_STATUS.sending,
];

export const MAX_DELIVERY_ATTEMPTS = 3;
/** حجز «قيد الإرسال» أقدم من هذا يُعتبر متروكًا (توقف الخادم أثناء الإرسال) */
export const STALE_CLAIM_MINUTES = 15;

export type DeliverableAlert = {
  id: string;
  level: number;
  recipientEmail: string;
  channels: string[];
  title: string;
  message: string;
  status: string;
  scheduledFor: string;
  attempts?: number;
  claimedAt?: string | null;
};

export function isDue(scheduledFor: string, nowStamp: string): boolean {
  return scheduledFor <= nowStamp;
}

export function isDeliverable(alert: DeliverableAlert, nowStamp: string, now: Date = new Date()): boolean {
  if (!alert.channels.includes("email")) return false;
  if (!alert.recipientEmail || !alert.recipientEmail.includes("@")) return false;
  if (!isDue(alert.scheduledFor, nowStamp)) return false;
  const attempts = alert.attempts ?? 0;
  if (attempts >= MAX_DELIVERY_ATTEMPTS) return false;
  if (alert.status === ALERT_STATUS.sending) {
    const claimed = alert.claimedAt ? Date.parse(alert.claimedAt) : 0;
    return now.getTime() - claimed > STALE_CLAIM_MINUTES * 60_000;
  }
  return [ALERT_STATUS.ready, ALERT_STATUS.deferred, ALERT_STATUS.aggregated, ALERT_STATUS.failed]
    .includes(alert.status as typeof ALERT_STATUS.ready);
}

/** يجمع التنبيهات لكل مستقبِل، الأعلى مستوى أولًا */
export function groupByRecipient<T extends DeliverableAlert>(alerts: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const alert of alerts) {
    const key = alert.recipientEmail.trim().toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), alert]);
  }
  for (const list of groups.values()) list.sort((a, b) => b.level - a.level || a.title.localeCompare(b.title));
  return groups;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type EmailContent = { subject: string; text: string; html: string };

const DISCLAIMER =
  "هذه المعلومات ملخّص تنظيمي لأغراض المتابعة الإدارية، وليست استشارة نظامية. المرجع الملزم هو النص الرسمي الصادر عن الجهة المختصة.";

function levelTone(level: number) {
  if (level >= 6) return { color: "#b84d43", bg: "#fae9e7", label: "عاجل" };
  if (level >= 4) return { color: "#b06a18", bg: "#fff1dc", label: "مرتفع" };
  return { color: "#326ba1", bg: "#e7f0fb", label: "متابعة" };
}

function layout(title: string, body: string, footer: string) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px;background:#f4f7f7;font-family:Tahoma,Arial,sans-serif;color:#142b3b;direction:rtl;text-align:right">
<div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #dfe7e7;border-radius:14px;overflow:hidden">
<div style="padding:18px 22px;background:#0b2438;color:#fff"><strong style="font-size:16px">مَسار</strong><span style="color:#9fb6c2;font-size:12px"> · ${escapeHtml(title)}</span></div>
<div style="padding:20px 22px">${body}</div>
<div style="padding:14px 22px;background:#fbfaf7;color:#70542a;font-size:11px;line-height:1.7;border-top:1px solid #efe7d6">${footer}</div>
</div></body></html>`;
}

/** ملخّص تنبيهات الامتثال لمستقبِل واحد */
export function renderAlertDigest(alerts: DeliverableAlert[], appUrl: string | null): EmailContent {
  const top = alerts[0];
  const subject = alerts.length === 1
    ? `[مَسار] ${levelTone(top.level).label}: ${top.title}`
    : `[مَسار] ${alerts.length} تنبيهات امتثال — أعلاها: ${top.title}`;

  const textLines = alerts.map((alert) => `• ${alert.title}\n  ${alert.message}`);
  const link = appUrl ? `${appUrl.replace(/\/$/, "")}/` : null;
  const text = [
    "تنبيهات الرصد النظامي والامتثال:",
    "",
    ...textLines,
    "",
    link ? `افتح مَسار للمتابعة: ${link}` : "افتح مَسار ← الرصد النظامي للمتابعة.",
    "",
    DISCLAIMER,
  ].join("\n");

  const rows = alerts.map((alert) => {
    const tone = levelTone(alert.level);
    return `<div style="padding:12px 14px;margin-bottom:8px;border:1px solid #dfe7e7;border-radius:10px">
<span style="display:inline-block;padding:2px 8px;font-size:11px;font-weight:bold;color:${tone.color};background:${tone.bg};border-radius:999px">${tone.label}</span>
<div style="margin-top:6px;font-size:14px;font-weight:bold">${escapeHtml(alert.title)}</div>
<div style="margin-top:4px;color:#6d7c85;font-size:12px">${escapeHtml(alert.message)}</div></div>`;
  }).join("");

  const button = link
    ? `<p style="margin:18px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;color:#fff;background:#0b8777;border-radius:9px;text-decoration:none;font-weight:bold">فتح مَسار</a></p>`
    : `<p style="margin:18px 0 0;color:#6d7c85;font-size:12px">افتح مَسار ← الرصد النظامي للمتابعة.</p>`;

  return { subject, text, html: layout("تنبيهات الامتثال", rows + button, escapeHtml(DISCLAIMER)) };
}

/** تنبيه تجديد مستند موجّه للعميل — نص الرسالة نفسه المُعدّ لواتساب */
export function renderReminderEmail(input: { clientName: string; documentTitle: string; message: string; officeName: string }): EmailContent {
  const subject = `تنبيه تجديد: ${input.documentTitle}`;
  const text = `${input.message}\n\n${input.officeName}`;
  const body = `<p style="margin:0;font-size:14px;line-height:1.9">${escapeHtml(input.message)}</p>
<p style="margin:18px 0 0;color:#6d7c85;font-size:12px">يمكنكم الرد على هذه الرسالة مباشرة.</p>`;
  return { subject, text, html: layout(input.documentTitle, body, escapeHtml(input.officeName)) };
}
