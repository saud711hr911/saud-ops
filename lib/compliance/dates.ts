/**
 * أدوات التواريخ — منطقة زمنية واحدة: Asia/Riyadh (UTC+3، بلا توقيت صيفي).
 * قاعدة: الطوابع تُخزَّن UTC، والحساب المنطقي (اليوم، المتبقي) يتم بتقويم الرياض.
 */

export const RIYADH_UTC_OFFSET_HOURS = 3;
export const MS_PER_DAY = 86_400_000;

/** يحوّل لحظة UTC إلى تاريخ الرياض بصيغة YYYY-MM-DD */
export function riyadhDate(instant: Date = new Date()): string {
  const shifted = new Date(instant.getTime() + RIYADH_UTC_OFFSET_HOURS * 3_600_000);
  return shifted.toISOString().slice(0, 10);
}

/** الساعة الحالية بتوقيت الرياض (0..23) */
export function riyadhHour(instant: Date = new Date()): number {
  const shifted = new Date(instant.getTime() + RIYADH_UTC_OFFSET_HOURS * 3_600_000);
  return shifted.getUTCHours();
}

/** يحوّل YYYY-MM-DD إلى عدد أيام مطلق (منتصف ليل الرياض بالـ UTC) */
function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

/**
 * الأيام المتبقية حتى `target` بالنسبة إلى `from` (كلاهما YYYY-MM-DD).
 * موجب = في المستقبل، صفر = اليوم، سالب = فات.
 */
export function daysBetween(from: string, target: string): number {
  return dayNumber(target) - dayNumber(from);
}

/** يضيف أيامًا (قد تكون سالبة) إلى تاريخ YYYY-MM-DD ويعيد YYYY-MM-DD */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * MS_PER_DAY;
  return new Date(t).toISOString().slice(0, 10);
}

/** تحقق شكلي بسيط من صيغة التاريخ */
export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** عرض عربي للمدة المتبقية */
export function remainingLabelAr(days: number | null): string {
  if (days === null) return "تاريخ النفاذ غير محدد";
  if (days < 0) return `متأخر ${Math.abs(days)} يومًا`;
  if (days === 0) return "يبدأ النفاذ اليوم";
  if (days === 1) return "يوم واحد متبقٍ";
  if (days === 2) return "يومان متبقيان";
  if (days <= 10) return `${days} أيام متبقية`;
  return `${days} يومًا متبقيًا`;
}
