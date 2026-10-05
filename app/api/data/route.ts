import { adminAuth, adminBucket, createRecord, deleteRecord, deleteReferences, getRecord, listRecords, nowIso, recordReference, updateRecord } from "../../../lib/firebase-admin";
import { ApiError, AppUserRecord, CurrentUser, ROLES, Role, requireRole, requireUser } from "../../../lib/server-auth";
import { complianceSnapshot, handleComplianceAction } from "./compliance";
import { handleMonitoringAction, monitoringSnapshot } from "./monitoring";
import { isMailConfigured, sendMail } from "../../../lib/mailer";
import { renderReminderEmail } from "../../../lib/compliance/delivery.ts";

type ClientRecord = {
  id: number; name: string; legalName: string | null; unifiedNumber: string | null; crNumber: string | null;
  phone: string | null; email: string | null; contactName: string | null; city: string; driveUrl: string | null;
  notes: string; status: string; createdAt: string; updatedAt: string;
};
type DocumentRecord = {
  id: number; clientId: number; type: string; title: string; documentNumber: string | null; issueDate: string | null;
  expiryDate: string; driveUrl: string | null; reminderDays: number; status: string; notes: string; createdAt: string; updatedAt: string;
};
type TaskRecord = {
  id: number; code: string; clientId: number; documentId: number | null; serviceType: string; subject: string;
  assignedTo: string | null; assignedEmail: string | null; status: string; priority: string; dueDate: string | null;
  currentStep: string; paymentStatus: string; amount: number | null; notes: string; source: string; createdAt: string; updatedAt: string;
};
type ReminderRecord = {
  id: number; clientId: number; documentId: number; expiryDate: string; channel: string; scheduledFor: string;
  status: string; message: string; sentAt: string | null; createdAt: string; updatedAt: string;
};
type TeamRecord = { id: number; name: string; email: string | null; role: string; color: string; active: boolean; createdAt: string };
type AccessRecord = { id: number; clientId: number; platform: string; username: string | null; vaultReference: string | null; notes: string; createdAt: string };
type ActivityRecord = { id: number; clientId: number; taskId: number | null; actor: string; event: string; detail: string; createdAt: string };
type ClientRequestRecord = {
  id: number; code: string; clientId: number; createdByEmail: string; serviceType: string; title: string; description: string;
  status: string; priority: string; assignedTo: string | null; assignedEmail: string | null; quotedAmount: number | null;
  paymentStatus: string; paymentUrl: string | null; dueDate: string | null; createdAt: string; updatedAt: string;
};
type RequirementRecord = {
  id: number; requestId: number; clientId: number; type: string; title: string; description: string; amount: number | null;
  paymentUrl: string | null; status: string; responseText: string | null; dueDate: string | null; createdBy: string;
  createdAt: string; respondedAt: string | null; updatedAt: string;
};
type RequestTaskRecord = { id: number; requestId: number; taskId: number; createdAt: string };
type StoredFileRecord = {
  id: number; clientId: number; requestId: number | null; requirementId: number | null; documentId: number | null;
  label: string; fileName: string; contentType: string; fileSize: number; storageKey: string; visibility: string;
  uploadedBy: string; createdAt: string;
};

function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function nullable(value: unknown) { return clean(value) || null; }
function normalizedEmail(value: unknown) { return clean(value).toLowerCase(); }
function numberValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function descendingDate<T extends { updatedAt?: string; createdAt?: string; id: number }>(left: T, right: T) {
  return (right.updatedAt || right.createdAt || "").localeCompare(left.updatedAt || left.createdAt || "") || right.id - left.id;
}
function authErrorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
}

async function assertClientAccess(user: CurrentUser, clientId: number) {
  if (user.role === "owner") return;
  if (user.role === "client" && user.clientId === clientId) return;
  if (user.role === "employee") {
    const [taskRows, requestRows] = await Promise.all([listRecords<TaskRecord>("tasks"), listRecords<ClientRequestRecord>("client_requests")]);
    if (taskRows.some((task) => task.clientId === clientId && task.assignedEmail === user.email) || requestRows.some((item) => item.clientId === clientId && item.assignedEmail === user.email)) return;
  }
  throw new ApiError("لا يمكنك الوصول إلى ملف هذا العميل.", 403, "FORBIDDEN");
}

async function assertTaskAccess(user: CurrentUser, taskId: number) {
  const task = await getRecord<TaskRecord>("tasks", taskId);
  if (!task) throw new ApiError("المهمة غير موجودة.", 404, "NOT_FOUND");
  if (user.role === "owner" || (user.role === "employee" && task.assignedEmail?.toLowerCase() === user.email)) return task;
  throw new ApiError("هذه المهمة غير مسندة إليك.", 403, "FORBIDDEN");
}

