import { cookies } from "next/headers";
import { adminAuth } from "../../../../lib/firebase-admin";
import { SESSION_COOKIE } from "../../../../lib/server-auth";

const SESSION_DURATION_MS = 5 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return Response.json({ error: "تعذر التحقق من مصدر طلب الدخول." }, { status: 403 });
    }
    const body = await request.json() as { idToken?: string };
    if (!body.idToken) return Response.json({ error: "رمز الدخول غير موجود." }, { status: 400 });
    await adminAuth.verifyIdToken(body.idToken, true);
    const sessionCookie = await adminAuth.createSessionCookie(body.idToken, { expiresIn: SESSION_DURATION_MS });
    (await cookies()).set(SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_MS / 1000,
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "بيانات الدخول غير صحيحة أو انتهت صلاحيتها." }, { status: 401 });
  }
}
