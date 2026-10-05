// الرصد الآلي للقرارات النظامية — طبقة الجلب وFirestore والإجراءات.
//
// المنطق كله في lib/monitoring (خالص). هنا فقط: جلب الرابط بحدود صارمة،
// تخزين البصمات، تحديث صحة المصدر، وإنشاء المرشّحات بحالة pending_review.
// لا يوجد مسار هنا يعتمد قرارًا — الاعتماد يبقى بشريًا عبر review_regulatory_update.

import { adminDb, createRecord, getRecord, listRecords, nowIso, updateRecord } from "../../../lib/firebase-admin";
import { ApiError, requireRole, type CurrentUser } from "../../../lib/server-auth";
import {
  ADAPTERS,
  AUTHORITIES,
  INITIAL_HEALTH,
  extractByRules,
  isRelevant,
  isSafeHttpsUrl,
  itemFingerprint,
  nextHealth,
  validateCandidate,
  type RawItem,
  type SourceConfig,
  type SourceHealth,
  type SourceKind,
} from "../../../lib/monitoring/index.ts";
import type { Authority } from "../../../lib/compliance/types.ts";
import type { RegulatoryUpdateRecord } from "./compliance";

const COL = {
  sources: "regulatory_sources",
  items: "regulatory_source_items",
  updates: "regulatory_updates",
} as const;

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 2_000_000;
/** أول فحص لمصدر جديد: يُسجَّل كل ما فيه كمرئي، ولا يُقترح إلا ما نُشر خلال هذه المدة */
const BACKFILL_DAYS = 30;
const SYSTEM_ACTOR = "monitor@masar.system";

export type RegulatorySourceRecord = SourceConfig & {
  health: SourceHealth;
  itemsSeen: number;
  candidatesCreated: number;
  createdByEmail: string;
  createdAt: string;
  updatedAt: string;
};

type SourceItemRecord = {
  id: string;
  sourceId: number;
  externalId: string | null;
  title: string;
  url: string | null;
  publishedAt: string | null;
  relevant: boolean;
  updateId: number | null;
  rejectedReason: string | null;
  seenAt: string;
};

export type MonitorSummary = {
  sources: number;
  checked: number;
  failed: number;
  newItems: number;
  candidatesCreated: number;
  errors: string[];
};

const clean = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const KINDS: SourceKind[] = ["rss", "json_feed"];

// ── اللقطة ────────────────────────────────────────────────────

export async function monitoringSnapshot(user: CurrentUser) {
  if (user.role !== "owner") return { regulatorySources: [] };
  const sources = await listRecords<RegulatorySourceRecord>(COL.sources);
  return { regulatorySources: sources.sort((a, b) => a.name.localeCompare(b.name, "ar")) };
}

// ── الإجراءات ─────────────────────────────────────────────────

const MONITORING_ACTIONS = new Set(["save_regulatory_source", "delete_regulatory_source", "run_regulatory_monitor"]);

export async function handleMonitoringAction(action: string, payload: Record<string, unknown>, user: CurrentUser) {
  if (!MONITORING_ACTIONS.has(action)) return null;
  requireRole(user, "owner");

  if (action === "save_regulatory_source") {
    const name = clean(payload.name);
    const url = clean(payload.url);
    const kind = clean(payload.kind) as SourceKind;
    const authority = (AUTHORITIES.includes(clean(payload.authority) as Authority) ? clean(payload.authority) : "OTHER") as Authority;
    const keywords = (Array.isArray(payload.keywords) ? payload.keywords : clean(payload.keywords).split(/[,،\n]/))
      .map((item) => clean(item)).filter(Boolean).slice(0, 30);
    if (!name) throw new ApiError("اسم المصدر مطلوب.");
    if (!KINDS.includes(kind)) throw new ApiError("نوع المصدر غير مدعوم.");
    if (!isSafeHttpsUrl(url)) throw new ApiError("رابط المصدر يجب أن يبدأ بـ https وأن يكون عنوانًا عامًا.");

    const id = Number(payload.id) || null;
    const timestamp = nowIso();
    if (id) {
      const existing = await getRecord<RegulatorySourceRecord>(COL.sources, id);
      if (!existing) throw new ApiError("المصدر غير موجود.", 404, "NOT_FOUND");
      const changedUrl = existing.url !== url || existing.kind !== kind;
      await updateRecord(COL.sources, id, {
        name, url, kind, authority, keywords,
        active: payload.active === undefined ? existing.active : payload.active !== false,
        ...(changedUrl ? { health: INITIAL_HEALTH } : {}),
        updatedAt: timestamp,
      });
      return { ok: true, id };
    }
    const created = await createRecord<RegulatorySourceRecord>(COL.sources, {
      name, url, kind, authority, keywords, active: true,
      health: INITIAL_HEALTH, itemsSeen: 0, candidatesCreated: 0,
      createdByEmail: user.email, createdAt: timestamp, updatedAt: timestamp,
    });
    return { ok: true, id: created.id };
  }

  if (action === "delete_regulatory_source") {
    const id = Number(payload.id);
    if (!id) throw new ApiError("المصدر غير محدد.");
    // البصمات تبقى عمدًا: إن أُعيد إضافة المصدر نفسه لا تعود أخباره القديمة مرشّحات
    await adminDb.collection(COL.sources).doc(String(id)).delete();
    return { ok: true };
  }

  // run_regulatory_monitor
  const sourceId = Number(payload.id) || null;
  return { ok: true, ...(await runRegulatoryMonitor({ now: new Date(), sourceId })) };
}

// ── المحرّك ───────────────────────────────────────────────────

