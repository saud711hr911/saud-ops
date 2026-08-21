// وحدة الرصد النظامي والامتثال — الأنواع.
// كل ما في lib/compliance خالٍ من drizzle ومن D1، فهو منطق قابل للاختبار وحده،
// وينتقل كما هو إن تحوّل التطبيق إلى Firestore لاحقًا.

export type Authority = "MHRSD" | "GOSI" | "QIWA" | "MUDAD" | "AJEER" | "OTHER";

export type RegulatoryCategory =
  | "saudization"
  | "wage_protection"
  | "gosi"
  | "contracts"
  | "work_permits"
  | "ajeer"
  | "ohs"
  | "other";

export type UpdateStatus =
  | "draft"
  | "pending_review"
  | "rejected"
  | "approved"
  | "in_effect"
  | "postponed"
  | "cancelled"
  | "superseded"
  | "archived";

export type ImpactState =
  | "pending_assessment"
  | "not_applicable"
  | "needs_review"
  | "action_required"
  | "plan_created"
  | "in_progress"
  | "compliant"
  | "overdue"
  | "closed";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type MeasureType =
  | "saudization_rate"
  | "headcount"
  | "registration"
  | "document"
  | "wage_threshold"
  | "procedure";

export type ApplicabilityOp =
  | "in"
  | "notIn"
  | "=="
  | "!="
  | ">="
  | "<="
  | "containsAny"
  | "containsAll"
  | "any";

export type ApplicabilityRule = {
  field: string;
  op: ApplicabilityOp;
  value: unknown;
  labelAr?: string;
};

export type ApplicabilityGroup = {
  logic: "AND" | "OR";
  rules: Array<ApplicabilityRule | ApplicabilityGroup>;
  unknownFieldPolicy?: "needs_review" | "treat_as_false";
};

export type Measure = {
  type: MeasureType;
  targetValue: number | null;
  unit: "percent" | "count" | "sar" | "none";
  scope?: { occupationCodes?: string[] };
  measuredBy: Authority | "internal";
  internalEstimateAllowed: boolean;
};

export type RequiredAction = { code: string; label: string };

export type MatchTraceEntry = {
  rule: string;
  ruleAr: string;
  value: unknown;
  passed: boolean | null;
  unknown?: boolean;
};

export type ImpactGap = {
  metric: string;
  currentValue: number | null;
  currentValueAsOf: string | null;
  currentValueSource: string | null;
  requiredValue: number | null;
  estimatedHires: number | null;
  estimateIsIndicative: true;
  stale: boolean;
};

export type OccupationCount = { code: string; label?: string; total: number; saudis: number };

export type WorkforceSnapshot = {
  asOf: string;
  source: "qiwa_manual" | "qiwa_export" | "estimated";
  totalEmployees: number;
  saudis: number;
  nonSaudis: number;
  // الرقم كما يظهر في قوى — لا يُحتسب داخل مَسار
  saudizationRate: number;
  occupations: OccupationCount[];
};

export type ComplianceProfile = {
  isicCode: string | null;
  activityLabel?: string | null;
  sector?: string | null;
  cityCode?: string | null;
  mhrsdEstablishmentId?: string | null;
  nitaqatBand?: "platinum" | "green" | "yellow" | "red" | null;
  nitaqatBandAsOf?: string | null;
  platforms?: Partial<Record<"qiwa" | "gosi" | "mudad" | "ajeer", boolean>>;
};

// السياق المسطّح الذي يعمل عليه محرك المطابقة
export type ClientContext = {
  clientId: number;
  clientName: string;
  profile: ComplianceProfile;
  workforce: WorkforceSnapshot | null;
};

export type RegulatoryUpdateInput = {
  id: number;
  code: string;
  title: string;
  summary: string;
  authority: Authority;
  categories: RegulatoryCategory[];
  effectiveDate: string | null;
  correctionDeadline: string | null;
  applicability: ApplicabilityGroup | null;
  measure: Measure | null;
  status: UpdateStatus;
};

export type AssessedImpact = {
  /** معرّف حتمي: `${updateId}__${clientId}` — يمنع التكرار عند إعادة أي تشغيل */
  id: string;
  updateId: number;
  clientId: number;
  effectiveDate: string | null;
  applicable: boolean | null;
  matchTrace: MatchTraceEntry[];
  gap: ImpactGap | null;
  risk: RiskLevel;
  state: ImpactState;
  isOverdue: boolean;
  daysRemaining: number | null;
  internalDeadline: string | null;
  escalationLevel: number;
  escalationBaselineDate: string | null;
  engineVersion: string;
};

export type ComplianceStepTemplate = { order: number; title: string; offsetDays: number };

export type ComplianceTemplate = {
  code: string;
  appliesToCategories: RegulatoryCategory[] | null;
  appliesToMeasureType: MeasureType | null;
  subjectTemplate: string;
  serviceType: string;
  defaultPriority: string;
  internalDeadlineOffsetDays: number;
  steps: ComplianceStepTemplate[];
};
