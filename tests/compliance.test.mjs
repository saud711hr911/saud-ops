// اختبارات وحدة الرصد النظامي والامتثال — منطق خالص، بلا قاعدة بيانات.
//
// التشغيل:  npm run test:compliance
//   (node --experimental-strip-types --test tests/compliance.test.mjs)

import { test } from "node:test";
import assert from "node:assert/strict";

import { addDays, daysBetween, riyadhDate } from "../lib/compliance/dates.ts";
import { evaluateApplicability, evaluateOp, resolveField } from "../lib/compliance/matching.ts";
import {
  buildGap, computeRisk, estimateAdditionalSaudiHires, gapPoints, isSnapshotStale,
} from "../lib/compliance/gap.ts";
import { levelForDaysRemaining, planEscalation } from "../lib/compliance/escalation.ts";
import { assessImpact } from "../lib/compliance/assessment.ts";
import { pickTemplate, renderSubject, scheduleSteps } from "../lib/compliance/plan.ts";
import { canTransitionUpdate } from "../lib/compliance/lifecycle.ts";
import { DEFAULT_TEMPLATES } from "../lib/compliance/templates.ts";

// ── بيانات ثابتة للاختبار ────────────────────────────────────

const نادي = {
  clientId: 2,
  clientName: "الناهلة الرياضية",
  profile: { isicCode: "93110", sector: "sports", cityCode: "RUH" },
  workforce: {
    asOf: "2026-08-18",
    source: "qiwa_manual",
    totalEmployees: 25,
    saudis: 7,
    nonSaudis: 18,
    saudizationRate: 27,
    occupations: [
      { code: "3423", label: "مدرب لياقة", total: 6, saudis: 2 },
      { code: "4226", label: "موظف استقبال", total: 3, saudis: 3 },
    ],
  },
};

const قواعد_التوطين = {
  logic: "AND",
  rules: [
    { field: "profile.isicCode", op: "in", value: ["93110", "93120"] },
    { field: "workforce.totalEmployees", op: ">=", value: 5 },
    { field: "workforce.occupationCodes", op: "containsAny", value: ["3423", "4226"] },
  ],
};

// ═══════════════════════════════════════════════════════════════
// 1. التواريخ
// ═══════════════════════════════════════════════════════════════

test("تقويم الرياض: منتصف ليل UTC هو الثالثة فجرًا في الرياض", () => {
  assert.equal(riyadhDate(new Date("2026-08-20T00:00:00Z")), "2026-08-20");
  assert.equal(riyadhDate(new Date("2026-08-20T21:30:00Z")), "2026-08-21");
});

