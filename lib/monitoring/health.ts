// صحة المصدر: مصدر صامت ليس بالضرورة مصدرًا بلا أخبار — قد يكون تغيّر شكله أو تعطّل.
//
// - فشل الجلب أو التحليل: متعثر من أول مرة، ومتوقف بعد 3 مرات متتالية.
// - نجاح بلا عناصر: متعثر بعد 7 تشغيلات فارغة متتالية (غالبًا تغيّر هيكل الصفحة).
// - نجاح بعناصر: سليم، ويُصفَّر العدّادان.

import type { FetchOutcome, HealthStatus, SourceHealth } from "./types.ts";

export const DOWN_AFTER_FAILURES = 3;
export const DEGRADED_AFTER_EMPTY_RUNS = 7;

export const INITIAL_HEALTH: SourceHealth = {
  status: "unknown",
  consecutiveFailures: 0,
  emptyRuns: 0,
  lastCheckedAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastError: null,
  lastItemCount: 0,
};

export function nextHealth(previous: SourceHealth | null | undefined, outcome: FetchOutcome): SourceHealth {
  const base = { ...INITIAL_HEALTH, ...(previous ?? {}) };
  if (!outcome.ok) {
    const consecutiveFailures = base.consecutiveFailures + 1;
    return {
      ...base,
      status: consecutiveFailures >= DOWN_AFTER_FAILURES ? "down" : "degraded",
      consecutiveFailures,
      lastCheckedAt: outcome.at,
      lastFailureAt: outcome.at,
      lastError: outcome.error.slice(0, 300),
    };
  }
  const emptyRuns = outcome.itemCount === 0 ? base.emptyRuns + 1 : 0;
  return {
    ...base,
    status: emptyRuns >= DEGRADED_AFTER_EMPTY_RUNS ? "degraded" : "healthy",
    consecutiveFailures: 0,
    emptyRuns,
    lastCheckedAt: outcome.at,
    lastSuccessAt: outcome.at,
    lastError: emptyRuns >= DEGRADED_AFTER_EMPTY_RUNS ? `لا عناصر منذ ${emptyRuns} فحوصات متتالية — تحقّق من رابط المصدر.` : null,
    lastItemCount: outcome.itemCount,
  };
}

export const HEALTH_LABELS_AR: Record<HealthStatus, string> = {
  unknown: "لم يُفحص بعد",
  healthy: "سليم",
  degraded: "متعثر",
  down: "متوقف",
};