async function fetchSource(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Masar-RegulatoryMonitor/1.0", Accept: "application/rss+xml, application/atom+xml, application/feed+json, application/json, text/xml;q=0.9, */*;q=0.5" },
      cache: "no-store",
    });
    if (response.url && !isSafeHttpsUrl(response.url)) throw new Error("حوّل المصدر إلى عنوان غير مسموح");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_BODY_BYTES) throw new Error("حجم الاستجابة أكبر من المسموح");

    const reader = response.body?.getReader();
    if (!reader) return await response.text();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) { await reader.cancel(); throw new Error("حجم الاستجابة أكبر من المسموح"); }
      chunks.push(value);
    }
    return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError") throw new Error("انتهت مهلة الاتصال بالمصدر");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** يسجّل البصمة؛ يعيد false إن كان العنصر معروفًا سابقًا */
async function claimItem(record: SourceItemRecord): Promise<boolean> {
  try {
    await adminDb.collection(COL.items).doc(record.id).create(record);
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 6) return false; // ALREADY_EXISTS
    throw error;
  }
}

async function createCandidate(source: RegulatorySourceRecord, item: RawItem, itemId: string): Promise<{ updateId: number | null; reason: string | null }> {
  const result = validateCandidate(extractByRules(item, source));
  if (!result.ok) return { updateId: null, reason: result.errors.join("، ") };
  const candidate = result.candidate;
  const timestamp = nowIso();
  const created = await createRecord<RegulatoryUpdateRecord>(COL.updates, {
    code: `REG-${new Date().getUTCFullYear()}-${String(Date.now()).slice(-5)}`,
    referenceNumber: candidate.referenceNumber,
    title: candidate.title,
    summary: candidate.summary,
    authority: candidate.authority,
    categories: candidate.categories,
    announcementDate: candidate.publishedAt ? candidate.publishedAt.slice(0, 10) : null,
    effectiveDate: candidate.effectiveDate,
    gracePeriodEndDate: null,
    correctionDeadline: null,
    hijriEffectiveDate: null,
    sourceUrl: candidate.sourceUrl,
    officialDocUrl: null,
    applicability: null,
    measure: candidate.targetValue !== null
      ? { type: "saudization_rate", targetValue: candidate.targetValue, unit: "percent", measuredBy: "QIWA", internalEstimateAllowed: true }
      : null,
    requiredActions: [],
    // بوابة الاعتماد البشري — لا يملك الرصد الآلي غير هذه الحالة
    status: "pending_review",
    supersedesId: null,
    supersededById: null,
    version: 1,
    previousEffectiveDate: null,
    statusReason: null,
    extractionMethod: "auto",
    extractionConfidence: candidate.confidence,
    extractionWarnings: candidate.warnings,
    sourceId: source.id,
    sourceItemId: itemId,
    publishedAt: candidate.publishedAt,
    createdByEmail: SYSTEM_ACTOR,
    reviewedByEmail: null,
    reviewedAt: null,
    reviewNotes: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return { updateId: created.id, reason: null };
}

export async function runRegulatoryMonitor(options: { now: Date; sourceId?: number | null }): Promise<MonitorSummary> {
  const all = await listRecords<RegulatorySourceRecord>(COL.sources);
  const sources = all.filter((source) => (options.sourceId ? source.id === options.sourceId : source.active));
  const summary: MonitorSummary = { sources: sources.length, checked: 0, failed: 0, newItems: 0, candidatesCreated: 0, errors: [] };
  const at = options.now.toISOString();
  const backfillFrom = options.now.getTime() - BACKFILL_DAYS * 86_400_000;

  for (const source of sources) {
    let items: RawItem[];
    try {
      if (!isSafeHttpsUrl(source.url)) throw new Error("رابط المصدر غير مسموح");
      items = ADAPTERS[source.kind](await fetchSource(source.url));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.failed++;
      summary.errors.push(`${source.name}: ${message}`);
      await updateRecord(COL.sources, source.id, { health: nextHealth(source.health, { ok: false, error: message, at }), updatedAt: at });
      continue;
    }

    summary.checked++;
    const firstRun = !source.health?.lastSuccessAt;
    let fresh = 0;
    let created = 0;
    for (const item of items) {
      const id = itemFingerprint(source.id, item);
      const relevant = isRelevant(item, source);
      const record: SourceItemRecord = {
        id, sourceId: source.id, externalId: item.externalId, title: item.title.slice(0, 300), url: item.url,
        publishedAt: item.publishedAt, relevant, updateId: null, rejectedReason: null, seenAt: at,
      };
      if (!(await claimItem(record))) continue;
      fresh++;
      if (!relevant) continue;
      if (firstRun && (!item.publishedAt || Date.parse(item.publishedAt) < backfillFrom)) {
        await adminDb.collection(COL.items).doc(id).update({ rejectedReason: "أقدم من نافذة الفحص الأول" });
        continue;
      }
      try {
        const result = await createCandidate(source, item, id);
        await adminDb.collection(COL.items).doc(id).update({ updateId: result.updateId, rejectedReason: result.reason });
        if (result.updateId) created++;
      } catch (error) {
        summary.errors.push(`${source.name} — ${item.title.slice(0, 60)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    summary.newItems += fresh;
    summary.candidatesCreated += created;
    await updateRecord(COL.sources, source.id, {
      health: nextHealth(source.health, { ok: true, itemCount: items.length, at }),
      itemsSeen: (source.itemsSeen ?? 0) + fresh,
      candidatesCreated: (source.candidatesCreated ?? 0) + created,
      updatedAt: at,
    });
  }
  return summary;
}
