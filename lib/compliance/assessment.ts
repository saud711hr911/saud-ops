// التقييم: يجمع المطابقة + الفجوة + الخطورة + المواعيد في نتيجة أثر واحدة.
// دالة خالصة — لا قراءة ولا كتابة. طبقة الإجراءات في /api/data تُطعمها وتحفظ ناتجها.

import { addDays, daysBetween } from "./dates.ts";
import { internalDeadlineOffsetFor, levelForDaysRemaining } from "./escalation.ts";
import { buildGap, computeRisk } from "./gap.ts";
import { evaluateApplicability, MATCH_ENGINE_VERSION } from "./matching.ts";
import type {
  AssessedImpact,
  ClientContext,
  ImpactState,
  RegulatoryUpdateInput,
} from "./types.ts";

/** المعرّف الحتمي للأثر — نفس القيمة تُستخدم كمعرّف مستند Firestore */
export function impactId(updateId: number, clientId: number): string {
  return `${updateId}__${clientId}`;
}

export type PreviousImpact = {
  state: ImpactState;
  taskId: number | null;
  escalationLevel: number;
  escalationBaselineDate: string | null;
} | null;

export type AssessOptions = {
  today: string;
  // المرحلة 1: تحديد المنشآت المتأثرة يدويًا قبل وجود قواعد مُهيكلة
  manualClientIds?: number[] | null;
  previous?: PreviousImpact;
};

export function assessImpact(
  update: RegulatoryUpdateInput,
  ctx: ClientContext,
  opts: AssessOptions,
): AssessedImpact {
  const { today, previous = null } = opts;

  // 1. الانطباق
  let applicable: boolean | null;
  let matchTrace: AssessedImpact["matchTrace"];

  const manual = opts.manualClientIds;
  if (manual && manual.length > 0) {
    applicable = manual.includes(ctx.clientId);
    matchTrace = [{
      rule: "manualSelection",
      ruleAr: applicable
        ? "حُدِّدت المنشأة يدويًا ضمن المنشآت المتأثرة"
        : "لم تُحدَّد المنشأة ضمن المنشآت المتأثرة (اختيار يدوي)",
      value: ctx.clientId,
      passed: applicable,
    }];
  } else {
    const res = evaluateApplicability(update.applicability, ctx);
    applicable = res.applicable;
    matchTrace = res.matchTrace;
  }

  // 2. الفجوة
  const gap = applicable === true ? buildGap(update.measure, ctx.workforce, today) : null;

  // 3. المواعيد
  const effectiveDate = update.effectiveDate;
  const daysRemaining = effectiveDate ? daysBetween(today, effectiveDate) : null;
  const isOverdue = daysRemaining !== null && daysRemaining < 0;
  const offset = internalDeadlineOffsetFor(update.categories);
  const internalDeadline = effectiveDate ? addDays(effectiveDate, offset) : null;

  // 4. الخطورة والحالة
  const risk = computeRisk(gap, daysRemaining, applicable);
  const state = deriveState(applicable, isOverdue, previous?.state ?? null);

  // 5. التصعيد — يُعاد ضبطه من الصفر إذا تغيّر تاريخ النفاذ (تأجيل أو تعديل)
  const baselineChanged =
    previous?.escalationBaselineDate != null &&
    previous.escalationBaselineDate !== effectiveDate;
  const earnedLevel = applicable === true ? levelForDaysRemaining(daysRemaining) : 0;
  const escalationLevel = baselineChanged
    ? earnedLevel
    : Math.max(earnedLevel, previous?.escalationLevel ?? 0);

  return {
    id: impactId(update.id, ctx.clientId),
    updateId: update.id,
    clientId: ctx.clientId,
    effectiveDate,
    applicable,
    matchTrace,
    gap,
    risk,
    state,
    isOverdue,
    daysRemaining,
    internalDeadline,
    escalationLevel,
    escalationBaselineDate: effectiveDate,
    engineVersion: MATCH_ENGINE_VERSION,
  };
}

// لا نتراجع بحالة تقدّمت: إعادة التقييم لا تُعيد خطة قائمة إلى «يحتاج إجراء».
const ADVANCED: ImpactState[] = ["plan_created", "in_progress", "compliant", "closed"];

export function deriveState(
  applicable: boolean | null,
  isOverdue: boolean,
  previousState: ImpactState | null,
): ImpactState {
  if (applicable === false) return "not_applicable";
  if (applicable === null) return "needs_review";

  if (previousState && ADVANCED.includes(previousState)) {
    if (isOverdue && (previousState === "plan_created" || previousState === "in_progress")) {
      return "overdue";
    }
    return previousState;
  }
  if (previousState === "overdue") return "overdue";
  return isOverdue ? "overdue" : "action_required";
}
