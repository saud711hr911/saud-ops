// اختبارات تسليم البريد والرصد الآلي — منطق خالص، بلا شبكة ولا قاعدة بيانات.

import { test } from "node:test";
import assert from "node:assert/strict";

import { riyadhStamp } from "../lib/compliance/dates.ts";
import {
  ALERT_STATUS, MAX_DELIVERY_ATTEMPTS, escapeHtml, groupByRecipient, isDeliverable, renderAlertDigest, renderReminderEmail,
} from "../lib/compliance/delivery.ts";
import {
  extractByRules, isRelevant, isSafeHttpsUrl, itemFingerprint, nextHealth, parseFeed, parseJsonFeed, validateCandidate,
  INITIAL_HEALTH, DOWN_AFTER_FAILURES, DEGRADED_AFTER_EMPTY_RUNS,
} from "../lib/monitoring/index.ts";

// ── التسليم بالبريد ──────────────────────────────────────────

const alert = (overrides = {}) => ({
  id: "a", level: 3, recipientEmail: "owner@example.com", channels: ["in_app", "email"],
  title: "قرار التوطين — الناهلة", message: "30 يومًا متبقيًا", status: ALERT_STATUS.ready, scheduledFor: "2026-10-05",
  ...overrides,
});

test("طابع الرياض: 02:30 UTC = 05:30 بتوقيت الرياض", () => {
  assert.equal(riyadhStamp(new Date("2026-10-05T02:30:00Z")), "2026-10-05 05:30");
});

test("المؤجل حتى 07:00 لا يُسلَّم عند 05:00 ويُسلَّم عند 07:00", () => {
  const deferred = alert({ status: ALERT_STATUS.deferred, scheduledFor: "2026-10-05 07:00" });
  assert.equal(isDeliverable(deferred, "2026-10-05 05:00"), false);
  assert.equal(isDeliverable(deferred, "2026-10-05 07:00"), true);
  assert.equal(isDeliverable(deferred, "2026-10-06 05:00"), true);
});

test("التنبيه بتاريخ فقط مستحق طوال يومه", () => {
  assert.equal(isDeliverable(alert(), "2026-10-05 00:01"), true);
  assert.equal(isDeliverable(alert(), "2026-10-04 23:59"), false);
});

test("المستوى 1 (داخل التطبيق فقط) لا يُرسل بالبريد", () => {
  assert.equal(isDeliverable(alert({ channels: ["in_app"] }), "2026-10-05 08:00"), false);
});

test("المُرسل لا يُعاد، والفاشل يُعاد حتى الحد ثم يتوقف", () => {
  assert.equal(isDeliverable(alert({ status: ALERT_STATUS.sent }), "2026-10-05 08:00"), false);
  assert.equal(isDeliverable(alert({ status: ALERT_STATUS.failed, attempts: 1 }), "2026-10-05 08:00"), true);
  assert.equal(isDeliverable(alert({ status: ALERT_STATUS.failed, attempts: MAX_DELIVERY_ATTEMPTS }), "2026-10-05 08:00"), false);
});

test("حجز «قيد الإرسال» حديث لا يُنتزع، والمتروك يُستعاد", () => {
  const now = new Date("2026-10-05T05:00:00Z");
  assert.equal(isDeliverable(alert({ status: ALERT_STATUS.sending, claimedAt: "2026-10-05T04:55:00Z" }), "2026-10-05 08:00", now), false);
  assert.equal(isDeliverable(alert({ status: ALERT_STATUS.sending, claimedAt: "2026-10-05T04:30:00Z" }), "2026-10-05 08:00", now), true);
});

test("رسالة واحدة لكل مستقبِل، الأخطر أولًا، والبريد غير حساس لحالة الأحرف", () => {
  const groups = groupByRecipient([
    alert({ id: "1", level: 2 }), alert({ id: "2", level: 6, recipientEmail: "Owner@Example.com" }), alert({ id: "3", recipientEmail: "emp@example.com" }),
  ]);
  assert.equal(groups.size, 2);
  assert.deepEqual(groups.get("owner@example.com").map((row) => row.id), ["2", "1"]);
});

test("الملخّص يهرّب HTML ويضع الأخطر في العنوان", () => {
  const content = renderAlertDigest([alert({ level: 6, title: "<b>قرار</b>" }), alert({ level: 2 })], "https://masar.example/");
  assert.match(content.subject, /2 تنبيهات/);
  assert.match(content.subject, /<b>قرار<\/b>/);
  assert.ok(content.html.includes("&lt;b&gt;قرار&lt;/b&gt;"));
  assert.ok(!content.html.includes("<b>قرار</b>"));
  assert.ok(content.html.includes('dir="rtl"'));
  assert.ok(content.text.includes("https://masar.example/"));
});