test("حساب الأيام يتجاوز حدود الشهور والسنوات الكبيسة", () => {
  assert.equal(daysBetween("2026-08-20", "2027-01-01"), 134);
  assert.equal(daysBetween("2028-02-28", "2028-03-01"), 2, "2028 سنة كبيسة");
  assert.equal(daysBetween("2027-01-01", "2026-12-25"), -7);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

// ═══════════════════════════════════════════════════════════════
// 2. محرك المطابقة
// ═══════════════════════════════════════════════════════════════

test("منشأة مستوفية لكل الشروط ⇒ منطبقة، مع أثر مطابقة كامل", () => {
  const result = evaluateApplicability(قواعد_التوطين, نادي);
  assert.equal(result.applicable, true);
  assert.equal(result.matchTrace.length, 3);
  assert.ok(result.matchTrace.every((entry) => entry.passed === true));
  assert.equal(result.matchTrace[0].ruleAr, "النشاط (رمز ISIC) ضمن 93110، 93120");
  assert.equal(result.matchTrace[1].value, 25);
});

test("نشاط خارج النطاق ⇒ غير منطبقة", () => {
  const موتر = { ...نادي, clientId: 3, clientName: "موتر مايند", profile: { isicCode: "62010", cityCode: "RUH" } };
  assert.equal(evaluateApplicability(قواعد_التوطين, موتر).applicable, false);
});

test("★ الحقل الناقص ⇒ يحتاج مراجعة لا نفيًا — الصمت ليس نفيًا", () => {
  const ناقص = { ...نادي, clientId: 4, clientName: "أعمال المصادر", workforce: null };
  const result = evaluateApplicability(قواعد_التوطين, ناقص);
  assert.equal(result.applicable, null);
  assert.deepEqual(result.unknownFields.sort(), ["workforce.occupationCodes", "workforce.totalEmployees"]);
  assert.ok(result.matchTrace.some((entry) => entry.unknown === true));
});

test("شرط فاشل يقينًا يحسم النفي حتى مع وجود حقل مجهول", () => {
  const ناقص = { ...نادي, profile: { isicCode: "62010" }, workforce: null };
  assert.equal(evaluateApplicability(قواعد_التوطين, ناقص).applicable, false,
    "لا داعي لإشغال المراجع البشري بنتيجة محسومة");
});

test("قرار بلا قواعد مُهيكلة ⇒ يحتاج مراجعة، لا انطباق تلقائي", () => {
  const result = evaluateApplicability(null, نادي);
  assert.equal(result.applicable, null);
  assert.match(result.matchTrace[0].ruleAr, /يدويًا/);
});

test("OR والمجموعات المتداخلة", () => {
  assert.equal(evaluateApplicability({
    logic: "OR",
    rules: [
      { field: "profile.isicCode", op: "==", value: "00000" },
      { field: "profile.cityCode", op: "==", value: "RUH" },
    ],
  }, نادي).applicable, true);

  assert.equal(evaluateApplicability({
    logic: "AND",
    rules: [
      { field: "workforce.totalEmployees", op: ">=", value: 5 },
      { logic: "OR", rules: [
        { field: "profile.cityCode", op: "==", value: "JED" },
        { field: "profile.cityCode", op: "==", value: "RUH" },
      ] },
    ],
  }, نادي).applicable, true);
});

test("المقارنة متساهلة بين الرمز الرقمي والنصي، والحقول المشتقة تُحل", () => {
  assert.equal(evaluateOp("in", 93110, ["93110"]), true);
  assert.equal(evaluateOp("==", "40", 40), true);
  assert.deepEqual(resolveField(نادي, "workforce.occupationCodes"), ["3423", "4226"]);
  assert.equal(resolveField(نادي, "workforce.saudiCount"), 7);
});

test("سياسة treat_as_false تغيّر السلوك عمدًا عند الحاجة", () => {
  const ناقص = { ...نادي, workforce: null };
  assert.equal(evaluateApplicability({ ...قواعد_التوطين, unknownFieldPolicy: "treat_as_false" }, ناقص).applicable, false);
});

// ═══════════════════════════════════════════════════════════════
// 3. الفجوة والخطورة
// ═══════════════════════════════════════════════════════════════

const قياس_التوطين = {
  type: "saudization_rate", targetValue: 40, unit: "percent",
  measuredBy: "QIWA", internalEstimateAllowed: true,
};

test("تقدير العجز يطابق مثال الوثيقة: 25 موظفًا، 7 سعوديين، هدف 40% ⇒ 5", () => {
  assert.equal(estimateAdditionalSaudiHires(25, 7, 40), 5);
});

test("التقدير صحيح رياضيًا وأدنى ما يكفي", () => {
  for (const [total, saudis, target] of [[25, 7, 40], [100, 10, 30], [8, 1, 25], [50, 40, 45]]) {
    const hires = estimateAdditionalSaudiHires(total, saudis, target);
    const achieved = ((saudis + hires) / (total + hires)) * 100;
    assert.ok(achieved >= target - 1e-9, `${total}/${saudis}→${target}%`);
    if (hires > 0) {
      assert.ok(((saudis + hires - 1) / (total + hires - 1)) * 100 < target, "ليس أدنى ما يكفي");
    }
  }
  assert.equal(estimateAdditionalSaudiHires(10, 5, 40), 0, "لا عجز إذا تحققت النسبة");
});

test("★ الفجوة تأخذ نسبة قوى كما هي ولا تُعيد احتسابها", () => {
  const gap = buildGap(قياس_التوطين, نادي.workforce, "2026-08-20");
  assert.equal(gap.currentValue, 27, "الرقم من قوى، لا 28% المحتسبة من 7/25");
  assert.equal(gap.currentValueSource, "qiwa_manual");
  assert.equal(gap.estimateIsIndicative, true);
});

test("نطاق مهني محدد ⇒ الفجوة على المهن المشمولة فقط", () => {
  const gap = buildGap({ ...قياس_التوطين, scope: { occupationCodes: ["3423"] } }, نادي.workforce, "2026-08-20");
  assert.equal(gap.currentValue, 33.3, "2 من 6");
  assert.equal(gap.estimatedHires, 1);
});

test("لقطة أقدم من 45 يومًا تُوسم قديمة، وغيابها كذلك", () => {
  assert.equal(isSnapshotStale(نادي.workforce, "2026-09-01"), false);
  assert.equal(isSnapshotStale(نادي.workforce, "2026-10-10"), true);
  assert.equal(isSnapshotStale(null, "2026-08-20"), true);
});

test("درجة الخطورة تتبع جدول القسم 4.4", () => {
  const gap = (current, required) => ({
    metric: "saudization_rate", currentValue: current, currentValueAsOf: "2026-08-18",
    currentValueSource: "qiwa_manual", requiredValue: required, estimatedHires: 1,
    estimateIsIndicative: true, stale: false,
  });
  assert.equal(computeRisk(gap(20, 40), 200, true), "critical", "فجوة 20 نقطة");
  assert.equal(computeRisk(gap(35, 40), 25, true), "critical", "أقل من 30 يومًا");
  assert.equal(computeRisk(gap(30, 40), 200, true), "high", "فجوة 10 نقاط");
  assert.equal(computeRisk(gap(38, 40), 60, true), "high", "أقل من 90 يومًا");
  assert.equal(computeRisk(gap(38, 40), 200, true), "medium");
  assert.equal(computeRisk(gap(45, 40), 200, true), "low", "لا فجوة ⇒ إجراء توثيقي");
  assert.equal(computeRisk(null, 10, false), "low", "غير منطبق");
  assert.equal(computeRisk(null, 20, true), "critical", "الجهل ليس اطمئنانًا");
  assert.equal(gapPoints(buildGap(قياس_التوطين, { ...نادي.workforce, saudizationRate: 55 }, "2026-08-20")), 0);
});

// ═══════════════════════════════════════════════════════════════
// 4. سلم التصعيد
// ═══════════════════════════════════════════════════════════════

const صباحًا = new Date("2026-08-20T07:00:00Z"); // 10 ص بالرياض
const فجرًا = new Date("2026-08-19T23:00:00Z");  // 2 ص بالرياض

function حالة(overrides = {}) {
  return {
    impactId: "12",
    effectiveDate: "2027-01-01",
    today: "2026-08-20",
    currentLevel: 0,
    state: "action_required",
    risk: "high",
    applicable: true,
    updateStatus: "approved",
    baselineEffectiveDate: "2027-01-01",
    hasCase: false,
    caseIsProgressing: false,
    sentKeys: new Set(),
    userNotificationCountToday: {},
    now: صباحًا,
    ...overrides,
  };
}

test("عتبات السلم مطابقة لجدول القسم 5.1", () => {
  const expected = [[200, 0], [91, 0], [90, 1], [61, 1], [60, 2], [31, 2], [30, 3],
    [15, 3], [14, 4], [8, 4], [7, 5], [2, 5], [1, 6], [0, 6], [-1, 7]];
  for (const [days, level] of expected) {
    assert.equal(levelForDaysRemaining(days), level, `${days} يومًا`);
  }
});

test("المستوى 3 (30 يومًا) يُنشئ خطة التصحيح تلقائيًا مرة واحدة", () => {
  const plan = planEscalation(حالة({ today: "2026-12-02" }));
  assert.equal(plan.level, 3);
  assert.equal(plan.shouldCreateCase, true);
  assert.deepEqual(plan.notification.audience, ["watcher", "assignee"]);
  assert.equal(planEscalation(حالة({ today: "2026-12-02", hasCase: true })).shouldCreateCase, false);
});

test("★ القرار المؤجَّل أو الملغى يوقف التصعيد فورًا", () => {
  for (const status of ["postponed", "cancelled", "pending_review"]) {
    const plan = planEscalation(حالة({ today: "2026-12-25", updateStatus: status }));
    assert.equal(plan.level, 0, status);
    assert.equal(plan.notification.send, false, status);
    assert.equal(plan.shouldCreateCase, false, status);
  }
});

test("★ تغيّر تاريخ النفاذ يُصفّر التصعيد بدل الإبقاء على المستوى الأعلى", () => {
  const plan = planEscalation(حالة({
    today: "2026-12-02",
    effectiveDate: "2027-06-01",
    baselineEffectiveDate: "2027-01-01",
    currentLevel: 3,
  }));
  assert.equal(plan.resetDueToDateChange, true);
  assert.equal(plan.level, 0);
});

test("مفتاح التفرّد والصمت الليلي والتجميع اليومي", () => {
  assert.equal(planEscalation(حالة({ today: "2026-12-02", sentKeys: new Set(["12:3"]) })).notification.send, false);

  // ★ التشغيل المجدول عند 05:00 يقع داخل الصمت (07:00–21:00):
  //   يُنشأ القيد ويُؤجَّل تسليمه، ولا يُسقَط — وإلا لما وصل تنبيه أبدًا.
  const ليلي = planEscalation(حالة({ today: "2026-12-02", now: فجرًا }));
  assert.equal(ليلي.notification.deferUntilMorning, true);
  assert.equal(ليلي.notification.send, true, "الرصد يقع الآن والتسليم يتأخر");
  assert.equal(ليلي.notification.deliverAfterHour, 7);

  const عاجل = planEscalation(حالة({ today: "2026-12-31", now: فجرًا }));
  assert.equal(عاجل.level, 6);
  assert.equal(عاجل.notification.send, true, "العاجل يخترق الصمت الليلي");
  assert.equal(عاجل.notification.deferUntilMorning, false);
  assert.equal(عاجل.notification.deliverAfterHour, null);

  assert.equal(planEscalation(حالة({
    today: "2026-12-02", userNotificationCountToday: { watcher: 4 },
  })).notification.aggregate, true);

  assert.equal(planEscalation(حالة({
    today: "2026-12-31", userNotificationCountToday: { watcher: 9, assignee: 9, owner: 9 },
  })).notification.aggregate, false, "المستوى 6 لا يُجمَّع");
});

test("الخطة النشطة تخفض ضجيج المستويين 4 و5 إلى إشعار داخلي", () => {
  const plan = planEscalation(حالة({
    today: "2026-12-25", hasCase: true, caseIsProgressing: true, state: "in_progress",
  }));
  assert.equal(plan.level, 5);
  assert.deepEqual(plan.notification.channels, ["in_app"]);
  assert.deepEqual(plan.notification.audience, ["watcher"]);
});

test("الالتزام غير المنطبق أو الذي يحتاج مراجعة لا يُصعَّد", () => {
  assert.equal(planEscalation(حالة({ today: "2026-12-02", applicable: false })).notification.send, false);
  assert.equal(planEscalation(حالة({ today: "2026-12-02", applicable: null })).notification.send, false);
});

// ═══════════════════════════════════════════════════════════════
// 5. دورة الحياة
// ═══════════════════════════════════════════════════════════════

test("انتقالات القرار المسموحة والممنوعة", () => {
  assert.equal(canTransitionUpdate("pending_review", "approved"), true);
  assert.equal(canTransitionUpdate("approved", "postponed"), true);
  assert.equal(canTransitionUpdate("postponed", "approved"), true);
  assert.equal(canTransitionUpdate("draft", "approved"), false, "لا اعتماد بلا مراجعة");
  assert.equal(canTransitionUpdate("archived", "approved"), false);
  assert.equal(canTransitionUpdate("cancelled", "in_effect"), false);
});

// ═══════════════════════════════════════════════════════════════
// 6. خطة التصحيح
// ═══════════════════════════════════════════════════════════════

test("اختيار القالب: الأدق أولًا ثم الفئة ثم العام", () => {
  assert.equal(pickTemplate(DEFAULT_TEMPLATES, ["saudization"], "saudization_rate").code, "TPL-SAUDIZATION-RAISE");
  assert.equal(pickTemplate(DEFAULT_TEMPLATES, ["wage_protection"], null).code, "TPL-WAGE-PROTECTION");
  assert.equal(pickTemplate(DEFAULT_TEMPLATES, ["contracts"], "registration").code, "TPL-REGISTRATION");
  assert.equal(pickTemplate(DEFAULT_TEMPLATES, ["other"], null).code, "TPL-GENERIC");
});

test("قالب العنوان يُعبّأ من القرار والمنشأة", () => {
  assert.equal(
    renderSubject("رفع نسبة التوطين إلى {{requiredValue}}% — {{clientName}}", { requiredValue: 40, clientName: "الناهلة الرياضية" }),
    "رفع نسبة التوطين إلى 40% — الناهلة الرياضية",
  );
});

test("★ ضغط جدول الخطوات حين يُدخل القرار متأخرًا — لا خطوة بتاريخ ماضٍ", () => {
  const قالب = DEFAULT_TEMPLATES[0]; // يمتد 120 يومًا
  const متأخر = scheduleSteps(قالب, addDays("2026-08-20", 40), "2026-08-20");
  assert.equal(متأخر.compressed, true);
  assert.equal(متأخر.steps.length, 7);
  assert.ok(متأخر.steps.every((step) => daysBetween("2026-08-20", step.dueDate) >= 0));
  assert.ok(متأخر.steps.every((step) => daysBetween(step.dueDate, addDays("2026-08-20", 40)) >= 0));

  const واسع = scheduleSteps(قالب, addDays("2026-08-20", 200), "2026-08-20");
  assert.equal(واسع.compressed, false);
});

// ═══════════════════════════════════════════════════════════════
// 7. معيار قبول المرحلة 1
// ═══════════════════════════════════════════════════════════════
// «إدخال قرار ينفذ بعد 6 أشهر ⇒ يظهر في اللوحة، وعند 90 و60 و30 يومًا
//   تُطلق الإشعارات وتُنشأ الخطة تلقائيًا عند 30 يومًا.»

const اليوم_صفر = "2026-08-20";
const تاريخ_النفاذ = addDays(اليوم_صفر, 180);

const القرار = {
  id: 42,
  code: "REG-2026-0042",
  title: "رفع نسبة توطين مهن الأندية الرياضية إلى 40%",
  summary: "رفع النسبة المطلوبة إلى 40% للمنشآت العاملة في تشغيل المرافق الرياضية.",
  authority: "MHRSD",
  categories: ["saudization"],
  effectiveDate: تاريخ_النفاذ,
  correctionDeadline: addDays(تاريخ_النفاذ, -30),
  applicability: {
    logic: "AND",
    rules: [
      { field: "profile.isicCode", op: "in", value: ["93110"] },
      { field: "workforce.totalEmployees", op: ">=", value: 5 },
    ],
  },
  measure: { type: "saudization_rate", targetValue: 40, unit: "percent", measuredBy: "QIWA", internalEstimateAllowed: true },
  status: "approved",
};

function محاكاة({ postponeOn = null, newEffectiveDate = null } = {}) {
  let impact = assessImpact(القرار, نادي, { today: اليوم_صفر });
  let update = { ...القرار };
  const sentKeys = new Set();
  const log = [];
  let hasPlan = false;

  for (let i = 0; i <= 200; i++) {
    const today = addDays(اليوم_صفر, i);

    if (postponeOn === today) {
      update = { ...update, status: "approved", effectiveDate: newEffectiveDate };
      impact = assessImpact(update, نادي, { today, previous: impact });
    }

    // التشغيل المجدول: 05:00 بالرياض = 02:00 UTC
    const plan = planEscalation({
      impactId: "42-2",
      effectiveDate: impact.effectiveDate,
      today,
      currentLevel: impact.escalationLevel,
      state: impact.state,
      risk: impact.risk,
      applicable: impact.applicable,
      updateStatus: update.status,
      baselineEffectiveDate: impact.escalationBaselineDate ?? impact.effectiveDate,
      hasCase: hasPlan,
      caseIsProgressing: false,
      sentKeys,
      userNotificationCountToday: {},
      now: new Date(`${today}T02:00:00Z`),
    });

    let notified = false;
    if (plan.notification.send) {
      sentKeys.add(plan.notification.uniquenessKey);
      notified = true;
    }
    let planCreated = false;
    if (plan.shouldCreateCase && !hasPlan) {
      hasPlan = true;
      planCreated = true;
    }

    impact = {
      ...impact,
      escalationLevel: plan.level,
      daysRemaining: plan.daysRemaining,
      isOverdue: plan.isOverdue,
      state: planCreated ? "plan_created" : plan.isOverdue ? "overdue" : impact.state,
    };

    log.push({ day: today, daysRemaining: plan.daysRemaining, level: plan.level, notified, planCreated });
  }

  return { log, sentKeys };
}

test("التقييم الأولي: منطبق، بفجوة صحيحة ومهلة داخلية 60 يومًا للتوطين", () => {
  const impact = assessImpact(القرار, نادي, { today: اليوم_صفر });
  assert.equal(impact.applicable, true);
  assert.equal(impact.state, "action_required");
  assert.equal(impact.daysRemaining, 180);
  assert.equal(impact.gap.currentValue, 27);
  assert.equal(impact.gap.requiredValue, 40);
  assert.equal(impact.gap.estimatedHires, 5);
  assert.equal(impact.internalDeadline, addDays(تاريخ_النفاذ, -60));
  assert.equal(impact.risk, "high", "فجوة 13 نقطة ضمن نطاق 5–15 والوقت لا يزال متسعًا");
});

test("★ معيار القبول: إشعار عند 90 و60 و30 و14 و7 و1، وخطة تلقائية عند 30 يومًا", () => {
  const { log } = محاكاة();
  assert.deepEqual(
    log.filter((row) => row.notified).map((row) => row.daysRemaining),
    [90, 60, 30, 14, 7, 1, -1],
    "إشعار واحد فقط عند كل عتبة، وواحد عند أول يوم تأخر",
  );
  const إنشاء = log.filter((row) => row.planCreated);
  assert.equal(إنشاء.length, 1, "خطة واحدة لا أكثر");
  assert.equal(إنشاء[0].daysRemaining, 30);
});

test("لا إشعار مكرر رغم 201 تشغيل يومي", () => {
  const { log, sentKeys } = محاكاة();
  assert.equal(log.filter((row) => row.notified).length, sentKeys.size);
  assert.equal(sentKeys.size, 7);
});

test("العدّ التنازلي يعمل من اليوم الأول، والتأخر يُوسم بعد النفاذ", () => {
  const { log } = محاكاة();
  assert.equal(log[0].level, 0);
  assert.equal(log[0].daysRemaining, 180);
  const بعد = log.filter((row) => row.daysRemaining < 0);
  assert.ok(بعد.length > 0);
  assert.ok(بعد.every((row) => row.level === 7));
});

test("★ التأجيل أثناء العدّ التنازلي: لا إشعارات وهمية بعده", () => {
  const يوم_التأجيل = addDays(اليوم_صفر, 155); // متبقٍ 25 يومًا
  const { log } = محاكاة({ postponeOn: يوم_التأجيل, newEffectiveDate: addDays(تاريخ_النفاذ, 180) });
  assert.equal(log.filter((row) => row.day > يوم_التأجيل && row.notified).length, 0);
  const آخر = log[log.length - 1];
  assert.equal(آخر.level, 0);
  assert.ok(آخر.daysRemaining > 90);
});

test("إعادة التقييم لا تُرجع حالة تقدّمت إلى الوراء", () => {
  const سابق = assessImpact(القرار, نادي, { today: اليوم_صفر });
  const مُعاد = assessImpact(القرار, نادي, {
    today: addDays(اليوم_صفر, 10),
    previous: { ...سابق, state: "plan_created", taskId: 77 },
  });
  assert.equal(مُعاد.state, "plan_created");
});

test("منشأة ناقصة البيانات تصل «يحتاج مراجعة» لا «غير منطبق»", () => {
  const ناقصة = { clientId: 4, clientName: "أعمال المصادر", profile: { isicCode: "93110" }, workforce: null };
  const impact = assessImpact(القرار, ناقصة, { today: اليوم_صفر });
  assert.equal(impact.applicable, null);
  assert.equal(impact.state, "needs_review");
  assert.equal(impact.escalationLevel, 0, "لا عدّ تنازلي على نتيجة غير محسومة");
});

test("الربط اليدوي في المرحلة 1 يوثَّق في أثر المطابقة", () => {
  const impact = assessImpact(القرار, نادي, { today: اليوم_صفر, manualClientIds: [2, 7] });
  assert.equal(impact.applicable, true);
  assert.equal(impact.matchTrace[0].rule, "manualSelection");
  assert.match(impact.matchTrace[0].ruleAr, /يدويًا/);
});
