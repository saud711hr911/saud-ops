import { adminBucket, createRecord, deleteRecord, getRecord, listRecords, nowIso } from "../../../lib/firebase-admin";
import { CurrentUser, requireUser } from "../../../lib/server-auth";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 12 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "webp", "doc", "docx", "xls", "xlsx"]);

type TaskRecord = { id: number; clientId: number; assignedEmail: string | null };
type ClientRequestRecord = { id: number; clientId: number; assignedEmail: string | null };
type RequirementRecord = { id: number; clientId: number };
type DocumentRecord = { id: number; clientId: number };
type StoredFileRecord = {
  id: number; clientId: number; requestId: number | null; requirementId: number | null; documentId: number | null;
  label: string; fileName: string; contentType: string; fileSize: number; storageKey: string; visibility: string;
  uploadedBy: string; createdAt: string;
};
type ActivityRecord = { id: number; clientId: number; taskId: number | null; actor: string; event: string; detail: string; createdAt: string };

class FileApiError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

async function canAccessClient(user: CurrentUser, clientId: number) {
  if (user.role === "owner") return true;
  if (user.role === "client") return user.clientId === clientId;
  const [tasks, requests] = await Promise.all([listRecords<TaskRecord>("tasks"), listRecords<ClientRequestRecord>("client_requests")]);
  return tasks.some((row) => row.clientId === clientId && row.assignedEmail === user.email) || requests.some((row) => row.clientId === clientId && row.assignedEmail === user.email);
}

function safeFileName(name: string) {
  return name.replace(/[\r\n"\\/]/g, "-").slice(0, 180) || "file";
}

function validateFileName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new FileApiError("نوع الملف غير مدعوم. استخدم PDF أو صورة أو Word أو Excel.", 415);
}

async function validateRelation(clientId: number, requestId: number | null, requirementId: number | null, documentId: number | null) {
  if (requestId) {
    const row = await getRecord<ClientRequestRecord>("client_requests", requestId);
    if (!row || row.clientId !== clientId) throw new FileApiError("الطلب لا يتبع ملف العميل المحدد.");
  }
  if (requirementId) {
    const row = await getRecord<RequirementRecord>("client_requirements", requirementId);
    if (!row || row.clientId !== clientId) throw new FileApiError("المطلوب لا يتبع ملف العميل المحدد.");
  }
  if (documentId) {
    const row = await getRecord<DocumentRecord>("documents", documentId);
    if (!row || row.clientId !== clientId) throw new FileApiError("المستند لا يتبع ملف العميل المحدد.");
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!id) throw new FileApiError("الملف غير محدد.");
    const record = await getRecord<StoredFileRecord>("stored_files", id);
    if (!record) throw new FileApiError("الملف غير موجود.", 404);
    if (!(await canAccessClient(user, record.clientId))) throw new FileApiError("لا يمكنك تنزيل هذا الملف.", 403);
    if (user.role === "client" && record.visibility !== "عميل وفريق") throw new FileApiError("هذا الملف داخلي.", 403);
    if (user.role === "employee" && record.visibility === "الإدارة فقط") throw new FileApiError("هذا الملف مخصص للإدارة.", 403);
    const [buffer] = await adminBucket.file(record.storageKey).download();
    const fileName = safeFileName(record.fileName);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": record.contentType,
        "Content-Length": String(record.fileSize),
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const status = error instanceof FileApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : "تعذر تنزيل الملف.";
    return Response.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new FileApiError("اختر ملفًا لرفعه.");
    if (file.size > MAX_FILE_SIZE) throw new FileApiError("الحد الأقصى للملف 12 ميجابايت.", 413);
    validateFileName(file.name);

    const suppliedClientId = Number(form.get("clientId"));
    const clientId = user.role === "client" ? user.clientId : suppliedClientId;
    if (!clientId || !(await canAccessClient(user, clientId))) throw new FileApiError("لا يمكنك الرفع إلى ملف هذا العميل.", 403);
    const requestId = Number(form.get("requestId")) || null;
    const requirementId = Number(form.get("requirementId")) || null;
    const documentId = Number(form.get("documentId")) || null;
    await validateRelation(clientId, requestId, requirementId, documentId);

    const fileName = safeFileName(file.name);
    const contentType = file.type || "application/octet-stream";
    const requestedVisibility = String(form.get("visibility") || "عميل وفريق");
    const visibility = user.role === "owner" && ["عميل وفريق", "الفريق", "الإدارة فقط"].includes(requestedVisibility)
      ? requestedVisibility : user.role === "client" ? "عميل وفريق" : "الفريق";
    const label = String(form.get("label") || fileName).trim().slice(0, 160) || fileName;
    const storageKey = `clients/${clientId}/${nowIso().slice(0, 10)}/${crypto.randomUUID()}-${fileName}`;
    const storageFile = adminBucket.file(storageKey);
    await storageFile.save(Buffer.from(await file.arrayBuffer()), {
      resumable: false,
      contentType,
      metadata: { metadata: { clientId: String(clientId), uploadedBy: user.email } },
    });

    let created: StoredFileRecord | null = null;
    try {
      created = await createRecord<StoredFileRecord>("stored_files", { clientId, requestId, requirementId, documentId, label, fileName, contentType, fileSize: file.size, storageKey, visibility, uploadedBy: user.email, createdAt: nowIso() });
      await createRecord<ActivityRecord>("activities", { clientId, taskId: null, actor: user.fullName, event: "رفع ملف", detail: `${label} — ${fileName}`, createdAt: nowIso() });
      return Response.json({ ok: true, file: created });
    } catch (error) {
      if (created) await deleteRecord("stored_files", created.id);
      await storageFile.delete({ ignoreNotFound: true });
      throw error;
    }
  } catch (error) {
    const status = error instanceof FileApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : "تعذر رفع الملف.";
    return Response.json({ error: message }, { status });
  }
}
