// بناء «خطة التصحيح» من القالب — منطق خالص قابل للاختبار بلا قاعدة بيانات.
//
// قاعدة معمارية: الخطة الناتجة معاملة عادية في جدول tasks الموجود
// (serviceType = "امتثال نظامي"، source = "رصد نظامي")، وخطواتها في
// compliance_steps. لا نظام مهام موازٍ.

import { addDays, daysBetween } from "./dates.ts";
import type { ComplianceTemplate, RegulatoryCategory, MeasureType, RiskLevel } from "./types.ts";

export type ScheduledStep = { order: number; title: string; dueDate: string };

export type PlanSchedule = {
  steps: ScheduledStep[];
  // ضُغط الجدول لأن المدة المتبقية أقصر من امتداد القالب
  compressed: boolean;
};

export function renderSubject(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ""));
}

/**
 * يوزّع خطوات القالب على المدة المتاحة فعلًا.
 * القالب مصمَّم لمدة كاملة (مثلًا 120 يومًا). فإذا أُدخل القرار متأخرًا ولم يبقَ
 * سوى 40 يومًا، فالتوزيع الحرفي يولّد خطوات مستحقة في الماضي — ضجيج يُفقد الثقة.
 * لذلك يُضغط الجدول تناسبيًا ويُعلَم المستخدم بذلك.
 */
export function scheduleSteps(
  template: ComplianceTemplate,
  effectiveDate: string,
  today: string,
): PlanSchedule {
  const steps = [...template.steps].sort((a, b) => a.order - b.order);
  if (steps.length === 0) return { steps: [], compressed: false };

  const earliestOffset = Math.min(...steps.map((s) => s.offsetDays)); // الأكثر سلبية
  const templateSpan = Math.abs(earliestOffset);
  const availableDays = Math.max(0, daysBetween(today, effectiveDate));
  const compressed = availableDays < templateSpan;
  const factor = templateSpan === 0 ? 1 : Math.min(1, availableDays / templateSpan);

  const scheduled = steps.map((s) => {
    const offset = compressed ? Math.round(s.offsetDays * factor) : s.offsetDays;
    let due = addDays(effectiveDate, offset);
    if (daysBetween(today, due) < 0) due = today; // لا خطوة بتاريخ ماضٍ
    return { order: s.order, title: s.title, dueDate: due };
  });

  return { steps: scheduled, compressed };
}

/** أولوية المعاملة بمفردات مَسار الحالية */
export function riskToPriority(risk: RiskLevel): string {
  if (risk === "critical") return "عاجلة";
  if (risk === "high") return "مرتفعة";
  return "متوسطة";
}

/** اختيار القالب: الأدق أولًا (فئة + نوع قياس)، ثم الفئة، ثم القالب العام */
export function pickTemplate(
  templates: ComplianceTemplate[],
  categories: RegulatoryCategory[],
  measureType: MeasureType | null,
): ComplianceTemplate | null {
  const byBoth = templates.find(
    (t) =>
      t.appliesToMeasureType === measureType &&
      t.appliesToCategories?.some((c) => categories.includes(c)),
  );
  if (byBoth) return byBoth;

  const byCategory = templates.find((t) => t.appliesToCategories?.some((c) => categories.includes(c)));
  if (byCategory) return byCategory;

  const byMeasure = templates.find((t) => t.appliesToMeasureType === measureType && !t.appliesToCategories);
  if (byMeasure) return byMeasure;

  return templates.find((t) => !t.appliesToCategories && !t.appliesToMeasureType) ?? null;
}
