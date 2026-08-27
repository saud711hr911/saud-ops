/**
 * محرك المطابقة الحتمي.
 *
 * مبدأ حاكم: «هل ينطبق هذا القرار على هذه المنشأة؟» دالة خالصة قابلة للتفسير،
 * لا مخرَج نموذج لغوي. الذكاء الاصطناعي يقترح القواعد فقط، والبشري يعتمدها،
 * وهذا الملف ينفّذها بنتيجة واحدة قابلة للشرح.
 *
 * قاعدة السلامة: الحقل غير المتوفر ⇒ needs_review، وليس false. الصمت ليس نفيًا.
 */

import type {
  ApplicabilityGroup,
  ApplicabilityRule,
  ClientContext,
  MatchTraceEntry,
} from "./types.ts";

export const MATCH_ENGINE_VERSION = "match-v1.0.0";

export interface MatchResult {
  /** true = منطبق، false = غير منطبق، null = يحتاج مراجعة */
  applicable: boolean | null;
  matchTrace: MatchTraceEntry[];
  /** أسماء الحقول التي تعذّر تقييمها */
  unknownFields: string[];
}

// ─────────────────────────────────────────────────────────────
// حلّ الحقول
// ─────────────────────────────────────────────────────────────

const UNKNOWN = Symbol("unknown-field");
type Resolved = unknown | typeof UNKNOWN;

/** الحقول المشتقة التي لا توجد حرفيًا في المستندات لكنها مفيدة في القواعد */
const DERIVED: Record<string, (c: ClientContext) => Resolved> = {
  "workforce.occupationCodes": (c) =>
    c.workforce ? c.workforce.occupations.map((o) => o.code) : UNKNOWN,
  "workforce.saudiCount": (c) => (c.workforce ? c.workforce.saudis : UNKNOWN),
  "workforce.nonSaudiCount": (c) => (c.workforce ? c.workforce.nonSaudis : UNKNOWN),
  "profile.activePlatforms": (c) => {
    const p = c.profile?.platforms;
    if (!p) return UNKNOWN;
    return Object.entries(p)
      .filter(([, active]) => active === true)
      .map(([platform]) => platform);
  },
};

export function resolveField(ctx: ClientContext, path: string): Resolved {
  if (path in DERIVED) return DERIVED[path](ctx);

  const parts = path.split(".");
  let cur: unknown = ctx;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object" || !(part in cur)) return UNKNOWN;
    cur = (cur as Record<string, unknown>)[part];
  }
  // القيم الفارغة تُعامَل كغير معروفة، لا كنفي
  if (cur === null || cur === undefined || cur === "") return UNKNOWN;
  if (Array.isArray(cur) && cur.length === 0) return cur; // مصفوفة فارغة = معلومة صحيحة
  return cur;
}

// ─────────────────────────────────────────────────────────────
// العمليات
// ─────────────────────────────────────────────────────────────

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [v];
}

/** مقارنة متساهلة بين رقم ونص رقمي (أكواد الأنشطة والمهن كثيرًا ما تُخزَّن كنص) */
function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "string") return String(a) === b;
  if (typeof a === "string" && typeof b === "number") return a === String(b);
  return false;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function evaluateOp(op: string, actual: unknown, expected: unknown): boolean | null {
  switch (op) {
    case "any":
      return true;

    case "in":
      return asArray(expected).some((e) => looseEq(actual, e));

    case "notIn":
      return !asArray(expected).some((e) => looseEq(actual, e));

    case "==":
      return looseEq(actual, expected);

    case "!=":
      return !looseEq(actual, expected);

    case ">=": {
      const a = toNumber(actual), b = toNumber(expected);
      return a === null || b === null ? null : a >= b;
    }

    case "<=": {
      const a = toNumber(actual), b = toNumber(expected);
      return a === null || b === null ? null : a <= b;
    }

    case "containsAny": {
      const list = asArray(actual);
      return asArray(expected).some((e) => list.some((a) => looseEq(a, e)));
    }

    case "containsAll": {
      const list = asArray(actual);
      return asArray(expected).every((e) => list.some((a) => looseEq(a, e)));
    }

    default:
      return null; // عملية غير مدعومة ⇒ تحتاج مراجعة، لا تُفترض صحيحة
  }
}

// ─────────────────────────────────────────────────────────────
// الشرح العربي
// ─────────────────────────────────────────────────────────────

const FIELD_LABELS_AR: Record<string, string> = {
  "profile.isicCode": "النشاط (رمز ISIC)",
  "profile.sector": "القطاع",
  "profile.cityCode": "المدينة",
  "profile.nitaqatBand": "نطاق المنشأة",
  "profile.activePlatforms": "المنصات المفعّلة",
  "workforce.totalEmployees": "إجمالي الموظفين",
  "workforce.saudis": "عدد السعوديين",
  "workforce.saudiCount": "عدد السعوديين",
  "workforce.nonSaudis": "عدد غير السعوديين",
  "workforce.nonSaudiCount": "عدد غير السعوديين",
  "workforce.saudizationRate": "نسبة التوطين الحالية",
  "workforce.occupationCodes": "المهن الموجودة في المنشأة",
};

