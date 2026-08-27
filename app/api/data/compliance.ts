// وحدة الرصد النظامي والامتثال — طبقة Firestore والإجراءات.
//
// كل المنطق القابل للاختبار في lib/compliance (خالٍ من Firebase تمامًا)؛
// هذا الملف يقرأ ويكتب فقط. يُستدعى من app/api/data/route.ts بسطرين.
//
// منع التكرار: Firestore بلا قيود فريدة، فالبديل هو **معرّفات مستندات حتمية**:
//   regulatory_impacts/{updateId}__{clientId}
//   compliance_steps/{updateId}__{clientId}__{order}
//   compliance_alerts/{updateId}__{clientId}__{level}__{recipient}
// إعادة تشغيل أي دالة تصيب المستند نفسه بدل إنشاء ثانٍ.

import {
  adminDb,
  createRecord,
  getRecord,
  listRecords,
  newNumericId,
  nowIso,
  recordReference,
  updateRecord,
} from "../../../lib/firebase-admin";
import { ApiError, requireRole, type CurrentUser } from "../../../lib/server-auth";

import { assessImpact, impactId } from "../../../lib/compliance/assessment.ts";
import { addDays, riyadhDate, remainingLabelAr } from "../../../lib/compliance/dates.ts";
import { planEscalation, stepFor } from "../../../lib/compliance/escalation.ts";
import { isSnapshotStale } from "../../../lib/compliance/gap.ts";
import {
  ACTIVE_IMPACT_STATES,
  LIVE_UPDATE_STATUSES,
  RISK_LABELS_AR,
  canTransitionUpdate,
} from "../../../lib/compliance/lifecycle.ts";
import { pickTemplate, renderSubject, riskToPriority, scheduleSteps } from "../../../lib/compliance/plan.ts";
import { DEFAULT_TEMPLATES } from "../../../lib/compliance/templates.ts";
import type {
  ApplicabilityGroup,
  AssessedImpact,
  ClientContext,
  ComplianceTemplate,
  Measure,
  RegulatoryCategory,
  RegulatoryUpdateInput,
  UpdateStatus,
  WorkforceSnapshot,
} from "../../../lib/compliance/types.ts";

// ── المجموعات ─────────────────────────────────────────────────
const COL = {
  updates: "regulatory_updates",
  revisions: "regulatory_revisions",
  impacts: "regulatory_impacts",
  profiles: "compliance_profiles",
  snapshots: "workforce_snapshots",
  templates: "compliance_templates",
  steps: "compliance_steps",
  alerts: "compliance_alerts",
  sources: "regulatory_sources",
  clients: "clients",
  tasks: "tasks",
  activities: "activities",
  appUsers: "app_users",
} as const;

