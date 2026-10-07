// الرصد الآلي للقرارات النظامية — الأنواع.
// lib/monitoring خالٍ من Firebase ومن الشبكة: دوال خالصة قابلة للاختبار وحدها.
// الجلب والتخزين في app/api/data/monitoring.ts.
//
// المبدأ الحاكم: الرصد الآلي **يقترح** ولا **يعتمد**. كل ما يُستخلص يدخل
// بحالة pending_review ويمر ببوابة الاعتماد البشري القائمة نفسها.

import type { Authority, RegulatoryCategory } from "../compliance/types.ts";

/** أنواع المصادر المدعومة. يُضاف نوع جديد بمحوّل جديد في adapters.ts فقط. */
export type SourceKind = "rss" | "json_feed";

export type SourceConfig = {
  id: number;
  name: string;
  authority: Authority;
  kind: SourceKind;
  url: string;
  active: boolean;
  /** كلمات تُضاف إلى كلمات الصلة الافتراضية لهذا المصدر */
  keywords: string[];
};

/** عنصر خام كما ورد من المصدر بعد التطبيع */
export type RawItem = {
  externalId: string | null;
  title: string;
  url: string | null;
  publishedAt: string | null;
  summary: string;
};

export type HealthStatus = "unknown" | "healthy" | "degraded" | "down";

export type SourceHealth = {
  status: HealthStatus;
  consecutiveFailures: number;
  emptyRuns: number;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  lastItemCount: number;
};

export type FetchOutcome =
  | { ok: true; itemCount: number; at: string }
  | { ok: false; error: string; at: string };

/**
 * المرشّح المستخلص — مخطط مغلق. لا يمر إلى قاعدة البيانات إلا ما في هذا النوع،
 * بعد validateCandidate، مهما كان المستخلِص (قواعد اليوم، أو نموذج لغوي لاحقًا).
 */
export type Candidate = {
  title: string;
  summary: string;
  authority: Authority;
  categories: RegulatoryCategory[];
  effectiveDate: string | null;
  referenceNumber: string | null;
  targetValue: number | null;
  sourceUrl: string | null;
  publishedAt: string | null;
  confidence: number;
  warnings: string[];
};

export type Extractor = (item: RawItem, source: Pick<SourceConfig, "authority" | "keywords">) => unknown;