function clientError(error: unknown) {
  if (error instanceof ApiError) return { message: error.message, status: error.status, code: error.code };
  const code = authErrorCode(error);
  if (code === "auth/email-already-exists") return { message: "يوجد حساب دخول بهذا البريد مسبقًا.", status: 409, code: "DUPLICATE" };
  const message = error instanceof Error ? error.message : "حدث خطأ غير متوقع";
  if (message.includes("NOT_FOUND") || message.includes("does not exist")) {
    return { message: "فعّل Firestore وCloud Storage في مشروع Firebase ثم أعد المحاولة.", status: 503, code: "FIREBASE_NOT_READY" };
  }
  return { message, status: 500, code: "SERVER_ERROR" };
}

function emptyOperationalSnapshot(user: CurrentUser) {
  return {
    currentUser: user,
    clients: [], documents: [], tasks: [], reminders: [], team: [], access: [], activities: [],
    requests: [], requirements: [], requestTasks: [], files: [], users: [],
    generatedAt: nowIso(),
  };
}

async function loadAll() {
  const [clients, documents, tasks, reminders, team, access, activities, requests, requirements, requestTasks, files, users] = await Promise.all([
    listRecords<ClientRecord>("clients"), listRecords<DocumentRecord>("documents"), listRecords<TaskRecord>("tasks"),
    listRecords<ReminderRecord>("reminders"), listRecords<TeamRecord>("team_members"), listRecords<AccessRecord>("platform_access"),
    listRecords<ActivityRecord>("activities"), listRecords<ClientRequestRecord>("client_requests"), listRecords<RequirementRecord>("client_requirements"),
    listRecords<RequestTaskRecord>("request_tasks"), listRecords<StoredFileRecord>("stored_files"), listRecords<AppUserRecord>("app_users"),
  ]);
  return { clients, documents, tasks, reminders, team, access, activities, requests, requirements, requestTasks, files, users };
}

async function snapshot(user: CurrentUser) {
  const all = await loadAll();
  if (user.role === "client") {
    if (!user.clientId) throw new ApiError("حساب العميل غير مرتبط بمنشأة.", 403, "CLIENT_NOT_LINKED");
    return {
      ...emptyOperationalSnapshot(user),
      clients: all.clients.filter((row) => row.id === user.clientId).map((row) => ({ ...row, notes: "" })),
      documents: all.documents.filter((row) => row.clientId === user.clientId).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)).map((row) => ({ ...row, notes: "" })),
      requests: all.requests.filter((row) => row.clientId === user.clientId).sort(descendingDate).map((row) => ({ ...row, createdByEmail: "", assignedEmail: null })),
      requirements: all.requirements.filter((row) => row.clientId === user.clientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((row) => ({ ...row, createdBy: "فريق سعود أوبس" })),
      files: all.files.filter((row) => row.clientId === user.clientId && row.visibility === "عميل وفريق").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((row) => ({ ...row, uploadedBy: "" })),
    };
  }

  if (user.role === "employee") {
    const taskRows = all.tasks.filter((row) => row.assignedEmail === user.email).sort(descendingDate);
    const requestRows = all.requests.filter((row) => row.assignedEmail === user.email).sort(descendingDate);
    const clientIds = new Set([...taskRows.map((row) => row.clientId), ...requestRows.map((row) => row.clientId)]);
    const taskIds = new Set(taskRows.map((row) => row.id));
    const requestIds = new Set(requestRows.map((row) => row.id));
    return {
      ...emptyOperationalSnapshot(user),
      clients: all.clients.filter((row) => clientIds.has(row.id)).sort((a, b) => a.name.localeCompare(b.name, "ar")),
      documents: all.documents.filter((row) => clientIds.has(row.clientId)).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)),
      tasks: taskRows,
      team: all.team.filter((row) => row.email === user.email),
      activities: all.activities.filter((row) => row.taskId !== null && taskIds.has(row.taskId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100),
      requests: requestRows,
      requirements: all.requirements.filter((row) => requestIds.has(row.requestId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      requestTasks: all.requestTasks.filter((row) => taskIds.has(row.taskId)),
      files: all.files.filter((row) => clientIds.has(row.clientId) && row.visibility !== "الإدارة فقط").sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }

  return {
    currentUser: user,
    clients: all.clients.sort((a, b) => a.name.localeCompare(b.name, "ar")),
    documents: all.documents.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)),
    tasks: all.tasks.sort(descendingDate),
    reminders: all.reminders.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor) || b.id - a.id),
    team: all.team.filter((row) => row.active).sort((a, b) => a.id - b.id),
    access: all.access.sort((a, b) => a.platform.localeCompare(b.platform, "ar")),
    activities: all.activities.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id).slice(0, 100),
    requests: all.requests.sort(descendingDate),
    requirements: all.requirements.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id),
    requestTasks: all.requestTasks.sort((a, b) => b.id - a.id),
    files: all.files.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id),
    users: all.users.map((row) => ({ id: row.id, email: row.email, fullName: row.fullName, role: row.role, clientId: row.clientId, active: row.active, createdAt: row.createdAt, updatedAt: row.updatedAt })).sort((a, b) => a.role.localeCompare(b.role) || a.fullName.localeCompare(b.fullName, "ar")),
    generatedAt: nowIso(),
  };
}

async function createAuthUser(email: string, password: string, displayName: string) {
  if (password.length < 8) throw new ApiError("كلمة المرور المؤقتة يجب ألا تقل عن 8 خانات.");
  return adminAuth.createUser({ email, password, displayName, disabled: false });
}

