// تشغيل مهام الرصد النظامي من مجدول خارجي (Cloud Scheduler).
//
// لا جلسة دخول هنا؛ الحماية بسرّ مشترك في ترويسة Authorization: Bearer <CRON_SECRET>.
// إن لم يُضبط CRON_SECRET تبقى النقطة معطّلة، ويستمر التشغيل عند فتح المالك للنظام كما هو.
//
// ?job=   all (افتراضي): رصد المصادر ← التقويم اليومي ← تسليم البريد   — 05:00
//         deliver:       تسليم التنبيهات المستحقة بالبريد فقط              — كل ساعة 07:00–21:00
//         monitor:       فحص مصادر الرصد الآلي فقط
//         tick:          التقويم اليومي فقط
// كل المهام متساوية القوى (idempotent): تكرارها لا يكرر تنبيهًا ولا خطة ولا مرشّحًا.

import { createHash, timingSafeEqual } from "node:crypto";
import { deliverComplianceAlerts, runComplianceTick } from "../../data/compliance";
import { runRegulatoryMonitor } from "../../data/monitoring";
import { riyadhDate } from "../../../../lib/compliance/dates.ts";

export const dynamic = "force-dynamic";

const JOBS = ["all", "deliver", "monitor", "tick"] as const;
type Job = (typeof JOBS)[number];

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

  const job = (new URL(request.url).searchParams.get("job") || "all") as Job;
  if (!JOBS.includes(job)) return Response.json({ error: "مهمة غير معروفة." }, { status: 400 });

  const now = new Date();
  const result: Record<string, unknown> = { ok: true, job };
  try {
    // الرصد أولًا: أي مرشّح جديد يظهر للمالك اليوم، لكنه لا يدخل التقويم قبل اعتماده
    if (job === "all" || job === "monitor") result.monitor = await runRegulatoryMonitor({ now });
    if (job === "all" || job === "tick") result.tick = await runComplianceTick({ today: riyadhDate(now), now });
    if (job === "all" || job === "deliver") result.delivery = await deliverComplianceAlerts({ now });
    console.log("compliance cron", JSON.stringify(result));
    return Response.json(result);
  } catch (error) {
    console.error("compliance cron failed", job, error);
    return Response.json({ error: "تعذّر تشغيل المهمة.", job }, { status: 500 });
  }
}
