// واجهة مكتبة الرصد الآلي.
export * from "./types.ts";
export { ADAPTERS, SOURCE_KIND_LABELS_AR, parseFeed, parseJsonFeed } from "./adapters.ts";
export { DEFAULT_KEYWORDS, extractByRules, isRelevant, relevanceHits } from "./extract.ts";
export { AUTHORITIES, CATEGORIES, isSafeHttpsUrl, validateCandidate } from "./schema.ts";
export { DEGRADED_AFTER_EMPTY_RUNS, DOWN_AFTER_FAILURES, HEALTH_LABELS_AR, INITIAL_HEALTH, nextHealth } from "./health.ts";
export { fnv1a64, itemFingerprint } from "./fingerprint.ts";
export { normalizeDigits, normalizeForMatch } from "./text.ts";
