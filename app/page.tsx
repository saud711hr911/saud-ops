"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";

type Section = "dashboard" | "clients" | "documents" | "tasks" | "requests" | "alerts" | "compliance" | "team" | "users" | "settings";
type ModalType = "client" | "document" | "task" | "access" | "team" | "user" | "requirement" | "deleteClient" | "deleteTeam" | "regUpdate" | "workforce" | null;
type AppRole = "owner" | "employee" | "client";

type Client = {
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

type Reminder = {
  id: number; clientId: number; documentId: number; expiryDate: string; channel: string; scheduledFor: string;
  status: string; message: string; sentAt: string | null; createdAt: string; updatedAt: string;
};

type TeamMember = { id: number; name: string; email: string | null; role: string; color: string; active: boolean; createdAt: string };
type AccessReference = { id: number; clientId: number; platform: string; username: string | null; vaultReference: string | null; notes: string; createdAt: string };
type Activity = { id: number; clientId: number; taskId: number | null; actor: string; event: string; detail: string; createdAt: string };
type CurrentUser = { id: number; email: string; fullName: string; role: AppRole; clientId: number | null };
type ClientRequest = { id: number; code: string; clientId: number; createdByEmail: string; serviceType: string; title: string; description: string; status: string; priority: string; assignedTo: string | null; assignedEmail: string | null; quotedAmount: number | null; paymentStatus: string; paymentUrl: string | null; dueDate: string | null; createdAt: string; updatedAt: string };
type ClientRequirement = { id: number; requestId: number; clientId: number; type: string; title: string; description: string; amount: number | null; paymentUrl: string | null; status: string; responseText: string | null; dueDate: string | null; createdBy: string; createdAt: string; respondedAt: string | null; updatedAt: string };
type RequestTask = { id: number; requestId: number; taskId: number; createdAt: string };
type StoredFile = { id: number; clientId: number; requestId: number | null; requirementId: number | null; documentId: number | null; label: string; fileName: string; contentType: string; fileSize: number; visibility: string; uploadedBy: string; createdAt: string };
type AppUser = { id: number; email: string; fullName: string; role: AppRole; clientId: number | null; active: boolean; createdAt: string; updatedAt: string };
type RegulatoryUpdateRow = { id: number; code: string; referenceNumber: string | null; title: string; summary: string; authority: string; categories: string[]; announcementDate: string | null; effectiveDate: string | null; correctionDeadline: string | null; sourceUrl: string | null; officialDocUrl: string | null; applicability: { logic: string; rules: Array<Record<string, unknown>> } | null; measure: { type: string; targetValue: number | null; unit: string } | null; requiredActions: Array<{ code: string; label: string }>; status: string; version: number; previousEffectiveDate: string | null; statusReason: string | null; createdByEmail: string; reviewedByEmail: string | null; reviewedAt: string | null; createdAt: string; updatedAt: string };
type MatchTraceRow = { rule: string; ruleAr: string; value: unknown; passed: boolean | null; unknown?: boolean };
type ImpactGapRow = { currentValue: number | null; currentValueAsOf: string | null; requiredValue: number | null; estimatedHires: number | null; stale: boolean };
type RegulatoryImpactRow = { id: string; updateId: number; clientId: number; effectiveDate: string | null; applicable: boolean | null; matchTrace: MatchTraceRow[]; gap: ImpactGapRow | null; risk: string; state: string; isOverdue: boolean; daysRemaining: number | null; internalDeadline: string | null; escalationLevel: number; taskId: number | null; assessedAt: string };
type ComplianceProfileRow = { id: number; clientId: number; isicCode: string | null; activityLabel: string | null; sector: string | null; cityCode: string | null; mhrsdEstablishmentId: string | null; nitaqatBand: string | null; completeness: number; missingFields: string[]; lastVerifiedAt: string | null };
type WorkforceSnapshotRow = { id: number; clientId: number; asOf: string; source: string; totalEmployees: number; saudis: number; nonSaudis: number; saudizationRate: number; capturedBy: string };
type ComplianceStepRow = { id: string; impactId: string; taskId: number | null; stepOrder: number; title: string; dueDate: string; status: string; completedAt: string | null };
type ComplianceAlertRow = { id: string; impactId: string; level: number; title: string; message: string; status: string; scheduledFor: string; sentAt: string | null; createdAt: string };
type ActionResult = { request?: ClientRequest; document?: DocumentRecord; [key: string]: unknown };
type Snapshot = { currentUser: CurrentUser; clients: Client[]; documents: DocumentRecord[]; tasks: TaskRecord[]; reminders: Reminder[]; team: TeamMember[]; access: AccessReference[]; activities: Activity[]; requests: ClientRequest[]; requirements: ClientRequirement[]; requestTasks: RequestTask[]; files: StoredFile[]; users: AppUser[]; regulatoryUpdates: RegulatoryUpdateRow[]; regulatoryImpacts: RegulatoryImpactRow[]; complianceProfiles: ComplianceProfileRow[]; workforceSnapshots: WorkforceSnapshotRow[]; complianceSteps: ComplianceStepRow[]; complianceAlerts: ComplianceAlertRow[]; generatedAt: string };

const navItems: Array<{ id: Section; label: string; icon: string }> = [
  { id: "dashboard", label: "الرئيسية", icon: "⌂" },
  { id: "clients", label: "العملاء", icon: "ع" },
  { id: "documents", label: "المستندات", icon: "م" },
  { id: "tasks", label: "المهام", icon: "✓" },
  { id: "requests", label: "طلبات العملاء", icon: "ط" },
  { id: "alerts", label: "التنبيهات", icon: "!" },
  { id: "compliance", label: "الرصد النظامي", icon: "ن" },
  { id: "team", label: "الفريق", icon: "ف" },
  { id: "users", label: "الدخول والصلاحيات", icon: "ص" },
  { id: "settings", label: "الربط والإعدادات", icon: "⚙" },
];

const taskStatuses = ["جديدة", "بانتظار موافقة العميل", "نقص مستند", "بانتظار السداد", "قيد التنفيذ", "مراجعة واعتماد", "مكتملة", "ملغاة"];
const taskQueues = ["مهامي اليوم", "بانتظار العميل", "متأخرة", "كل المعاملات"];
const priorityOrder: Record<string, number> = { "عاجلة": 0, "مرتفعة": 1, "متوسطة": 2, "منخفضة": 3 };

const authorityLabels: Record<string, string> = { MHRSD: "الموارد البشرية والتنمية الاجتماعية", GOSI: "التأمينات الاجتماعية", QIWA: "قوى", MUDAD: "مدد", AJEER: "أجير", OTHER: "جهة أخرى" };
const categoryLabels: Record<string, string> = { saudization: "التوطين", wage_protection: "حماية الأجور", gosi: "التأمينات", contracts: "العقود", work_permits: "رخص العمل", ajeer: "أجير", ohs: "السلامة المهنية", other: "أخرى" };
const updateStatusLabels: Record<string, string> = { draft: "مسودة", pending_review: "بانتظار المراجعة", rejected: "مرفوض", approved: "معتمد", in_effect: "نافذ", postponed: "مؤجَّل", cancelled: "ملغى", superseded: "حلّ محله قرار آخر", archived: "مؤرشف" };
const impactStateLabels: Record<string, string> = { pending_assessment: "بانتظار التقييم", not_applicable: "غير منطبق", needs_review: "يحتاج مراجعة", action_required: "يحتاج إجراء", plan_created: "أُنشئت خطة تصحيح", in_progress: "قيد التنفيذ", compliant: "ممتثل", overdue: "متأخر", closed: "مغلق" };
const riskLabels: Record<string, string> = { low: "منخفض", medium: "متوسط", high: "مرتفع", critical: "حرج" };
const complianceDisclaimer = "هذه المعلومات ملخّص تنظيمي لأغراض المتابعة الإدارية، وليست استشارة نظامية. المرجع الملزم هو النص الرسمي الصادر عن الجهة المختصة والمنشور في الجريدة الرسمية. يُرجى التحقق من الرابط الرسمي المرفق قبل اتخاذ أي إجراء.";

function riskTone(risk: string) {
  if (risk === "critical") return "danger";
  if (risk === "high") return "warning";
  if (risk === "medium") return "info";
  return "success";
}

function remainingText(days: number | null) {
  if (days === null) return "بلا تاريخ نفاذ";
  if (days < 0) return `متأخر ${Math.abs(days)} يومًا`;
  if (days === 0) return "يبدأ النفاذ اليوم";
  if (days === 1) return "يوم واحد متبقٍ";
  if (days <= 10) return `${days} أيام متبقية`;
  return `${days} يومًا متبقيًا`;
}

function ruleValueText(value: unknown) {
  if (value === null || value === undefined) return "غير متوفرة";
  if (Array.isArray(value)) return value.join("، ");
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  return String(value);
}

function daysUntil(date: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T00:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function expiryMeta(date: string) {
  const days = daysUntil(date);
  if (days < 0) return { label: `منتهي منذ ${Math.abs(days)} يوم`, tone: "danger", days };
  if (days <= 7) return { label: `متبقي ${days} أيام`, tone: "danger", days };
  if (days <= 30) return { label: `متبقي ${days} يومًا`, tone: "warning", days };
  if (days <= 60) return { label: `متبقي ${days} يومًا`, tone: "info", days };
  return { label: "ساري", tone: "success", days };
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("");
}

function toneForTask(status: string) {
  if (status === "مكتملة") return "success";
  if (status === "ملغاة") return "muted";
  if (status === "نقص مستند") return "danger";
  if (status.includes("السداد") || status.includes("موافقة")) return "warning";
  if (status === "قيد التنفيذ" || status === "مراجعة واعتماد") return "info";
  return "neutral";
}

function firebaseMessage(error: unknown) {
  const code = (error as { code?: string })?.code || "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(code)) return "البريد أو كلمة المرور غير صحيحة.";
  if (code === "auth/too-many-requests") return "توقفت محاولات الدخول مؤقتًا للحماية. حاول لاحقًا أو أعد تعيين كلمة المرور.";
  if (code === "auth/invalid-email") return "صيغة البريد الإلكتروني غير صحيحة.";
  if (code === "auth/user-disabled") return "حساب الدخول موقوف. تواصل مع مالك المنصة.";
  if (code === "auth/network-request-failed") return "تعذر الاتصال. تحقق من الإنترنت ثم حاول مرة أخرى.";
  return error instanceof Error ? error.message : "تعذر إكمال تسجيل الدخول.";
}

async function endFirebaseSession() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    try {
      const [{ firebaseAuth }, { signOut }] = await Promise.all([import("./lib/firebase-client"), import("firebase/auth")]);
      await signOut(firebaseAuth);
    } catch {
      // The server session is already closed, so a missing client session is harmless.
    }
    window.location.assign("/");
  }
}

function isTaskWaiting(task: TaskRecord) {
  return task.status.includes("بانتظار") || task.status === "نقص مستند";
}

function isTaskClosed(task: TaskRecord) {
  return ["مكتملة", "ملغاة"].includes(task.status);
}

function taskMatchesQueue(task: TaskRecord, queue: string) {
  const overdue = !isTaskClosed(task) && Boolean(task.dueDate && daysUntil(task.dueDate) < 0);
  if (queue === "متأخرة") return overdue;
  if (queue === "بانتظار العميل") return !isTaskClosed(task) && isTaskWaiting(task);
  if (queue === "مهامي اليوم") return !isTaskClosed(task) && !isTaskWaiting(task) && !overdue;
  return true;
}

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function Avatar({ name, color = "#143653", size = "normal" }: { name: string; color?: string; size?: "small" | "normal" | "large" }) {
  return <span className={`avatar avatar-${size}`} style={{ background: color }}>{initials(name)}</span>;
}