test("بريد التجديد للعميل يحمل نص رسالة واتساب نفسه", () => {
  const content = renderReminderEmail({ clientName: "س", documentTitle: "السجل التجاري", message: "مرحبًا، السجل متبقي 20 يومًا", officeName: "مَسار" });
  assert.equal(content.subject, "تنبيه تجديد: السجل التجاري");
  assert.ok(content.text.startsWith("مرحبًا، السجل متبقي 20 يومًا"));
  assert.equal(escapeHtml(`"<&>'`), "&quot;&lt;&amp;&gt;&#39;");
});

// ── المحوّلات ────────────────────────────────────────────────

const RSS = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>أخبار</title>
<item><title><![CDATA[قصر مهن المبيعات على السعوديين بنسبة ٧٠٪ اعتبارًا من 1 يناير 2027]]></title>
<link>https://example.gov.sa/news/1?utm_source=x</link><guid>news-1</guid><pubDate>Sun, 04 Oct 2026 08:00:00 GMT</pubDate>
<description>&lt;p&gt;أصدرت الوزارة قرار وزاري رقم (12345) بشأن توطين مهن المبيعات.&lt;/p&gt;</description></item>
<item><title>افتتاح معرض الكتاب</title><link>https://example.gov.sa/news/2</link><pubDate>Sat, 03 Oct 2026 08:00:00 GMT</pubDate></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>تحديث نظام حماية الأجور</title><id>urn:1</id>
<link rel="alternate" href="https://example.org/a"/><updated>2026-10-01T10:00:00Z</updated><summary>يسري القرار من 2026-12-01</summary></entry></feed>`;

test("RSS: CDATA والكيانات والوسوم تُطبَّع", () => {
  const items = parseFeed(RSS);
  assert.equal(items.length, 2);
  assert.equal(items[0].externalId, "news-1");
  assert.equal(items[0].publishedAt, "2026-10-04T08:00:00.000Z");
  assert.equal(items[0].summary, "أصدرت الوزارة قرار وزاري رقم (12345) بشأن توطين مهن المبيعات.");
});

test("Atom: الرابط البديل والتاريخ", () => {
  const [item] = parseFeed(ATOM);
  assert.equal(item.url, "https://example.org/a");
  assert.equal(item.externalId, "urn:1");
});

test("JSON Feed", () => {
  const items = parseJsonFeed(JSON.stringify({ version: "https://jsonfeed.org/version/1.1", items: [{ id: 7, title: "تعديل لائحة أجير", url: "https://x.sa/7", content_text: "نص" }, { id: 8 }] }));
  assert.equal(items.length, 1);
  assert.equal(items[0].externalId, "7");
  assert.throws(() => parseJsonFeed("{}"));
});

// ── الصلة والاستخلاص ─────────────────────────────────────────

const source = { authority: "MHRSD", keywords: [] };

test("الصلة: خبر التوطين ذو صلة، ومعرض الكتاب لا", () => {
  const [sales, books] = parseFeed(RSS);
  assert.equal(isRelevant(sales, source), true);
  assert.equal(isRelevant(books, source), false);
  assert.equal(isRelevant(books, { keywords: ["معرض الكتاب"] }), true);
});

test("الاستخلاص: أرقام عربية، تاريخ نفاذ بعد عبارة النفاذ، نسبة توطين، رقم القرار", () => {
  const [sales] = parseFeed(RSS);
  const result = validateCandidate(extractByRules(sales, source));
  assert.equal(result.ok, true);
  const c = result.candidate;
  assert.deepEqual(c.categories, ["saudization"]);
  assert.equal(c.effectiveDate, "2027-01-01");
  assert.equal(c.targetValue, 70);
  assert.equal(c.referenceNumber, "12345");
  assert.equal(c.authority, "MHRSD");
  assert.ok(c.confidence > 0.5);
});

test("الاستخلاص لا يخمّن: بلا عبارة نفاذ لا تاريخ نفاذ، مع تحذير", () => {
  const raw = extractByRules({ externalId: null, title: "الوزارة تعلن تحديث نطاقات", url: null, publishedAt: null, summary: "صدر في 2026-10-01 تحديث للبرنامج" }, source);
  assert.equal(raw.effectiveDate, null);
  assert.ok(raw.warnings.some((warning) => warning.includes("لم يُحسم")));
});

test("نسبة بلا توطين لا تصبح قيمة مستهدفة", () => {
  const raw = extractByRules({ externalId: null, title: "رفع اشتراكات التأمينات الاجتماعية 2%", url: null, publishedAt: null, summary: "" }, source);
  assert.equal(raw.targetValue, null);
  assert.deepEqual(raw.categories, ["gosi"]);
});

test("التاريخ الهجري يُنبَّه عليه ولا يُحوَّل", () => {
  const raw = extractByRules({ externalId: null, title: "قرار توطين", url: null, publishedAt: null, summary: "يبدأ التطبيق في 1/7/1448هـ" }, source);
  assert.equal(raw.effectiveDate, null);
  assert.ok(raw.warnings.some((warning) => warning.includes("هجري")));
});

// ── المخطط المغلق ────────────────────────────────────────────

test("المخطط: لا حقل حالة يمر، والقيم خارج النطاق تُسقط", () => {
  const result = validateCandidate({
    title: "قرار", summary: "x".repeat(5000), authority: "NASA", categories: ["saudization", "hacking", "saudization"],
    effectiveDate: "2026-02-31", targetValue: 250, sourceUrl: "http://insecure.example", confidence: 7,
    status: "approved", reviewedByEmail: "attacker@example.com",
  });
  assert.equal(result.ok, true);
  const c = result.candidate;
  assert.equal(c.authority, "OTHER");
  assert.deepEqual(c.categories, ["saudization"]);
  assert.equal(c.effectiveDate, null);
  assert.equal(c.targetValue, null);
  assert.equal(c.sourceUrl, null);
  assert.equal(c.confidence, 1);
  assert.equal(c.summary.length, 2000);
  assert.equal("status" in c, false);
  assert.equal("reviewedByEmail" in c, false);
});

test("المخطط: بلا عنوان يُرفض", () => {
  assert.equal(validateCandidate({ title: "" }).ok, false);
  assert.equal(validateCandidate(null).ok, false);
});

test("روابط المصادر: https عامة فقط", () => {
  assert.equal(isSafeHttpsUrl("https://hrsd.gov.sa/ar/rss"), true);
  for (const bad of ["http://hrsd.gov.sa", "https://localhost/x", "https://127.0.0.1/", "https://10.0.0.5/", "https://192.168.1.1/",
    "https://169.254.169.254/latest", "https://metadata.google.internal/", "https://[::1]/", "https://user:pass@x.sa/", "file:///etc/passwd", "https://intranet/"]) {
    assert.equal(isSafeHttpsUrl(bad), false, bad);
  }
});

// ── البصمة والصحة ────────────────────────────────────────────

test("البصمة: ثابتة، وتتجاهل utm وعلامة #، وتختلف بين المصادر", () => {
  const a = { externalId: null, title: "خبر", url: "https://x.sa/n/1?utm_source=a#top", publishedAt: null, summary: "" };
  const b = { ...a, url: "https://X.sa/n/1/" };
  assert.equal(itemFingerprint(1, a), itemFingerprint(1, b));
  assert.notEqual(itemFingerprint(1, a), itemFingerprint(2, a));
  assert.match(itemFingerprint(1, a), /^1__[0-9a-f]{16}$/);
});

test("الصحة: فشل ← متعثر، ثلاثة ← متوقف، نجاح يصفّر", () => {
  let health = INITIAL_HEALTH;
  for (let i = 1; i <= DOWN_AFTER_FAILURES; i++) health = nextHealth(health, { ok: false, error: "HTTP 500", at: `t${i}` });
  assert.equal(health.status, "down");
  assert.equal(health.consecutiveFailures, 3);
  health = nextHealth(health, { ok: true, itemCount: 5, at: "t9" });
  assert.equal(health.status, "healthy");
  assert.equal(health.consecutiveFailures, 0);
  assert.equal(health.lastError, null);
});

test("الصحة: المصدر الصامت طويلًا متعثر لا سليم", () => {
  let health = nextHealth(null, { ok: true, itemCount: 3, at: "t0" });
  for (let i = 1; i < DEGRADED_AFTER_EMPTY_RUNS; i++) health = nextHealth(health, { ok: true, itemCount: 0, at: `t${i}` });
  assert.equal(health.status, "healthy");
  health = nextHealth(health, { ok: true, itemCount: 0, at: "tx" });
  assert.equal(health.status, "degraded");
});