const OP_LABELS_AR: Record<string, string> = {
  in: "ضمن",
  notIn: "ليس ضمن",
  "==": "يساوي",
  "!=": "لا يساوي",
  ">=": "لا يقل عن",
  "<=": "لا يزيد عن",
  containsAny: "يشمل أيًا من",
  containsAll: "يشمل كل",
  any: "أي قيمة",
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.join("، ");
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  return String(v);
}

export function describeRuleAr(rule: ApplicabilityRule): string {
  if (rule.labelAr) return rule.labelAr;
  const field = FIELD_LABELS_AR[rule.field] ?? rule.field;
  if (rule.op === "any") return `${field}: أي قيمة`;
  const op = OP_LABELS_AR[rule.op] ?? rule.op;
  return `${field} ${op} ${formatValue(rule.value)}`;
}

// ─────────────────────────────────────────────────────────────
// التقييم
// ─────────────────────────────────────────────────────────────

function isGroup(n: ApplicabilityRule | ApplicabilityGroup): n is ApplicabilityGroup {
  return (n as ApplicabilityGroup).logic !== undefined;
}

interface NodeResult {
  passed: boolean | null;
  trace: MatchTraceEntry[];
  unknownFields: string[];
}

function evalNode(
  node: ApplicabilityRule | ApplicabilityGroup,
  ctx: ClientContext,
  policy: "needs_review" | "treat_as_false",
): NodeResult {
  if (isGroup(node)) return evalGroup(node, ctx, node.unknownFieldPolicy ?? policy);

  const raw = resolveField(ctx, node.field);
  const isUnknown = raw === UNKNOWN;

  if (isUnknown && node.op !== "any") {
    const passed = policy === "treat_as_false" ? false : null;
    return {
      passed,
      unknownFields: [node.field],
      trace: [{
        rule: `${node.field} ${node.op} ${JSON.stringify(node.value)}`,
        ruleAr: describeRuleAr(node),
        value: null,
        passed,
        unknown: true,
      }],
    };
  }

  const actual = isUnknown ? null : raw;
  const passed = evaluateOp(node.op, actual, node.value);

  return {
    passed,
    unknownFields: passed === null ? [node.field] : [],
    trace: [{
      rule: `${node.field} ${node.op} ${JSON.stringify(node.value)}`,
      ruleAr: describeRuleAr(node),
      value: actual,
      passed,
      ...(passed === null ? { unknown: true } : {}),
    }],
  };
}

function evalGroup(
  group: ApplicabilityGroup,
  ctx: ClientContext,
  policy: "needs_review" | "treat_as_false",
): NodeResult {
  const results = group.rules.map((r) => evalNode(r, ctx, policy));
  const trace = results.flatMap((r) => r.trace);
  const unknownFields = results.flatMap((r) => r.unknownFields);

  let passed: boolean | null;
  if (group.logic === "AND") {
    // شرط واحد فاشل يقينًا يكفي للنفي حتى مع وجود مجهول — لا حاجة لمراجعة بشرية
    if (results.some((r) => r.passed === false)) passed = false;
    else if (results.some((r) => r.passed === null)) passed = null;
    else passed = true;
  } else {
    // OR: شرط واحد ناجح يقينًا يكفي للإثبات
    if (results.some((r) => r.passed === true)) passed = true;
    else if (results.some((r) => r.passed === null)) passed = null;
    else passed = false;
  }

  return { passed, trace, unknownFields };
}

/**
 * يقيّم انطباق قرار على منشأة.
 * `applicability = null` (قرار بلا قواعد مُهيكلة) ⇒ needs_review، لا انطباق تلقائي.
 */
export function evaluateApplicability(
  applicability: ApplicabilityGroup | null | undefined,
  ctx: ClientContext,
): MatchResult {
  if (!applicability || !applicability.rules || applicability.rules.length === 0) {
    return {
      applicable: null,
      unknownFields: [],
      matchTrace: [{
        rule: "applicability == null",
        ruleAr: "لم تُحدَّد معايير انطباق مُهيكلة لهذا القرار — يلزم تحديد المنشآت يدويًا",
        value: null,
        passed: null,
        unknown: true,
      }],
    };
  }

  const policy = applicability.unknownFieldPolicy ?? "needs_review";
  const res = evalGroup(applicability, ctx, policy);
  return { applicable: res.passed, matchTrace: res.trace, unknownFields: dedupe(res.unknownFields) };
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}