// ── سجلات Firestore ───────────────────────────────────────────
export type RegulatoryUpdateRecord = {
  id: number;
  code: string;
  referenceNumber: string | null;
  title: string;
  summary: string;
  authority: string;
  categories: RegulatoryCategory[];
  announcementDate: string | null;
  effectiveDate: string | null;
  gracePeriodEndDate: string | null;
  correctionDeadline: string | null;
  hijriEffectiveDate: string | null;
  sourceUrl: string | null;
  officialDocUrl: string | null;
  applicability: ApplicabilityGroup | null;
  measure: Measure | null;
  requiredActions: Array<{ code: string; label: string }>;
  status: UpdateStatus;
  supersedesId: number | null;
  supersededById: number | null;
  version: number;
  previousEffectiveDate: string | null;
  statusReason: string | null;
  extractionMethod: "ai" | "manual";
  extractionConfidence: number | null;
  extractionWarnings: string[];
  createdByEmail: string;
  reviewedByEmail: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RegulatoryImpactRecord = AssessedImpact & {
  taskId: number | null;
  assessedAt: string;
  updatedAt: string;
};

export type ComplianceProfileRecord = {
  id: number;
  clientId: number;
  isicCode: string | null;
  activityLabel: string | null;
  sector: string | null;
  cityCode: string | null;
  mhrsdEstablishmentId: string | null;
  nitaqatBand: string | null;
  nitaqatBandAsOf: string | null;
  platforms: Record<string, boolean>;
  completeness: number;
  missingFields: string[];
  lastVerifiedAt: string | null;
  verifiedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkforceSnapshotRecord = WorkforceSnapshot & {
  id: number;
  clientId: number;
  capturedBy: string;
  createdAt: string;
};

export type ComplianceStepRecord = {
  id: string;
  impactId: string;
  taskId: number | null;
  stepOrder: number;
  title: string;
  dueDate: string;
  status: string;
  completedAt: string | null;
  completedBy: string | null;
  createdAt: string;
};

export type ComplianceAlertRecord = {
  id: string;
  impactId: string;
  level: number;
  recipientEmail: string;
  audience: string;
  channels: string[];
  title: string;
  message: string;
  aggregated: boolean;
  status: string;
  scheduledFor: string;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
};

export type ComplianceTemplateRecord = ComplianceTemplate & { id: number; active: boolean };

type RevisionRecord = {
  id: number;
  updateId: number;
  version: number;
  snapshot: RegulatoryUpdateRecord;
  reason: string;
  actorEmail: string;
  createdAt: string;
};

type ActivityRecord = {
  id: number;
  clientId: number;
  taskId: number | null;
  actor: string;
  event: string;
  detail: string;
  createdAt: string;
};

type TaskRecord = {
  id: number;
  code: string;
  clientId: number;
  documentId: number | null;
  serviceType: string;
  subject: string;
  assignedTo: string | null;
  assignedEmail: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  currentStep: string;
  paymentStatus: string;
  amount: number | null;
  notes: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

type AppUserLite = { id: number; email: string; role: string; active: boolean };

// ── أدوات صغيرة ───────────────────────────────────────────────
const clean = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const nullable = (value: unknown) => clean(value) || null;
const num = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** بريد المستقبِل داخل معرّف المستند — نُبقيه آمنًا كمكوّن مسار */
const emailSlug = (email: string) => email.replace(/[^a-z0-9]/gi, "_").toLowerCase();

const stepDocId = (impact: string, order: number) => `${impact}__S${order}`;
const alertDocId = (impact: string, level: number, email: string) => `${impact}__L${level}__${emailSlug(email)}`;

/** قراءة مجموعة كاملة بمعرّفات نصية (helpers الأساسية تفترض معرّفات رقمية) */
async function listDocs<T>(collectionName: string): Promise<T[]> {
  const snapshot = await adminDb.collection(collectionName).get();
  return snapshot.docs.map((document) => document.data() as T);
}

async function getDoc<T>(collectionName: string, id: string): Promise<T | null> {
  const snapshot = await adminDb.collection(collectionName).doc(id).get();
  return snapshot.exists ? (snapshot.data() as T) : null;
}

async function queryDocs<T>(
  collectionName: string,
  field: string,
  operator: FirebaseFirestore.WhereFilterOp,
  value: unknown,
): Promise<T[]> {
  const snapshot = await adminDb.collection(collectionName).where(field, operator, value).get();
  return snapshot.docs.map((document) => document.data() as T);
}

// ═══════════════════════════════════════════════════════════════
// اللقطة — تُدمج في مخرج GET /api/data
// ═══════════════════════════════════════════════════════════════

export async function complianceSnapshot(user: CurrentUser) {
  // المرحلة 1: ملف الامتثال غير معروض للعميل (قرار موثّق في وثيقة الوحدة §6)
  if (user.role === "client") {
    return {
      regulatoryUpdates: [], regulatoryImpacts: [], complianceProfiles: [],
      workforceSnapshots: [], complianceSteps: [], complianceAlerts: [],
    };
  }

  const [updates, impactsAll, profiles, snapshots, steps, alerts] = await Promise.all([
    listRecords<RegulatoryUpdateRecord>(COL.updates),
    listDocs<RegulatoryImpactRecord>(COL.impacts),
    listRecords<ComplianceProfileRecord>(COL.profiles),
    listRecords<WorkforceSnapshotRecord>(COL.snapshots),
    listDocs<ComplianceStepRecord>(COL.steps),
    queryDocs<ComplianceAlertRecord>(COL.alerts, "recipientEmail", "==", user.email),
  ]);

  let impacts = impactsAll;
  if (user.role === "employee") {
    // الموظف يرى آثار العملاء الذين لديه معاملات مسندة عندهم فقط
    const tasks = await listRecords<TaskRecord>(COL.tasks);
    const allowed = new Set(
      tasks.filter((task) => (task.assignedEmail || "").toLowerCase() === user.email).map((task) => task.clientId),
    );
    impacts = impactsAll.filter((impact) => allowed.has(impact.clientId));
  }

  const visibleImpacts = new Set(impacts.map((impact) => impact.id));

  return {
    regulatoryUpdates: [...updates].sort(byEffectiveDate),
    regulatoryImpacts: [...impacts].sort(byEffectiveDate),
    complianceProfiles: profiles,
    // أحدث لقطة لكل منشأة فقط — السجل الكامل يُقرأ عند الحاجة
    workforceSnapshots: latestPerClient(snapshots),
    complianceSteps: steps.filter((step) => visibleImpacts.has(step.impactId)).sort((a, b) => a.stepOrder - b.stepOrder),
    complianceAlerts: [...alerts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 60),
  };
}

function byEffectiveDate(a: { effectiveDate: string | null }, b: { effectiveDate: string | null }) {
  return String(a.effectiveDate || "9999").localeCompare(String(b.effectiveDate || "9999"));
}

function latestPerClient(rows: WorkforceSnapshotRecord[]) {
  const byClient = new Map<number, WorkforceSnapshotRecord>();
  for (const row of rows) {
    const current = byClient.get(row.clientId);
    if (!current || row.asOf > current.asOf) byClient.set(row.clientId, row);
  }
  return [...byClient.values()];
}

// ═══════════════════════════════════════════════════════════════
// الإجراءات
// ═══════════════════════════════════════════════════════════════

const COMPLIANCE_ACTIONS = new Set([
  "create_regulatory_update",
  "update_regulatory_update",
  "review_regulatory_update",
  "change_regulatory_status",
  "assess_regulatory_impacts",
  "save_compliance_profile",
  "save_workforce_snapshot",
  "create_compliance_plan",
  "complete_compliance_step",
  "mark_compliance_alert_sent",
  "compliance_tick",
]);

export function isComplianceAction(action: string) {
  return COMPLIANCE_ACTIONS.has(action);
}

export async function handleComplianceAction(
  action: string,
  payload: Record<string, unknown>,
  user: CurrentUser,
): Promise<Record<string, unknown> | null> {
  if (!isComplianceAction(action)) return null;
  const actor = user.fullName;

  // ── 1. إدخال قرار يدويًا ─────────────────────────────────────
  if (action === "create_regulatory_update") {
    requireRole(user, "owner");
    const title = clean(payload.title);
    if (!title) throw new ApiError("عنوان القرار مطلوب.");
    const effectiveDate = nullable(payload.effectiveDate);
    if (!effectiveDate) throw new ApiError("تاريخ النفاذ مطلوب — بدونه لا عدّ تنازلي ولا تصعيد.");

    const targetValue = num(payload.targetValue);
    const timestamp = nowIso();
    const created = await createRecord<RegulatoryUpdateRecord>(COL.updates, {
      code: `REG-${new Date().getUTCFullYear()}-${String(Date.now()).slice(-5)}`,
      referenceNumber: nullable(payload.referenceNumber),
      title,
      summary: clean(payload.summary),
      authority: clean(payload.authority) || "MHRSD",
      categories: normalizeCategories(payload.categories),
      announcementDate: nullable(payload.announcementDate),
      effectiveDate,
      gracePeriodEndDate: nullable(payload.gracePeriodEndDate),
      correctionDeadline: nullable(payload.correctionDeadline),
      hijriEffectiveDate: nullable(payload.hijriEffectiveDate),
      sourceUrl: nullable(payload.sourceUrl),
      officialDocUrl: nullable(payload.officialDocUrl),
      applicability: (payload.applicability as ApplicabilityGroup) ?? null,
      measure: (payload.measure as Measure) ?? (targetValue !== null
        ? { type: "saudization_rate", targetValue, unit: "percent", measuredBy: "QIWA", internalEstimateAllowed: true }
        : null),
      requiredActions: (payload.requiredActions as Array<{ code: string; label: string }>) ?? [],
      // بوابة المراجعة إلزامية — لا اعتماد عند الإنشاء
      status: "pending_review",
      supersedesId: null,
      supersededById: null,
      version: 1,
      previousEffectiveDate: null,
      statusReason: null,
      extractionMethod: "manual",
      extractionConfidence: null,
      extractionWarnings: [],
      createdByEmail: user.email,
      reviewedByEmail: null,
      reviewedAt: null,
      reviewNotes: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // الربط اليدوي يُحفظ حتى يُستخدم عند الاعتماد
    const manualClientIds = toIdList(payload.manualClientIds);
    if (manualClientIds.length) {
      await updateRecord(COL.updates, created.id, { manualClientIds });
    }
    return { ok: true, update: created };
  }

  // ── 2. تعديل قرار ────────────────────────────────────────────
  if (action === "update_regulatory_update") {
    requireRole(user, "owner");
    const update = await loadUpdate(num(payload.id));

    // أثر تدقيق: أي تعديل بعد الاعتماد يُحفظ نسخةً كاملة
    if (!["draft", "pending_review", "rejected"].includes(update.status)) {
      await createRecord<RevisionRecord>(COL.revisions, {
        updateId: update.id,
        version: update.version,
        snapshot: update,
        reason: clean(payload.reason) || "تعديل بعد الاعتماد",
        actorEmail: user.email,
        createdAt: nowIso(),
      });
    }

    const nextEffective = nullable(payload.effectiveDate) ?? update.effectiveDate;
    await updateRecord(COL.updates, update.id, {
      title: clean(payload.title) || update.title,
      summary: payload.summary === undefined ? update.summary : clean(payload.summary),
      authority: clean(payload.authority) || update.authority,
      categories: payload.categories ? normalizeCategories(payload.categories) : update.categories,
      effectiveDate: nextEffective,
      correctionDeadline: nullable(payload.correctionDeadline) ?? update.correctionDeadline,
      sourceUrl: nullable(payload.sourceUrl) ?? update.sourceUrl,
      applicability: payload.applicability === undefined ? update.applicability : payload.applicability,
      measure: payload.measure === undefined ? update.measure : payload.measure,
      previousEffectiveDate: nextEffective !== update.effectiveDate ? update.effectiveDate : update.previousEffectiveDate,
      version: update.version + 1,
      updatedAt: nowIso(),
    });

    if (LIVE_UPDATE_STATUSES.includes(update.status)) await reassessUpdate(update.id, null);
    return { ok: true };
  }

  // ── 3. بوابة الاعتماد البشري ─────────────────────────────────
  if (action === "review_regulatory_update") {
    requireRole(user, "owner");
    const update = await loadUpdate(num(payload.id));
    const decision = clean(payload.decision);
    if (!["approve", "reject"].includes(decision)) throw new ApiError("حدّد الاعتماد أو الرفض.");
    const next: UpdateStatus = decision === "approve" ? "approved" : "rejected";
    assertTransition(update.status, next);

    // فصل المهام: لا يعتمد المنشئ ما أنشأه ما دام هناك مراجع آخر
    let selfApproved = false;
    if (next === "approved" && update.createdByEmail === user.email) {
      const owners = await listRecords<AppUserLite>(COL.appUsers);
      const others = owners.filter((row) => row.role === "owner" && row.active && row.email !== user.email);
      if (others.length > 0) {
        throw new ApiError("لا يجوز اعتماد قرار أنشأته بنفسك. أحِله إلى مراجع آخر.", 403, "SELF_APPROVAL");
      }
      selfApproved = true;
    }

    await updateRecord(COL.updates, update.id, {
      status: next,
      reviewedByEmail: user.email,
      reviewedAt: nowIso(),
      reviewNotes: clean(payload.notes),
      updatedAt: nowIso(),
    });
    if (next === "rejected") return { ok: true, status: next };

    const manualClientIds = toIdList(payload.manualClientIds).length
      ? toIdList(payload.manualClientIds)
      : toIdList((update as unknown as { manualClientIds?: unknown }).manualClientIds);
    const summary = await reassessUpdate(update.id, manualClientIds.length ? manualClientIds : null);
    await logUpdateActivity(update.id, actor, "اعتماد قرار نظامي",
      `${update.title}${selfApproved ? " (اعتماد ذاتي — لا يوجد مراجع ثانٍ)" : ""} — ${summary.applicable} منشأة متأثرة، ${summary.needsReview} تحتاج مراجعة.`);

    return { ok: true, status: next, ...summary, selfApproved };
  }

  // ── 4. التأجيل والإلغاء يوقفان التصعيد فورًا ─────────────────
  if (action === "change_regulatory_status") {
    requireRole(user, "owner");
    const update = await loadUpdate(num(payload.id));
    const next = clean(payload.status) as UpdateStatus;
    assertTransition(update.status, next);

    const newEffectiveDate = nullable(payload.effectiveDate);
    if (next === "postponed" && !newEffectiveDate) throw new ApiError("أدخل تاريخ النفاذ الجديد عند التأجيل.");

    await createRecord<RevisionRecord>(COL.revisions, {
      updateId: update.id,
      version: update.version,
      snapshot: update,
      reason: `تغيير الحالة إلى ${next}`,
      actorEmail: user.email,
      createdAt: nowIso(),
    });
    await updateRecord(COL.updates, update.id, {
      status: next,
      previousEffectiveDate: update.effectiveDate,
      effectiveDate: next === "postponed" ? newEffectiveDate : update.effectiveDate,
      statusReason: clean(payload.reason),
      version: update.version + 1,
      updatedAt: nowIso(),
    });

    const halted = await haltEscalation(update, next, newEffectiveDate, actor);
    return { ok: true, status: next, halted };
  }

  // ── 5. إعادة التقييم يدويًا ──────────────────────────────────
  if (action === "assess_regulatory_impacts") {
    requireRole(user, "owner");
    const update = await loadUpdate(num(payload.id));
    if (!LIVE_UPDATE_STATUSES.includes(update.status)) {
      throw new ApiError(`لا يُقيَّم قرار بحالة ${update.status} — الاعتماد شرط مسبق.`);
    }
    const manualClientIds = toIdList(payload.manualClientIds);
    return { ok: true, ...(await reassessUpdate(update.id, manualClientIds.length ? manualClientIds : null)) };
  }

  // ── 6. ملف امتثال المنشأة ────────────────────────────────────
  if (action === "save_compliance_profile") {
    requireRole(user, "owner", "employee");
    const clientId = num(payload.clientId);
    if (!clientId) throw new ApiError("المنشأة غير محددة.");
    await assertComplianceClientAccess(user, clientId);

    const values = {
      clientId,
      isicCode: nullable(payload.isicCode),
      activityLabel: nullable(payload.activityLabel),
      sector: nullable(payload.sector),
      cityCode: nullable(payload.cityCode),
      mhrsdEstablishmentId: nullable(payload.mhrsdEstablishmentId),
      nitaqatBand: nullable(payload.nitaqatBand),
      nitaqatBandAsOf: nullable(payload.nitaqatBandAsOf),
      platforms: (payload.platforms as Record<string, boolean>) ?? {},
      lastVerifiedAt: riyadhDate(),
      verifiedBy: user.email,
      updatedAt: nowIso(),
    };
    const completeness = profileCompleteness(values);

    const existing = (await listRecords<ComplianceProfileRecord>(COL.profiles))
      .find((row) => row.clientId === clientId);
    if (existing) {
      await updateRecord(COL.profiles, existing.id, { ...values, ...completeness });
    } else {
      await createRecord<ComplianceProfileRecord>(COL.profiles, {
        ...values, ...completeness, createdAt: nowIso(),
      } as Omit<ComplianceProfileRecord, "id">);
    }

    await writeActivity(clientId, null, actor, "تحديث ملف الامتثال",
      `اكتمال البيانات ${Math.round(completeness.completeness * 100)}%`);
    return { ok: true, completeness: completeness.completeness, reassessed: await reassessClient(clientId) };
  }

  // ── 7. لقطة القوى العاملة ────────────────────────────────────
  if (action === "save_workforce_snapshot") {
    requireRole(user, "owner", "employee");
    const clientId = num(payload.clientId);
    if (!clientId) throw new ApiError("المنشأة غير محددة.");
    await assertComplianceClientAccess(user, clientId);

    const totalEmployees = num(payload.totalEmployees) ?? 0;
    const saudis = num(payload.saudis) ?? 0;
    const rate = num(payload.saudizationRate);
    if (totalEmployees <= 0) throw new ApiError("أدخل إجمالي عدد الموظفين.");
    if (saudis > totalEmployees) throw new ApiError("عدد السعوديين لا يمكن أن يتجاوز الإجمالي.");
    if (rate === null) throw new ApiError("أدخل نسبة التوطين كما تظهر في قوى — مَسار لا يحتسبها داخليًا.");

    const asOf = nullable(payload.asOf) ?? riyadhDate();
    const values = {
      clientId, asOf,
      source: (clean(payload.source) || "qiwa_manual") as WorkforceSnapshot["source"],
      totalEmployees, saudis,
      nonSaudis: totalEmployees - saudis,
      saudizationRate: rate,
      occupations: (payload.occupations as WorkforceSnapshot["occupations"]) ?? [],
      capturedBy: user.email,
      createdAt: nowIso(),
    };

    // لقطة واحدة لكل (منشأة، تاريخ) — إعادة الإدخال تحديث لا تكرار
    const existing = (await listRecords<WorkforceSnapshotRecord>(COL.snapshots))
      .find((row) => row.clientId === clientId && row.asOf === asOf);
    if (existing) await updateRecord(COL.snapshots, existing.id, values);
    else await createRecord<WorkforceSnapshotRecord>(COL.snapshots, values);

    await writeActivity(clientId, null, actor, "تحديث بيانات القوى العاملة",
      `${totalEmployees} موظفًا — نسبة التوطين ${rate}% بتاريخ ${asOf}`);
    return { ok: true, reassessed: await reassessClient(clientId) };
  }

  // ── 8. إنشاء خطة التصحيح ─────────────────────────────────────
  if (action === "create_compliance_plan") {
    requireRole(user, "owner");
    const result = await createPlan(clean(payload.impactId), {
      actor,
      assignedTo: nullable(payload.assignedTo),
      assignedEmail: nullable(payload.assignedEmail),
      today: riyadhDate(),
    });
    return { ok: true, ...result };
  }

  // ── 9. إنجاز خطوة ────────────────────────────────────────────
  if (action === "complete_compliance_step") {
    requireRole(user, "owner", "employee");
    const step = await getDoc<ComplianceStepRecord>(COL.steps, clean(payload.id));
    if (!step) throw new ApiError("الخطوة غير موجودة.", 404, "NOT_FOUND");

    const impact = await getDoc<RegulatoryImpactRecord>(COL.impacts, step.impactId);
    if (impact) await assertComplianceClientAccess(user, impact.clientId);

    const done = payload.done !== false;
    await adminDb.collection(COL.steps).doc(step.id).update({
      status: done ? "مكتملة" : "مطلوبة",
      completedAt: done ? nowIso() : null,
      completedBy: done ? user.email : null,
    });

    if (step.taskId && impact) {
      const siblings = (await queryDocs<ComplianceStepRecord>(COL.steps, "impactId", "==", step.impactId))
        .map((row) => (row.id === step.id ? { ...row, status: done ? "مكتملة" : "مطلوبة" } : row))
        .sort((a, b) => a.stepOrder - b.stepOrder);
      const nextStep = siblings.find((row) => row.status !== "مكتملة");

      await updateRecord(COL.tasks, step.taskId, {
        currentStep: nextStep ? nextStep.title : "مكتملة ومؤرشفة",
        status: nextStep ? "قيد التنفيذ" : "مكتملة",
        updatedAt: nowIso(),
      });
      await adminDb.collection(COL.impacts).doc(impact.id).update({
        state: nextStep ? "in_progress" : "compliant",
        escalationLevel: nextStep ? impact.escalationLevel : 0,
        updatedAt: nowIso(),
      });
      await writeActivity(impact.clientId, step.taskId, actor,
        nextStep ? "إنجاز خطوة امتثال" : "إغلاق التزام نظامي", step.title);
    }
    return { ok: true };
  }

  // ── 10. تسجيل إرسال تنبيه ────────────────────────────────────
  if (action === "mark_compliance_alert_sent") {
    requireRole(user, "owner", "employee");
    const id = clean(payload.id);
    if (!id) throw new ApiError("التنبيه غير محدد.");
    await adminDb.collection(COL.alerts).doc(id).update({ status: "تم الإرسال", sentAt: nowIso() });
    return { ok: true };
  }

  // ── 11. التقويم اليومي ───────────────────────────────────────
  if (action === "compliance_tick") {
    requireRole(user, "owner");
    return { ok: true, ...(await runComplianceTick({ today: clean(payload.today) || riyadhDate(), now: new Date() })) };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// المحرّك
// ═══════════════════════════════════════════════════════════════

async function loadUpdate(id: number | null) {
  if (!id) throw new ApiError("القرار غير محدد.");
  const record = await getRecord<RegulatoryUpdateRecord>(COL.updates, id);
  if (!record) throw new ApiError("القرار غير موجود.", 404, "NOT_FOUND");
  return record;
}

function assertTransition(from: UpdateStatus, to: UpdateStatus) {
  if (!canTransitionUpdate(from, to)) {
    throw new ApiError(`انتقال غير مسموح: ${from} ← ${to}`, 409, "INVALID_TRANSITION");
  }
}

async function assertComplianceClientAccess(user: CurrentUser, clientId: number) {
  if (user.role === "owner") return;
  if (user.role === "employee") {
    const tasks = await listRecords<TaskRecord>(COL.tasks);
    if (tasks.some((task) => task.clientId === clientId && (task.assignedEmail || "").toLowerCase() === user.email)) return;
  }
  throw new ApiError("لا يمكنك الوصول إلى ملف هذه المنشأة.", 403, "FORBIDDEN");
}

function normalizeCategories(value: unknown): RegulatoryCategory[] {
  const allowed = new Set([
    "saudization", "wage_protection", "gosi", "contracts", "work_permits", "ajeer", "ohs", "other",
  ]);
  const list = (Array.isArray(value) ? value : [value]).map((item) => clean(item)).filter((item) => allowed.has(item));
  return (list.length ? list : ["other"]) as RegulatoryCategory[];
}

function toIdList(value: unknown): number[] {
  return Array.isArray(value) ? value.map(Number).filter((item) => Number.isFinite(item) && item > 0) : [];
}

function profileCompleteness(profile: Record<string, unknown>) {
  const required = ["isicCode", "cityCode", "sector", "mhrsdEstablishmentId"];
  const missingFields = required.filter((key) => !profile[key]);
  return { completeness: (required.length - missingFields.length) / required.length, missingFields };
}

async function writeActivity(clientId: number, taskId: number | null, actor: string, event: string, detail: string) {
  await createRecord<ActivityRecord>(COL.activities, { clientId, taskId, actor, event, detail, createdAt: nowIso() });
}

async function logUpdateActivity(updateId: number, actor: string, event: string, detail: string) {
  const impacts = await queryDocs<RegulatoryImpactRecord>(COL.impacts, "updateId", "==", updateId);
  const first = impacts.find((impact) => impact.applicable === true);
  if (first) await writeActivity(first.clientId, null, actor, event, detail);
}

async function buildClientContexts(clientIds?: number[]): Promise<ClientContext[]> {
  const [clients, profiles, snapshots] = await Promise.all([
    listRecords<{ id: number; name: string }>(COL.clients),
    listRecords<ComplianceProfileRecord>(COL.profiles),
    listRecords<WorkforceSnapshotRecord>(COL.snapshots),
  ]);

  const wanted = clientIds?.length ? clients.filter((client) => clientIds.includes(client.id)) : clients;
  const profileByClient = new Map(profiles.map((row) => [row.clientId, row]));
  const latest = new Map<number, WorkforceSnapshotRecord>();
  for (const row of snapshots) {
    const current = latest.get(row.clientId);
    if (!current || row.asOf > current.asOf) latest.set(row.clientId, row);
  }

  return wanted.map((client) => {
    const profile = profileByClient.get(client.id);
    const snapshot = latest.get(client.id);
    return {
      clientId: client.id,
      clientName: client.name,
      profile: profile
        ? {
            isicCode: profile.isicCode,
            activityLabel: profile.activityLabel,
            sector: profile.sector,
            cityCode: profile.cityCode,
            mhrsdEstablishmentId: profile.mhrsdEstablishmentId,
            nitaqatBand: profile.nitaqatBand as ClientContext["profile"]["nitaqatBand"],
            nitaqatBandAsOf: profile.nitaqatBandAsOf,
            platforms: profile.platforms,
          }
        : { isicCode: null },
      workforce: snapshot
        ? {
            asOf: snapshot.asOf,
            source: snapshot.source,
            totalEmployees: snapshot.totalEmployees,
            saudis: snapshot.saudis,
            nonSaudis: snapshot.nonSaudis,
            saudizationRate: snapshot.saudizationRate,
            occupations: snapshot.occupations ?? [],
          }
        : null,
    };
  });
}

function toUpdateInput(record: RegulatoryUpdateRecord): RegulatoryUpdateInput {
  return {
    id: record.id,
    code: record.code,
    title: record.title,
    summary: record.summary,
    authority: record.authority as RegulatoryUpdateInput["authority"],
    categories: record.categories ?? [],
    effectiveDate: record.effectiveDate,
    correctionDeadline: record.correctionDeadline,
    applicability: record.applicability,
    measure: record.measure,
    status: record.status,
  };
}

/** كتابة دفعية بمعرّفات حتمية — إعادة التشغيل لا تُنتج تكرارًا */
async function persistImpacts(impacts: AssessedImpact[], previous: Map<string, RegulatoryImpactRecord>) {
  for (let index = 0; index < impacts.length; index += 450) {
    const batch = adminDb.batch();
    for (const impact of impacts.slice(index, index + 450)) {
      const prior = previous.get(impact.id);
      batch.set(adminDb.collection(COL.impacts).doc(impact.id), {
        ...impact,
        taskId: prior?.taskId ?? null,
        assessedAt: nowIso(),
        updatedAt: nowIso(),
      } satisfies RegulatoryImpactRecord, { merge: true });
    }
    await batch.commit();
  }
}

async function reassessUpdate(updateId: number, manualClientIds: number[] | null) {
  const update = await loadUpdate(updateId);
  const today = riyadhDate();
  const [contexts, existing] = await Promise.all([
    buildClientContexts(),
    queryDocs<RegulatoryImpactRecord>(COL.impacts, "updateId", "==", updateId),
  ]);
  const previous = new Map(existing.map((row) => [row.id, row]));

  const assessed = contexts.map((context) =>
    assessImpact(toUpdateInput(update), context, {
      today,
      manualClientIds,
      previous: previous.get(impactId(updateId, context.clientId)) ?? null,
    }),
  );

  await persistImpacts(assessed, previous);
  return {
    evaluated: assessed.length,
    applicable: assessed.filter((row) => row.applicable === true).length,
    notApplicable: assessed.filter((row) => row.applicable === false).length,
    needsReview: assessed.filter((row) => row.applicable === null).length,
  };
}

async function reassessClient(clientId: number) {
  const today = riyadhDate();
  const [updates, contexts, existing] = await Promise.all([
    listRecords<RegulatoryUpdateRecord>(COL.updates),
    buildClientContexts([clientId]),
    queryDocs<RegulatoryImpactRecord>(COL.impacts, "clientId", "==", clientId),
  ]);
  const context = contexts[0];
  const live = updates.filter((update) => LIVE_UPDATE_STATUSES.includes(update.status));
  if (!context || !live.length) return 0;

  const previous = new Map(existing.map((row) => [row.id, row]));
  const assessed = live.map((update) =>
    assessImpact(toUpdateInput(update), context, {
      today,
      previous: previous.get(impactId(update.id, clientId)) ?? null,
    }),
  );
  await persistImpacts(assessed, previous);
  return assessed.length;
}

/**
 * التأجيل أو الإلغاء: يوقف التصعيد فورًا ويسجّل إشعارًا تصحيحيًا.
 * بدون هذا سيعرض مَسار بعد سنة عدًّا تنازليًا لقرار مؤجَّل — وهو أسوأ من غياب النظام.
 */
async function haltEscalation(
  update: RegulatoryUpdateRecord,
  status: UpdateStatus,
  newEffectiveDate: string | null,
  actor: string,
) {
  const impacts = await queryDocs<RegulatoryImpactRecord>(COL.impacts, "updateId", "==", update.id);
  if (!impacts.length) return 0;
  const cancelled = status === "cancelled" || status === "superseded";

  for (let index = 0; index < impacts.length; index += 450) {
    const batch = adminDb.batch();
    for (const impact of impacts.slice(index, index + 450)) {
      batch.update(adminDb.collection(COL.impacts).doc(impact.id), {
        escalationLevel: 0,
        effectiveDate: newEffectiveDate ?? impact.effectiveDate,
        escalationBaselineDate: newEffectiveDate ?? impact.effectiveDate,
        isOverdue: false,
        daysRemaining: null,
        ...(cancelled ? { state: "closed" } : {}),
        updatedAt: nowIso(),
      });
    }
    await batch.commit();
  }

  for (const impact of impacts) {
    if (impact.applicable !== true || (!impact.taskId && impact.escalationLevel === 0)) continue;
    await writeActivity(impact.clientId, impact.taskId, actor,
      cancelled ? "إلغاء قرار نظامي" : "تأجيل قرار نظامي",
      cancelled
        ? `${update.title} — أُوقفت المتابعة والتنبيهات المرتبطة به.`
        : `${update.title} — تاريخ النفاذ الجديد ${newEffectiveDate}. أُعيد ضبط العدّ التنازلي.`);
  }
  return impacts.length;
}

async function loadTemplates(): Promise<ComplianceTemplate[]> {
  const rows = await listRecords<ComplianceTemplateRecord>(COL.templates);
  const active = rows.filter((row) => row.active !== false);
  if (active.length) return active;

  // زرع أولي عند أول استخدام — القوالب بيانات لا كود
  for (const template of DEFAULT_TEMPLATES) {
    await createRecord<ComplianceTemplateRecord>(COL.templates, { ...template, active: true });
  }
  return DEFAULT_TEMPLATES;
}

async function createPlan(
  impact_id: string,
  options: { actor: string; assignedTo: string | null; assignedEmail: string | null; today: string },
) {
  if (!impact_id) throw new ApiError("الالتزام غير محدد.");
  const impact = await getDoc<RegulatoryImpactRecord>(COL.impacts, impact_id);
  if (!impact) throw new ApiError("الالتزام غير موجود.", 404, "NOT_FOUND");
  if (impact.taskId) return { taskId: impact.taskId, created: false, stepCount: 0, compressed: false };
  if (impact.applicable !== true) {
    throw new ApiError("لا تُنشأ خطة تصحيح لالتزام غير منطبق أو يحتاج مراجعة.");
  }

  const [update, client, templates] = await Promise.all([
    loadUpdate(impact.updateId),
    getRecord<{ id: number; name: string }>(COL.clients, impact.clientId),
    loadTemplates(),
  ]);
  if (!client) throw new ApiError("المنشأة غير موجودة.", 404, "NOT_FOUND");

  const template = pickTemplate(templates, update.categories ?? [], update.measure?.type ?? null);
  if (!template) throw new ApiError("لا يوجد قالب خطة مطابق.");

  const effectiveDate = impact.effectiveDate ?? addDays(options.today, 90);
  const { steps, compressed } = scheduleSteps(template, effectiveDate, options.today);
  const dueDate = addDays(effectiveDate, template.internalDeadlineOffsetDays);
  const taskId = newNumericId();

  // Firestore يدعم المعاملات فعليًا: إنشاء المعاملة وربطها بالالتزام ذرّيًا،
  // فلا تنشأ خطتان لالتزام واحد مهما تزامنت النقرات.
  const impactRef = adminDb.collection(COL.impacts).doc(impact.id);
  const taskRef = recordReference(COL.tasks, taskId);

  const outcome = await adminDb.runTransaction(async (transaction) => {
    const fresh = await transaction.get(impactRef);
    const current = fresh.data() as RegulatoryImpactRecord | undefined;
    if (current?.taskId) return { taskId: current.taskId, created: false };

    transaction.set(taskRef, {
      id: taskId,
      code: `REG-${String(Date.now()).slice(-6)}`,
      clientId: impact.clientId,
      documentId: null,
      serviceType: template.serviceType,
      subject: renderSubject(template.subjectTemplate, {
        requiredValue: update.measure?.targetValue ?? "",
        clientName: client.name,
        title: update.title,
      }),
      assignedTo: options.assignedTo,
      assignedEmail: options.assignedEmail,
      status: "قيد التنفيذ",
      priority: template.defaultPriority || riskToPriority(impact.risk),
      dueDate,
      currentStep: steps[0]?.title ?? "مراجعة المتطلبات",
      paymentStatus: "غير مطلوب",
      amount: null,
      notes: update.summary,
      // يظهر في شاشات المهام الحالية بمصدر واضح
      source: "رصد نظامي",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    for (const step of steps) {
      transaction.set(adminDb.collection(COL.steps).doc(stepDocId(impact.id, step.order)), {
        id: stepDocId(impact.id, step.order),
        impactId: impact.id,
        taskId,
        stepOrder: step.order,
        title: step.title,
        dueDate: step.dueDate,
        status: "مطلوبة",
        completedAt: null,
        completedBy: null,
        createdAt: nowIso(),
      } satisfies ComplianceStepRecord);
    }

    transaction.update(impactRef, {
      taskId,
      state: "plan_created",
      internalDeadline: dueDate,
      updatedAt: nowIso(),
    });
    return { taskId, created: true };
  });

  if (!outcome.created) return { ...outcome, stepCount: 0, compressed: false };

  await writeActivity(impact.clientId, taskId, options.actor, "إنشاء خطة تصحيح نظامية",
    `${update.title} — ${steps.length} خطوة${compressed ? " (جدول مضغوط لقصر المدة المتبقية)" : ""}`);
  return { taskId, created: true, stepCount: steps.length, compressed };
}

// ═══════════════════════════════════════════════════════════════
// التقويم اليومي — العدّ التنازلي والتصعيد
// ═══════════════════════════════════════════════════════════════

export type TickSummary = {
  today: string;
  scanned: number;
  levelChanged: number;
  plansCreated: number;
  alertsCreated: number;
  staleFlagged: number;
  errors: string[];
};

export async function runComplianceTick(options: { today: string; now: Date }): Promise<TickSummary> {
  const summary: TickSummary = {
    today: options.today, scanned: 0, levelChanged: 0, plansCreated: 0,
    alertsCreated: 0, staleFlagged: 0, errors: [],
  };

  // ضبط التكلفة: الآثار النشطة فقط، لا كل التقاطعات
  const impacts = (await listDocs<RegulatoryImpactRecord>(COL.impacts))
    .filter((impact) => ACTIVE_IMPACT_STATES.includes(impact.state));
  summary.scanned = impacts.length;
  if (!impacts.length) return summary;

  const [updates, clients, tasks, appUsers, snapshots, steps, todayAlerts] = await Promise.all([
    listRecords<RegulatoryUpdateRecord>(COL.updates),
    listRecords<{ id: number; name: string }>(COL.clients),
    listRecords<TaskRecord>(COL.tasks),
    listRecords<AppUserLite>(COL.appUsers),
    listRecords<WorkforceSnapshotRecord>(COL.snapshots),
    listDocs<ComplianceStepRecord>(COL.steps),
    queryDocs<ComplianceAlertRecord>(COL.alerts, "scheduledFor", ">=", options.today),
  ]);

  const updateById = new Map(updates.map((row) => [row.id, row]));
  const clientById = new Map(clients.map((row) => [row.id, row]));
  const taskById = new Map(tasks.map((row) => [row.id, row]));
  const ownerEmails = appUsers.filter((row) => row.role === "owner" && row.active).map((row) => row.email);

  const latestSnapshot = new Map<number, WorkforceSnapshotRecord>();
  for (const row of snapshots) {
    const current = latestSnapshot.get(row.clientId);
    if (!current || row.asOf > current.asOf) latestSnapshot.set(row.clientId, row);
  }

  const countsToday = new Map<string, number>();
  for (const alert of todayAlerts) {
    countsToday.set(alert.recipientEmail, (countsToday.get(alert.recipientEmail) ?? 0) + 1);
  }

  for (const impact of impacts) {
    try {
      const update = updateById.get(impact.updateId);
      const client = clientById.get(impact.clientId);
      if (!update || !client) {
        summary.errors.push(`الالتزام ${impact.id}: القرار أو المنشأة غير موجود`);
        continue;
      }
      const task = impact.taskId ? taskById.get(impact.taskId) : undefined;
      const own = steps.filter((step) => step.impactId === impact.id);
      const doneSteps = own.filter((step) => step.status === "مكتملة").length;

      const recipients = {
        // لا يوجد حقل «متابع» في نموذج العميل الحالي، فالمالك هو المتابع الافتراضي
        watcher: ownerEmails[0] ?? null,
        assignee: task?.assignedEmail ?? null,
        owner: ownerEmails[0] ?? null,
      };

      const plan = planEscalation({
        impactId: impact.id,
        effectiveDate: impact.effectiveDate,
        today: options.today,
        currentLevel: impact.escalationLevel,
        state: impact.state,
        risk: impact.risk,
        applicable: impact.applicable,
        updateStatus: update.status,
        baselineEffectiveDate: impact.escalationBaselineDate ?? impact.effectiveDate,
        hasCase: Boolean(impact.taskId),
        caseIsProgressing: Boolean(task && task.status === "قيد التنفيذ" && doneSteps > 0 && doneSteps < own.length),
        // التفرّد مضمون بمعرّف مستند حتمي لا بمجموعة في الذاكرة
        sentKeys: new Set<string>(),
        userNotificationCountToday: {
          watcher: countsToday.get(recipients.watcher ?? "") ?? 0,
          assignee: countsToday.get(recipients.assignee ?? "") ?? 0,
          owner: countsToday.get(recipients.owner ?? "") ?? 0,
        },
        now: options.now,
      });

      // (أ) اللقطة القديمة: نوسم ولا نعرض رقمًا قديمًا كأنه حالي
      const stale = impact.gap ? isSnapshotStale(latestSnapshot.get(impact.clientId) ?? null, options.today) : false;
      if (stale && impact.gap && !impact.gap.stale) {
        summary.staleFlagged++;
        await ensureRefreshTask(impact.clientId, client.name, options.today);
      }

      // (ب) تحديث العدّ التنازلي
      await adminDb.collection(COL.impacts).doc(impact.id).update({
        daysRemaining: plan.daysRemaining,
        isOverdue: plan.isOverdue,
        escalationLevel: plan.level,
        escalationBaselineDate: impact.effectiveDate,
        ...(impact.gap ? { gap: { ...impact.gap, stale } } : {}),
        ...(plan.isOverdue && !["closed", "compliant"].includes(impact.state) ? { state: "overdue" } : {}),
        updatedAt: nowIso(),
      });
      if (plan.level !== impact.escalationLevel) summary.levelChanged++;

      // (ج) خطة تصحيح تلقائية عند المستوى 3
      if (plan.shouldCreateCase) {
        const result = await createPlan(impact.id, {
          actor: "النظام", assignedTo: null, assignedEmail: recipients.assignee, today: options.today,
        });
        if (result.created) summary.plansCreated++;
      }

      // (د) الإشعار — مرة واحدة لكل (التزام، مستوى، مستقبِل)
      if (plan.notification.send) {
        for (const audience of plan.notification.audience) {
          const email = recipients[audience];
          if (!email) continue;
          const created = await claimAlert({
            impact, update, client: client.name, level: plan.level, email, audience,
            channels: plan.notification.channels,
            aggregated: plan.notification.aggregate,
            deferUntilMorning: plan.notification.deferUntilMorning,
            deliverAfterHour: plan.notification.deliverAfterHour,
            daysRemaining: plan.daysRemaining,
            today: options.today,
          });
          if (created) summary.alertsCreated++;
        }
        if (plan.level >= 5) {
          await writeActivity(impact.clientId, impact.taskId, "النظام", "تصعيد التزام نظامي",
            `${update.title} — ${stepFor(plan.level).labelAr}`);
        }
      }
    } catch (error) {
      summary.errors.push(`الالتزام ${impact.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return summary;
}

/**
 * إنشاء التنبيه بمعرّف حتمي عبر `create` — يفشل إن كان المستند موجودًا،
 * وهذا بالضبط ما يجعل تكرار التشغيل بلا إشعارات مكررة.
 */
async function claimAlert(input: {
  impact: RegulatoryImpactRecord;
  update: RegulatoryUpdateRecord;
  client: string;
  level: number;
  email: string;
  audience: string;
  channels: string[];
  aggregated: boolean;
  deferUntilMorning: boolean;
  deliverAfterHour: number | null;
  daysRemaining: number | null;
  today: string;
}): Promise<boolean> {
  const id = alertDocId(input.impact.id, input.level, input.email);
  const gap = input.impact.gap;
  const gapText =
    gap && gap.currentValue !== null && gap.requiredValue !== null
      ? ` — الفجوة: ${gap.currentValue}% ← ${gap.requiredValue}%`
      : "";

  const record: ComplianceAlertRecord = {
    id,
    impactId: input.impact.id,
    level: input.level,
    recipientEmail: input.email,
    audience: input.audience,
    channels: input.channels,
    title: `${input.update.title} — ${input.client}`,
    message: `${remainingLabelAr(input.daysRemaining)} • الخطورة: ${RISK_LABELS_AR[input.impact.risk]}${gapText}`,
    aggregated: input.aggregated,
    // الصمت الليلي يؤخّر التسليم ولا يُسقط الرصد: التشغيل المجدول عند 05:00
    // يقع داخل الصمت، فلو أسقطناه لما وصل تنبيه أبدًا.
    status: input.deferUntilMorning ? "مؤجل حتى الصباح" : input.aggregated ? "مجمّع" : "جاهز للإرسال",
    scheduledFor: input.deliverAfterHour === null
      ? input.today
      : `${input.today} ${String(input.deliverAfterHour).padStart(2, "0")}:00`,
    sentAt: null,
    readAt: null,
    createdAt: nowIso(),
  };

  try {
    await adminDb.collection(COL.alerts).doc(id).create(record);
    return true;
  } catch (error) {
    // ALREADY_EXISTS ⇒ أُرسل هذا المستوى سابقًا لهذا المستقبِل
    if ((error as { code?: number }).code === 6) return false;
    throw error;
  }
}

/** مهمة «تحديث بيانات القوى العاملة» — لا تُنشأ مكررة ما دامت مفتوحة */
async function ensureRefreshTask(clientId: number, clientName: string, today: string) {
  const all = await listRecords<TaskRecord>(COL.tasks);
  const open = all.find(
    (task) => task.clientId === clientId
      && task.serviceType === "تحديث بيانات القوى العاملة"
      && ["جديدة", "قيد التنفيذ"].includes(task.status),
  );
  if (open) return;

  await createRecord<TaskRecord>(COL.tasks, {
    code: `WF-${String(Date.now()).slice(-6)}`,
    clientId,
    documentId: null,
    serviceType: "تحديث بيانات القوى العاملة",
    subject: `تحديث لقطة القوى العاملة — ${clientName}`,
    assignedTo: null,
    assignedEmail: null,
    status: "جديدة",
    priority: "متوسطة",
    dueDate: today,
    currentStep: "سحب الأرقام من قوى",
    paymentStatus: "غير مطلوب",
    amount: null,
    notes: "آخر لقطة تجاوزت 45 يومًا. حدّث الأرقام قبل الاعتماد على الفجوة المعروضة.",
    source: "رصد نظامي",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
}
