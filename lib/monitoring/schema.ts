// المخطط المغلق للمرشّح، والتحقق من روابط المصادر.
//
// validateCandidate هي البوابة الوحيدة بين أي مستخلِص وقاعدة البيانات:
// تنسخ الحقول المسموحة فقط، وتقصّ الأطوال، وترفض القيم خارج النطاق،
// ولا تملك أي حقل حالة — فلا يستطيع مستخلِص أن «يعتمد» قرارًا.

import type { Authority, RegulatoryCategory } from "../compliance/types.ts";
import type { Candidate } from "./types.ts";

export const AUTHORITIES: Authority[] = ["MHRSD", "GOSI", "QIWA", "MUDAD", "AJEER", "OTHER"];
export const CATEGORIES: RegulatoryCategory[] = ["saudization", "wage_protection", "gosi", "contracts", "work_permits", "ajeer", "ohs", "other"];

export type ValidationResult = { ok: true; candidate: Candidate } | { ok: false; errors: string[] };

const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

function isoDateInRange(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time)) return null;
  const year = Number(value.slice(0, 4));
  if (year < 2015 || year > 2100) return null;
  // يرفض 2026-02-31 وأمثاله التي يقبلها Date.parse بالتدوير
  return new Date(time).toISOString().slice(0, 10) === value ? value : null;
}

export function validateCandidate(input: unknown): ValidationResult {
  if (!input || typeof input !== "object") return { ok: false, errors: ["المخرج ليس كائنًا"] };
  const row = input as Record<string, unknown>;
  const errors: string[] = [];
  const warnings = Array.isArray(row.warnings) ? row.warnings.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 300)).slice(0, 10) : [];

  const title = str(row.title, 300);
  if (title.length < 3) errors.push("العنوان مفقود أو قصير جدًا");

  const authority = AUTHORITIES.includes(row.authority as Authority) ? (row.authority as Authority) : "OTHER";
  if (authority !== row.authority) warnings.push("جهة غير معروفة — عُيّنت «جهة أخرى».");

  const categories = (Array.isArray(row.categories) ? row.categories : [])
    .filter((item): item is RegulatoryCategory => CATEGORIES.includes(item as RegulatoryCategory));
  const uniqueCategories = [...new Set(categories)];
  if (!uniqueCategories.length) uniqueCategories.push("other");

  const effectiveDate = row.effectiveDate == null ? null : isoDateInRange(row.effectiveDate);
  if (row.effectiveDate != null && !effectiveDate) warnings.push("تاريخ نفاذ غير صالح أُسقط — حدّده يدويًا.");

  let targetValue: number | null = null;
  if (row.targetValue != null) {
    const value = Number(row.targetValue);
    if (Number.isFinite(value) && value >= 0 && value <= 100) targetValue = Math.round(value * 100) / 100;
    else warnings.push("قيمة مستهدفة خارج النطاق أُسقطت.");
  }

  const sourceUrl = typeof row.sourceUrl === "string" && isSafeHttpsUrl(row.sourceUrl) ? row.sourceUrl.slice(0, 1000) : null;
  const publishedAt = typeof row.publishedAt === "string" && !Number.isNaN(Date.parse(row.publishedAt)) ? new Date(row.publishedAt).toISOString() : null;
  const referenceRaw = str(row.referenceNumber, 40);
  const confidenceRaw = Number(row.confidence);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    candidate: {
      title,
      summary: str(row.summary, 2000),
      authority,
      categories: uniqueCategories,
      effectiveDate,
      referenceNumber: referenceRaw || null,
      targetValue,
      sourceUrl,
      publishedAt,
      confidence: Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0,
      warnings,
    },
  };
}

/**
 * روابط المصادر: https فقط، وبلا عناوين داخلية — لأن الخادم هو من يجلبها.
 * (يُعاد التحقق من الرابط النهائي بعد التحويلات في طبقة الجلب.)
 */
export function isSafeHttpsUrl(value: string): boolean {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host.includes(".") && !host.includes(":")) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return false;
  if (host === "metadata.google.internal") return false;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || a === 0 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
  }
  if (host.includes(":")) {
    if (host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80") || host.startsWith("::ffff:")) return false;
  }
  return true;
}
