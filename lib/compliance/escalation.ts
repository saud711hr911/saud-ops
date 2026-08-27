/**
 * سلم التصعيد وضوابط منع الإزعاج.
 *
 * المبدأ: التنبيه مورد نادر. التصعيد يرفع الجمهور والقناة، لا التكرار.
 */

import { daysBetween, riyadhHour } from "./dates.ts";
import type { ImpactState, RegulatoryCategory, RiskLevel } from "./types.ts";

export type NotificationChannel = "in_app" | "email" | "push";
export type Audience = "watcher" | "assignee" | "owner";

export interface EscalationStep {
  level: number;
  /** يُفعَّل عندما تصبح الأيام المتبقية ≤ هذه العتبة */
  thresholdDays: number;
  channels: NotificationChannel[];
  audience: Audience[];
  /** إنشاء حالة تلقائيًا إن لم تكن أُنشئت */
  autoCreateCase: boolean;
  pinToDashboard: boolean;
  labelAr: string;
}

/** ترتيب تنازلي بالعتبة — أول عنصر تتحقق شرطه هو المستوى الحالي */
export const ESCALATION_LADDER: EscalationStep[] = [
  { level: 7, thresholdDays: -1,  channels: ["in_app", "email"], audience: ["watcher", "assignee", "owner"], autoCreateCase: true,  pinToDashboard: true,  labelAr: "متأخر — تجاوز تاريخ النفاذ" },
  { level: 6, thresholdDays: 1,   channels: ["in_app", "email", "push"], audience: ["watcher", "assignee", "owner"], autoCreateCase: true,  pinToDashboard: true,  labelAr: "عاجل — يوم واحد" },
  { level: 5, thresholdDays: 7,   channels: ["in_app", "email"], audience: ["watcher", "assignee", "owner"], autoCreateCase: true,  pinToDashboard: true,  labelAr: "تنبيه عالٍ — أسبوع" },
  { level: 4, thresholdDays: 14,  channels: ["in_app", "email"], audience: ["watcher", "assignee"],          autoCreateCase: true,  pinToDashboard: false, labelAr: "أسبوعان" },
  { level: 3, thresholdDays: 30,  channels: ["in_app", "email"], audience: ["watcher", "assignee"],          autoCreateCase: true,  pinToDashboard: false, labelAr: "شهر — تُنشأ خطة التصحيح" },
  { level: 2, thresholdDays: 60,  channels: ["in_app", "email"], audience: ["watcher"],                      autoCreateCase: false, pinToDashboard: false, labelAr: "شهران" },
  { level: 1, thresholdDays: 90,  channels: ["in_app"],          audience: ["watcher"],                      autoCreateCase: false, pinToDashboard: false, labelAr: "ثلاثة أشهر" },
  { level: 0, thresholdDays: Number.POSITIVE_INFINITY, channels: [], audience: [], autoCreateCase: false, pinToDashboard: false, labelAr: "إدراج في السجل" },
];

/** المهلة الداخلية الافتراضية قبل تاريخ النفاذ، بالأيام (سالبة) */
export const INTERNAL_DEADLINE_OFFSET_DAYS: Record<string, number> = {
  // التوطين يحتاج توظيفًا فعليًا: 30 يومًا لا تكفي — القرار المعتمد في الوثيقة: 60
  saudization: -60,
  default: -30,
};

export function internalDeadlineOffsetFor(categories: RegulatoryCategory[]): number {
  for (const c of categories) {
    if (c in INTERNAL_DEADLINE_OFFSET_DAYS) return INTERNAL_DEADLINE_OFFSET_DAYS[c];
  }
  return INTERNAL_DEADLINE_OFFSET_DAYS.default;
}

/** المستوى المستحق بناءً على الأيام المتبقية وحدها */
export function levelForDaysRemaining(daysRemaining: number | null): number {
  if (daysRemaining === null) return 0; // بلا تاريخ نفاذ ⇒ لا تصعيد زمني
  if (daysRemaining < 0) return 7;
  for (const step of ESCALATION_LADDER) {
    if (step.level === 7 || step.level === 0) continue;
    if (daysRemaining <= step.thresholdDays) {
      // نأخذ أعلى مستوى تتحقق عتبته (المصفوفة مرتّبة تنازليًا)
      return step.level;
    }
  }
  return 0;
}

export function stepFor(level: number): EscalationStep {
  return ESCALATION_LADDER.find((s) => s.level === level) ?? ESCALATION_LADDER[ESCALATION_LADDER.length - 1];
}

// ─────────────────────────────────────────────────────────────
// قرار التنبيه
// ─────────────────────────────────────────────────────────────

export interface EscalationInput {
  impactId: string;
  effectiveDate: string | null;
  today: string;
  /** المستوى المسجَّل حاليًا على الأثر */
  currentLevel: number;
  state: ImpactState;
  risk: RiskLevel;
  applicable: boolean | null;
  /** حالة القرار — postponed/cancelled توقف التصعيد فورًا */
  updateStatus: string;
  /** تاريخ النفاذ الذي حُسب عليه التصعيد آخر مرة */
  baselineEffectiveDate: string | null;
  hasCase: boolean;
  /** الحالة قيد التنفيذ والمهام تتقدم ⇒ خفض الضجيج */
  caseIsProgressing: boolean;
  /** مفاتيح التفرّد المُرسلة سابقًا لهذا الأثر: `${impactId}:${level}` */
  sentKeys: Set<string>;
  /** عدد إشعارات الامتثال التي أُرسلت اليوم لكل مستخدم */
  userNotificationCountToday: Record<string, number>;
  /** اللحظة الحالية (UTC) لفحص الصمت الليلي */
  now: Date;
}