function StatCard({ icon, label, value, detail, tone }: { icon: string; label: string; value: string | number; detail: string; tone: string }) {
  return <article className="stat-card"><span className={`stat-icon stat-${tone}`}>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

function Field({ label, required, children, wide }: { label: string; required?: boolean; children: ReactNode; wide?: boolean }) {
  return <label className={`form-field ${wide ? "field-wide" : ""}`}><span>{label}{required && <b> *</b>}</span>{children}</label>;
}

function Modal({ title, subtitle, onClose, children, wide }: { title: string; subtitle: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><div><h2>{title}</h2><p>{subtitle}</p></div><button type="button" className="close-button" onClick={onClose} aria-label="إغلاق">×</button></header>
      {children}
    </section>
  </div>;
}

export default function Home() {
  const [section, setSection] = useState<Section>("dashboard");
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [taskFilter, setTaskFilter] = useState("مهامي اليوم");
  const [documentFilter, setDocumentFilter] = useState("الكل");
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deletingMember, setDeletingMember] = useState<TeamMember | null>(null);
  const [selectedUpdateId, setSelectedUpdateId] = useState<number | null>(null);
  const [workforceClientId, setWorkforceClientId] = useState<number | null>(null);
  const scanCompleted = useRef(false);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };

  const loadData = async (showLoader = false) => {
    if (showLoader) setLoading(true);
    const response = await fetch("/api/data", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) {
      const requestError = new Error(result.error || "تعذر تحميل البيانات.") as Error & { code?: string };
      requestError.code = result.code;
      throw requestError;
    }
    setData(result);
    setError("");
    setErrorCode("");
    if (!selectedClientId && result.clients.length) setSelectedClientId(result.clients[0].id);
    if (!selectedTaskId && result.tasks.length) setSelectedTaskId(result.tasks.find((task: TaskRecord) => taskMatchesQueue(task, "مهامي اليوم"))?.id || result.tasks[0].id);
    if (!selectedRequestId && result.requests.length) setSelectedRequestId(result.requests[0].id);
    setLoading(false);
    return result as Snapshot;
  };

  useEffect(() => {
    (async () => {
      try {
        const loaded = await loadData(true);
        if (loaded.currentUser.role === "owner" && !scanCompleted.current) {
          scanCompleted.current = true;
          const response = await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "scan_alerts" }) });
          const result = await response.json();
          // العدّ التنازلي والتصعيد النظامي — يعمل مع فحص المستندات في المسار نفسه
          const tickResponse = await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "compliance_tick" }) });
          const tick = await tickResponse.json();
          const changed = (response.ok && (result.remindersCreated || result.tasksCreated))
            || (tickResponse.ok && (tick.plansCreated || tick.alertsCreated || tick.levelChanged || tick.staleFlagged));
          if (changed) await loadData();
        }
      } catch (loadError) {
        setLoading(false);
        setError(loadError instanceof Error ? loadError.message : "تعذر تشغيل التطبيق.");
        setErrorCode((loadError as Error & { code?: string })?.code || "");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const postAction = async (action: string, payload: Record<string, unknown>, successMessage: string) => {
    setSaving(true);
    try {
      const response = await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
      const result = await response.json();
      if (!response.ok) {
        if (result.existingClient) {
          setSelectedClientId(result.existingClient.id);
          setSection("clients");
          setModal(null);
        }
        throw new Error(result.error || "لم يكتمل الحفظ.");
      }
      await loadData();
      setModal(null);
      setEditingClient(null);
      showToast(successMessage);
      return result;
    } catch (actionError) {
      showToast(actionError instanceof Error ? actionError.message : "تعذر تنفيذ الإجراء.");
      throw actionError;
    } finally {
      setSaving(false);
    }
  };

  const submitRegulatoryUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const targetValue = form.get("targetValue");
    const clientIds = form.getAll("clientIds").map(Number).filter(Boolean);
    await postAction("create_regulatory_update", {
      title: form.get("title"),
      summary: form.get("summary"),
      authority: form.get("authority"),
      categories: [form.get("category")],
      effectiveDate: form.get("effectiveDate"),
      correctionDeadline: form.get("correctionDeadline"),
      referenceNumber: form.get("referenceNumber"),
      sourceUrl: form.get("sourceUrl"),
      measure: targetValue ? { type: "saudization_rate", targetValue: Number(targetValue), unit: "percent", measuredBy: "QIWA", internalEstimateAllowed: true } : null,
      manualClientIds: clientIds,
    }, "حُفظ القرار في قائمة المراجعة.");
  };

  const submitWorkforce = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await postAction("save_workforce_snapshot", {
      clientId: Number(form.get("clientId")),
      asOf: form.get("asOf"),
      source: form.get("source"),
      totalEmployees: Number(form.get("totalEmployees")),
      saudis: Number(form.get("saudis")),
      saudizationRate: Number(form.get("saudizationRate")),
    }, "حُفظت لقطة القوى العاملة وأُعيد تقييم الالتزامات.");
  };

  const uploadFile = async (file: File, metadata: Record<string, string | number | null | undefined>) => {
    if (!file.size) return null;
    setSaving(true);
    try {
      const form = new FormData();
      form.set("file", file);
      Object.entries(metadata).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== "") form.set(key, String(value));
      });
      const response = await fetch("/api/files", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر رفع الملف.");
      await loadData();
      showToast("تم رفع الملف وحفظه داخل أرشيف مَسار.");
      return result;
    } finally {
      setSaving(false);
    }
  };

  const clientsById = useMemo(() => new Map((data?.clients || []).map((item) => [item.id, item])), [data]);
  const docsById = useMemo(() => new Map((data?.documents || []).map((item) => [item.id, item])), [data]);
  const selectedClient = data?.clients.find((item) => item.id === selectedClientId) || null;
  const selectedTask = data?.tasks.find((item) => item.id === selectedTaskId) || null;
  const selectedRequest = data?.requests.find((item) => item.id === selectedRequestId) || null;
  const deletingMemberOpenTasks = deletingMember && data ? data.tasks.filter((task) => task.assignedEmail === deletingMember.email && !isTaskClosed(task)) : [];
  const deletingMemberOpenRequests = deletingMember && data ? data.requests.filter((request) => request.assignedEmail === deletingMember.email && !["مكتمل", "ملغي"].includes(request.status)) : [];

  const filteredClients = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!data) return [];
    if (!needle) return data.clients;
    return data.clients.filter((client) => [client.name, client.legalName, client.phone, client.crNumber, client.unifiedNumber, client.contactName].some((value) => value?.toLowerCase().includes(needle)));
  }, [data, search]);

  const sortedTasks = useMemo(() => {
    if (!data) return [];
    const employee = data.team.find((member) => member.email && member.email === data.currentUser.email);
    return [...data.tasks]
      .filter((task) => !employee || task.assignedEmail === employee.email)
      .filter((task) => taskMatchesQueue(task, taskFilter))
      .sort((a, b) => {
        const priority = (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
        if (priority) return priority;
        return (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31");
      });
  }, [data, taskFilter]);

  const taskQueueCounts = useMemo(() => {
    if (!data) return new Map<string, number>();
    const employee = data.team.find((member) => member.email && member.email === data.currentUser.email);
    const visible = data.tasks.filter((task) => !employee || task.assignedEmail === employee.email);
    return new Map(taskQueues.map((queue) => [queue, visible.filter((task) => taskMatchesQueue(task, queue)).length]));
  }, [data]);

  const openTaskQueue = (queue: string) => {
    setTaskFilter(queue);
    if (!data) return;
    const employee = data.team.find((member) => member.email && member.email === data.currentUser.email);
    const firstMatch = data.tasks.find((task) => (!employee || task.assignedEmail === employee.email) && taskMatchesQueue(task, queue));
    setSelectedTaskId(firstMatch?.id || null);
  };

  useEffect(() => {
    if (!selectedTaskId || section !== "tasks") return;
    void fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "record_task_open", id: selectedTaskId }),
    });
  }, [selectedTaskId, section]);

  const filteredDocuments = useMemo(() => {
    if (!data) return [];
    return data.documents.filter((document) => {
      const meta = expiryMeta(document.expiryDate);
      if (documentFilter === "الكل") return true;
      if (documentFilter === "منتهي") return meta.days < 0;
      if (documentFilter === "30 يومًا") return meta.days >= 0 && meta.days <= 30;
      if (documentFilter === "60 يومًا") return meta.days > 30 && meta.days <= 60;
      return document.type === documentFilter;
    });
  }, [data, documentFilter]);

  const counts = useMemo(() => {
    const documentsList = data?.documents || [];
    const openTasks = (data?.tasks || []).filter((task) => !["مكتملة", "ملغاة"].includes(task.status));
    return {
      urgent: documentsList.filter((document) => expiryMeta(document.expiryDate).days <= 7).length,
      soon: documentsList.filter((document) => { const days = expiryMeta(document.expiryDate).days; return days > 7 && days <= 30; }).length,
      waiting: openTasks.filter((task) => task.status.includes("بانتظار") || task.status === "نقص مستند").length,
      overdueTasks: openTasks.filter((task) => task.dueDate && daysUntil(task.dueDate) < 0).length,
      openTasks: openTasks.length,
    };
  }, [data]);

  const submitClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    await postAction(editingClient ? "update_client" : "create_client", editingClient ? { ...values, id: editingClient.id } : values, editingClient ? "تم تحديث ملف العميل." : "تم إنشاء ملف العميل وربطه بسجل دائم.");
  };

  const submitDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    form.delete("file");
    const values = Object.fromEntries(form.entries());
    const result = await postAction("create_document", values, "تم حفظ المستند وإضافته للفحص التلقائي.");
    if (file instanceof File && file.size && result?.document) {
      await uploadFile(file, { clientId: Number(values.clientId), documentId: result.document.id, label: String(values.title), visibility: "عميل وفريق" });
    }
  };

  const submitTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const member = data?.team.find((item) => item.name === values.assignedTo);
    await postAction("create_task", { ...values, assignedEmail: member?.email || "" }, "تم إنشاء المهمة وإسنادها للفريق.");
  };

  const submitAccess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    await postAction("create_access_reference", values, "تم حفظ مرجع الدخول دون كلمة مرور.");
  };

  const submitTeamMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    await postAction("create_team_member", values, "تمت إضافة عضو الفريق وأصبح جاهزًا لإسناد المهام.");
  };

  const submitDeleteClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedClient || !data) return;
    const confirmation = String(new FormData(event.currentTarget).get("confirmation") || "");
    const nextClientId = data.clients.find((client) => client.id !== selectedClient.id)?.id || null;
    await postAction("delete_client", { id: selectedClient.id, confirmation }, "تم حذف العميل وجميع بياناته المرتبطة نهائيًا.");
    setSelectedClientId(nextClientId);
  };

  const submitDeleteTeamMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!deletingMember) return;
    await postAction("delete_team_member", { id: deletingMember.id }, "تم حذف الموظف وإلغاء حساب دخوله.");
    setDeletingMember(null);
  };

  const submitUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    await postAction("create_user", values, "تم إنشاء حساب الدخول وتطبيق صلاحياته.");
  };

  const submitRequirement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRequest) return;
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    await postAction("create_requirement", { ...values, requestId: selectedRequest.id }, "تم إرسال المطلوب إلى بوابة العميل.");
  };

  const openWhatsApp = (reminder: Reminder) => {
    const client = clientsById.get(reminder.clientId);
    if (!client?.phone) return showToast("لا يوجد رقم جوال مسجل لهذا العميل.");
    const phone = client.phone.replace(/\D/g, "");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(reminder.message)}`, "_blank", "noopener,noreferrer");
  };

  const signOutUser = async () => {
    setSaving(true);
    await endFirebaseSession();
  };

  if (loading) return <main className="loading-screen" dir="rtl"><div className="loading-mark">SO</div><h1>SaudOps <span>| مَسار</span></h1><p>نرتب ملفات العملاء والتنبيهات والمهام.</p><span className="loader" /></main>;

  if (errorCode === "AUTH_REQUIRED") return <AccessScreen mode="signin" message={error} />;
  if (["ACCESS_PENDING", "CLIENT_NOT_LINKED", "INVALID_ROLE"].includes(errorCode)) return <AccessScreen mode="pending" message={error} />;
  if (error || !data) return <main className="error-screen" dir="rtl"><div>!</div><h1>تعذر فتح التطبيق</h1><p>{error}</p><button onClick={() => window.location.reload()}>إعادة المحاولة</button></main>;

  if (data.currentUser.role === "client") {
    return <ClientPortal data={data} saving={saving} toast={toast} onAction={postAction} onUpload={uploadFile} onSignOut={signOutUser} />;
  }

  const isOwner = data.currentUser.role === "owner";
  const visibleNavItems = navItems.filter((item) => isOwner || ["dashboard", "clients", "documents", "tasks"].includes(item.id));

  return <main className="operations-app" dir="rtl">
    {toast && <div className="toast"><span>✓</span>{toast}</div>}

    <aside className="sidebar">
      <div className="brand"><span className="brand-symbol">SO</span><div><strong><em>Saud</em>Ops</strong><small>مَسار · كل ملف في مساره</small></div></div>
      <nav>{visibleNavItems.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><span>{item.icon}</span>{item.label}{item.id === "alerts" && data.reminders.filter((entry) => entry.status !== "تم الإرسال").length > 0 && <b>{data.reminders.filter((entry) => entry.status !== "تم الإرسال").length}</b>}</button>)}</nav>
      <div className="sidebar-foot"><Avatar name={data.currentUser.fullName} size="small" /><div><strong>{data.currentUser.fullName}</strong><small>{isOwner ? "مالك النظام" : "موظف تنفيذ ومتابعة"}</small></div></div>
    </aside>

    <section className="main-area">
      <header className="app-header">
        <div className="mobile-brand"><span>SO</span><div><strong><em>Saud</em>Ops</strong><small>مَسار</small></div></div>
        <label className="global-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} onFocus={() => setSection("clients")} placeholder="ابحث باسم العميل أو الجوال أو السجل…" /></label>
        <div className="header-actions">{isOwner && <button className="icon-button" onClick={() => setSection("alerts")} aria-label="التنبيهات">!{data.reminders.filter((item) => item.status !== "تم الإرسال").length > 0 && <i />}</button>}{isOwner && <button className="primary-action" onClick={() => { setEditingClient(null); setModal("client"); }}>＋ عميل جديد</button>}<button className="icon-button" type="button" onClick={() => void signOutUser()} disabled={saving} aria-label="تسجيل الخروج">↗</button></div>
      </header>

      <div className="content-area">
        {section === "dashboard" && <Dashboard data={data} counts={counts} clientsById={clientsById} onSection={setSection} onClient={setSelectedClientId} onTask={(id) => { setSelectedTaskId(id); setSection("tasks"); }} onAddClient={() => { setEditingClient(null); setModal("client"); }} onAddTeam={() => setModal("team")} onScan={async () => { await postAction("scan_alerts", {}, "اكتمل فحص جميع تواريخ الانتهاء."); }} saving={saving} canManage={isOwner} />}

        {section === "clients" && <section className="page-section">
          <PageHeader eyebrow="الملف الموحد" title={isOwner ? "العملاء" : "ملفات العمل المسندة"} description={isOwner ? "كل بيانات العميل ومستنداته ومعاملاته السابقة في مكان واحد." : "تظهر فقط ملفات العملاء المرتبطة بمهامك الحالية."} action={isOwner ? <button className="primary-action" onClick={() => { setEditingClient(null); setModal("client"); }}>＋ إضافة عميل</button> : undefined} />
          <div className="clients-layout">
            <article className="list-panel clients-list-panel">
              <div className="panel-toolbar"><strong>{filteredClients.length} عميل</strong><span>انقر على العميل لفتح ملفه</span></div>
              <div className="client-list">{filteredClients.map((client) => {
                const clientDocs = data.documents.filter((document) => document.clientId === client.id);
                const urgent = clientDocs.filter((document) => expiryMeta(document.expiryDate).days <= 30).length;
                return <button key={client.id} className={`client-row ${selectedClientId === client.id ? "selected" : ""}`} onClick={() => setSelectedClientId(client.id)}>
                  <Avatar name={client.name} color={urgent ? "#b95045" : "#176b63"} /><div className="client-row-copy"><strong>{client.name}</strong><span>{client.contactName || "لا يوجد مفوض مسجل"} · {client.city}</span><small>{client.crNumber ? `سجل ${client.crNumber}` : client.phone || "—"}</small></div><div className="client-row-meta"><b>{clientDocs.length}</b><small>مستند</small>{urgent > 0 && <Badge tone="warning">{urgent} قريب</Badge>}</div>
                </button>;
              })}{!filteredClients.length && <EmptyState icon="⌕" title="لا توجد نتيجة" text="جرّب الاسم أو الجوال أو رقم السجل، أو أضف العميل إذا كان جديدًا." />}</div>
            </article>
            <article className="detail-panel">{selectedClient ? <ClientDetail client={selectedClient} data={data} canManage={isOwner} onEdit={() => { setEditingClient(selectedClient); setModal("client"); }} onDelete={() => setModal("deleteClient")} onDocument={() => setModal("document")} onTask={() => setModal("task")} onAccess={() => setModal("access")} /> : <EmptyState icon="ع" title="اختر عميلًا" text="ستظهر هنا جميع بياناته ومستنداته ومعاملاته السابقة." />}</article>
          </div>
        </section>}

        {section === "documents" && <section className="page-section">
          <PageHeader eyebrow="الأرشيف والتنبيهات" title="المستندات" description="حالة جميع الوثائق مرتبة حسب تاريخ الانتهاء." action={<button className="primary-action" disabled={!data.clients.length} onClick={() => setModal("document")}>＋ إضافة مستند</button>} />
          <div className="filter-tabs">{["الكل", "منتهي", "30 يومًا", "60 يومًا", "سجل تجاري", "إقامة", "عقد إيجار"].map((filter) => <button key={filter} className={documentFilter === filter ? "active" : ""} onClick={() => setDocumentFilter(filter)}>{filter}</button>)}</div>
          <article className="table-card"><div className="data-table document-table"><div className="table-head"><span>المستند</span><span>العميل</span><span>رقم المستند</span><span>تاريخ الانتهاء</span><span>الحالة</span><span>الملف</span></div>{filteredDocuments.map((document) => { const client = clientsById.get(document.clientId); const meta = expiryMeta(document.expiryDate); const archivedFile = data.files.find((file) => file.documentId === document.id); return <div className="table-row" key={document.id}><span><b>{document.title}</b><small>{document.type}</small></span><span><button className="link-button" onClick={() => { setSelectedClientId(document.clientId); setSection("clients"); }}>{client?.name || "—"}</button></span><span>{document.documentNumber || "—"}</span><span>{formatDate(document.expiryDate)}</span><span><Badge tone={meta.tone}>{meta.label}</Badge></span><span>{archivedFile ? <a href={`/api/files?id=${archivedFile.id}`} className="outline-link">تحميل الملف ↓</a> : document.driveUrl ? <a href={document.driveUrl} target="_blank" rel="noreferrer" className="outline-link">فتح Drive ↗</a> : <small>غير مرفق</small>}</span></div>; })}</div></article>
        </section>}

        {section === "tasks" && <section className="page-section">
          <PageHeader eyebrow="التنفيذ والمتابعة" title="المهام والمعاملات" description="توزيع العمل ومعرفة الخطوة المتوقفة والمسؤول عنها." action={isOwner ? <button className="primary-action" disabled={!data.clients.length} onClick={() => setModal("task")}>＋ مهمة جديدة</button> : undefined} />
          <div className="task-status-tabs">{taskQueues.map((filter) => <button key={filter} className={taskFilter === filter ? "active" : ""} onClick={() => openTaskQueue(filter)}>{filter}<b>{taskQueueCounts.get(filter) || 0}</b></button>)}</div>
          <div className="tasks-layout"><article className="list-panel task-list">{sortedTasks.map((task) => { const client = clientsById.get(task.clientId); return <button key={task.id} className={`task-row ${selectedTaskId === task.id ? "selected" : ""}`} onClick={() => setSelectedTaskId(task.id)}><div className="task-row-top"><span>{task.code}</span><Badge tone={toneForTask(task.status)}>{task.status}</Badge></div><strong>{task.subject}</strong><p>{client?.name || "—"}</p><div className="task-row-foot"><span><i className={`priority priority-${task.priority}`} />{task.priority}</span><span>{task.assignedTo || "غير مسندة"}</span><span>{task.dueDate ? formatDate(task.dueDate) : "دون موعد"}</span></div></button>; })}{!sortedTasks.length && <EmptyState icon="✓" title="لا توجد مهام في هذه القائمة" text="انتقل إلى قائمة أخرى أو أنشئ مهمة جديدة." />}</article><article className="detail-panel task-detail">{selectedTask ? <TaskDetail key={selectedTask.id} task={selectedTask} client={clientsById.get(selectedTask.clientId)} document={selectedTask.documentId ? docsById.get(selectedTask.documentId) : undefined} team={data.team} activities={data.activities.filter((activity) => activity.taskId === selectedTask.id)} saving={saving} canAssign={isOwner} onUpdate={async (payload) => { await postAction("update_task", { id: selectedTask.id, ...payload }, "تم تحديث المهمة وتسجيل الحركة."); }} onClient={() => { setSelectedClientId(selectedTask.clientId); setSection("clients"); }} /> : <EmptyState icon="✓" title="اختر مهمة" text="ستظهر تفاصيل التنفيذ والحالة وسجل الحركة هنا." />}</article></div>
        </section>}

        {section === "requests" && isOwner && <RequestCenter
          data={data}
          selected={selectedRequest}
          onSelect={setSelectedRequestId}
          saving={saving}
          onUpdate={async (payload) => { if (selectedRequest) await postAction("update_request", { id: selectedRequest.id, ...payload }, payload.createTask ? "تم اعتماد الطلب وتحويله إلى مهمة داخلية." : "تم تحديث الطلب."); }}
          onRequirement={() => setModal("requirement")}
          onTask={(taskId) => { setSelectedTaskId(taskId); setSection("tasks"); }}
        />}

        {section === "alerts" && <section className="page-section">
          <PageHeader eyebrow="متابعة آلية" title="مركز التنبيهات" description="يُنشئ النظام هذه التنبيهات من تواريخ انتهاء المستندات، دون اعتماد على ذاكرة الموظف." action={<button className="primary-action" disabled={saving} onClick={async () => { await postAction("scan_alerts", {}, "اكتمل فحص تواريخ الانتهاء وإنشاء المهام اللازمة."); }}>{saving ? "جارٍ الفحص…" : "↻ فحص الآن"}</button>} />
          <div className="alert-summary"><div><span className="alert-dot danger" /><strong>{counts.urgent}</strong><p>منتهي أو خلال 7 أيام</p></div><div><span className="alert-dot warning" /><strong>{counts.soon}</strong><p>خلال 30 يومًا</p></div><div><span className="alert-dot info" /><strong>{data.reminders.filter((item) => item.status === "جاهز للإرسال").length}</strong><p>رسائل جاهزة للإرسال</p></div><div><span className="alert-dot success" /><strong>{data.reminders.filter((item) => item.status === "تم الإرسال").length}</strong><p>تم إرسالها</p></div></div>
          <article className="alerts-list">{data.reminders.map((reminder) => { const client = clientsById.get(reminder.clientId); const document = docsById.get(reminder.documentId); const meta = expiryMeta(reminder.expiryDate); return <div className="alert-item" key={reminder.id}><div className={`alert-symbol ${meta.tone}`}>!</div><div className="alert-main"><div><strong>{document?.title || "مستند"}</strong><Badge tone={reminder.status === "تم الإرسال" ? "success" : meta.tone}>{reminder.status}</Badge></div><p>{client?.name} · {meta.label}</p><blockquote>{reminder.message}</blockquote></div><div className="alert-actions"><button className="whatsapp-button" onClick={() => openWhatsApp(reminder)}>واتساب ↗</button>{reminder.status !== "تم الإرسال" && <button className="outline-button" disabled={saving} onClick={async () => { await postAction("mark_reminder_sent", { id: reminder.id }, "تم تسجيل إرسال التنبيه."); }}>تسجيل الإرسال</button>}</div></div>; })}{!data.reminders.length && <EmptyState icon="✓" title="لا توجد تنبيهات" text="جميع المستندات بعيدة عن تواريخ الانتهاء المحددة." />}</article>
        </section>}

        {section === "compliance" && isOwner && <ComplianceCenter
          data={data}
          saving={saving}
          selectedUpdateId={selectedUpdateId}
          onSelectUpdate={setSelectedUpdateId}
          onAction={postAction}
          onNewUpdate={() => setModal("regUpdate")}
          onWorkforce={(clientId) => { setWorkforceClientId(clientId); setModal("workforce"); }}
          onTask={(id) => { setSelectedTaskId(id); setSection("tasks"); }}
        />}

        {section === "team" && <section className="page-section">
          <PageHeader eyebrow="توزيع العمل" title="الفريق" description="كل موظف يرى مهامه، بينما يراقب المشرف ضغط العمل والتأخير." action={<button className="primary-action" onClick={() => setModal("team")}>＋ إضافة عضو</button>} />
          <div className="team-grid">{data.team.map((member) => { const memberTasks = data.tasks.filter((task) => task.assignedEmail === member.email && !["مكتملة", "ملغاة"].includes(task.status)); const overdue = memberTasks.filter((task) => task.dueDate && daysUntil(task.dueDate) < 0).length; return <article className="member-card" key={member.id}><div className="member-head"><Avatar name={member.name} color={member.color} size="large" /><div><h3>{member.name}</h3><p>{member.role}</p></div><Badge tone={overdue ? "danger" : "success"}>{member.active ? "نشط" : "موقوف"}</Badge></div><div className="member-stats"><div><strong>{memberTasks.length}</strong><span>مهام مفتوحة</span></div><div><strong>{memberTasks.filter((task) => task.status === "قيد التنفيذ").length}</strong><span>قيد التنفيذ</span></div><div><strong>{overdue}</strong><span>متأخرة</span></div></div><div className="member-card-actions"><button className="outline-button" onClick={() => { openTaskQueue("كل المعاملات"); setSection("tasks"); }}>عرض مهام الفريق</button><button className="danger-button" onClick={() => { setDeletingMember(member); setModal("deleteTeam"); }}>حذف الموظف</button></div></article>; })}{!data.team.length && <EmptyState icon="ف" title="ابدأ بإضافة فريقك" text="أضف اسم الموظف ودوره وبريده ليصبح متاحًا عند إسناد المهام." />}</div>
          <article className="permissions-card"><div><span>⌾</span><div><h3>فصل الصلاحيات مفعّل</h3><p>لكل موظف دخول مستقل ببريده، ويعرض الخادم له مهامه والعملاء المرتبطين بها فقط.</p></div></div><ul><li>الموظف: مهامه وملفات العملاء المرتبطة بها</li><li>العميل: ملف منشأته وطلباته ومتطلباته</li><li>المالك: جميع البيانات والإسناد والصلاحيات</li></ul></article>
        </section>}

        {section === "users" && isOwner && <AccessManagement data={data} saving={saving} onAdd={() => setModal("user")} onToggle={async (account) => { await postAction("set_user_active", { id: account.id, active: !account.active }, account.active ? "تم إيقاف دخول الحساب." : "تم تفعيل دخول الحساب."); }} />}

        {section === "settings" && <section className="page-section">
          <PageHeader eyebrow="جاهزية التكامل" title="الربط والإعدادات" description="حالة القنوات التي يعتمد عليها التشغيل الآن وما يلزم لإكمال الربط الحقيقي." />
          <div className="integration-grid"><IntegrationCard icon="م" title="أرشيف مَسار" state="مفعّل" tone="success" text="ترفع الملفات مباشرة داخل التطبيق مع صلاحيات تنزيل بحسب العميل والمهمة، ويمكن إبقاء روابط Drive الحالية." detail={`${data.files.length} ملفات محفوظة داخل التطبيق`} /><IntegrationCard icon="و" title="WhatsApp Business API" state="بانتظار الربط" tone="warning" text="الرسائل تُجهز تلقائيًا ويمكن فتحها في واتساب. الإرسال التلقائي يحتاج حساب Meta ورقمًا معتمدًا." detail="لا توجد مفاتيح ربط محفوظة" /><IntegrationCard icon="خ" title="خزنة بيانات الدخول" state="مرجع آمن" tone="info" text="يحفظ التطبيق اسم المنصة واسم المستخدم ومرجع الخزنة فقط، ولا يحفظ كلمات المرور." detail={`${data.access.length} مراجع منصات`} /><IntegrationCard icon="د" title="بوابة الدفع" state="رابط دفع جاهز" tone="info" text="يمكن للمالك إرسال مبلغ ورابط دفع داخل الطلب، ويؤكد العميل السداد من بوابته." detail="الربط الآلي مع المزود يُضاف لاحقًا" /></div>
          <article className="automation-card"><header><div><span>⚡</span><div><h3>قواعد الأتمتة المفعلة</h3><p>هذه القواعد تعمل عند فتح النظام أو الضغط على «فحص الآن».</p></div></div><Badge tone="success">مفعلة</Badge></header><div className="automation-rules"><div><b>60 يومًا</b><span>إنشاء تنبيه جاهز للعميل</span></div><i>←</i><div><b>30 يومًا</b><span>إنشاء مهمة وإسنادها تلقائيًا</span></div><i>←</i><div><b>7 أيام</b><span>رفع الأولوية إلى عاجلة</span></div><i>←</i><div><b>بعد الإنجاز</b><span>تحديث المستند والتاريخ الجديد</span></div></div></article>
        </section>}
      </div>
    </section>

    <nav className="mobile-nav">{visibleNavItems.slice(0, 5).map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><span>{item.icon}</span><small>{item.label}</small></button>)}</nav>

    {modal === "client" && <Modal title={editingClient ? "تعديل ملف العميل" : "إضافة عميل جديد"} subtitle="سيمنع النظام تكرار السجل أو الرقم الموحد تلقائيًا." onClose={() => { setModal(null); setEditingClient(null); }} wide><form className="modal-form form-grid" onSubmit={submitClient} key={editingClient?.id || "new"}><Field label="اسم العميل" required><input name="name" defaultValue={editingClient?.name || ""} required /></Field><Field label="الاسم النظامي"><input name="legalName" defaultValue={editingClient?.legalName || ""} /></Field><Field label="رقم الجوال"><input name="phone" inputMode="tel" defaultValue={editingClient?.phone || ""} placeholder="9665xxxxxxxx" /></Field><Field label="اسم المفوض"><input name="contactName" defaultValue={editingClient?.contactName || ""} /></Field><Field label="الرقم الموحد"><input name="unifiedNumber" defaultValue={editingClient?.unifiedNumber || ""} /></Field><Field label="السجل التجاري"><input name="crNumber" defaultValue={editingClient?.crNumber || ""} /></Field><Field label="البريد الإلكتروني"><input type="email" name="email" defaultValue={editingClient?.email || ""} /></Field><Field label="المدينة"><input name="city" defaultValue={editingClient?.city || "مكة المكرمة"} /></Field><Field label="رابط مجلد Drive" wide><input type="url" name="driveUrl" defaultValue={editingClient?.driveUrl || ""} placeholder="https://drive.google.com/..." /></Field><Field label="ملاحظات داخلية" wide><textarea name="notes" defaultValue={editingClient?.notes || ""} rows={3} /></Field><FormActions saving={saving} onCancel={() => { setModal(null); setEditingClient(null); }} submit={editingClient ? "حفظ التعديلات" : "إنشاء ملف العميل"} /></form></Modal>}

    {modal === "document" && <Modal title="إضافة مستند" subtitle="ارفع الملف مباشرة أو أضف رابط Drive، وسيبدأ النظام مراقبة تاريخ الانتهاء." onClose={() => setModal(null)} wide><form className="modal-form form-grid" onSubmit={submitDocument}><Field label="العميل" required><select name="clientId" defaultValue={selectedClientId || data.clients[0]?.id} required>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field><Field label="نوع المستند" required><select name="type" required><option>سجل تجاري</option><option>إقامة</option><option>رخصة بلدية</option><option>عقد إيجار</option><option>هوية</option><option>تأمين</option><option>اشتراك غرفة تجارية</option><option>شهادة زكاة وضريبة</option><option>أخرى</option></select></Field><Field label="اسم المستند" required><input name="title" required placeholder="مثال: إقامة الموظف أحمد علي" /></Field><Field label="رقم المستند"><input name="documentNumber" /></Field><Field label="تاريخ الإصدار"><input type="date" name="issueDate" /></Field><Field label="تاريخ الانتهاء" required><input type="date" name="expiryDate" required /></Field><Field label="التنبيه قبل"><select name="reminderDays" defaultValue="60"><option value="30">30 يومًا</option><option value="60">60 يومًا</option><option value="90">90 يومًا</option></select></Field><Field label="رابط المستند في Drive (اختياري)"><input type="url" name="driveUrl" placeholder="https://drive.google.com/..." /></Field><Field label="رفع الملف داخل مَسار" wide><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" /></Field><Field label="ملاحظات" wide><textarea name="notes" rows={3} /></Field><FormActions saving={saving} onCancel={() => setModal(null)} submit="حفظ المستند" /></form></Modal>}

    {modal === "task" && <Modal title="إنشاء مهمة جديدة" subtitle="اربط المهمة بالعميل والمستند حتى يبقى تاريخها كاملًا." onClose={() => setModal(null)} wide><form className="modal-form form-grid" onSubmit={submitTask}><Field label="العميل" required><select name="clientId" defaultValue={selectedClientId || data.clients[0]?.id} required>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field><Field label="المستند المرتبط"><select name="documentId" defaultValue=""><option value="">دون مستند</option>{data.documents.map((document) => <option key={document.id} value={document.id}>{clientsById.get(document.clientId)?.name} — {document.title}</option>)}</select></Field><Field label="نوع الخدمة" required><input name="serviceType" required placeholder="تجديد إقامة" /></Field><Field label="موضوع المهمة" required><input name="subject" required placeholder="تجديد إقامة أحمد علي" /></Field><Field label="الموظف المسؤول"><select name="assignedTo" defaultValue={data.team[0]?.name || ""}><option value="">غير مسندة</option>{data.team.map((member) => <option key={member.id}>{member.name}</option>)}</select></Field><Field label="الأولوية"><select name="priority"><option>متوسطة</option><option>مرتفعة</option><option>عاجلة</option><option>منخفضة</option></select></Field><Field label="تاريخ الاستحقاق"><input type="date" name="dueDate" /></Field><Field label="الخطوة الأولى"><input name="currentStep" defaultValue="مراجعة المتطلبات" /></Field><Field label="ملاحظات" wide><textarea name="notes" rows={3} /></Field><FormActions saving={saving} onCancel={() => setModal(null)} submit="إنشاء وإسناد المهمة" /></form></Modal>}

    {modal === "team" && <Modal title="إضافة عضو فريق" subtitle="سيُنشئ البريد حساب موظف مستقل يرى المهام المسندة إليه فقط." onClose={() => setModal(null)}><form className="modal-form" onSubmit={submitTeamMember}><Field label="اسم الموظف" required><input name="name" required autoComplete="name" /></Field><Field label="بريد الموظف" required><input type="email" name="email" required autoComplete="email" placeholder="employee@example.com" /></Field><Field label="كلمة مرور مؤقتة" required><input type="password" name="temporaryPassword" required minLength={8} autoComplete="new-password" placeholder="8 أحرف على الأقل" /></Field><Field label="الدور الوظيفي" required><select name="role" required><option value="">اختر الدور</option><option>تنفيذ المعاملات</option><option>متابعة العملاء</option><option>المتابعة المالية</option><option>مشرف تشغيل</option></select></Field><Field label="لون بطاقة الموظف"><input type="color" name="color" defaultValue="#087568" /></Field><FormActions saving={saving} onCancel={() => setModal(null)} submit="إضافة الموظف وتفعيل دخوله" /></form></Modal>}

    {modal === "deleteTeam" && deletingMember && <Modal title="حذف الموظف" subtitle={`سيُلغى دخول ${deletingMember.name} إلى المنصة.`} onClose={() => { setModal(null); setDeletingMember(null); }}><form className="modal-form" onSubmit={submitDeleteTeamMember}><div className="danger-zone"><strong>حذف حساب الموظف نهائي</strong><p>تبقى أسماء الموظف في سجل المهام المكتملة للمراجعة، لكن بطاقة الفريق وحساب الدخول سيُحذفان.</p></div><div className="delete-summary"><span><b>{deletingMemberOpenTasks.length}</b> مهام مفتوحة</span><span><b>{deletingMemberOpenRequests.length}</b> طلبات عملاء مفتوحة</span></div>{(deletingMemberOpenTasks.length > 0 || deletingMemberOpenRequests.length > 0) && <p className="blocking-note">أعد إسناد الأعمال المفتوحة أو أغلقها أولًا، ثم ارجع للحذف.</p>}<div className="form-actions"><button type="button" className="outline-button" onClick={() => { setModal(null); setDeletingMember(null); }}>إلغاء</button><button type="submit" className="danger-button" disabled={saving || deletingMemberOpenTasks.length > 0 || deletingMemberOpenRequests.length > 0}>{saving ? "جارٍ الحذف…" : "تأكيد حذف الموظف"}</button></div></form></Modal>}

    {modal === "deleteClient" && selectedClient && <Modal title="حذف ملف العميل" subtitle="هذا الإجراء يحذف الملف والحسابات والمستندات المؤرشفة المرتبطة به." onClose={() => setModal(null)}><form className="modal-form" onSubmit={submitDeleteClient}><div className="danger-zone"><strong>لا يمكن التراجع عن هذا الحذف</strong><p>سيُحذف العميل من قاعدة البيانات وتُحذف ملفاته المرفوعة داخل مَسار. ملفات Google Drive الخارجية لا تُحذف.</p></div><div className="delete-summary"><span><b>{data.tasks.filter((task) => task.clientId === selectedClient.id && !isTaskClosed(task)).length}</b> مهام مفتوحة</span><span><b>{data.requests.filter((request) => request.clientId === selectedClient.id && !["مكتمل", "ملغي"].includes(request.status)).length}</b> طلبات مفتوحة</span><span><b>{data.files.filter((file) => file.clientId === selectedClient.id).length}</b> ملفات مؤرشفة</span></div>{(data.tasks.some((task) => task.clientId === selectedClient.id && !isTaskClosed(task)) || data.requests.some((request) => request.clientId === selectedClient.id && !["مكتمل", "ملغي"].includes(request.status))) ? <p className="blocking-note">أغلق المهام والطلبات المفتوحة أولًا لحماية سجل العمل.</p> : <Field label={`اكتب اسم العميل للتأكيد: ${selectedClient.name}`} required><input name="confirmation" required autoComplete="off" /></Field>}<div className="form-actions"><button type="button" className="outline-button" onClick={() => setModal(null)}>إلغاء</button><button type="submit" className="danger-button" disabled={saving || data.tasks.some((task) => task.clientId === selectedClient.id && !isTaskClosed(task)) || data.requests.some((request) => request.clientId === selectedClient.id && !["مكتمل", "ملغي"].includes(request.status))}>{saving ? "جارٍ الحذف…" : "حذف العميل نهائيًا"}</button></div></form></Modal>}

    {modal === "user" && <Modal title="إضافة حساب دخول" subtitle="البريد هو هوية الدخول، والدور يحدد البيانات التي يمكن للحساب رؤيتها." onClose={() => setModal(null)} wide><form className="modal-form form-grid" onSubmit={submitUser}><Field label="الاسم" required><input name="fullName" required /></Field><Field label="البريد الإلكتروني" required><input type="email" name="email" required autoComplete="email" /></Field><Field label="كلمة مرور مؤقتة" required><input type="password" name="temporaryPassword" required minLength={8} autoComplete="new-password" placeholder="8 أحرف على الأقل" /></Field><Field label="نوع الحساب" required><select name="role" required defaultValue="employee"><option value="employee">موظف — مهامه وملفاتها فقط</option><option value="client">عميل — ملف منشأته فقط</option></select></Field><Field label="ربط بملف عميل"><select name="clientId" defaultValue=""><option value="">غير مرتبط (للموظف)</option>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field><div className="security-callout field-wide">⌾ كلمة المرور تُنشئ حساب Firebase ولا تُحفظ داخل قاعدة بيانات مَسار. العميل لا يرى الملاحظات الداخلية أو بيانات المنصات أو مهام الموظفين.</div><FormActions saving={saving} onCancel={() => setModal(null)} submit="إنشاء الحساب" /></form></Modal>}

    {modal === "requirement" && selectedRequest && <Modal title="إرسال مطلوب للعميل" subtitle={`سيظهر مباشرة داخل الطلب ${selectedRequest.code} في بوابة العميل.`} onClose={() => setModal(null)} wide><form className="modal-form form-grid" onSubmit={submitRequirement}><Field label="نوع المطلوب" required><select name="type" required><option>معلومة</option><option>مستند</option><option>سداد</option><option>موافقة</option></select></Field><Field label="العنوان" required><input name="title" required placeholder="مثال: سداد رسوم رخصة العمل" /></Field><Field label="المبلغ"><input type="number" min="0" step="0.01" name="amount" /></Field><Field label="رابط الدفع"><input type="url" name="paymentUrl" placeholder="https://..." /></Field><Field label="الموعد المطلوب"><input type="date" name="dueDate" /></Field><Field label="التفاصيل" wide><textarea name="description" rows={4} placeholder="وضح للعميل ما يلزم تنفيذه أو رفعه." /></Field><FormActions saving={saving} onCancel={() => setModal(null)} submit="إرسال إلى العميل" /></form></Modal>}

    {modal === "regUpdate" && <Modal title="إدخال قرار نظامي" subtitle="لن يُطبَّق القرار قبل اعتماده. الإدخال يضعه في قائمة المراجعة." onClose={() => setModal(null)} wide><form className="modal-form form-grid" onSubmit={submitRegulatoryUpdate}>
      <Field label="عنوان القرار" required wide><input name="title" required placeholder="رفع نسبة توطين مهن ____ إلى 40%" /></Field>
      <Field label="الجهة" required><select name="authority" defaultValue="MHRSD">{Object.entries(authorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="التصنيف" required><select name="category" defaultValue="saudization">{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="تاريخ النفاذ" required><input type="date" name="effectiveDate" required /></Field>
      <Field label="نهاية فترة التصحيح"><input type="date" name="correctionDeadline" /></Field>
      <Field label="رقم القرار"><input name="referenceNumber" placeholder="قرار وزاري رقم ____" /></Field>
      <Field label="رابط المصدر الرسمي" required><input name="sourceUrl" type="url" required placeholder="https://www.hrsd.gov.sa/…" /></Field>
      <Field label="النسبة أو القيمة المستهدفة"><input name="targetValue" type="number" step="0.1" placeholder="40" /></Field>
      <Field label="الملخص التنفيذي" wide><textarea name="summary" rows={3} placeholder="ثلاثة أسطر بلغة تنفيذية: ما القرار، على من ينطبق، وما المطلوب عمليًا." /></Field>
      <Field label="المنشآت المتأثرة" wide><div className="checkbox-grid">{data.clients.map((client) => <label key={client.id}><input type="checkbox" name="clientIds" value={client.id} /><span>{client.name}</span></label>)}</div></Field>
      <div className="form-note wide"><span>⌾</span><p>اختيار المنشآت يدويًا هو أسلوب المرحلة الأولى. سيُسجَّل السبب في أثر المطابقة، وتبقى النتيجة قابلة للشرح.</p></div>
      <FormActions saving={saving} onCancel={() => setModal(null)} submit="حفظ وإرسال للمراجعة" />
    </form></Modal>}

    {modal === "workforce" && workforceClientId && <Modal title="تحديث لقطة القوى العاملة" subtitle="أدخل الأرقام كما تظهر في قوى. مَسار لا يُعيد احتساب نسبة التوطين." onClose={() => setModal(null)} wide><form className="modal-form form-grid" onSubmit={submitWorkforce}>
      <input type="hidden" name="clientId" value={workforceClientId} />
      <Field label="تاريخ اللقطة" required><input type="date" name="asOf" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
      <Field label="المصدر"><select name="source" defaultValue="qiwa_manual"><option value="qiwa_manual">إدخال يدوي من قوى</option><option value="qiwa_export">تصدير من قوى</option><option value="estimated">تقدير</option></select></Field>
      <Field label="إجمالي الموظفين" required><input type="number" name="totalEmployees" min={1} required /></Field>
      <Field label="عدد السعوديين" required><input type="number" name="saudis" min={0} required /></Field>
      <Field label="نسبة التوطين كما تظهر في قوى (%)" required wide><input type="number" name="saudizationRate" min={0} max={100} step="0.1" required /></Field>
      <div className="form-note wide"><span>⌾</span><p>احتساب النطاقات يتضمّن أوزانًا واستثناءات (الدوام الجزئي، ذوو الإعاقة، شرط التسجيل في التأمينات). لذلك الرقم المعتمد هو ما يظهر في قوى، ويُخزَّن هنا كلقطة مؤرّخة.</p></div>
      <FormActions saving={saving} onCancel={() => setModal(null)} submit="حفظ اللقطة" />
    </form></Modal>}

    {modal === "access" && <Modal title="إضافة مرجع دخول" subtitle="لن نحفظ كلمة المرور هنا. استخدم مرجعًا من خزنة كلمات المرور." onClose={() => setModal(null)}><form className="modal-form" onSubmit={submitAccess}><input type="hidden" name="clientId" value={selectedClientId || ""} /><Field label="المنصة" required><input name="platform" required placeholder="قوى، مقيم، أبشر أعمال…" /></Field><Field label="اسم المستخدم"><input name="username" autoComplete="off" /></Field><Field label="مرجع الخزنة"><input name="vaultReference" autoComplete="off" placeholder="مثال: VAULT-CLIENT-QIWA" /></Field><Field label="ملاحظات"><textarea name="notes" rows={3} /></Field><div className="security-callout">⌾ لا تكتب كلمة المرور أو رمز التحقق داخل هذه الخانات.</div><FormActions saving={saving} onCancel={() => setModal(null)} submit="حفظ المرجع" /></form></Modal>}
  </main>;
}

function ComplianceCenter({ data, saving, selectedUpdateId, onSelectUpdate, onAction, onNewUpdate, onWorkforce, onTask }: { data: Snapshot; saving: boolean; selectedUpdateId: number | null; onSelectUpdate: (id: number) => void; onAction: (action: string, payload: Record<string, unknown>, message: string) => Promise<ActionResult>; onNewUpdate: () => void; onWorkforce: (clientId: number) => void; onTask: (taskId: number) => void }) {
  const [openTrace, setOpenTrace] = useState<string | null>(null);
  const [postponing, setPostponing] = useState(false);

  const updates = data.regulatoryUpdates;
  const impacts = data.regulatoryImpacts;
  const clientsById = useMemo(() => new Map(data.clients.map((client) => [client.id, client])), [data.clients]);
  const selected = updates.find((item) => item.id === selectedUpdateId) || updates[0] || null;
  const selectedImpacts = selected ? impacts.filter((item) => item.updateId === selected.id) : [];

  const live = impacts.filter((item) => item.applicable === true && !["compliant", "closed", "not_applicable"].includes(item.state));
  const counts = {
    pendingReview: updates.filter((item) => item.status === "pending_review").length,
    within90: live.filter((item) => item.daysRemaining !== null && item.daysRemaining > 30 && item.daysRemaining <= 90).length,
    within30: live.filter((item) => item.daysRemaining !== null && item.daysRemaining >= 0 && item.daysRemaining <= 30).length,
    actionRequired: live.length,
    overdue: impacts.filter((item) => item.isOverdue && item.applicable === true).length,
    needsReview: impacts.filter((item) => item.applicable === null).length,
    done: impacts.filter((item) => ["compliant", "closed"].includes(item.state)).length,
  };

  // المتأخر أولًا دائمًا، ثم الأقرب استحقاقًا
  const upcoming = [...live].sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    return String(a.effectiveDate || "9999").localeCompare(String(b.effectiveDate || "9999"));
  });

  const staleClients = data.clients.filter((client) => {
    const snapshot = data.workforceSnapshots.find((item) => item.clientId === client.id);
    if (!snapshot) return impacts.some((item) => item.clientId === client.id && item.applicable !== false);
    return daysUntil(snapshot.asOf) < -45;
  });

  const selectedSteps = selected ? data.complianceSteps.filter((step) => selectedImpacts.some((impact) => impact.id === step.impactId)) : [];

  return <section className="page-section">
    <PageHeader
      eyebrow="من الخبر إلى التزام متتبَّع"
      title="الرصد النظامي والامتثال"
      description="كل قرار نظامي يتحول إلى التزام مرتبط بمنشأة، بعدّ تنازلي وتصعيد متدرج وخطة تصحيح داخل نظام المهام نفسه."
      action={<div className="header-actions">
        <button className="outline-button" disabled={saving} onClick={async () => { const result = await onAction("compliance_tick", {}, "اكتمل فحص الالتزامات النظامية."); const created = Number(result?.plansCreated || 0); const alerts = Number(result?.alertsCreated || 0); if (created || alerts) console.info("compliance tick", result); }}>↻ فحص الآن</button>
        <button className="primary-action" onClick={onNewUpdate}>＋ قرار نظامي</button>
      </div>}
    />

    <div className="stats-grid">
      <StatCard icon="م" label="تحتاج مراجعة" value={counts.pendingReview} detail="قرارات لم تُعتمد بعد" tone="amber" />
      <StatCard icon="٩" label="خلال 90 يومًا" value={counts.within90} detail="التزامات قادمة" tone="blue" />
      <StatCard icon="٣" label="خلال 30 يومًا" value={counts.within30} detail="تُنشأ خطة تصحيح تلقائيًا" tone="amber" />
      <StatCard icon="!" label="متأخرة" value={counts.overdue} detail="تجاوزت تاريخ النفاذ" tone={counts.overdue ? "red" : "green"} />
      <StatCard icon="✓" label="تمت معالجتها" value={counts.done} detail="ممتثلة أو مغلقة" tone="green" />
    </div>

    {(counts.needsReview > 0 || staleClients.length > 0) && <div className="attention-banner">
      <span>!</span>
      <div>
        <strong>بيانات ناقصة تمنع الحسم</strong>
        <p>
          {counts.needsReview > 0 && `${counts.needsReview} التزامًا لا يمكن الحسم فيه لنقص بيانات المنشأة. `}
          {staleClients.length > 0 && `${staleClients.length} منشأة تحتاج تحديث لقطة القوى العاملة (أقدم من 45 يومًا).`}
        </p>
      </div>
      {staleClients[0] && <button className="outline-button" onClick={() => onWorkforce(staleClients[0].id)}>تحديث بيانات {staleClients[0].name}</button>}
    </div>}

    <div className="clients-layout">
      <article className="list-panel">
        <div className="panel-toolbar"><strong>{updates.length} قرارًا</strong><span>مرتبة بالأقرب نفاذًا</span></div>
        <div className="client-list">
          {updates.map((update) => {
            const related = impacts.filter((item) => item.updateId === update.id);
            const affected = related.filter((item) => item.applicable === true).length;
            const days = update.effectiveDate ? daysUntil(update.effectiveDate) : null;
            return <button key={update.id} className={selected?.id === update.id ? "active" : ""} onClick={() => { onSelectUpdate(update.id); setOpenTrace(null); setPostponing(false); }}>
              <span className="mini-code">{update.code.slice(-3)}</span>
              <div>
                <strong>{update.title}</strong>
                <p>{authorityLabels[update.authority] || update.authority} · {affected} منشأة متأثرة</p>
              </div>
              <div className="list-meta">
                <Badge tone={update.status === "approved" || update.status === "in_effect" ? "success" : update.status === "pending_review" ? "warning" : update.status === "postponed" ? "info" : "muted"}>{updateStatusLabels[update.status] || update.status}</Badge>
                <small>{remainingText(days)}</small>
              </div>
            </button>;
          })}
          {!updates.length && <EmptyState icon="ن" title="لا توجد قرارات بعد" text="أدخل أول قرار نظامي يدويًا، وسيبدأ العدّ التنازلي والتصعيد فورًا بعد اعتماده." />}
        </div>
      </article>

      <div className="detail-column">
        {!selected && <EmptyState icon="ن" title="اختر قرارًا" text="ستظهر هنا تفاصيل القرار والمنشآت المتأثرة وسبب كل نتيجة." />}

        {selected && <article className="detail-panel">
          <header className="detail-header">
            <div>
              <span className="eyebrow">{selected.code}{selected.referenceNumber ? ` · ${selected.referenceNumber}` : ""}</span>
              <h2>{selected.title}</h2>
              <p>{authorityLabels[selected.authority] || selected.authority} · {selected.categories.map((item) => categoryLabels[item] || item).join("، ")}</p>
            </div>
            <div className="detail-header-meta">
              <Badge tone={selected.status === "approved" || selected.status === "in_effect" ? "success" : selected.status === "pending_review" ? "warning" : "muted"}>{updateStatusLabels[selected.status] || selected.status}</Badge>
              <strong>{remainingText(selected.effectiveDate ? daysUntil(selected.effectiveDate) : null)}</strong>
              <small>تاريخ النفاذ: {formatDate(selected.effectiveDate)}</small>
            </div>
          </header>

          {selected.summary && <p className="detail-summary">{selected.summary}</p>}

          <div className="request-metadata">
            <span><small>نهاية فترة التصحيح</small><b>{formatDate(selected.correctionDeadline)}</b></span>
            <span><small>القيمة المستهدفة</small><b>{selected.measure?.targetValue !== null && selected.measure?.targetValue !== undefined ? `${selected.measure.targetValue}${selected.measure.unit === "percent" ? "%" : ""}` : "—"}</b></span>
            <span><small>المراجع</small><b>{selected.reviewedByEmail || "لم يُراجع بعد"}</b></span>
            <span><small>المصدر الرسمي</small><b>{selected.sourceUrl ? <a href={selected.sourceUrl} target="_blank" rel="noreferrer">فتح المصدر ↗</a> : "غير مرفق"}</b></span>
          </div>

          <div className="detail-actions">
            {selected.status === "pending_review" && <>
              <button className="primary-action" disabled={saving} onClick={() => onAction("review_regulatory_update", { id: selected.id, decision: "approve" }, "اعتُمد القرار وبدأ تقييم المنشآت.")}>اعتماد القرار</button>
              <button className="outline-button" disabled={saving} onClick={() => onAction("review_regulatory_update", { id: selected.id, decision: "reject" }, "رُفض القرار.")}>رفض</button>
            </>}
            {["approved", "in_effect"].includes(selected.status) && <>
              <button className="outline-button" disabled={saving} onClick={() => onAction("assess_regulatory_impacts", { id: selected.id }, "أُعيد تقييم المنشآت.")}>إعادة التقييم</button>
              <button className="outline-button" disabled={saving} onClick={() => setPostponing((value) => !value)}>تأجيل</button>
              <button className="outline-button" disabled={saving} onClick={() => onAction("change_regulatory_status", { id: selected.id, status: "cancelled" }, "أُلغي القرار وأُوقف التصعيد.")}>إلغاء</button>
            </>}
          </div>

          {postponing && <form className="inline-form" onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            await onAction("change_regulatory_status", { id: selected.id, status: "postponed", effectiveDate: form.get("effectiveDate"), reason: form.get("reason") }, "أُجّل القرار وأُعيد ضبط العدّ التنازلي.");
            setPostponing(false);
          }}>
            <Field label="تاريخ النفاذ الجديد" required><input type="date" name="effectiveDate" required /></Field>
            <Field label="السبب"><input name="reason" placeholder="تمديد من الجهة" /></Field>
            <button className="primary-action" disabled={saving}>تأكيد التأجيل</button>
          </form>}

          <section className="detail-block">
            <h3>على من ينطبق؟</h3>
            {selected.applicability ? <ul className="rule-list">
              {(selected.applicability.rules || []).map((rule, index) => <li key={index}>{String((rule as { labelAr?: string }).labelAr || `${(rule as { field?: string }).field} ${(rule as { op?: string }).op} ${ruleValueText((rule as { value?: unknown }).value)}`)}</li>)}
            </ul> : <p className="muted-note">لم تُحدَّد معايير مُهيكلة — المنشآت المتأثرة محددة يدويًا، والسبب موثّق في أثر المطابقة لكل منشأة.</p>}
          </section>

          <section className="detail-block">
            <h3>هل يؤثر عليّ؟</h3>
            <div className="impact-list">
              {selectedImpacts.map((impact) => {
                const client = clientsById.get(impact.clientId);
                const steps = selectedSteps.filter((step) => step.impactId === impact.id);
                const doneSteps = steps.filter((step) => step.status === "مكتملة").length;
                return <div key={impact.id} className="impact-row">
                  <button className="impact-summary" onClick={() => setOpenTrace(openTrace === impact.id ? null : impact.id)}>
                    <span className={`impact-mark ${impact.applicable === true ? "yes" : impact.applicable === false ? "no" : "maybe"}`}>{impact.applicable === true ? "✓" : impact.applicable === false ? "✕" : "⚠"}</span>
                    <div>
                      <strong>{client?.name || `منشأة ${impact.clientId}`}</strong>
                      <p>
                        {impact.applicable === true ? impactStateLabels[impact.state] || impact.state : impact.applicable === false ? "غير متأثرة" : "تحتاج مراجعة"}
                        {impact.gap && impact.gap.currentValue !== null && impact.gap.requiredValue !== null ? ` · الفجوة: ${impact.gap.currentValue}% ← ${impact.gap.requiredValue}%` : ""}
                        {impact.gap?.estimatedHires ? ` · تقدير إرشادي: ${impact.gap.estimatedHires} توظيف سعودي` : ""}
                      </p>
                    </div>
                    <div className="list-meta">
                      {impact.applicable === true && <Badge tone={riskTone(impact.risk)}>{riskLabels[impact.risk] || impact.risk}</Badge>}
                      <small>{impact.applicable === true ? remainingText(impact.daysRemaining) : "—"}</small>
                    </div>
                  </button>

                  {openTrace === impact.id && <div className="impact-detail">
                    <h4>لماذا هذه النتيجة؟</h4>
                    <table className="trace-table"><tbody>
                      {impact.matchTrace.map((entry, index) => <tr key={index} className={entry.passed === true ? "pass" : entry.passed === false ? "fail" : "unknown"}>
                        <td>{entry.ruleAr}</td>
                        <td>{ruleValueText(entry.value)}</td>
                        <td>{entry.passed === true ? "متحقق" : entry.passed === false ? "غير متحقق" : "بيانات ناقصة"}</td>
                      </tr>)}
                    </tbody></table>

                    {impact.gap?.stale && <p className="muted-note">⚠ آخر لقطة للقوى العاملة أقدم من 45 يومًا — الرقم المعروض قد لا يكون حاليًا.</p>}
                    {impact.gap?.currentValueAsOf && <p className="muted-note">الرقم المعتمد هو ما يظهر في قوى بتاريخ {formatDate(impact.gap.currentValueAsOf)}. تقدير العجز إرشادي فقط.</p>}

                    <div className="detail-actions">
                      <button className="outline-button" onClick={() => onWorkforce(impact.clientId)}>تحديث بيانات القوى العاملة</button>
                      {impact.applicable === true && !impact.taskId && <button className="primary-action" disabled={saving} onClick={() => onAction("create_compliance_plan", { impactId: impact.id }, "أُنشئت خطة التصحيح داخل المهام.")}>إنشاء خطة تصحيح</button>}
                      {impact.taskId && <button className="outline-button" onClick={() => onTask(impact.taskId as number)}>فتح المعاملة</button>}
                    </div>

                    {steps.length > 0 && <div className="steps-list">
                      <h4>خطة التصحيح ({doneSteps} من {steps.length})</h4>
                      {steps.map((step) => <label key={step.id} className={step.status === "مكتملة" ? "done" : ""}>
                        <input type="checkbox" checked={step.status === "مكتملة"} disabled={saving} onChange={(event) => onAction("complete_compliance_step", { id: step.id, done: event.target.checked }, "حُدِّثت خطوة الخطة.")} />
                        <span>{step.stepOrder}. {step.title}</span>
                        <small>{formatDate(step.dueDate)}</small>
                      </label>)}
                    </div>}
                  </div>}
                </div>;
              })}
              {!selectedImpacts.length && <EmptyState icon="ع" title="لم يُقيَّم بعد" text="بعد اعتماد القرار سيُقيَّم على كل المنشآت، وستظهر هنا النتيجة وسببها." />}
            </div>
          </section>

          <p className="disclaimer-note">{complianceDisclaimer}</p>
        </article>}

        {upcoming.length > 0 && <article className="dashboard-card">
          <header><div><h2>أقرب الالتزامات</h2><p>المتأخر أولًا، ثم الأقرب استحقاقًا</p></div></header>
          <div>
            {upcoming.slice(0, 8).map((impact) => {
              const client = clientsById.get(impact.clientId);
              const update = updates.find((item) => item.id === impact.updateId);
              return <button key={impact.id} className="portal-list-row" onClick={() => { onSelectUpdate(impact.updateId); setOpenTrace(impact.id); }}>
                <span className={`mini-icon ${riskTone(impact.risk)}`}>{impact.isOverdue ? "!" : String(impact.escalationLevel)}</span>
                <div>
                  <strong>{update?.title || "قرار نظامي"}</strong>
                  <p>{client?.name} · {impactStateLabels[impact.state] || impact.state}</p>
                </div>
                <Badge tone={impact.isOverdue ? "danger" : riskTone(impact.risk)}>{remainingText(impact.daysRemaining)}</Badge>
              </button>;
            })}
          </div>
        </article>}
      </div>
    </div>
  </section>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="page-header"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}

function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{text}</p></div>;
}

function FormActions({ saving, onCancel, submit }: { saving: boolean; onCancel: () => void; submit: string }) {
  return <div className="form-actions field-wide"><button type="button" className="outline-button" onClick={onCancel}>إلغاء</button><button type="submit" className="primary-action" disabled={saving}>{saving ? "جارٍ الحفظ…" : submit}</button></div>;
}

function Dashboard({ data, counts, clientsById, onSection, onClient, onTask, onAddClient, onAddTeam, onScan, saving, canManage }: { data: Snapshot; counts: { urgent: number; soon: number; waiting: number; overdueTasks: number; openTasks: number }; clientsById: Map<number, Client>; onSection: (section: Section) => void; onClient: (id: number) => void; onTask: (id: number) => void; onAddClient: () => void; onAddTeam: () => void; onScan: () => Promise<void>; saving: boolean; canManage: boolean }) {
  const activeTasks = data.tasks.filter((task) => !["مكتملة", "ملغاة"].includes(task.status)).slice(0, 5);
  const urgentDocs = data.documents.filter((document) => expiryMeta(document.expiryDate).days <= 30).slice(0, 5);
  if (!canManage && !data.tasks.length) {
    return <section className="dashboard-page activation-start"><div className="activation-hero"><div><span className="eyebrow">مساحة الموظف</span><h1>مرحبًا، {data.currentUser.fullName}</h1><p>لا توجد مهام مسندة إليك حاليًا. ستظهر هنا تلقائيًا عند إسناد المالك طلبًا أو معاملة إليك.</p></div><Badge tone="success">الحساب جاهز</Badge></div><div className="activation-note"><span>✓</span><div><strong>الصلاحيات محددة تلقائيًا</strong><p>سترى فقط المهمة وملف العميل والمستندات اللازمة لتنفيذها.</p></div></div></section>;
  }
  if (canManage && !data.clients.length && !data.team.length) {
    return <section className="dashboard-page activation-start">
      <div className="activation-hero"><div><span className="eyebrow">نسخة نظيفة وجاهزة للتفعيل</span><h1>مرحبًا بك في SaudOps | مَسار</h1><p>تمت إزالة البيانات التجريبية. ابدأ بإضافة فريقك، ثم أول عميل، وبعدها المستندات وتواريخ التنبيه.</p></div><Badge tone="success">جاهز للبدء</Badge></div>
      <div className="activation-steps">
        <article><b>1</b><div><h2>أضف فريق العمل</h2><p>سجل الاسم والدور والبريد المستخدم للدخول وإسناد المهام.</p></div><button className="primary-action" onClick={onAddTeam}>إضافة أول موظف</button></article>
        <article><b>2</b><div><h2>أنشئ أول ملف عميل</h2><p>أدخل بيانات المنشأة والجوال والسجل ومجلد Drive إن وجد.</p></div><button className="primary-action" onClick={onAddClient}>إضافة أول عميل</button></article>
        <article><b>3</b><div><h2>ارفع المستندات وحدد الانتهاء</h2><p>بعد إضافة العميل، سيبدأ النظام تجهيز التنبيهات والمهام تلقائيًا.</p></div><button className="outline-button" onClick={() => onSection("documents")}>فتح المستندات</button></article>
      </div>
      <div className="activation-note"><span>⌾</span><div><strong>الرفع المباشر والصلاحيات مفعّلان</strong><p>يمكنك رفع المستندات داخل مَسار الآن. لا تكتب كلمات المرور أو رموز التحقق داخل الملاحظات.</p></div></div>
    </section>;
  }
  return <section className="dashboard-page">
    <div className="welcome-row"><div><span className="eyebrow">غرفة المتابعة اليومية</span><h1>مرحبًا، {data.currentUser.fullName}</h1><p>{canManage ? "هذه الأعمال تحتاج إجراءً اليوم. النظام فحص تواريخ المستندات ورتّبها حسب الخطورة." : "هذه قائمة عملك الحالية، ولا تظهر لك إلا المهام والملفات المرتبطة بها."}</p></div><div className="welcome-actions">{canManage && <button className="outline-button" disabled={saving} onClick={onScan}>↻ فحص التنبيهات</button>}<button className="primary-action" onClick={() => onSection("tasks")}>فتح قائمة العمل ←</button></div></div>
    {(counts.urgent > 0 || counts.overdueTasks > 0) && <div className="attention-banner"><span>!</span><div><strong>توجد عناصر تحتاج تدخلًا مباشرًا</strong><p>{counts.urgent} مستندات منتهية أو عاجلة، و{counts.overdueTasks} مهام تجاوزت موعدها.</p></div><button onClick={() => onSection("alerts")}>عرضها الآن</button></div>}
    <div className="stats-grid"><StatCard icon="ع" label="العملاء النشطون" value={data.clients.length} detail="ملفات موحدة محفوظة" tone="green" /><StatCard icon="✓" label="المهام المفتوحة" value={counts.openTasks} detail={`${counts.waiting} بانتظار العميل`} tone="blue" /><StatCard icon="!" label="تنبيهات عاجلة" value={counts.urgent} detail={`${counts.soon} أخرى خلال 30 يومًا`} tone="amber" /><StatCard icon="م" label="المستندات" value={data.documents.length} detail="مراقبة تواريخ الانتهاء" tone="violet" /></div>
    <div className="dashboard-grid">
      <article className="dashboard-card tasks-card"><header><div><h2>أولوية العمل اليوم</h2><p>أعلى المهام حاجة للتنفيذ والمتابعة</p></div><button onClick={() => onSection("tasks")}>عرض الكل</button></header><div>{activeTasks.map((task) => <button className="dashboard-task" key={task.id} onClick={() => onTask(task.id)}><span className={`priority-line priority-line-${task.priority}`} /><div><strong>{task.subject}</strong><p>{clientsById.get(task.clientId)?.name}</p></div><Badge tone={toneForTask(task.status)}>{task.status}</Badge><small>{task.assignedTo || "غير مسندة"}</small></button>)}</div></article>
      <article className="dashboard-card expiring-card"><header><div><h2>قريبة الانتهاء</h2><p>مرتبة حسب أقل مدة متبقية</p></div><button onClick={() => onSection("documents")}>المستندات</button></header><div>{urgentDocs.map((document) => { const meta = expiryMeta(document.expiryDate); return <button className="expiring-row" key={document.id} onClick={() => { onClient(document.clientId); onSection("clients"); }}><span className={`doc-icon ${meta.tone}`}>{document.type[0]}</span><div><strong>{document.title}</strong><p>{clientsById.get(document.clientId)?.name}</p></div><Badge tone={meta.tone}>{meta.label}</Badge></button>; })}</div></article>
      <article className="dashboard-card activity-card"><header><div><h2>آخر الحركات</h2><p>سجل لا يعتمد على ذاكرة الموظف</p></div></header><div className="activity-list">{data.activities.slice(0, 6).map((activity) => <div key={activity.id}><span className="activity-dot" /><div><strong>{activity.event}</strong><p>{activity.detail}</p><small>{activity.actor} · {formatTime(activity.createdAt)}</small></div></div>)}</div></article>
    </div>
  </section>;
}

function ClientDetail({ client, data, canManage, onEdit, onDelete, onDocument, onTask, onAccess }: { client: Client; data: Snapshot; canManage: boolean; onEdit: () => void; onDelete: () => void; onDocument: () => void; onTask: () => void; onAccess: () => void }) {
  const clientDocs = data.documents.filter((item) => item.clientId === client.id);
  const clientTasks = data.tasks.filter((item) => item.clientId === client.id);
  const clientAccess = data.access.filter((item) => item.clientId === client.id);
  const clientActivity = data.activities.filter((item) => item.clientId === client.id).slice(0, 8);
  return <div className="client-detail">
    <header className="client-profile-head"><div className="client-identity"><Avatar name={client.name} color="#176b63" size="large" /><div><span>ملف العميل #{client.id}</span><h2>{client.name}</h2><p>{client.legalName || client.contactName || "لم يضف الاسم النظامي"}</p></div></div><div className="client-head-actions"><Badge tone="success">{client.status}</Badge>{canManage && <button className="outline-button" onClick={onEdit}>تعديل</button>}{canManage && <button className="danger-button" onClick={onDelete}>حذف</button>}</div></header>
    <div className="quick-actions"><button onClick={onDocument}><span>＋</span>مستند</button>{canManage && <button onClick={onTask}><span>✓</span>مهمة</button>}{canManage && <button onClick={onAccess}><span>⌾</span>مرجع دخول</button>}{client.driveUrl && <a href={client.driveUrl} target="_blank" rel="noreferrer"><span>D</span>فتح Drive ↗</a>}</div>
    <section className="client-info-grid"><div><small>المفوض</small><strong>{client.contactName || "—"}</strong></div><div><small>الجوال</small><strong dir="ltr">{client.phone || "—"}</strong></div><div><small>السجل التجاري</small><strong>{client.crNumber || "—"}</strong></div><div><small>الرقم الموحد</small><strong>{client.unifiedNumber || "—"}</strong></div><div><small>المدينة</small><strong>{client.city}</strong></div><div><small>البريد</small><strong>{client.email || "—"}</strong></div></section>
    {client.notes && <div className="client-note"><span>ملاحظة داخلية</span><p>{client.notes}</p></div>}
    <section className="detail-block"><header><h3>المستندات</h3><b>{clientDocs.length}</b></header><div className="mini-list">{clientDocs.map((document) => { const meta = expiryMeta(document.expiryDate); return <div key={document.id}><span className={`mini-icon ${meta.tone}`}>{document.type[0]}</span><div><strong>{document.title}</strong><p>{document.documentNumber || document.type}</p></div><Badge tone={meta.tone}>{meta.label}</Badge></div>; })}{!clientDocs.length && <p className="muted-copy">لا توجد مستندات حتى الآن.</p>}</div></section>
    {canManage && <section className="detail-block"><header><h3>مداخل المنصات</h3><b>{clientAccess.length}</b></header><div className="access-list">{clientAccess.map((access) => <div key={access.id}><span>{access.platform[0]}</span><div><strong>{access.platform}</strong><p>{access.username || "لا يوجد اسم مستخدم"}</p></div><code>{access.vaultReference || "دون مرجع خزنة"}</code></div>)}{!clientAccess.length && <p className="muted-copy">لا توجد مراجع دخول. كلمات المرور لا تحفظ داخل النظام.</p>}</div></section>}
    <section className="detail-block"><header><h3>المعاملات السابقة والحالية</h3><b>{clientTasks.length}</b></header><div className="mini-list">{clientTasks.slice(0, 5).map((task) => <div key={task.id}><span className="mini-code">{task.code.slice(-2)}</span><div><strong>{task.subject}</strong><p>{task.code} · {task.assignedTo || "غير مسندة"}</p></div><Badge tone={toneForTask(task.status)}>{task.status}</Badge></div>)}</div></section>
    <section className="detail-block"><header><h3>سجل العميل</h3></header><div className="timeline">{clientActivity.map((activity) => <div key={activity.id}><i /><div><strong>{activity.event}</strong><p>{activity.detail}</p><small>{activity.actor} · {formatTime(activity.createdAt)}</small></div></div>)}</div></section>
  </div>;
}

function TaskDetail({ task, client, document, team, activities, saving, canAssign, onUpdate, onClient }: { task: TaskRecord; client?: Client; document?: DocumentRecord; team: TeamMember[]; activities: Activity[]; saving: boolean; canAssign: boolean; onUpdate: (payload: Record<string, unknown>) => Promise<void>; onClient: () => void }) {
  const [status, setStatus] = useState(task.status);
  const [memberName, setMemberName] = useState(task.assignedTo || "");
  const [currentStep, setCurrentStep] = useState(task.currentStep);
  const [paymentStatus, setPaymentStatus] = useState(task.paymentStatus);
  const [nextExpiryDate, setNextExpiryDate] = useState("");
  const [proofDriveUrl, setProofDriveUrl] = useState(document?.driveUrl || "");
  const member = team.find((item) => item.name === memberName);
  return <div className="task-detail-inner">
    <header><div><span>{task.code}</span><h2>{task.subject}</h2><button className="link-button" onClick={onClient}>{client?.name || "—"}</button></div><Badge tone={toneForTask(task.status)}>{task.status}</Badge></header>
    <div className="task-metadata"><div><small>الأولوية</small><strong>{task.priority}</strong></div><div><small>الموعد</small><strong>{formatDate(task.dueDate)}</strong></div><div><small>المصدر</small><strong>{task.source}</strong></div><div><small>السداد</small><strong>{task.paymentStatus}</strong></div></div>
    {document && <div className="linked-document"><span>{document.type[0]}</span><div><small>المستند المرتبط</small><strong>{document.title}</strong><p>ينتهي في {formatDate(document.expiryDate)}</p></div>{document.driveUrl && <a href={document.driveUrl} target="_blank" rel="noreferrer">فتح الملف ↗</a>}</div>}
    <section className="task-control">
      <h3>تحديث التنفيذ</h3>
      <Field label="الحالة"><select value={status} onChange={(event) => setStatus(event.target.value)}>{taskStatuses.map((item) => <option key={item}>{item}</option>)}</select></Field>
      {canAssign ? <Field label="الموظف المسؤول"><select value={memberName} onChange={(event) => setMemberName(event.target.value)}><option value="">غير مسندة</option>{team.map((item) => <option key={item.id}>{item.name}</option>)}</select></Field> : <Field label="الموظف المسؤول"><input value={memberName || "مسندة إليك"} readOnly /></Field>}
      <Field label="حالة السداد"><select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}><option>غير مطلوب</option><option>بانتظار السداد</option><option>مسدد</option><option>ملغي</option></select></Field>
      <Field label="الخطوة الحالية"><input value={currentStep} onChange={(event) => setCurrentStep(event.target.value)} /></Field>
      {status === "مكتملة" && document && <div className="completion-fields field-wide"><Field label="تاريخ الانتهاء الجديد" required><input type="date" value={nextExpiryDate} onChange={(event) => setNextExpiryDate(event.target.value)} required /></Field><Field label="رابط الإثبات أو المستند المجدد في Drive"><input type="url" value={proofDriveUrl} onChange={(event) => setProofDriveUrl(event.target.value)} placeholder="https://drive.google.com/..." /></Field></div>}
      <button className="primary-action field-wide" disabled={saving} onClick={() => onUpdate({ status, assignedTo: memberName, assignedEmail: member?.email || "", currentStep, paymentStatus, nextExpiryDate, proofDriveUrl })}>{saving ? "جارٍ الحفظ…" : status === "مكتملة" ? "إنجاز وأرشفة المعاملة" : "حفظ التحديث"}</button>
    </section>
    <section className="sop-box"><header><span>دليل التنفيذ المختصر</span><Badge tone="info">{task.serviceType}</Badge></header><ol><li><b>راجع المتطلبات</b><p>تحقق من المستندات والتفويض قبل الدخول للمنصة.</p></li><li><b>نفّذ الخطوة الحالية</b><p>{task.currentStep}</p></li><li><b>وثّق النتيجة</b><p>سجل حالة السداد وارفع المستند النهائي إلى Drive.</p></li><li><b>أغلق المهمة</b><p>أدخل تاريخ الانتهاء القادم ليبدأ التنبيه الجديد تلقائيًا.</p></li></ol></section>
    <section className="task-history"><h3>سجل المعاملة</h3>{activities.map((activity) => <div key={activity.id}><i /><div><strong>{activity.event}</strong><p>{activity.detail}</p><small>{activity.actor} · {formatTime(activity.createdAt)}</small></div></div>)}</section>
  </div>;
}

function AccessScreen({ mode, message }: { mode: "signin" | "pending"; message: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  const submitSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setFeedback("");
    try {
      const [{ firebaseAuth }, { signInWithEmailAndPassword }] = await Promise.all([import("./lib/firebase-client"), import("firebase/auth")]);
      const credential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      const idToken = await credential.user.getIdToken(true);
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر إنشاء جلسة الدخول.");
      window.location.assign("/");
    } catch (signInError) {
      setFeedback(firebaseMessage(signInError));
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!email.trim()) {
      setFeedback("اكتب بريدك أولًا، ثم اضغط إعادة تعيين كلمة المرور.");
      return;
    }
    setBusy(true);
    setFeedback("");
    try {
      const [{ firebaseAuth }, { sendPasswordResetEmail }] = await Promise.all([import("./lib/firebase-client"), import("firebase/auth")]);
      await sendPasswordResetEmail(firebaseAuth, email.trim());
      setFeedback("أرسلنا رابط إعادة تعيين كلمة المرور إلى بريدك.");
    } catch (resetError) {
      setFeedback(firebaseMessage(resetError));
    } finally {
      setBusy(false);
    }
  };

  return <main className="access-screen" dir="rtl">
    <section className="access-card">
      <div className="access-brand"><span>SO</span><div><strong><em>Saud</em>Ops</strong><small>مَسار · كل ملف في مساره</small></div></div>
      <Badge tone={mode === "signin" ? "info" : "warning"}>{mode === "signin" ? "دخول آمن" : "بانتظار التفعيل"}</Badge>
      <h1>{mode === "signin" ? "ادخل إلى مساحة عملك" : "الحساب معروف ولم يُمنح صلاحية بعد"}</h1>
      <p>{message}</p>
      <div className="access-role-grid"><div><b>المالك</b><span>كامل الإدارة والصلاحيات</span></div><div><b>الموظف</b><span>المهام والملفات المسندة فقط</span></div><div><b>العميل</b><span>ملف منشأته وطلباته فقط</span></div></div>
      {mode === "signin" ? <form className="access-login-form" onSubmit={submitSignIn}>
        <label><span>البريد الإلكتروني</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" dir="ltr" placeholder="name@example.com" /></label>
        <label><span>كلمة المرور</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete="current-password" dir="ltr" /></label>
        {feedback && <p className="access-feedback" role="status">{feedback}</p>}
        <button className="primary-action access-cta" type="submit" disabled={busy}>{busy ? "جارٍ الدخول…" : "تسجيل الدخول ←"}</button>
        <button className="link-button access-reset" type="button" disabled={busy} onClick={() => void resetPassword()}>نسيت كلمة المرور؟</button>
      </form> : <div className="access-actions"><button className="outline-button" onClick={() => window.location.reload()}>تحقق مرة أخرى</button><button className="link-button" type="button" onClick={() => void endFirebaseSession()}>استخدام حساب آخر</button></div>}
      <small className="access-note">يتم الدخول عبر Firebase Authentication، وتُطبّق الصلاحيات مرة أخرى على الخادم قبل عرض أي بيانات.</small>
    </section>
  </main>;
}

function ClientPortal({ data, saving, toast, onAction, onUpload, onSignOut }: { data: Snapshot; saving: boolean; toast: string; onAction: (action: string, payload: Record<string, unknown>, message: string) => Promise<ActionResult>; onUpload: (file: File, metadata: Record<string, string | number | null | undefined>) => Promise<unknown>; onSignOut: () => Promise<void> }) {
  const [section, setSection] = useState<"home" | "documents" | "requests" | "required">("home");
  const [newRequest, setNewRequest] = useState(false);
  const client = data.clients[0];
  const pending = data.requirements.filter((item) => item.status === "مطلوب");
  const openRequests = data.requests.filter((item) => !["مكتمل", "ملغي"].includes(item.status));
  const nav = [
    { id: "home" as const, label: "الرئيسية", icon: "⌂" },
    { id: "documents" as const, label: "ملفاتي", icon: "م" },
    { id: "requests" as const, label: "طلباتي", icon: "ط" },
    { id: "required" as const, label: "مطلوب مني", icon: "!" },
  ];

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    form.delete("file");
    const values = Object.fromEntries(form.entries());
    const result = await onAction("create_request", values, "تم إرسال الطلب إلى فريق سعود أوبس.");
    if (file instanceof File && file.size && result?.request) await onUpload(file, { clientId: client.id, requestId: result.request.id, label: `مرفق ${result.request.code}` });
    setNewRequest(false);
  };

  const submitResponse = async (event: FormEvent<HTMLFormElement>, requirement: ClientRequirement) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    const responseText = String(form.get("responseText") || "");
    await onAction("respond_requirement", { id: requirement.id, responseText }, "تم إرسال ردك وسيُراجع من الفريق.");
    if (file instanceof File && file.size) await onUpload(file, { clientId: client.id, requestId: requirement.requestId, requirementId: requirement.id, label: requirement.title });
  };

  return <main className="client-portal" dir="rtl">
    {toast && <div className="toast"><span>✓</span>{toast}</div>}
    <header className="client-topbar"><div className="access-brand"><span>SO</span><div><strong><em>Saud</em>Ops</strong><small>بوابة العميل · مَسار</small></div></div><div className="client-account"><div><strong>{data.currentUser.fullName}</strong><small>{client?.name || "حساب عميل"}</small></div><button type="button" onClick={() => void onSignOut()} disabled={saving} className="outline-button">خروج</button></div></header>
    <div className="client-shell">
      <aside className="client-nav"><div className="client-company"><Avatar name={client?.name || data.currentUser.fullName} color="#087568" size="large" /><div><span>ملف المنشأة</span><strong>{client?.name || "—"}</strong><small>{client?.crNumber ? `سجل ${client.crNumber}` : client?.unifiedNumber || ""}</small></div></div><nav>{nav.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><span>{item.icon}</span>{item.label}{item.id === "required" && pending.length > 0 && <b>{pending.length}</b>}</button>)}</nav><div className="client-help"><b>تحتاج مساعدة؟</b><p>أنشئ طلبًا خاصًا وسيصل مباشرة إلى فريق المتابعة.</p><button onClick={() => setNewRequest(true)}>طلب خاص</button></div></aside>
      <section className="client-content">
        {section === "home" && <><div className="client-hero"><div><span>صباح الخير، {data.currentUser.fullName}</span><h1>كل ملفات منشأتك في مكان واحد</h1><p>تابع المستندات والطلبات والمبالغ المطلوبة دون الرجوع إلى المحادثات القديمة.</p></div><button className="primary-action" onClick={() => setNewRequest(true)}>＋ طلب خدمة</button></div><div className="client-stat-grid"><StatCard icon="م" label="المستندات" value={data.documents.length} detail="متاحة للتحميل" tone="green" /><StatCard icon="ط" label="طلبات مفتوحة" value={openRequests.length} detail="قيد المتابعة" tone="blue" /><StatCard icon="!" label="مطلوب منك" value={pending.length} detail="معلومة أو مستند أو سداد" tone="amber" /></div>{pending.length > 0 && <article className="client-focus"><header><div><span>!</span><div><h2>يوجد إجراء مطلوب منك</h2><p>استكماله يساعد الفريق على متابعة طلبك دون تأخير.</p></div></div><button onClick={() => setSection("required")}>عرض المطلوب ←</button></header>{pending.slice(0, 2).map((item) => <div className="client-focus-row" key={item.id}><div><Badge tone="warning">{item.type}</Badge><strong>{item.title}</strong><p>{item.description || "بانتظار ردك"}</p></div><small>{formatDate(item.dueDate)}</small></div>)}</article>}<div className="client-overview-grid"><article><header><h2>آخر الطلبات</h2><button onClick={() => setSection("requests")}>عرض الكل</button></header>{data.requests.slice(0, 4).map((request) => <div className="portal-list-row" key={request.id}><span className="mini-code">{request.code.slice(-2)}</span><div><strong>{request.title}</strong><p>{request.code} · {request.serviceType}</p></div><Badge tone={toneForTask(request.status)}>{request.status}</Badge></div>)}{!data.requests.length && <EmptyState icon="ط" title="لا توجد طلبات" text="اطلب خدمة جاهزة أو اكتب طلبًا خاصًا." />}</article><article><header><h2>مستندات قريبة الانتهاء</h2><button onClick={() => setSection("documents")}>ملفاتي</button></header>{data.documents.slice(0, 4).map((document) => { const meta = expiryMeta(document.expiryDate); return <div className="portal-list-row" key={document.id}><span className={`mini-icon ${meta.tone}`}>{document.type[0]}</span><div><strong>{document.title}</strong><p>{formatDate(document.expiryDate)}</p></div><Badge tone={meta.tone}>{meta.label}</Badge></div>; })}</article></div></>}

        {section === "documents" && <section className="portal-page"><PageHeader eyebrow="أرشيف منشأتك" title="الملفات والمستندات" description="تحميل سريع للمستندات التي شاركها الفريق معك." /><div className="portal-doc-grid">{data.documents.map((document) => { const meta = expiryMeta(document.expiryDate); const file = data.files.find((item) => item.documentId === document.id); return <article key={document.id}><header><span>{document.type[0]}</span><Badge tone={meta.tone}>{meta.label}</Badge></header><h3>{document.title}</h3><p>{document.documentNumber || document.type}</p><small>تاريخ الانتهاء: {formatDate(document.expiryDate)}</small>{file ? <a className="primary-action" href={`/api/files?id=${file.id}`}>تحميل المستند ↓</a> : document.driveUrl ? <a className="outline-button" href={document.driveUrl} target="_blank" rel="noreferrer">فتح الملف ↗</a> : <button className="outline-button" disabled>لم يرفع بعد</button>}</article>; })}{data.files.filter((file) => !file.documentId).map((file) => <article key={`file-${file.id}`}><header><span>م</span><Badge tone="info">ملف مشترك</Badge></header><h3>{file.label}</h3><p>{file.fileName}</p><small>{Math.ceil(file.fileSize / 1024)} كيلوبايت · {formatTime(file.createdAt)}</small><a className="primary-action" href={`/api/files?id=${file.id}`}>تحميل الملف ↓</a></article>)}</div>{!data.documents.length && !data.files.length && <EmptyState icon="م" title="الأرشيف فارغ" text="ستظهر هنا المستندات والملفات التي يشاركها الفريق معك." />}</section>}

        {section === "requests" && <section className="portal-page"><PageHeader eyebrow="متابعة واضحة" title="طلباتي" description="كل طلب مع حالته الحالية والخطوة التي وصل إليها." action={<button className="primary-action" onClick={() => setNewRequest(true)}>＋ طلب جديد</button>} /><div className="portal-request-list">{data.requests.map((request) => <article key={request.id}><header><div><span>{request.code}</span><h3>{request.title}</h3><p>{request.serviceType}</p></div><Badge tone={toneForTask(request.status)}>{request.status}</Badge></header>{request.description && <p className="request-description">{request.description}</p>}<div className="request-metadata"><span><small>الموظف المتابع</small><b>{request.assignedTo || "جارٍ التوزيع"}</b></span><span><small>الاستحقاق</small><b>{formatDate(request.dueDate)}</b></span><span><small>السداد</small><b>{request.paymentStatus}</b></span>{request.quotedAmount !== null && <span><small>المبلغ</small><b>{request.quotedAmount.toLocaleString("ar-SA")} ر.س</b></span>}</div><div className="request-progress"><i className={["جديد", "قيد المراجعة"].includes(request.status) ? "current" : "done"} /><span>استلام الطلب</span><i className={["قيد التنفيذ", "مراجعة واعتماد", "مكتمل"].includes(request.status) ? "done" : ""} /><span>التنفيذ</span><i className={request.status === "مكتمل" ? "done" : ""} /><span>الإنجاز</span></div></article>)}{!data.requests.length && <EmptyState icon="ط" title="لا توجد طلبات بعد" text="اختر خدمة جاهزة أو أنشئ طلبًا خاصًا." />}</div></section>}

        {section === "required" && <section className="portal-page"><PageHeader eyebrow="حتى لا تتوقف المعاملة" title="مطلوب مني" description="المعلومات والمستندات والمبالغ التي ينتظرها فريق المتابعة منك." /><div className="requirements-list">{data.requirements.map((requirement) => <article key={requirement.id} className={requirement.status === "مطلوب" ? "pending" : "answered"}><header><div><Badge tone={requirement.status === "مطلوب" ? "warning" : "success"}>{requirement.type}</Badge><h3>{requirement.title}</h3></div><span>{requirement.status}</span></header><p>{requirement.description || "أكمل المطلوب ثم أرسل تأكيدك للفريق."}</p>{requirement.amount !== null && <div className="payment-amount"><small>المبلغ المطلوب</small><strong>{requirement.amount.toLocaleString("ar-SA")} ر.س</strong>{requirement.paymentUrl && <a href={requirement.paymentUrl} target="_blank" rel="noreferrer">فتح رابط الدفع ↗</a>}</div>}{requirement.status === "مطلوب" ? <form onSubmit={(event) => submitResponse(event, requirement)}><Field label={requirement.type === "سداد" ? "تأكيد السداد أو ملاحظتك" : "ردك"} required><textarea name="responseText" required rows={3} placeholder={requirement.type === "سداد" ? "تم السداد، رقم العملية..." : "اكتب المعلومات المطلوبة"} /></Field><Field label="إرفاق ملف (اختياري)"><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" /></Field><button className="primary-action" disabled={saving}>{saving ? "جارٍ الإرسال…" : "إرسال الرد"}</button></form> : <div className="client-response"><small>ردك</small><p>{requirement.responseText}</p></div>}</article>)}{!data.requirements.length && <EmptyState icon="✓" title="لا يوجد إجراء مطلوب" text="كل متطلباتك مكتملة حاليًا." />}</div></section>}
      </section>
    </div>
    <nav className="client-mobile-nav">{nav.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><span>{item.icon}</span><small>{item.label}</small>{item.id === "required" && pending.length > 0 && <b>{pending.length}</b>}</button>)}</nav>
    {newRequest && <Modal title="طلب خدمة جديدة" subtitle="سيصل الطلب مباشرة إلى المالك ثم يُسند للموظف المناسب." onClose={() => setNewRequest(false)} wide><form className="modal-form form-grid" onSubmit={submitRequest}><Field label="الخدمة" required><select name="serviceType" required defaultValue=""><option value="">اختر الخدمة</option><option>تجديد إقامة</option><option>إصدار أو تجديد رخصة عمل</option><option>تجديد سجل تجاري</option><option>تجديد رخصة بلدية</option><option>عقد إيجار</option><option>نقل خدمات</option><option>طلب خاص</option></select></Field><Field label="عنوان الطلب" required><input name="title" required placeholder="اكتب المطلوب باختصار" /></Field><Field label="الأولوية"><select name="priority"><option>متوسطة</option><option>مرتفعة</option><option>عاجلة</option></select></Field><Field label="مرفق أولي"><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" /></Field><Field label="التفاصيل" wide><textarea name="description" rows={5} placeholder="اشرح الطلب وأي معلومات تساعد الفريق على البدء." /></Field><FormActions saving={saving} onCancel={() => setNewRequest(false)} submit="إرسال الطلب" /></form></Modal>}
  </main>;
}

function RequestCenter({ data, selected, onSelect, saving, onUpdate, onRequirement, onTask }: { data: Snapshot; selected: ClientRequest | null; onSelect: (id: number) => void; saving: boolean; onUpdate: (payload: Record<string, unknown>) => Promise<void>; onRequirement: () => void; onTask: (taskId: number) => void }) {
  const clientMap = new Map(data.clients.map((client) => [client.id, client]));
  const linkedTaskId = selected ? data.requestTasks.find((link) => link.requestId === selected.id)?.taskId : undefined;
  const linkedTask = data.tasks.find((task) => task.id === linkedTaskId);
  const requirements = selected ? data.requirements.filter((item) => item.requestId === selected.id) : [];
  const files = selected ? data.files.filter((file) => file.requestId === selected.id) : [];

  const submitUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const member = data.team.find((item) => item.name === values.assignedTo);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const createTask = submitter?.value === "create-task";
    await onUpdate({ ...values, assignedEmail: member?.email || "", createTask });
  };

  return <section className="page-section"><PageHeader eyebrow="من العميل إلى التنفيذ" title="طلبات العملاء" description="استلام الطلب، طلب النواقص، إسناده للموظف، ثم إعادته للعميل بنتيجة واضحة." /><div className="requests-workspace"><article className="list-panel request-admin-list"><div className="panel-toolbar"><strong>{data.requests.length} طلب</strong><span>{data.requests.filter((item) => item.status === "جديد").length} جديد</span></div>{data.requests.map((request) => <button key={request.id} className={`request-admin-row ${selected?.id === request.id ? "selected" : ""}`} onClick={() => onSelect(request.id)}><div><span>{request.code}</span><Badge tone={toneForTask(request.status)}>{request.status}</Badge></div><strong>{request.title}</strong><p>{clientMap.get(request.clientId)?.name || "—"}</p><small>{request.assignedTo || "لم يسند بعد"} · {formatTime(request.updatedAt)}</small></button>)}{!data.requests.length && <EmptyState icon="ط" title="لا توجد طلبات واردة" text="ستظهر هنا فور إرسال العميل طلبًا من بوابته." />}</article><article className="detail-panel request-admin-detail">{selected ? <><header className="request-detail-head"><div><span>{selected.code}</span><h2>{selected.title}</h2><p>{clientMap.get(selected.clientId)?.name} · {selected.serviceType}</p></div><Badge tone={toneForTask(selected.status)}>{selected.status}</Badge></header>{selected.description && <blockquote>{selected.description}</blockquote>}<form key={selected.id} className="request-admin-form" onSubmit={submitUpdate}><Field label="الحالة"><select name="status" defaultValue={selected.status}><option>جديد</option><option>قيد المراجعة</option><option>بانتظار العميل</option><option>بانتظار السداد</option><option>جاهز للتنفيذ</option><option>قيد التنفيذ</option><option>مراجعة واعتماد</option><option>مكتمل</option><option>ملغي</option></select></Field><Field label="الموظف"><select name="assignedTo" defaultValue={selected.assignedTo || ""}><option value="">اختر الموظف</option>{data.team.map((member) => <option key={member.id}>{member.name}</option>)}</select></Field><Field label="موعد الإنجاز"><input type="date" name="dueDate" defaultValue={selected.dueDate || ""} /></Field><Field label="التسعير"><input type="number" min="0" step="0.01" name="quotedAmount" defaultValue={selected.quotedAmount ?? ""} /></Field><Field label="حالة السداد"><select name="paymentStatus" defaultValue={selected.paymentStatus}><option>غير مطلوب</option><option>بانتظار السداد</option><option>أفاد العميل بالسداد</option><option>مسدد</option><option>ملغي</option></select></Field><Field label="رابط الدفع"><input type="url" name="paymentUrl" defaultValue={selected.paymentUrl || ""} /></Field><div className="request-admin-actions field-wide"><button className="outline-button" type="button" onClick={onRequirement}>＋ طلب معلومة / مستند / سداد</button><button className="outline-button" type="submit" value="save" disabled={saving}>حفظ الحالة</button>{linkedTask ? <button className="primary-action" type="button" onClick={() => onTask(linkedTask.id)}>فتح المهمة {linkedTask.code}</button> : <button className="primary-action" type="submit" value="create-task" disabled={saving}>اعتماد وتحويل لمهمة</button>}</div></form><section className="request-subsection"><header><h3>المطلوب من العميل</h3><b>{requirements.length}</b></header>{requirements.map((item) => <div className="requirement-admin-row" key={item.id}><Badge tone={item.status === "مطلوب" ? "warning" : "success"}>{item.type}</Badge><div><strong>{item.title}</strong><p>{item.status === "تم الرد" ? item.responseText : item.description}</p></div><small>{item.status}</small></div>)}{!requirements.length && <p className="muted-copy">لم يُطلب شيء من العميل بعد.</p>}</section><section className="request-subsection"><header><h3>المرفقات</h3><b>{files.length}</b></header>{files.map((file) => <a className="file-admin-row" key={file.id} href={`/api/files?id=${file.id}`}><span>م</span><div><strong>{file.label}</strong><p>{file.fileName}</p></div><small>تحميل ↓</small></a>)}{!files.length && <p className="muted-copy">لا توجد مرفقات للطلب.</p>}</section></> : <EmptyState icon="ط" title="اختر طلبًا" text="ستظهر حالته ومتطلباته وإسناده هنا." />}</article></div></section>;
}

function AccessManagement({ data, saving, onAdd, onToggle }: { data: Snapshot; saving: boolean; onAdd: () => void; onToggle: (account: AppUser) => Promise<void> }) {
  const clientMap = new Map(data.clients.map((client) => [client.id, client]));
  const roleLabel: Record<AppRole, string> = { owner: "مالك", employee: "موظف", client: "عميل" };
  return <section className="page-section"><PageHeader eyebrow="دخول مستقل لكل شخص" title="الدخول والصلاحيات" description="أضف البريد وحدد الدور؛ وسيطبّق النظام الصلاحيات على الخادم تلقائيًا." action={<button className="primary-action" onClick={onAdd}>＋ حساب دخول</button>} /><div className="access-summary"><div><strong>{data.users.filter((item) => item.role === "owner").length}</strong><span>مالك</span></div><div><strong>{data.users.filter((item) => item.role === "employee").length}</strong><span>موظف</span></div><div><strong>{data.users.filter((item) => item.role === "client").length}</strong><span>عميل</span></div></div><article className="accounts-table"><div className="accounts-head"><span>الحساب</span><span>الدور</span><span>النطاق</span><span>الحالة</span><span>الإجراء</span></div>{data.users.map((account) => <div className="account-row" key={account.id}><span><Avatar name={account.fullName} size="small" /><span><b>{account.fullName}</b><small dir="ltr">{account.email}</small></span></span><span><Badge tone={account.role === "owner" ? "info" : account.role === "client" ? "warning" : "success"}>{roleLabel[account.role]}</Badge></span><span>{account.role === "owner" ? "جميع البيانات" : account.role === "employee" ? "مهامه والعملاء المرتبطون" : clientMap.get(account.clientId || 0)?.name || "غير مرتبط"}</span><span><Badge tone={account.active ? "success" : "muted"}>{account.active ? "نشط" : "موقوف"}</Badge></span><span><button className="outline-button" disabled={saving || account.role === "owner"} onClick={() => onToggle(account)}>{account.active ? "إيقاف" : "تفعيل"}</button></span></div>)}</article><div className="permission-matrix"><div><h3>ما الذي يراه كل حساب؟</h3><p>الإخفاء بصري ومن الخادم، فلا يمكن للحساب الوصول إلى بيانات خارج نطاقه حتى عبر الرابط المباشر.</p></div><ul><li><b>المالك:</b> العملاء، الفريق، الطلبات، التسعير، التنبيهات والصلاحيات.</li><li><b>الموظف:</b> المهام المسندة وملفات العملاء اللازمة للتنفيذ.</li><li><b>العميل:</b> منشأته ومستنداته وطلباته وما يطلبه الفريق منه.</li></ul></div></section>;
}

function IntegrationCard({ icon, title, state, tone, text, detail }: { icon: string; title: string; state: string; tone: string; text: string; detail: string }) {
  return <article className="integration-card"><header><span>{icon}</span><Badge tone={tone}>{state}</Badge></header><h3>{title}</h3><p>{text}</p><small>{detail}</small></article>;
}
