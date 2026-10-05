// الاستخلاص بالقواعد — حتمي وقابل للشرح. لا يقرر شيئًا: يملأ مسودة، ويُعلن ما لم يجده.
//
// يُرجع كائنًا غير موثوق عمدًا (unknown) ليمر إلزاميًا عبر validateCandidate،
// تمامًا كما سيمر مخرج أي مستخلِص آخر يُضاف لاحقًا.

import type { RegulatoryCategory } from "../compliance/types.ts";
import type { Extractor, RawItem, SourceConfig } from "./types.ts";
import { normalizeDigits, normalizeForMatch } from "./text.ts";

/** كلمات الصلة الافتراضية: عنصر لا يحوي أيًّا منها لا يصبح مرشّحًا */
export const DEFAULT_KEYWORDS = [
  "توطين", "نطاقات", "سعودة", "حماية الأجور", "مدد", "التأمينات الاجتماعية", "رخص العمل", "رخصة عمل",
  "أجير", "عقد العمل", "عقود العمل", "نظام العمل", "اللائحة التنفيذية", "السلامة والصحة المهنية",
  "قرار وزاري", "قوى", "العمالة الوافدة", "المهن", "قصر المهن",
];

const CATEGORY_KEYWORDS: Array<[RegulatoryCategory, string[]]> = [
  ["saudization", ["توطين", "نطاقات", "سعودة", "قصر المهن", "نسبة التوطين"]],
  ["wage_protection", ["حماية الأجور", "مدد", "الأجور"]],
  ["gosi", ["التأمينات الاجتماعية", "التأمينات", "الاشتراكات"]],
  ["contracts", ["عقد العمل", "عقود العمل", "توثيق العقود"]],
  ["work_permits", ["رخص العمل", "رخصة عمل", "رخصة العمل", "تأشيرات العمل", "المقابل المالي"]],
  ["ajeer", ["أجير"]],
  ["ohs", ["السلامة والصحة المهنية", "السلامة المهنية", "الإجهاد الحراري", "ساعات العمل تحت الشمس"]],
];

const MONTHS: Record<string, number> = {
  "يناير": 1, "فبراير": 2, "مارس": 3, "ابريل": 4, "مايو": 5, "يونيو": 6, "يوليو": 7, "اغسطس": 8,
  "سبتمبر": 9, "اكتوبر": 10, "نوفمبر": 11, "ديسمبر": 12,
  "كانون الثاني": 1, "شباط": 2, "اذار": 3, "نيسان": 4, "ايار": 5, "حزيران": 6, "تموز": 7, "اب": 8,
  "ايلول": 9, "تشرين الاول": 10, "تشرين الثاني": 11, "كانون الاول": 12,
};

const EFFECTIVE_CUES = ["اعتبارا من", "ابتداء من", "بدءا من", "يبدا تطبيق", "يبدا العمل", "يسري", "نفاذ", "حيز التنفيذ", "تطبيق القرار", "يطبق"];
const HIJRI_PATTERN = /\d{1,2}\s*[/-]\s*\d{1,2}\s*[/-]\s*14\d{2}|14\d{2}\s*هـ|14\d{2}\s*ه\b/;

const pad = (n: number) => String(n).padStart(2, "0");

type FoundDate = { iso: string; index: number };

function findDates(text: string): FoundDate[] {
  const found: FoundDate[] = [];
  for (const match of text.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) {
    found.push({ iso: `${match[1]}-${pad(+match[2])}-${pad(+match[3])}`, index: match.index ?? 0 });
  }
  for (const match of text.matchAll(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(20\d{2})\b/g)) {
    found.push({ iso: `${match[3]}-${pad(+match[2])}-${pad(+match[1])}`, index: match.index ?? 0 });
  }
  const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
  for (const match of text.matchAll(new RegExp(`(\\d{1,2})\\s+(${monthNames})\\s+(20\\d{2})`, "g"))) {
    found.push({ iso: `${match[3]}-${pad(MONTHS[match[2]])}-${pad(+match[1])}`, index: match.index ?? 0 });
  }
  return found.filter((date) => !Number.isNaN(Date.parse(`${date.iso}T00:00:00Z`))).sort((a, b) => a.index - b.index);
}

export function relevanceHits(text: string, extraKeywords: string[] = []): string[] {
  const haystack = normalizeForMatch(text);
  return [...DEFAULT_KEYWORDS, ...extraKeywords].filter((keyword) => keyword && haystack.includes(normalizeForMatch(keyword)));
}

export function isRelevant(item: RawItem, source: Pick<SourceConfig, "keywords">): boolean {
  return relevanceHits(`${item.title} ${item.summary}`, source.keywords).length > 0;
}

export const extractByRules: Extractor = (item, source) => {
  const raw = `${item.title}. ${item.summary}`;
  const text = normalizeForMatch(raw);
  const warnings: string[] = [];

  const categories = CATEGORY_KEYWORDS
    .filter(([, words]) => words.some((word) => text.includes(normalizeForMatch(word))))
    .map(([category]) => category);
  if (!categories.length) {
    categories.push("other");
    warnings.push("لم يُحدَّد تصنيف واضح — صُنّف «أخرى».");
  }

  // تاريخ النفاذ: أقرب تاريخ يلي عبارة نفاذ، وإلا لا شيء — لا نخمّن
  const dates = findDates(text);
  let effectiveDate: string | null = null;
  for (const cue of EFFECTIVE_CUES) {
    const at = text.indexOf(cue);
    if (at < 0) continue;
    const next = dates.find((date) => date.index >= at && date.index - at < 80);
    if (next) { effectiveDate = next.iso; break; }
  }
  if (!effectiveDate) {
    warnings.push(dates.length
      ? "وُجدت تواريخ في النص لكن لم يُحسم أيها تاريخ النفاذ — حدّده يدويًا."
      : "لم يُعثر على تاريخ نفاذ — حدّده يدويًا قبل الاعتماد.");
  }
  if (HIJRI_PATTERN.test(text)) warnings.push("يحوي النص تاريخًا هجريًا لم يُحوَّل آليًا — راجعه.");

  // القيمة المستهدفة: نسبة مئوية قرب كلمة توطين فقط
  let targetValue: number | null = null;
  const percent = text.match(/(\d{1,3}(?:\.\d+)?)\s*(?:%|٪|في المائه|بالمائه)/);
  if (percent && categories.includes("saudization")) {
    targetValue = Number(percent[1]);
  } else if (percent) {
    warnings.push(`وردت نسبة ${percent[1]}% دون ربط واضح بالتوطين — لم تُعتمد قيمةً مستهدفة.`);
  }

  const reference = normalizeDigits(raw).match(/قرار\s*(?:وزاري|رقم)?\s*(?:رقم)?\s*\(?\s*(\d{2,7})\s*\)?/);

  const hits = relevanceHits(raw, source.keywords).length;
  let confidence = 0.25 + Math.min(hits, 4) * 0.08;
  if (effectiveDate) confidence += 0.2;
  if (!categories.includes("other")) confidence += 0.1;
  if (reference) confidence += 0.05;
  confidence -= warnings.length * 0.05;

  return {
    title: item.title,
    summary: item.summary.slice(0, 1500),
    authority: source.authority,
    categories,
    effectiveDate,
    referenceNumber: reference ? reference[1] : null,
    targetValue,
    sourceUrl: item.url,
    publishedAt: item.publishedAt,
    confidence: Math.round(Math.max(0.05, Math.min(0.95, confidence)) * 100) / 100,
    warnings,
  };
};
