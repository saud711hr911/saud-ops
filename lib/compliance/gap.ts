/**
 * حساب الفجوة (إرشادي فقط) ودرجة الخطورة.
 *
 * ⚠ مسار لا يُعيد احتساب نسبة التوطين. الرقم المعروض في قوى هو مصدر الحقيقة،
 * ويُخزَّن كلقطة مؤرّخة. ما يلي تقديرٌ إرشادي للعجز يُعرض دائمًا موسومًا كذلك،
 * لأن احتساب النطاقات يتضمّن أوزانًا واستثناءات لا يمثّلها هذا التقدير
 * (الدوام الجزئي، ذوو الإعاقة، شرط التسجيل في التأمينات، الحد الأدنى للأجر المحتسب…).
 */

import { daysBetween } from "./dates.ts";
import type { ImpactGap, Measure, RiskLevel, WorkforceSnapshot } from "./types.ts";

/** عمر اللقطة الذي بعده لا يجوز عرض الرقم كأنه حالي */
export const SNAPSHOT_STALE_AFTER_DAYS = 45;

export const GAP_DISCLAIMER_AR =
  "تقدير إرشادي — الرقم المعتمد هو ما يظهر في قوى.";

export function isSnapshotStale(snapshot: WorkforceSnapshot | null, today: string): boolean {
  if (!snapshot) return true;
  return daysBetween(snapshot.asOf, today) > SNAPSHOT_STALE_AFTER_DAYS;
}

/**
 * أقل عدد من التوظيفات السعودية الإضافية للوصول إلى النسبة المستهدفة،
 * بافتراض أن كل توظيف يزيد الإجمالي والسعوديين معًا:
 *
 *   (saudis + x) / (total + x) >= target
 *   ⇒ x >= (target×total − saudis) / (1 − target)
 */
export function estimateAdditionalSaudiHires(
  totalEmployees: number,
  saudis: number,
  targetPercent: number,
): number {
  if (targetPercent >= 100) return Number.POSITIVE_INFINITY;
  if (targetPercent <= 0) return 0;
  const t = targetPercent / 100;
  const needed = (t * totalEmployees - saudis) / (1 - t);
  return needed <= 0 ? 0 : Math.ceil(needed - 1e-9);
}

export function buildGap(
  measure: Measure | null,
  snapshot: WorkforceSnapshot | null,
  today: string,
): ImpactGap | null {
  if (!measure) return null;

  const stale = isSnapshotStale(snapshot, today);

  if (measure.type !== "saudization_rate" || measure.targetValue === null) {
    // التزام إجرائي/توثيقي: لا فجوة رقمية، لكن نبقي البنية للعرض الموحّد
    return {
      metric: measure.type,
      currentValue: null,
      currentValueAsOf: snapshot?.asOf ?? null,
      currentValueSource: snapshot?.source ?? null,
      requiredValue: measure.targetValue,
      estimatedHires: null,
      estimateIsIndicative: true,
      stale,
    };
  }

  // نطاق القرار قد يكون مهنًا محددة لا المنشأة كلها
  const scopeCodes = measure.scope?.occupationCodes;
  let total: number | null = null;
  let saudis: number | null = null;
  let currentValue: number | null = null;

  if (snapshot) {
    if (scopeCodes && scopeCodes.length > 0) {
      const inScope = snapshot.occupations.filter((o) => scopeCodes.includes(o.code));
      if (inScope.length > 0) {
        total = inScope.reduce((s, o) => s + o.total, 0);
        saudis = inScope.reduce((s, o) => s + o.saudis, 0);
        currentValue = total > 0 ? round1((saudis / total) * 100) : null;
      }
    } else {
      total = snapshot.totalEmployees;
      saudis = snapshot.saudis;
      // ★ لا نحتسب: نأخذ الرقم كما ورد من قوى
      currentValue = snapshot.saudizationRate;
    }
  }

  const estimatedHires =
    total !== null && saudis !== null
      ? estimateAdditionalSaudiHires(total, saudis, measure.targetValue)
      : null;

  return {
    metric: "saudization_rate",
    currentValue,
    currentValueAsOf: snapshot?.asOf ?? null,
    currentValueSource: snapshot?.source ?? null,
    requiredValue: measure.targetValue,
    estimatedHires: estimatedHires === null || !Number.isFinite(estimatedHires) ? null : estimatedHires,
    estimateIsIndicative: true,
    stale,
  };
}

/** فرق النقاط المئوية بين المطلوب والحالي (0 إذا لا فجوة أو لا بيانات) */
export function gapPoints(gap: ImpactGap | null): number | null {
  if (!gap || gap.currentValue === null || gap.requiredValue === null) return null;
  return Math.max(0, round1(gap.requiredValue - gap.currentValue));
}

/**
 * درجة الخطورة حسب جدول القسم 4.4 من الوثيقة التنفيذية.
 * ملاحظة: الفجوة المجهولة (لا لقطة قوى عاملة) لا تُخفَّض إلى `medium` —
 * الجهل ليس اطمئنانًا، فتُعامَل بحسب الوقت المتبقي وحده.
 */
export function computeRisk(
  gap: ImpactGap | null,
  daysRemaining: number | null,
  applicable: boolean | null,
): RiskLevel {
  if (applicable !== true) return "low";

  const d = daysRemaining;
  const points = gapPoints(gap);

  if ((points !== null && points > 15) || (d !== null && d < 30)) return "critical";
  if ((points !== null && points >= 5 && points <= 15) || (d !== null && d < 90)) return "high";
  if (points !== null && points > 0 && points < 5) return "medium";
  if (points === 0) return "low"; // منطبق بلا فجوة ⇒ إجراء توثيقي
  return "medium"; // منطبق، الفجوة غير معروفة، والوقت متسع
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
