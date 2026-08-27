// قوالب خطط التصحيح.
// تُزرع في جدول compliance_templates عند تجهيز القاعدة (INSERT OR IGNORE)،
// فتبقى قابلة للتعديل من قاعدة البيانات لا من الكود.

import type { ComplianceTemplate } from "./types.ts";

export const DEFAULT_TEMPLATES: ComplianceTemplate[] = [
  {
    code: "TPL-SAUDIZATION-RAISE",
    appliesToCategories: ["saudization"],
    appliesToMeasureType: "saudization_rate",
    subjectTemplate: "رفع نسبة التوطين إلى {{requiredValue}}% — {{clientName}}",
    serviceType: "امتثال نظامي — توطين",
    defaultPriority: "مرتفعة",
    internalDeadlineOffsetDays: -60,
    steps: [
      { order: 1, title: "مراجعة المهن المشمولة بالقرار", offsetDays: -120 },
      { order: 2, title: "مراجعة السعوديين المحتسبين في قوى", offsetDays: -110 },
      { order: 3, title: "التأكد من الأجور المؤهِّلة للاحتساب", offsetDays: -100 },
      { order: 4, title: "تحديد العجز المطلوب", offsetDays: -95 },
      { order: 5, title: "بدء التوظيف", offsetDays: -90 },
      { order: 6, title: "التحقق من النسبة في قوى", offsetDays: -20 },
      { order: 7, title: "إغلاق المعاملة", offsetDays: -5 },
    ],
  },
  {
    code: "TPL-REGISTRATION",
    appliesToCategories: null,
    appliesToMeasureType: "registration",
    subjectTemplate: "{{title}} — {{clientName}}",
    serviceType: "امتثال نظامي — تسجيل",
    defaultPriority: "متوسطة",
    internalDeadlineOffsetDays: -30,
    steps: [
      { order: 1, title: "التحقق من متطلبات التسجيل", offsetDays: -45 },
      { order: 2, title: "تجهيز المستندات المطلوبة", offsetDays: -30 },
      { order: 3, title: "إتمام التسجيل في المنصة", offsetDays: -15 },
      { order: 4, title: "حفظ إثبات التسجيل وإغلاق المعاملة", offsetDays: -5 },
    ],
  },
  {
    code: "TPL-WAGE-PROTECTION",
    appliesToCategories: ["wage_protection"],
    appliesToMeasureType: null,
    subjectTemplate: "حماية الأجور: {{title}} — {{clientName}}",
    serviceType: "امتثال نظامي — حماية الأجور",
    defaultPriority: "مرتفعة",
    internalDeadlineOffsetDays: -30,
    steps: [
      { order: 1, title: "مطابقة ملف الرواتب مع بيانات مدد", offsetDays: -45 },
      { order: 2, title: "معالجة حالات عدم المطابقة", offsetDays: -25 },
      { order: 3, title: "رفع ملف الرواتب في الموعد", offsetDays: -10 },
      { order: 4, title: "التحقق من نسبة الالتزام وإغلاق المعاملة", offsetDays: -3 },
    ],
  },
  {
    code: "TPL-GENERIC",
    appliesToCategories: null,
    appliesToMeasureType: null,
    subjectTemplate: "{{title}} — {{clientName}}",
    serviceType: "امتثال نظامي",
    defaultPriority: "متوسطة",
    internalDeadlineOffsetDays: -30,
    steps: [
      { order: 1, title: "دراسة القرار وتحديد المطلوب", offsetDays: -60 },
      { order: 2, title: "تنفيذ الإجراءات المطلوبة", offsetDays: -30 },
      { order: 3, title: "التحقق من الامتثال", offsetDays: -10 },
      { order: 4, title: "إغلاق المعاملة", offsetDays: -3 },
    ],
  },
];

export const AUTHORITY_LABELS_AR: Record<string, string> = {
  MHRSD: "الموارد البشرية والتنمية الاجتماعية",
  GOSI: "التأمينات الاجتماعية",
  QIWA: "قوى",
  MUDAD: "مدد",
  AJEER: "أجير",
  OTHER: "جهة أخرى",
};

export const CATEGORY_LABELS_AR: Record<string, string> = {
  saudization: "التوطين",
  wage_protection: "حماية الأجور",
  gosi: "التأمينات",
  contracts: "العقود",
  work_permits: "رخص العمل",
  ajeer: "أجير",
  ohs: "السلامة المهنية",
  other: "أخرى",
};

export const MEASURE_LABELS_AR: Record<string, string> = {
  saudization_rate: "نسبة توطين",
  headcount: "عدد موظفين",
  registration: "تسجيل في منصة",
  document: "مستند مطلوب",
  wage_threshold: "حد أجر",
  procedure: "إجراء تشغيلي",
};

export const COMPLIANCE_DISCLAIMER_AR =
  "هذه المعلومات ملخّص تنظيمي لأغراض المتابعة الإدارية، وليست استشارة نظامية. " +
  "المرجع الملزم هو النص الرسمي الصادر عن الجهة المختصة والمنشور في الجريدة الرسمية. " +
  "يُرجى التحقق من الرابط الرسمي المرفق قبل اتخاذ أي إجراء.";
