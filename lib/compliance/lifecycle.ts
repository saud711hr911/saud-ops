/**
 * دورات الحياة — القرار والأثر.
 * الانتقالات مُصرَّح بها هنا فقط؛ أي كتابة خارج هذه الخريطة تُرفض في طبقة الدوال.
 */

import type { ImpactState, UpdateStatus } from "./types.ts";

export const UPDATE_TRANSITIONS: Record<UpdateStatus, UpdateStatus[]> = {
  draft:          ["pending_review", "rejected"],
  pending_review: ["approved", "rejected", "draft"],
  rejected:       ["draft"],
  approved:       ["in_effect", "postponed", "cancelled", "superseded", "archived"],
  in_effect:      ["superseded", "cancelled", "archived"],
  postponed:      ["approved", "cancelled", "archived"],
  cancelled:      ["archived"],
  superseded:     ["archived"],
  archived:       [],
};

export const IMPACT_TRANSITIONS: Record<ImpactState, ImpactState[]> = {
  pending_assessment: ["not_applicable", "needs_review", "action_required"],
  not_applicable:     ["pending_assessment"],           // إعادة تقييم عند تغيّر بيانات المنشأة
  needs_review:       ["pending_assessment", "action_required", "not_applicable"],
  action_required:    ["plan_created", "compliant", "overdue", "not_applicable", "needs_review"],
  plan_created:       ["in_progress", "compliant", "overdue", "closed"],
  in_progress:        ["compliant", "overdue", "closed"],
  overdue:            ["in_progress", "compliant", "closed"],
  compliant:          ["closed", "action_required"],    // قد يعود الالتزام إن تغيّر القرار
  closed:             ["action_required"],
};

export function canTransitionUpdate(from: UpdateStatus, to: UpdateStatus): boolean {
  if (from === to) return true;
  return (UPDATE_TRANSITIONS[from] ?? []).includes(to);
}

export function canTransitionImpact(from: ImpactState, to: ImpactState): boolean {
  if (from === to) return true;
  return (IMPACT_TRANSITIONS[from] ?? []).includes(to);
}

export class TransitionError extends Error {
  constructor(kind: "update" | "impact", from: string, to: string) {
    super(`انتقال غير مسموح في ${kind}: ${from} ← ${to}`);
    this.name = "TransitionError";
  }
}

export function assertUpdateTransition(from: UpdateStatus, to: UpdateStatus): void {
  if (!canTransitionUpdate(from, to)) throw new TransitionError("update", from, to);
}

export function assertImpactTransition(from: ImpactState, to: ImpactState): void {
  if (!canTransitionImpact(from, to)) throw new TransitionError("impact", from, to);
}

/** الحالات التي يكون فيها الأثر «نشطًا» — وهي وحدها ما يمر عليه التشغيل اليومي */
export const ACTIVE_IMPACT_STATES: ImpactState[] = [
  "action_required",
  "plan_created",
  "in_progress",
  "overdue",
];

/** حالات القرار التي تُنتج آثارًا وتصعيدًا */
export const LIVE_UPDATE_STATUSES: UpdateStatus[] = ["approved", "in_effect"];

export const UPDATE_STATUS_LABELS_AR: Record<UpdateStatus, string> = {
  draft: "مسودة",
  pending_review: "بانتظار المراجعة",
  rejected: "مرفوض",
  approved: "معتمد",
  in_effect: "نافذ",
  postponed: "مؤجَّل",
  cancelled: "ملغى",
  superseded: "محلّ محلّه قرار آخر",
  archived: "مؤرشف",
};

export const IMPACT_STATE_LABELS_AR: Record<ImpactState, string> = {
  pending_assessment: "بانتظار التقييم",
  not_applicable: "غير منطبق",
  needs_review: "يحتاج مراجعة",
  action_required: "يحتاج إجراء",
  plan_created: "أُنشئت خطة تصحيح",
  in_progress: "قيد التنفيذ",
  compliant: "ممتثل",
  overdue: "متأخر",
  closed: "مغلق",
};

export const RISK_LABELS_AR = {
  low: "منخفض",
  medium: "متوسط",
  high: "مرتفع",
  critical: "حرج",
} as const;
