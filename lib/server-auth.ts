import { cookies } from "next/headers";
import { adminAuth, createRecord, listRecords } from "./firebase-admin";

export const SESSION_COOKIE = "__session";
export const OWNER_EMAIL = (process.env.OWNER_EMAIL || "sssaaa2020@hotmail.com").trim().toLowerCase();
export const ROLES = ["owner", "employee", "client"] as const;
export type Role = (typeof ROLES)[number];

export type AppUserRecord = {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  role: Role;
  clientId: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CurrentUser = {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  role: Role;
  clientId: number | null;
};

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "BAD_REQUEST") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function requireUser(): Promise<CurrentUser> {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionCookie) throw new ApiError("سجّل الدخول إلى مَسار للمتابعة.", 401, "AUTH_REQUIRED");

  let decoded;
  try {
    decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
  } catch {
    throw new ApiError("انتهت جلسة الدخول. سجّل الدخول مرة أخرى.", 401, "AUTH_REQUIRED");
  }

  const email = (decoded.email || "").trim().toLowerCase();
  if (!email) throw new ApiError("حساب الدخول لا يحتوي على بريد إلكتروني.", 403, "ACCESS_PENDING");
  const appUsers = await listRecords<AppUserRecord>("app_users");
  let row = appUsers.find((item) => item.uid === decoded.uid || item.email === email);

  if (!row && email === OWNER_EMAIL) {
    const timestamp = new Date().toISOString();
    row = await createRecord<AppUserRecord>("app_users", {
      uid: decoded.uid,
      email,
      fullName: decoded.name || "سعود",
      role: "owner",
      clientId: null,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  if (!row || !row.active) {
    throw new ApiError("هذا الحساب غير مضاف إلى SaudOps | مَسار. اطلب من المالك تفعيل صلاحيتك.", 403, "ACCESS_PENDING");
  }
  if (!ROLES.includes(row.role)) throw new ApiError("دور الحساب غير صالح.", 403, "INVALID_ROLE");

  return {
    id: row.id,
    uid: decoded.uid,
    email: row.email,
    fullName: row.fullName || decoded.name || row.email,
    role: row.role,
    clientId: row.clientId,
  };
}

export function requireRole(user: CurrentUser, ...allowed: Role[]) {
  if (!allowed.includes(user.role)) throw new ApiError("ليست لديك صلاحية لتنفيذ هذا الإجراء.", 403, "FORBIDDEN");
}