async function deleteAuthUser(uid: string | undefined) {
  if (!uid) return;
  try { await adminAuth.deleteUser(uid); } catch (error) { if (authErrorCode(error) !== "auth/user-not-found") throw error; }
}

export async function GET() {
  try {
    const user = await requireUser();
    const [operational, compliance, monitoring] = await Promise.all([snapshot(user), complianceSnapshot(user), monitoringSnapshot(user)]);
    return Response.json({ ...operational, ...compliance, ...monitoring });
  } catch (error) {
    const result = clientError(error);
    return Response.json({ error: result.message, code: result.code }, { status: result.status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const payload = await request.json() as Record<string, unknown>;
    const action = clean(payload.action);
    const actor = user.fullName;

    if (action === "create_user") {
      requireRole(user, "owner");
      const email = normalizedEmail(payload.email);
      const fullName = clean(payload.fullName);
      const role = clean(payload.role) as Role;
      const clientId = numberValue(payload.clientId);
      const temporaryPassword = clean(payload.temporaryPassword);
      if (!email || !fullName || !ROLES.includes(role) || role === "owner") throw new ApiError("الاسم والبريد ونوع الحساب مطلوبة.");
      if (role === "client" && !clientId) throw new ApiError("اختر ملف العميل الذي سيظهر لهذا الحساب.");
      const existingUsers = await listRecords<AppUserRecord>("app_users");
      if (existingUsers.some((row) => row.email === email)) throw new ApiError("يوجد حساب بهذا البريد مسبقًا.", 409, "DUPLICATE");
      const authUser = await createAuthUser(email, temporaryPassword, fullName);
      try {
        const timestamp = nowIso();
        const created = await createRecord<AppUserRecord>("app_users", { uid: authUser.uid, email, fullName, role, clientId: role === "client" ? clientId : null, active: true, createdAt: timestamp, updatedAt: timestamp });
        if (role === "employee") {
          const teamRows = await listRecords<TeamRecord>("team_members");
          if (!teamRows.some((row) => row.email === email)) await createRecord<TeamRecord>("team_members", { name: fullName, email, role: "تنفيذ ومتابعة", color: "#087568", active: true, createdAt: timestamp });
        }
        return Response.json({ ok: true, user: created });
      } catch (error) {
        await deleteAuthUser(authUser.uid);
        throw error;
      }
    }

    if (action === "set_user_active") {
      requireRole(user, "owner");
      const id = Number(payload.id);
      const account = await getRecord<AppUserRecord>("app_users", id);
      if (!account) throw new ApiError("الحساب غير موجود.", 404, "NOT_FOUND");
      if (id === user.id && payload.active === false) throw new ApiError("لا يمكنك إيقاف حساب المالك الحالي.");
      const active = Boolean(payload.active);
      await adminAuth.updateUser(account.uid, { disabled: !active });
      await updateRecord("app_users", id, { active, updatedAt: nowIso() });
      return Response.json({ ok: true });
    }

    if (action === "create_team_member") {
      requireRole(user, "owner");
      const name = clean(payload.name);
      const email = normalizedEmail(payload.email);
      const role = clean(payload.role);
      const color = clean(payload.color) || "#087568";
      const temporaryPassword = clean(payload.temporaryPassword);
      if (!name || !role || !email) throw new ApiError("اسم الموظف وبريده ودوره مطلوبة.");
      const [teamRows, appUsers] = await Promise.all([listRecords<TeamRecord>("team_members"), listRecords<AppUserRecord>("app_users")]);
      if (teamRows.some((row) => row.email === email) || appUsers.some((row) => row.email === email)) throw new ApiError("الموظف أو حساب دخوله مسجل مسبقًا.", 409, "DUPLICATE");
      const authUser = await createAuthUser(email, temporaryPassword, name);
      let createdMember: TeamRecord | null = null;
      try {
        const timestamp = nowIso();
        createdMember = await createRecord<TeamRecord>("team_members", { name, email, role, color, active: true, createdAt: timestamp });
        await createRecord<AppUserRecord>("app_users", { uid: authUser.uid, email, fullName: name, role: "employee", clientId: null, active: true, createdAt: timestamp, updatedAt: timestamp });
        return Response.json({ ok: true, member: createdMember });
      } catch (error) {
        if (createdMember) await deleteRecord("team_members", createdMember.id);
        await deleteAuthUser(authUser.uid);
        throw error;
      }
    }

    if (action === "delete_team_member") {
      requireRole(user, "owner");
      const id = Number(payload.id);
      const member = await getRecord<TeamRecord>("team_members", id);
      if (!member) throw new ApiError("الموظف غير موجود.", 404, "NOT_FOUND");
      const email = normalizedEmail(member.email);
      if (email === user.email) throw new ApiError("لا يمكنك حذف حساب المالك الحالي.");
      const [taskRows, requestRows, appUsers] = await Promise.all([listRecords<TaskRecord>("tasks"), listRecords<ClientRequestRecord>("client_requests"), listRecords<AppUserRecord>("app_users")]);
      const openTasks = taskRows.filter((item) => item.assignedEmail === email && !["مكتملة", "ملغاة"].includes(item.status));
      const openRequests = requestRows.filter((item) => item.assignedEmail === email && !["مكتمل", "ملغي"].includes(item.status));
      if (openTasks.length || openRequests.length) throw new ApiError(`لا يمكن حذف الموظف قبل إعادة إسناد أو إغلاق ${openTasks.length} مهمة و${openRequests.length} طلب مفتوح.`);
      const account = appUsers.find((row) => row.email === email && row.role === "employee");
      await deleteAuthUser(account?.uid);
      await deleteRecord("team_members", id);
      if (account) await deleteRecord("app_users", account.id);
      return Response.json({ ok: true });
    }

    if (action === "create_client") {
      requireRole(user, "owner");
      const name = clean(payload.name);
      const phone = nullable(payload.phone);
      const crNumber = nullable(payload.crNumber);
      const unifiedNumber = nullable(payload.unifiedNumber);
      if (!name) throw new ApiError("اسم العميل مطلوب.");
      if (!phone && !crNumber && !unifiedNumber) throw new ApiError("أدخل الجوال أو السجل التجاري أو الرقم الموحد لمنع التكرار.");
      const clientRows = await listRecords<ClientRecord>("clients");
      const existing = clientRows.find((row) => (phone && row.phone === phone) || (crNumber && row.crNumber === crNumber) || (unifiedNumber && row.unifiedNumber === unifiedNumber));
      if (existing) return Response.json({ error: "العميل مسجل مسبقًا.", code: "DUPLICATE", existingClient: existing }, { status: 409 });
      const timestamp = nowIso();
      const created = await createRecord<ClientRecord>("clients", { name, legalName: nullable(payload.legalName), unifiedNumber, crNumber, phone, email: normalizedEmail(payload.email) || null, contactName: nullable(payload.contactName), city: clean(payload.city) || "مكة المكرمة", driveUrl: nullable(payload.driveUrl), notes: clean(payload.notes), status: "نشط", createdAt: timestamp, updatedAt: timestamp });
      await createRecord<ActivityRecord>("activities", { clientId: created.id, taskId: null, actor, event: "إضافة عميل", detail: "تم إنشاء ملف العميل لأول مرة.", createdAt: timestamp });
      return Response.json({ ok: true, client: created });
    }

    if (action === "update_client") {
      requireRole(user, "owner");
      const id = Number(payload.id);
      if (!id || !clean(payload.name) || !(await getRecord<ClientRecord>("clients", id))) throw new ApiError("بيانات العميل غير مكتملة.");
      await updateRecord("clients", id, { name: clean(payload.name), legalName: nullable(payload.legalName), unifiedNumber: nullable(payload.unifiedNumber), crNumber: nullable(payload.crNumber), phone: nullable(payload.phone), email: normalizedEmail(payload.email) || null, contactName: nullable(payload.contactName), city: clean(payload.city) || "مكة المكرمة", driveUrl: nullable(payload.driveUrl), notes: clean(payload.notes), updatedAt: nowIso() });
      await createRecord<ActivityRecord>("activities", { clientId: id, taskId: null, actor, event: "تحديث ملف العميل", detail: "تم تعديل بيانات الملف الأساسي.", createdAt: nowIso() });
      return Response.json({ ok: true });
    }

    if (action === "delete_client") {
      requireRole(user, "owner");
      const id = Number(payload.id);
      const client = await getRecord<ClientRecord>("clients", id);
      if (!client) throw new ApiError("العميل غير موجود.", 404, "NOT_FOUND");
      if (clean(payload.confirmation) !== client.name) throw new ApiError("اكتب اسم العميل كما هو لتأكيد الحذف.");
      const all = await loadAll();
      const clientTasks = all.tasks.filter((row) => row.clientId === id);
      const clientRequests = all.requests.filter((row) => row.clientId === id);
      const openTasks = clientTasks.filter((row) => !["مكتملة", "ملغاة"].includes(row.status));
      const openRequests = clientRequests.filter((row) => !["مكتمل", "ملغي"].includes(row.status));
      if (openTasks.length || openRequests.length) throw new ApiError(`لا يمكن حذف العميل قبل إغلاق ${openTasks.length} مهمة و${openRequests.length} طلب مفتوح.`);
      const fileRows = all.files.filter((row) => row.clientId === id);
      for (const file of fileRows) await adminBucket.file(file.storageKey).delete({ ignoreNotFound: true });
      const clientAccounts = all.users.filter((row) => row.clientId === id);
      for (const account of clientAccounts) await deleteAuthUser(account.uid);
      const taskIds = new Set(clientTasks.map((row) => row.id));
      const requestIds = new Set(clientRequests.map((row) => row.id));
      const references = [recordReference("clients", id)];
      all.documents.filter((row) => row.clientId === id).forEach((row) => references.push(recordReference("documents", row.id)));
      clientTasks.forEach((row) => references.push(recordReference("tasks", row.id)));
      all.reminders.filter((row) => row.clientId === id).forEach((row) => references.push(recordReference("reminders", row.id)));
      all.access.filter((row) => row.clientId === id).forEach((row) => references.push(recordReference("platform_access", row.id)));
      all.activities.filter((row) => row.clientId === id).forEach((row) => references.push(recordReference("activities", row.id)));
      clientRequests.forEach((row) => references.push(recordReference("client_requests", row.id)));
      all.requirements.filter((row) => row.clientId === id).forEach((row) => references.push(recordReference("client_requirements", row.id)));
      all.requestTasks.filter((row) => requestIds.has(row.requestId) || taskIds.has(row.taskId)).forEach((row) => references.push(recordReference("request_tasks", row.id)));
      fileRows.forEach((row) => references.push(recordReference("stored_files", row.id)));
      clientAccounts.forEach((row) => references.push(recordReference("app_users", row.id)));
      await deleteReferences(references);
      return Response.json({ ok: true });
    }

    if (action === "create_document") {
      requireRole(user, "owner", "employee");
      const clientId = Number(payload.clientId);
      const type = clean(payload.type);
      const title = clean(payload.title);
      const expiryDate = clean(payload.expiryDate);
      if (!clientId || !type || !title || !expiryDate) throw new ApiError("العميل ونوع المستند واسمه وتاريخ انتهائه مطلوبة.");
      await assertClientAccess(user, clientId);
      const timestamp = nowIso();
      const created = await createRecord<DocumentRecord>("documents", { clientId, type, title, documentNumber: nullable(payload.documentNumber), issueDate: nullable(payload.issueDate), expiryDate, driveUrl: nullable(payload.driveUrl), reminderDays: Number(payload.reminderDays) || 60, status: "ساري", notes: clean(payload.notes), createdAt: timestamp, updatedAt: timestamp });
      await createRecord<ActivityRecord>("activities", { clientId, taskId: null, actor, event: "إضافة مستند", detail: `${title} — تاريخ الانتهاء ${expiryDate}`, createdAt: timestamp });
      return Response.json({ ok: true, document: created });
    }

    if (action === "create_task") {
      requireRole(user, "owner");
      const clientId = Number(payload.clientId);
      const subject = clean(payload.subject);
      const serviceType = clean(payload.serviceType) || subject;
      if (!clientId || !subject) throw new ApiError("العميل وموضوع المهمة مطلوبان.");
      const timestamp = nowIso();
      const code = `TR-${Date.now().toString().slice(-6)}${crypto.randomUUID().slice(0, 2).toUpperCase()}`;
      const created = await createRecord<TaskRecord>("tasks", { code, clientId, documentId: numberValue(payload.documentId), serviceType, subject, assignedTo: nullable(payload.assignedTo), assignedEmail: normalizedEmail(payload.assignedEmail) || null, status: clean(payload.status) || "جديدة", priority: clean(payload.priority) || "متوسطة", dueDate: nullable(payload.dueDate), currentStep: clean(payload.currentStep) || "مراجعة المتطلبات", paymentStatus: clean(payload.paymentStatus) || "غير مطلوب", amount: numberValue(payload.amount), notes: clean(payload.notes), source: "يدوي", createdAt: timestamp, updatedAt: timestamp });
      await createRecord<ActivityRecord>("activities", { clientId, taskId: created.id, actor, event: "إنشاء مهمة", detail: `${code} — ${subject}`, createdAt: timestamp });
      return Response.json({ ok: true, task: created });
    }

    if (action === "record_task_open") {
      requireRole(user, "owner", "employee");
      const task = await assertTaskAccess(user, Number(payload.id));
      await createRecord<ActivityRecord>("activities", { clientId: task.clientId, taskId: task.id, actor, event: "فتح المعاملة", detail: `تم فتح ${task.code} للاطلاع أو المتابعة.`, createdAt: nowIso() });
      return Response.json({ ok: true });
    }

    if (action === "update_task") {
      requireRole(user, "owner", "employee");
      const task = await assertTaskAccess(user, Number(payload.id));
      const status = clean(payload.status) || task.status;
      const nextExpiryDate = clean(payload.nextExpiryDate);
      const proofDriveUrl = nullable(payload.proofDriveUrl);
      if (status === "مكتملة" && task.documentId && !nextExpiryDate) throw new ApiError("أدخل تاريخ الانتهاء الجديد قبل إغلاق المعاملة.");
      const assignedTo = user.role === "owner" ? nullable(payload.assignedTo) ?? task.assignedTo : task.assignedTo;
      const assignedEmail = user.role === "owner" ? normalizedEmail(payload.assignedEmail) || task.assignedEmail : task.assignedEmail;
      const timestamp = nowIso();
      await updateRecord("tasks", task.id, { status, assignedTo, assignedEmail, currentStep: status === "مكتملة" ? "مكتملة ومؤرشفة" : clean(payload.currentStep) || task.currentStep, paymentStatus: clean(payload.paymentStatus) || task.paymentStatus, updatedAt: timestamp });
      if (status === "مكتملة" && task.documentId) {
        await updateRecord("documents", task.documentId, { expiryDate: nextExpiryDate, driveUrl: proofDriveUrl, status: "ساري", updatedAt: timestamp });
        const reminderRows = await listRecords<ReminderRecord>("reminders");
        for (const reminder of reminderRows.filter((row) => row.documentId === task.documentId)) await updateRecord("reminders", reminder.id, { status: "أغلق بالتجديد", updatedAt: timestamp });
        await createRecord<ActivityRecord>("activities", { clientId: task.clientId, taskId: task.id, actor, event: "إنجاز وأرشفة المعاملة", detail: `تم تحديث المستند، وتاريخ الانتهاء القادم ${nextExpiryDate}.`, createdAt: timestamp });
      } else {
        await createRecord<ActivityRecord>("activities", { clientId: task.clientId, taskId: task.id, actor, event: "تحديث المهمة", detail: `الحالة الحالية: ${status} — ${clean(payload.currentStep) || task.currentStep}`, createdAt: timestamp });
      }
      const [links, requestRows] = await Promise.all([listRecords<RequestTaskRecord>("request_tasks"), listRecords<ClientRequestRecord>("client_requests")]);
      const requestStatus = status === "مكتملة" ? "مراجعة واعتماد" : status === "قيد التنفيذ" ? "قيد التنفيذ" : null;
      if (requestStatus) for (const link of links.filter((row) => row.taskId === task.id)) if (requestRows.some((row) => row.id === link.requestId)) await updateRecord("client_requests", link.requestId, { status: requestStatus, updatedAt: timestamp });
      return Response.json({ ok: true });
    }

    if (action === "add_note") {
      requireRole(user, "owner", "employee");
      const clientId = Number(payload.clientId);
      const detail = clean(payload.detail);
      const taskId = numberValue(payload.taskId);
      if (!clientId || !detail) throw new ApiError("اكتب الملاحظة أولًا.");
      if (taskId) await assertTaskAccess(user, taskId); else await assertClientAccess(user, clientId);
      await createRecord<ActivityRecord>("activities", { clientId, taskId, actor, event: "ملاحظة داخلية", detail, createdAt: nowIso() });
      return Response.json({ ok: true });
    }

    if (action === "create_access_reference") {
      requireRole(user, "owner");
      const clientId = Number(payload.clientId);
      const platform = clean(payload.platform);
      if (!clientId || !platform) throw new ApiError("العميل والمنصة مطلوبان.");
      await createRecord<AccessRecord>("platform_access", { clientId, platform, username: nullable(payload.username), vaultReference: nullable(payload.vaultReference), notes: clean(payload.notes), createdAt: nowIso() });
      await createRecord<ActivityRecord>("activities", { clientId, taskId: null, actor, event: "إضافة مرجع دخول", detail: `أضيف مرجع منصة ${platform} دون حفظ كلمة المرور.`, createdAt: nowIso() });
      return Response.json({ ok: true });
    }

    if (action === "create_request") {
      requireRole(user, "owner", "client");
      const clientId = user.role === "client" ? user.clientId : numberValue(payload.clientId);
      const serviceType = clean(payload.serviceType);
      const title = clean(payload.title) || serviceType;
      if (!clientId || !serviceType || !title) throw new ApiError("اختر الخدمة واكتب عنوان الطلب.");
      await assertClientAccess(user, clientId);
      const timestamp = nowIso();
      const code = `RQ-${Date.now().toString().slice(-6)}${crypto.randomUUID().slice(0, 2).toUpperCase()}`;
      const created = await createRecord<ClientRequestRecord>("client_requests", { code, clientId, createdByEmail: user.email, serviceType, title, description: clean(payload.description), status: "جديد", priority: clean(payload.priority) || "متوسطة", assignedTo: null, assignedEmail: null, quotedAmount: null, paymentStatus: "غير مطلوب", paymentUrl: null, dueDate: null, createdAt: timestamp, updatedAt: timestamp });
      await createRecord<ActivityRecord>("activities", { clientId, taskId: null, actor, event: "طلب جديد من العميل", detail: `${code} — ${title}`, createdAt: timestamp });
      return Response.json({ ok: true, request: created });
    }

    if (action === "update_request") {
      requireRole(user, "owner");
      const id = Number(payload.id);
      const requestRow = await getRecord<ClientRequestRecord>("client_requests", id);
      if (!requestRow) throw new ApiError("الطلب غير موجود.", 404, "NOT_FOUND");
      const assignedTo = nullable(payload.assignedTo) ?? requestRow.assignedTo;
      const assignedEmail = normalizedEmail(payload.assignedEmail) || requestRow.assignedEmail;
      const status = clean(payload.status) || requestRow.status;
      const timestamp = nowIso();
      await updateRecord("client_requests", id, { status, assignedTo, assignedEmail, quotedAmount: numberValue(payload.quotedAmount) ?? requestRow.quotedAmount, paymentStatus: clean(payload.paymentStatus) || requestRow.paymentStatus, paymentUrl: nullable(payload.paymentUrl) ?? requestRow.paymentUrl, dueDate: nullable(payload.dueDate) ?? requestRow.dueDate, updatedAt: timestamp });
      if (payload.createTask === true) {
        if (!assignedEmail) throw new ApiError("اختر الموظف قبل إنشاء المهمة الداخلية.");
        const existingLinks = await listRecords<RequestTaskRecord>("request_tasks");
        if (!existingLinks.some((row) => row.requestId === id)) {
          const code = `TR-${Date.now().toString().slice(-6)}${crypto.randomUUID().slice(0, 2).toUpperCase()}`;
          const task = await createRecord<TaskRecord>("tasks", { code, clientId: requestRow.clientId, documentId: null, serviceType: requestRow.serviceType, subject: requestRow.title, assignedTo, assignedEmail, status: "جديدة", priority: requestRow.priority, dueDate: nullable(payload.dueDate), currentStep: "مراجعة طلب العميل والمتطلبات", paymentStatus: "غير مطلوب", amount: null, notes: "", source: "طلب عميل", createdAt: timestamp, updatedAt: timestamp });
          await createRecord<RequestTaskRecord>("request_tasks", { requestId: id, taskId: task.id, createdAt: timestamp });
          await createRecord<ActivityRecord>("activities", { clientId: requestRow.clientId, taskId: task.id, actor, event: "تحويل الطلب إلى مهمة", detail: `${requestRow.code} أُسند إلى ${assignedTo || assignedEmail}.`, createdAt: timestamp });
        }
      }
      return Response.json({ ok: true });
    }

    if (action === "create_requirement") {
      requireRole(user, "owner");
      const requestId = Number(payload.requestId);
      const type = clean(payload.type);
      const title = clean(payload.title);
      const requestRow = await getRecord<ClientRequestRecord>("client_requests", requestId);
      if (!requestRow) throw new ApiError("الطلب غير موجود.", 404, "NOT_FOUND");
      if (!type || !title) throw new ApiError("نوع المطلوب وعنوانه مطلوبان.");
      const timestamp = nowIso();
      const created = await createRecord<RequirementRecord>("client_requirements", { requestId, clientId: requestRow.clientId, type, title, description: clean(payload.description), amount: numberValue(payload.amount), paymentUrl: nullable(payload.paymentUrl), status: "مطلوب", responseText: null, dueDate: nullable(payload.dueDate), createdBy: actor, createdAt: timestamp, respondedAt: null, updatedAt: timestamp });
      const waitingStatus = type === "سداد" ? "بانتظار السداد" : "بانتظار العميل";
      await updateRecord("client_requests", requestId, { status: waitingStatus, paymentStatus: type === "سداد" ? "بانتظار السداد" : requestRow.paymentStatus, updatedAt: timestamp });
      await createRecord<ActivityRecord>("activities", { clientId: requestRow.clientId, taskId: null, actor, event: `طلب ${type} من العميل`, detail: `${requestRow.code} — ${title}`, createdAt: timestamp });
      return Response.json({ ok: true, requirement: created });
    }

    if (action === "respond_requirement") {
      requireRole(user, "client");
      const id = Number(payload.id);
      const requirement = await getRecord<RequirementRecord>("client_requirements", id);
      if (!requirement || requirement.clientId !== user.clientId) throw new ApiError("المطلوب غير موجود.", 404, "NOT_FOUND");
      const responseText = clean(payload.responseText);
      if (!responseText) throw new ApiError("اكتب الرد أو تأكيد الإجراء.");
      const timestamp = nowIso();
      await updateRecord("client_requirements", id, { status: "تم الرد", responseText, respondedAt: timestamp, updatedAt: timestamp });
      await updateRecord("client_requests", requirement.requestId, { status: "قيد المراجعة", paymentStatus: requirement.type === "سداد" ? "أفاد العميل بالسداد" : undefined, updatedAt: timestamp });
      await createRecord<ActivityRecord>("activities", { clientId: requirement.clientId, taskId: null, actor, event: "رد العميل", detail: `${requirement.title} — ${responseText}`, createdAt: timestamp });
      return Response.json({ ok: true });
    }

    if (action === "mark_reminder_sent") {
      requireRole(user, "owner");
      const id = Number(payload.id);
      const reminder = await getRecord<ReminderRecord>("reminders", id);
      if (!reminder) throw new ApiError("التنبيه غير موجود.", 404, "NOT_FOUND");
      const timestamp = nowIso();
      await updateRecord("reminders", id, { status: "تم الإرسال", sentAt: timestamp, updatedAt: timestamp });
      await createRecord<ActivityRecord>("activities", { clientId: reminder.clientId, taskId: null, actor, event: "إرسال تنبيه للعميل", detail: "تم تسجيل إرسال تنبيه التجديد عبر واتساب.", createdAt: timestamp });
      return Response.json({ ok: true });
    }

    if (action === "email_reminder") {
      requireRole(user, "owner");
      if (!isMailConfigured()) throw new ApiError("البريد غير مفعّل: أكمل إعدادات SMTP في App Hosting أولًا.", 400, "MAIL_DISABLED");
      const id = Number(payload.id);
      const reminder = await getRecord<ReminderRecord>("reminders", id);
      if (!reminder) throw new ApiError("التنبيه غير موجود.", 404, "NOT_FOUND");
      const [client, document] = await Promise.all([getRecord<ClientRecord>("clients", reminder.clientId), getRecord<DocumentRecord>("documents", reminder.documentId)]);
      const to = (client?.email || "").trim();
      if (!client || !to.includes("@")) throw new ApiError("لا يوجد بريد إلكتروني مسجل لهذا العميل. أضفه من ملف العميل.");
      try {
        await sendMail({ to, ...renderReminderEmail({ clientName: client.name, documentTitle: document?.title || "مستند", message: reminder.message, officeName: "مَسار — سعود أوبس" }) });
      } catch (error) {
        throw new ApiError(`تعذّر إرسال البريد: ${error instanceof Error ? error.message.slice(0, 200) : "خطأ غير معروف"}`, 502, "MAIL_FAILED");
      }
      const timestamp = nowIso();
      await updateRecord("reminders", id, { status: "تم الإرسال", channel: "بريد", sentAt: timestamp, updatedAt: timestamp });
      await createRecord<ActivityRecord>("activities", { clientId: reminder.clientId, taskId: null, actor, event: "إرسال تنبيه للعميل", detail: `تم إرسال تنبيه التجديد بالبريد إلى ${to}.`, createdAt: timestamp });
      return Response.json({ ok: true, sentTo: to });
    }

    if (action === "scan_alerts") {
      requireRole(user, "owner");
      const [documentRows, clientRows, taskRows, memberRows, reminderRows] = await Promise.all([listRecords<DocumentRecord>("documents"), listRecords<ClientRecord>("clients"), listRecords<TaskRecord>("tasks"), listRecords<TeamRecord>("team_members"), listRecords<ReminderRecord>("reminders")]);
      const clientsById = new Map(clientRows.map((item) => [item.id, item]));
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      let remindersCreated = 0;
      let tasksCreated = 0;
      const activeMembers = memberRows.filter((row) => row.active).sort((a, b) => a.id - b.id);
      for (const document of documentRows.filter((row) => row.status !== "مؤرشف")) {
        const expiry = new Date(`${document.expiryDate}T00:00:00Z`);
        const days = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
        if (days > document.reminderDays) continue;
        const client = clientsById.get(document.clientId);
        if (!client) continue;
        const dayText = days < 0 ? `منتهي منذ ${Math.abs(days)} يومًا` : `متبقي ${days} يومًا`;
        const message = `مرحبًا ${client.name}، نود تنبيهكم بأن ${document.title} ${dayText} (تاريخ الانتهاء: ${document.expiryDate}). هل ترغبون أن نبدأ إجراءات التجديد؟`;
        if (!reminderRows.some((row) => row.documentId === document.id && row.expiryDate === document.expiryDate)) {
          const timestamp = nowIso();
          await createRecord<ReminderRecord>("reminders", { clientId: client.id, documentId: document.id, expiryDate: document.expiryDate, channel: "واتساب", scheduledFor: isoDate(today), status: "جاهز للإرسال", message, sentAt: null, createdAt: timestamp, updatedAt: timestamp });
          await createRecord<ActivityRecord>("activities", { clientId: client.id, taskId: null, actor: "النظام", event: "إنشاء تنبيه تلقائي", detail: `${document.title} — ${dayText}`, createdAt: timestamp });
          remindersCreated += 1;
        }
        const hasOpenTask = taskRows.some((task) => task.documentId === document.id && !["مكتملة", "ملغاة"].includes(task.status));
        if (days <= 30 && !hasOpenTask) {
          const assignee = activeMembers[tasksCreated % Math.max(activeMembers.length, 1)];
          const timestamp = nowIso();
          const code = `TR-${Date.now().toString().slice(-6)}${String(document.id).slice(-4)}`;
          await createRecord<TaskRecord>("tasks", { code, clientId: client.id, documentId: document.id, serviceType: `تجديد ${document.type}`, subject: `تجديد ${document.title}`, assignedTo: assignee?.name || null, assignedEmail: assignee?.email || null, status: "بانتظار موافقة العميل", priority: days <= 7 ? "عاجلة" : "مرتفعة", dueDate: document.expiryDate, currentStep: "إرسال موافقة التجديد", paymentStatus: "غير مطلوب", amount: null, notes: "", source: "تنبيه آلي", createdAt: timestamp, updatedAt: timestamp });
          tasksCreated += 1;
        }
      }
      return Response.json({ ok: true, remindersCreated, tasksCreated });
    }

    // إجراءات وحدة الرصد النظامي والامتثال
    const complianceResult = await handleComplianceAction(action, payload, user);
    if (complianceResult) return Response.json(complianceResult);
    const monitoringResult = await handleMonitoringAction(action, payload, user);
    if (monitoringResult) return Response.json(monitoringResult);

    throw new ApiError("الإجراء غير معروف.");
  } catch (error) {
    const result = clientError(error);
    return Response.json({ error: result.message, code: result.code }, { status: result.status });
  }
}