export interface EscalationPlan {
  daysRemaining: number | null;
  level: number;
  isOverdue: boolean;
  /** أُعيد ضبط التصعيد لأن تاريخ النفاذ تغيّر */
  resetDueToDateChange: boolean;
  shouldCreateCase: boolean;
  pinToDashboard: boolean;
  notification: {
    send: boolean;
    reason: string;
    uniquenessKey: string;
    channels: NotificationChannel[];
    audience: Audience[];
    /** يُدمَج ضمن «ملخص امتثال» بدل إشعار مستقل */
    aggregate: boolean;
    /**
     * وقع التنبيه داخل الصمت الليلي.
     * التشغيل المجدول عند 05:00 والصمت يمتد حتى 07:00، فلو أسقطنا التنبيه
     * لما وصل شيء أبدًا. لذلك يُنشأ القيد الآن ويُحمل ساعة تسليم لاحقة.
     */
    deferUntilMorning: boolean;
    /** أبكر ساعة تسليم بتوقيت الرياض، أو null للتسليم فورًا */
    deliverAfterHour: number | null;
  };
}

export const QUIET_HOURS = { startHour: 7, endHour: 21 };
export const DAILY_NOTIFICATION_CAP = 3;

const HALTING_UPDATE_STATUSES = new Set(["postponed", "cancelled", "rejected", "superseded", "archived", "draft", "pending_review"]);
const HALTING_IMPACT_STATES = new Set<ImpactState>(["not_applicable", "compliant", "closed", "pending_assessment"]);

export function planEscalation(input: EscalationInput): EscalationPlan {
  const daysRemaining = input.effectiveDate ? daysBetween(input.today, input.effectiveDate) : null;
  const isOverdue = daysRemaining !== null && daysRemaining < 0;

  const resetDueToDateChange =
    input.baselineEffectiveDate !== null &&
    input.effectiveDate !== null &&
    input.baselineEffectiveDate !== input.effectiveDate;

  const silent = (level: number, reason: string): EscalationPlan => ({
    daysRemaining,
    level,
    isOverdue,
    resetDueToDateChange,
    shouldCreateCase: false,
    pinToDashboard: false,
    notification: {
      send: false, reason, uniquenessKey: `${input.impactId}:${level}`,
      channels: [], audience: [], aggregate: false,
      deferUntilMorning: false, deliverAfterHour: null,
    },
  });

  // 1. مؤجَّل/ملغى/غير معتمد ⇒ توقف فوري
  if (HALTING_UPDATE_STATUSES.has(input.updateStatus)) {
    return silent(0, `القرار بحالة ${input.updateStatus} — التصعيد متوقف`);
  }

  // 2. غير منطبق أو منتهٍ ⇒ لا تصعيد. needs_review له مساره الخاص (مهمة مراجعة، لا عدّ تنازلي)
  if (input.applicable !== true || HALTING_IMPACT_STATES.has(input.state)) {
    return silent(0, "الأثر غير نشط للتصعيد");
  }

  // 3. المستوى المستحق. عند تغيّر تاريخ النفاذ نُعيد الحساب من الصفر
  //    (لا نأخذ max مع المستوى السابق) حتى لا يستمر تصعيد قرار أُجّل.
  const earned = levelForDaysRemaining(daysRemaining);
  const level = resetDueToDateChange ? earned : Math.max(earned, 0);

  if (level === 0) {
    return { ...silent(0, "أكثر من 90 يومًا — إدراج في السجل فقط"), shouldCreateCase: false };
  }

  const step = stepFor(level);
  const uniquenessKey = `${input.impactId}:${level}`;

  // 4. مفتاح التفرّد — مهما تكرر تشغيل الدالة، إشعار واحد لكل مستوى
  const alreadySent = input.sentKeys.has(uniquenessKey);

  // 5. الحالة النشطة تخفض الضجيج: المستويان 4 و5 يصيران إشعارًا داخليًا فقط
  let channels = [...step.channels];
  let audience = [...step.audience];
  if (input.caseIsProgressing && (level === 4 || level === 5)) {
    channels = ["in_app"];
    audience = ["watcher"];
  }

  // 6. الصمت الليلي — إلا المستوى 6 (عاجل)
  const hour = riyadhHour(input.now);
  const inQuietHours = hour < QUIET_HOURS.startHour || hour >= QUIET_HOURS.endHour;
  const deferUntilMorning = inQuietHours && level < 6 && !isOverdue;

  // 7. التجميع اليومي — إذا تجاوز المستخدم 3 إشعارات اليوم
  const overCap = audience.some(
    (a) => (input.userNotificationCountToday[a] ?? 0) >= DAILY_NOTIFICATION_CAP,
  );
  const aggregate = overCap && level < 6;

  return {
    daysRemaining,
    level,
    isOverdue,
    resetDueToDateChange,
    shouldCreateCase: step.autoCreateCase && !input.hasCase,
    pinToDashboard: step.pinToDashboard,
    notification: {
      // القيد يُنشأ الآن حتى داخل الصمت الليلي؛ الصمت يؤخّر التسليم لا الرصد.
      send: !alreadySent && channels.length > 0,
      reason: alreadySent
        ? "أُرسل إشعار هذا المستوى سابقًا"
        : deferUntilMorning
          ? `${step.labelAr} — يُسلَّم بعد ${QUIET_HOURS.startHour}:00 بتوقيت الرياض`
          : step.labelAr,
      uniquenessKey,
      channels,
      audience,
      aggregate,
      deferUntilMorning,
      deliverAfterHour: deferUntilMorning ? QUIET_HOURS.startHour : null,
    },
  };
}
