// تشغيل التقويم اليومي للرصد النظامي من مجدول خارجي (Cloud Scheduler عند 05:00 بتوقيت الرياض).
//
// لا جلسة دخول هنا؛ الحماية بسرّ مشترك في ترويسة Authorization: Bearer <CRON_SECRET>.
// إن لم يُضبط CRON_SECRET تبقى النقطة معطّلة، ويستمر التشغيل عند فتح المالك للنظام كما هو.
// runComplianceTick متساوي القوى (idempotent): تشغيله من المجدول ومن المتصفح في اليوم نفسه
// لا يكرر تنبيهًا ولا خطة.

import { createHash, timingSafeEqual } from "node:crypto";
import { runComplianceTick } from "../../data/compliance";
import { riyadhDate } from "../../../../lib/compliance/dates.ts";

export const dynamic = "force-dynamic";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function authorized(request: Request, secret: string) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token.length > 0 && timingSafeEqual(digest(token), digest(secret));
}

export async function POST(request: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return Response.json({ error: "المجدول غير مفعّل: CRON_SECRET غير مضبوط." }, { status: 503 });
  if (!authorized(request, secret)) return Response.json({ error: "غير مصرّح." }, { status: 401 });

  try {
    const summary = await runComplianceTick({ today: riyadhDate(), now: new Date() });
    console.log("compliance_tick (cron)", JSON.stringify(summary));
    return Response.json({ ok: true, ...summary });
  } catch (error) {
    console.error("compliance_tick (cron) failed", error);
    return Response.json({ error: "تعذّر تشغيل الفحص اليومي." }, { status: 500 });
  }
}
