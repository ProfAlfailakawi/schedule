import React, { useEffect, useMemo, useRef, useState } from "react";
import { sortByName } from "../utils/sorting";
import {
  Activity,
  ArchiveRestore,
  Building2,
  Check,
  DatabaseBackup,
  Download,
  Eraser,
  FileCheck2,
  ChevronLeft,
  KeyRound,
  Landmark,
  ScrollText,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserCog,
  UsersRound,
  RefreshCw,
  X,
} from "lucide-react";
import {
  AddButton,
  Badge,
  ConsoleRail,
  Field,
  FormActions,
  Notice,
  PageTitle,
  PrimaryButton,
  SecondaryButton,
  Surface,
  CatalogFormDrawer,
  visualConfirm,
} from "./ui";
import {
  AdCollege,
  AdCollegeUserAssign,
  AdSection,
  AuditLogEntry,
  FormName,
  FormSecurity,
} from "../types";

export type AdminMode = "users" | "permissions" | "scopes" | "audit" | "backup";
type PageMode = "index" | "create" | "edit";
interface SafeUser {
  SystemUserId: number;
  Name: string;
  SystemUserLogin: string;
  /** Whether an account has a password at all. The value itself never leaves the server. */
  HasPassword?: boolean;
  IsAdminUser: boolean;
  IsActive: boolean;
  IsLocked: boolean;
  AdInstructorId?: number;
}
interface Props {
  mode: AdminMode;
  onNavigate?: (mode: AdminMode) => void;
  permissions?: number[];
  rootAdmin?: boolean;
  demoReadOnly?: boolean;
}

interface BackupPreview {
  valid: boolean;
  backupId: string;
  createdAt: string;
  storage: string;
  documentCount: number;
  collectionCounts: Record<string, number>;
  sha256: string;
}
interface RestorePoint {
  id: string;
  createdAt: string;
  action: string;
  byUserId: number;
  documentCount: number;
  collectionCounts: Record<string, number>;
  consumedAt?: string;
}
interface ExportJob {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "queued" | "running" | "finalizing" | "ready" | "failed";
  totalUnits: number;
  completedUnits: number;
  documentCount: number;
  collectionCounts: Record<string, number>;
  current?: string;
  filename?: string;
  sha256?: string;
  sizeBytes?: number;
  error?: string;
}
interface ImportJob {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "running" | "ready" | "failed";
  phase: "safety" | "apply" | "finalizing";
  totalUnits: number;
  completedUnits: number;
  documentCount: number;
  collectionCounts: Record<string, number>;
  current?: string;
  error?: string;
  restorePointId?: string;
}
interface BackupStatus {
  rootOnly: boolean;
  data: { mode: string; real: boolean };
  restorePoints: RestorePoint[];
  latest: RestorePoint | null;
  latestExport?: ExportJob | null;
  latestImport?: ImportJob | null;
}

/**
 * Declared here, not inside the screen — and that is the whole fix.
 *
 * A component defined in another component's body is a NEW component type on
 * every render, so React cannot reconcile it: it unmounts the old input and
 * mounts a fresh one. The visible symptom was that the admin search boxes lost
 * focus and the caret after every single keystroke, on all four screens, and
 * the only way to type a name was to click back into the field each letter.
 * At module scope the type is stable and the input simply keeps its focus.
 */
function SearchBox({
  value,
  onChange,
  placeholder = "بحث...",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="master-search">
      <Search />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value ? (
        <button type="button" data-guide-ignore="مسح حقل البحث فقط" onClick={() => onChange("")} aria-label="مسح" title="مسح">
          <X aria-hidden="true" />
        </button>
      ) : null}
    </label>
  );
}

function EmptyInspector({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="master-empty">
      {icon}
      <strong>{title}</strong>
      <span>اختر عنصراً من القائمة</span>
    </div>
  );
}

const collectionMeta: Record<string, { label: string, icon: React.FC<any> }> = {
  users: { label: "المستخدمين", icon: UsersRound },
  colleges: { label: "الكليات", icon: Landmark },
  terms: { label: "الفصول", icon: Activity },
  sections: { label: "الشعب", icon: Building2 },
  instructors: { label: "المحاضرين", icon: UserCog },
  courses: { label: "المقررات", icon: ScrollText },
  schedules: { label: "الجداول", icon: ScrollText },
  formNames: { label: "نماذج الصلاحيات", icon: ShieldCheck },
  formSecurity: { label: "الأمن", icon: KeyRound },
  collegeUserAssign: { label: "ربط الكليات", icon: UserCog },
};

export default function AdminUsers({
  mode,
  onNavigate,
  permissions = [],
  rootAdmin = false,
  demoReadOnly = false,
}: Props) {
  const [page, setPage] = useState<PageMode>("index"),
    [error, setError] = useState<string | null>(null),
    [users, setUsers] = useState<SafeUser[]>([]),
    [forms, setForms] = useState<FormName[]>([]),
    [perms, setPerms] = useState<FormSecurity[]>([]),
    [assigns, setAssigns] = useState<AdCollegeUserAssign[]>([]),
    [colleges, setColleges] = useState<AdCollege[]>([]),
    [sections, setSections] = useState<AdSection[]>([]),
    [instructors, setInstructors] = useState<any[]>([]),
    [logs, setLogs] = useState<AuditLogEntry[]>([]),
    [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null),
    [exportJob, setExportJob] = useState<ExportJob | null>(null),
    [importJob, setImportJob] = useState<ImportJob | null>(null),
    [importUploadPercent, setImportUploadPercent] = useState(0),
    [backupBusy, setBackupBusy] = useState<"export" | "preview" | "import" | "reset" | "undo" | null>(null),
    [backupFile, setBackupFile] = useState<File | null>(null),
    [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null),
    [resetPhrase, setResetPhrase] = useState(""),
    [backupMessage, setBackupMessage] = useState<string | null>(null),
    [backupConfirm, setBackupConfirm] = useState<"import" | "reset" | "undo" | null>(null);
  useEffect(() => {
    if (!demoReadOnly) return;
    document.documentElement.dataset.demoAdminReadonly = "true";
    return () => { delete document.documentElement.dataset.demoAdminReadonly; };
  }, [demoReadOnly]);
  const exportRunner = useRef(0);
  const importRunner = useRef(0);
  const [query, setQuery] = useState(""),
    [filterUser, setFilterUser] = useState(0),
    [selectedUserId, setSelectedUserId] = useState<number | null>(null),
    [selectedPermKey, setSelectedPermKey] = useState<string | null>(null),
    [selectedScopeKey, setSelectedScopeKey] = useState<string | null>(null),
    [selectedLogId, setSelectedLogId] = useState<string | number | null>(null);
  const [editUserId, setEditUserId] = useState<number | null>(null),
    [name, setName] = useState(""),
    [login, setLogin] = useState(""),
    [password, setPassword] = useState(""),
    [isAdmin, setIsAdmin] = useState(false),
    [isActive, setIsActive] = useState(true),
    [isLocked, setIsLocked] = useState(false),
    [linkedInstructor, setLinkedInstructor] = useState(0);
  const [permUser, setPermUser] = useState(0),
    [permForm, setPermForm] = useState(0),
    [permSelections, setPermSelections] = useState<number[]>([]),
    [oldPerm, setOldPerm] = useState<FormSecurity | null>(null),
    [scopeUser, setScopeUser] = useState(0),
    [scopeCollege, setScopeCollege] = useState(0),
    [scopeSection, setScopeSection] = useState(0);
  const api = async (url: string, init?: RequestInit) => {
    if (demoReadOnly && init?.method && !["GET", "HEAD"].includes(String(init.method).toUpperCase()))
      throw new Error("الإدارة للعرض فقط في البيئة التجريبية");
    // Defensive read: a non-JSON body is a busy gateway, not a crash to leak.
    const r = await fetch(url, init);
    const body = await r.text();
    let d: any = {};
    if (body) {
      try { d = JSON.parse(body); }
      catch { throw new Error(r.ok ? "وصل رد غير متوقع من الخادم. أعد المحاولة بعد لحظات." : `الخادم مشغول حالياً (${r.status}). أعد المحاولة بعد قليل.`); }
    }
    if (!r.ok) throw new Error(d.error || "تعذر تنفيذ العملية");
    return d;
  };
  const backupRequest = async (url: string, file: File, confirmHeader?: string) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": file.name.endsWith(".gz") ? "application/gzip" : "application/octet-stream",
        ...(confirmHeader ? { "X-Schedule-Confirm": confirmHeader } : {}),
      },
      body: file,
    });
    const text = await response.text();
    let data: any = {};
    if (text) {
      try { data = JSON.parse(text); }
      catch { throw new Error(response.ok ? "وصل رد غير متوقع من الخادم" : `تعذر قراءة رد الخادم (${response.status})`); }
    }
    if (!response.ok) throw new Error(data.error || "تعذر تنفيذ العملية");
    return data;
  };
  const uploadBackupJob = (file: File): Promise<ImportJob> => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/system-backup/import-jobs", true);
    xhr.withCredentials = true;
    xhr.responseType = "text";
    xhr.setRequestHeader("Content-Type", file.name.endsWith(".gz") ? "application/gzip" : "application/octet-stream");
    xhr.setRequestHeader("X-Schedule-Confirm", "FULL-SYSTEM-IMPORT");
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.max(1, Math.min(100, Math.round((event.loaded / event.total) * 100)));
      setImportUploadPercent(percent);
    };
    xhr.onerror = () => reject(new Error("انقطع الاتصال أثناء رفع النسخة. لم يبدأ الاستيراد؛ أعد المحاولة وسيبدأ من ملفك نفسه."));
    xhr.onabort = () => reject(new Error("تم إيقاف رفع النسخة قبل بدء الاستيراد."));
    xhr.onload = () => {
      let data: any = {};
      try { data = xhr.responseText ? JSON.parse(xhr.responseText) : {}; }
      catch { reject(new Error(`تعذر قراءة رد الخادم (${xhr.status || "بدون حالة"})`)); return; }
      if (xhr.status < 200 || xhr.status >= 300) { reject(new Error(data.error || "تعذر بدء الاستيراد")); return; }
      setImportUploadPercent(100);
      resolve(data as ImportJob);
    };
    xhr.send(file);
  });
  const refreshBackupStatus = async () => {
    if (!rootAdmin) return;
    const status = await api("/api/system-backup/status") as BackupStatus;
    setBackupStatus(status);
    setExportJob(status.latestExport || null);
    setImportJob(status.latestImport || null);
  };
  const driveExportJob = async (jobId: string) => {
    const runner = ++exportRunner.current;
    setBackupBusy("export");
    setError(null);
    let transportRetries = 0;
    let visibleFailureRetries = 0;
    try {
      let job = await api(`/api/system-backup/export-jobs/${encodeURIComponent(jobId)}`) as ExportJob;
      setExportJob(job);
      while (runner === exportRunner.current && job.status !== "ready") {
        try {
          job = await api(`/api/system-backup/export-jobs/${encodeURIComponent(jobId)}/step`, { method: "POST" }) as ExportJob;
          transportRetries = 0;
        } catch (stepError: any) {
          transportRetries += 1;
          if (transportRetries > 12) throw stepError;
          setBackupMessage(`الاتصال تعثر لحظيًا — أحاول المتابعة من ${job.completedUnits}/${job.totalUnits} بدون فقد التقدم.`);
          await new Promise(resolve => window.setTimeout(resolve, Math.min(5000, 350 * (2 ** (transportRetries - 1)))));
          continue;
        }
        if (runner !== exportRunner.current) return;
        setExportJob(job);
        if (job.status === "failed") {
          visibleFailureRetries += 1;
          if (visibleFailureRetries > 8) break;
          setBackupMessage(`توقفت مرحلة مؤقتًا عند ${job.completedUnits}/${job.totalUnits} — أعيد المحاولة من نفس النقطة.`);
          await new Promise(resolve => window.setTimeout(resolve, 900 * visibleFailureRetries));
          continue;
        }
        visibleFailureRetries = 0;
        await new Promise(resolve => window.setTimeout(resolve, 140));
      }
      if (job.status === "ready") {
        setBackupMessage(`اكتملت النسخة: ${job.documentCount.toLocaleString("ar-KW-u-nu-latn")} سجل. اضغط «تنزيل النسخة» لحفظ الملف.`);
        const status = await api("/api/system-backup/status") as BackupStatus;
        if (runner === exportRunner.current) { setBackupStatus(status); setExportJob(status.latestExport || job); }
      } else if (job.status === "failed") {
        setError(job.error || `تعذر إكمال المرحلة ${job.completedUnits + 1}/${job.totalUnits}. التقدم محفوظ ويمكن استكماله.`);
      }
    } catch (e: any) {
      if (runner === exportRunner.current) setError(`${e.message || "تعذر متابعة التصدير"} — التقدم المحفوظ لم يُفقد.`);
    } finally {
      if (runner === exportRunner.current) setBackupBusy(null);
    }
  };
  const exportFullBackup = async (forceNew = false) => {
    setError(null);
    setBackupMessage(null);
    if (!forceNew && exportJob && ["queued", "running", "finalizing", "failed"].includes(exportJob.status)) {
      await driveExportJob(exportJob.id);
      return;
    }
    setBackupBusy("export");
    try {
      const url = forceNew ? "/api/system-backup/export-jobs?force=true" : "/api/system-backup/export-jobs";
      const job = await api(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: forceNew }),
      }) as ExportJob;
      setExportJob(job);
      if (job.status === "ready") {
        setBackupMessage(`النسخة جاهزة: ${job.documentCount.toLocaleString("ar-KW-u-nu-latn")} سجل.`);
        setBackupBusy(null);
        return;
      }
      setBackupMessage("بدأ التصدير الآمن. يمكنك ترك الصفحة والعودة؛ التقدم المحفوظ لن يضيع.");
      setBackupBusy(null);
      await driveExportJob(job.id);
    } catch (e: any) {
      setBackupBusy(null);
      setError(e.message || "تعذر بدء التصدير");
    }
  };
  const resetExportJobs = async () => {
    if (!(await visualConfirm({ title: "تصفير عملية التصدير", message: "سيُلغى التصدير الجاري وتُمسح حالته الحالية.", confirmLabel: "تصفير", tone: "warning" }))) return;
    setError(null);
    setBackupBusy("export");
    try {
      await api("/api/system-backup/export-jobs", { method: "DELETE" });
      setExportJob(null);
      setBackupMessage("تم تصفير عمليات التصدير السابقة بنجاح.");
    } catch (e: any) {
      setError(e.message || "تعذر تصفير المهام");
    } finally {
      setBackupBusy(null);
    }
  };

  const downloadFullBackup = async () => {
    if (!exportJob || exportJob.status !== "ready") return;
    setBackupBusy("export");
    setError(null);
    try {
      const response = await fetch(`/api/system-backup/export-jobs/${encodeURIComponent(exportJob.id)}/download`);
      if (!response.ok) {
        let msg = "تعذر تنزيل ملف النسخة الاحتياطية";
        try { const d = await response.json(); if (d.error) msg = d.error; } catch {}
        throw new Error(msg);
      }
      const blob = await response.blob();
      const filename = exportJob.filename || "schedule-full-backup.json.gz";
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => {
        link.remove();
        window.URL.revokeObjectURL(url);
      }, 1000);
      setBackupMessage(`تم تنزيل ملف النسخة الاحتياطية بنجاح (${(blob.size / 1024 / 1024).toFixed(2)} MB).`);
    } catch (e: any) {
      setError(e.message || "تعذر تنزيل النسخة");
    } finally {
      setBackupBusy(null);
    }
  };
  const driveImportJob = async (jobId: string) => {
    const runner = ++importRunner.current;
    setBackupBusy("import");
    setError(null);
    setImportUploadPercent(0);
    let transportRetries = 0;
    let visibleFailureRetries = 0;
    try {
      let job = await api(`/api/system-backup/import-jobs/${encodeURIComponent(jobId)}`) as ImportJob;
      setImportJob(job);
      while (runner === importRunner.current && job.status !== "ready") {
        try {
          job = await api(`/api/system-backup/import-jobs/${encodeURIComponent(jobId)}/step`, { method: "POST" }) as ImportJob;
          transportRetries = 0;
        } catch (stepError: any) {
          transportRetries += 1;
          if (transportRetries > 12) throw stepError;
          setBackupMessage(`الاتصال تعثر لحظياً — الاستيراد محفوظ عند ${job.completedUnits}/${job.totalUnits} وسأكمل تلقائياً.`);
          await new Promise(resolve => window.setTimeout(resolve, Math.min(5000, 400 * (2 ** (transportRetries - 1)))));
          continue;
        }
        if (runner !== importRunner.current) return;
        setImportJob(job);
        if (job.status === "failed") {
          visibleFailureRetries += 1;
          if (visibleFailureRetries > 8) break;
          setBackupMessage(`توقفت مرحلة مؤقتاً عند ${job.completedUnits}/${job.totalUnits} — أعيدها من نفس النقطة دون إعادة ما اكتمل.`);
          await new Promise(resolve => window.setTimeout(resolve, 900 * visibleFailureRetries));
          continue;
        }
        visibleFailureRetries = 0;
        await new Promise(resolve => window.setTimeout(resolve, 180));
      }
      if (job.status === "ready") {
        setImportJob(job);
        setBackupFile(null);
        setBackupPreview(null);
        setImportUploadPercent(0);
        setBackupMessage(`اكتمل الاستيراد والتحقق من ${job.documentCount.toLocaleString("ar-KW-u-nu-latn")} سجل. نقطة التراجع محفوظة تلقائياً.`);
        const status = await api("/api/system-backup/status") as BackupStatus;
        if (runner === importRunner.current) {
          setBackupStatus(status);
          setExportJob(status.latestExport || null);
          setImportJob(status.latestImport || job);
        }
      } else if (job.status === "failed") {
        setError(job.error || `تعذر إكمال المرحلة ${job.completedUnits + 1}/${job.totalUnits}. التقدم محفوظ ويمكن استكماله.`);
      }
    } catch (e: any) {
      if (runner === importRunner.current) setError(`${e.message || "تعذر متابعة الاستيراد"} — ما اكتمل من المراحل محفوظ.`);
    } finally {
      if (runner === importRunner.current) setBackupBusy(null);
    }
  };

  const previewBackup = async () => {
    if (!backupFile) { setError("اختر ملف النسخة الاحتياطية أولاً"); return; }
    setError(null); setBackupBusy("preview"); setBackupPreview(null); setImportJob(null); setImportUploadPercent(0);
    try { setBackupPreview(await backupRequest("/api/system-backup/preview", backupFile)); }
    catch (e: any) { setError(e.message); }
    finally { setBackupBusy(null); }
  };
  const importFullBackup = async (confirmed = false) => {
    if (importJob && ["running", "failed"].includes(importJob.status)) {
      await driveImportJob(importJob.id);
      return;
    }
    if (!backupFile || !backupPreview) { setError("افحص النسخة أولاً قبل الاستيراد"); return; }
    if (!confirmed) { setBackupConfirm("import"); return; }
    setBackupConfirm(null);
    setBackupMessage("أرفع النسخة مرة واحدة؛ بعد ذلك كل مرحلة تحفظ تقدمها تلقائياً.");
    setError(null);
    setBackupBusy("import");
    setImportUploadPercent(1);
    try {
      const job = await uploadBackupJob(backupFile);
      setImportJob(job);
      setBackupMessage("تم رفع النسخة وفحصها. بدأت نقطة الأمان والاستيراد المتدرج.");
      setBackupBusy(null);
      await driveImportJob(job.id);
    } catch (e: any) {
      setBackupBusy(null);
      setImportUploadPercent(0);
      setError(e.message || "تعذر بدء الاستيراد");
    }
  };
  const resetFullSystem = async (confirmed = false) => {
    if (resetPhrase !== "تصفير النظام") { setError("اكتب «تصفير النظام» حرفياً للتأكيد"); return; }
    if (!confirmed) { setBackupConfirm("reset"); return; }
    setBackupConfirm(null); setBackupMessage(null); setError(null); setBackupBusy("reset");
    try {
      await api("/api/system-backup/reset", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Schedule-Confirm": "FULL-SYSTEM-RESET" },
        body: JSON.stringify({ phrase: resetPhrase }),
      });
      setResetPhrase(""); await refreshBackupStatus();
      setBackupMessage("تم تصفير بيانات العمل. حساب الإدارة الرئيسي ونقطة التراجع ما زالا محفوظين.");
    } catch (e: any) { setError(e.message); }
    finally { setBackupBusy(null); }
  };
  const undoSystemOperation = async (confirmed = false) => {
    if (!backupStatus?.latest) { setError("لا توجد نقطة تراجع متاحة"); return; }
    if (!confirmed) { setBackupConfirm("undo"); return; }
    setBackupConfirm(null); setBackupMessage(null); setError(null); setBackupBusy("undo");
    try {
      await api("/api/system-backup/undo", { method: "POST", headers: { "Content-Type": "application/json", "X-Schedule-Confirm": "FULL-SYSTEM-UNDO" } });
      await refreshBackupStatus();
      setBackupMessage("تم التراجع الكامل بنجاح، وحُفظت الحالة التي غادرتها كنقطة إعادة آمنة.");
    } catch (e: any) { setError(e.message); }
    finally { setBackupBusy(null); }
  };

  const permKey = (p: FormSecurity) =>
      String(p.legacyId ?? `${p.SystemUserId}-${p.FormNameId}`),
    scopeKey = (a: AdCollegeUserAssign, index = 0) =>
      String(
        a.legacyId ??
          `${a.SystemUserId}-${a.AdCollegeId}-${a.AdSectionId}-${index}`,
      );
  const load = async () => {
    setError(null);
    try {
      if (mode === "backup") {
        if (!rootAdmin) throw new Error("هذه الخزنة مخصصة لحساب الإدارة الرئيسي فقط");
        const status = await api("/api/system-backup/status") as BackupStatus;
        setBackupStatus(status);
        setExportJob(status.latestExport || null);
        setImportJob(status.latestImport || null);
        return;
      }
      const base = await Promise.all([
        api(mode === "users" ? "/api/users" : "/api/admin-user-options"),
        api("/api/colleges"),
        api("/api/sections"),
      ]);
      setUsers(sortByName(base[0], (row:any)=>row.Name));
      setColleges(sortByName(base[1], (row:any)=>row.AdCollegeName));
      setSections(sortByName(base[2], (row:any)=>row.AdSectionName));
      if (mode === "users")
        try {
          setInstructors(sortByName(await api("/api/admin-instructor-options"), (row:any)=>row.AdInstructorName));
        } catch {
          setInstructors([]);
        }
      // Note 26: permissions are edited inside the users screen now, so the users
      // mode needs the same forms + grants the standalone screen used to load.
      if (mode === "permissions" || mode === "users") {
        const d = await Promise.all([
          api("/api/permissions/forms"),
          api("/api/permissions"),
        ]);
        setForms(d[0]);
        setPerms(d[1]);
      }
      if (mode === "scopes") setAssigns(await api("/api/user-scopes"));
      if (mode === "audit") setLogs(await api("/api/audit-logs?limit=500"));
    } catch (e: any) {
      setError(e.message);
    }
  };
  useEffect(() => {
    // Stop only the browser-side driver when leaving the screen. The durable
    // server checkpoint remains resumable when the vault is opened again.
    exportRunner.current += 1;
    setBackupBusy(null);
    setPage("index");
    setQuery("");
    setFilterUser(0);
    setError(null);
    setSelectedUserId(null);
    setSelectedPermKey(null);
    setSelectedScopeKey(null);
    setSelectedLogId(null);
    void load();
  }, [mode]);
  useEffect(() => {
    if (mode === "users" && users.length && !selectedUserId)
      setSelectedUserId(users[0].SystemUserId);
  }, [mode, users.length]);
  // Note 26: keep the inline permission grid bound to the selected user, seeded
  // from their current grants (re-seeds after a save reloads `perms`).
  useEffect(() => {
    if (mode !== "users" || !selectedUserId) return;
    setPermUser(selectedUserId);
    setPermSelections(perms.filter((item) => item.SystemUserId === selectedUserId).map((item) => item.FormNameId));
  }, [mode, selectedUserId, perms]);
  useEffect(() => {
    if (mode === "permissions" && perms.length && !selectedPermKey)
      setSelectedPermKey(permKey(perms[0]));
  }, [mode, perms.length]);
  useEffect(() => {
    if (mode === "scopes" && assigns.length && !selectedScopeKey)
      setSelectedScopeKey(scopeKey(assigns[0], 0));
  }, [mode, assigns.length]);
  useEffect(() => {
    if (mode === "audit" && logs.length && selectedLogId == null)
      setSelectedLogId(logs[0].id);
  }, [mode, logs.length]);

  const userById = useMemo(
      () => new Map(users.map((u) => [u.SystemUserId, u])),
      [users],
    ),
    formById = useMemo(
      () => new Map(forms.map((f) => [f.FormNameId, f])),
      [forms],
    ),
    collegeById = useMemo(
      () => new Map(colleges.map((c) => [c.AdCollegeId, c])),
      [colleges],
    ),
    sectionById = useMemo(
      () => new Map(sections.map((s) => [s.AdSectionId, s])),
      [sections],
    );
  const filteredSections = sections.filter(
    (s) => !scopeCollege || s.AdCollegeId === scopeCollege,
  );
  const resetUser = () => {
    setEditUserId(null);
    setName("");
    setLogin("");
    setPassword("");
    setIsAdmin(false);
    setIsActive(true);
    setIsLocked(false);
    setLinkedInstructor(0);
  };
  const back = () => {
    setPage("index");
    setError(null);
    resetUser();
    setOldPerm(null);
    setPermUser(0);
    setPermForm(0);
    setPermSelections([]);
    setScopeUser(0);
    setScopeCollege(0);
    setScopeSection(0);
  };
  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !login.trim() || (!editUserId && !password)) {
      setError("الرجاء إدخال الحقول المطلوبة بالأحمر");
      return;
    }
    try {
      await api(editUserId ? `/api/users/${editUserId}` : "/api/users", {
        method: editUserId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Name: name.trim(),
          SystemUserLogin: login.trim(),
          password: password || undefined,
          IsAdminUser: isAdmin,
          IsActive: isActive,
          IsLocked: isLocked,
          AdInstructorId: linkedInstructor || undefined,
        }),
      });
      const id = editUserId;
      await load();
      back();
      if (id) setSelectedUserId(id);
    } catch (e: any) {
      setError(e.message);
    }
  };
  const editUser = (u: SafeUser) => {
    setEditUserId(u.SystemUserId);
    setName(u.Name);
    setLogin(u.SystemUserLogin);
    // Empty means "leave the current password untouched" — the old value is
    // never sent to the browser, so there is nothing here to prefill.
    setPassword("");
    setIsAdmin(u.IsAdminUser);
    setIsActive(u.IsActive);
    setIsLocked(u.IsLocked);
    setLinkedInstructor(Number(u.AdInstructorId || 0));
    setPage("edit");
  };
  const deleteUser = async (id: number) => {
    // Deletion now removes the account's permissions and departments with it,
    // so the sentence says so — a confirmation that hides half the consequence
    // is not a confirmation.
    const who = users.find(user => user.SystemUserId === id);
    if (!(await visualConfirm({
      title: `حذف «${who?.Name || "المستخدم"}»`,
      message: "ستُحذف معه صلاحياته وارتباطه بالأقسام العلمية، ولا يمكن التراجع.",
      confirmLabel: "حذف المستخدم",
      tone: "danger",
    }))) return;
    try {
      await api(`/api/users/${id}`, { method: "DELETE" });
      setSelectedUserId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const savePermission = async (e?: React.FormEvent) => {
    e?.preventDefault?.();
    setError(null);
    // No lower bound on selections here: clearing every permission is a valid,
    // deliberate action from the inline editor (removes all of the user's grants).
    if (!permUser) {
      setError("اختر المستخدم");
      return;
    }
    try {
      const current = perms.filter((item) => item.SystemUserId === permUser);
      const selected = new Set(permSelections);
      const currentIds = new Set(current.map((item) => item.FormNameId));
      const removals = current.filter((item) => !selected.has(item.FormNameId));
      const additions = permSelections.filter((id) => !currentIds.has(id));
      for (const item of removals) {
        if (item.legacyId)
          await api(`/api/permissions/${item.legacyId}`, { method: "DELETE" });
      }
      for (const formId of additions)
        await api("/api/permissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ SystemUserId: permUser, FormNameId: formId }),
        });
      await load();
      back();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const editPermission = (p: FormSecurity) => {
    setOldPerm(p);
    setPermUser(p.SystemUserId);
    setPermForm(p.FormNameId);
    setPermSelections(
      perms
        .filter((item) => item.SystemUserId === p.SystemUserId)
        .map((item) => item.FormNameId),
    );
    setPage("edit");
  };
  const deletePermission = async (p: FormSecurity) => {
    if (!(await visualConfirm({ title: "حذف الصلاحية", message: "سيُزال هذا الربط من المستخدم فورًا.", confirmLabel: "حذف", tone: "danger", compact: true }))) return;
    try {
      if (!p.legacyId) throw new Error("الصلاحية غير موجودة");
      await api(`/api/permissions/${p.legacyId}`, { method: "DELETE" });
      setSelectedPermKey(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const saveScope = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!scopeUser || !scopeCollege || !scopeSection) {
      setError("الرجاء إدخال الحقول المطلوبة بالأحمر");
      return;
    }
    try {
      await api("/api/user-scopes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          SystemUserId: scopeUser,
          AdCollegeId: scopeCollege,
          AdSectionId: scopeSection,
        }),
      });
      await load();
      back();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const deleteScope = async (a: AdCollegeUserAssign) => {
    if (!(await visualConfirm({ title: "حذف الصلاحية", message: "سيُزال هذا الربط من المستخدم فورًا.", confirmLabel: "حذف", tone: "danger", compact: true }))) return;
    try {
      if (!a.legacyId)
        throw new Error("صلاحية الكلية والقسم العلمي غير موجودة");
      await api(`/api/user-scopes/${a.legacyId}`, { method: "DELETE" });
      setSelectedScopeKey(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Only the open section's records are loaded, so the rail stays purely
  // navigational rather than showing counts it would have to guess at.
  const tabs = [
    permissions.length === 0 || permissions.includes(11)
      ? { value: "users", label: "المستخدمون", icon: <UsersRound /> }
      : null,
    // Note 26: the standalone "الصلاحيات" tab is gone — permissions are edited
    // inline on the users screen, so there is nothing useful to show on its own.
    permissions.length === 0 || permissions.includes(15)
      ? { value: "scopes", label: "النطاقات", icon: <Building2 /> }
      : null,
    { value: "audit", label: "السجل", icon: <ScrollText /> },
    rootAdmin ? { value: "backup", label: "النسخة الاحتياطية", icon: <DatabaseBackup /> } : null,
  ].filter(Boolean) as Array<{ value: string; label: string; icon: React.ReactNode }>;
  // One header line for the whole console: the section rail plus whatever the
  // open section can create. Editor pages get the message only — switching
  // section mid-edit would throw away what was typed.
  const consoleHead = (action?: React.ReactNode) => (
    <>
      <h1 className="sr-only">إدارة النظام</h1>
      <div className="console-head">
        <ConsoleRail
          label="إدارة النظام"
          value={mode}
          onChange={(v) => onNavigate?.(v as AdminMode)}
          options={tabs}
        />
        {action ? <div className="console-action-slot no-print">{action}</div> : null}
      </div>
      {error ? <Notice>{error}</Notice> : null}
    </>
  );

  const usersFormDrawer = (mode === "users" && page !== "index") ? (
      <CatalogFormDrawer onClose={back} label={page === "create" ? "إنشاء مستخدم" : "تعديل المستخدم"}>
        <PageTitle
          eyebrow="إدارة النظام"
          subtitle="يمكن ربطه بأستاذ مقرر"
        >
          {page === "create" ? "إنشاء مستخدم" : "تعديل المستخدم"}
        </PageTitle>
        {error ? <Notice>{error}</Notice> : null}
        <Surface className="form-card smart-form">
          <div className="form-intro">
            <span>
              <UserCog />
            </span>
            <div>
              <strong>حساب مسؤول الجدول</strong>
              <p>دخول · حالة · ربط اختياري</p>
            </div>
          </div>
          <form onSubmit={saveUser}>
            <div className="form-grid">
              <Field label="الاسم" required>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>
              <Field label="اسم المستخدم" required>
                <input
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  required
                />
              </Field>
              <Field
                label="كلمة السر"
                required={!editUserId}
                hint={editUserId ? "اتركها فارغة للإبقاء على كلمة السر الحالية" : undefined}
              >
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  placeholder={editUserId ? "••••••••" : ""}
                  onChange={(e) => setPassword(e.target.value)}
                  required={!editUserId}
                />
              </Field>
              <Field
                label="ربط بلوحة أستاذ المقرر"
                hint="اختياري — لتفعيل اللوحة الشخصية"
              >
                <select
                  value={linkedInstructor || ""}
                  onChange={(e) =>
                    setLinkedInstructor(Number(e.target.value) || 0)
                  }
                >
                  <option value="">بدون ربط</option>
                  {instructors.map((i) => (
                    <option key={i.AdInstructorId} value={i.AdInstructorId}>
                      {i.AdInstructorName} — {i.AdInstructorCivil}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="حالة الحساب">
                <div className="checkbox-row day-pills">
                  <label>
                    <input
                      type="checkbox"
                      checked={isAdmin}
                      onChange={(e) => setIsAdmin(e.target.checked)}
                    />
                    <span>مدير</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                    />
                    <span>فعال</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={isLocked}
                      onChange={(e) => setIsLocked(e.target.checked)}
                    />
                    <span>مقفل</span>
                  </label>
                </div>
              </Field>
            </div>
            <FormActions onBack={back} />
          </form>
        </Surface>
      </CatalogFormDrawer>
    ) : null;
  const permissionsFormDrawer = (mode === "permissions" && page !== "index") ? (
      <CatalogFormDrawer onClose={back} label="صلاحيات المستخدم" wide>
        <PageTitle
          eyebrow="إدارة النظام"
          subtitle="مستخدم واحد · صلاحياته فقط"
        >
          صلاحيات المستخدم
        </PageTitle>
        {error ? <Notice>{error}</Notice> : null}
        <Surface className="form-card smart-form permission-picker-card">
          <div className="form-intro">
            <span><KeyRound /></span>
            <div>
              <strong>اختيار بصري مباشر</strong>
              <p>مستخدم واحد · كل صلاحياته</p>
            </div>
          </div>
          <form onSubmit={savePermission}>
            <Field label="المستخدم" required>
              <select
                value={permUser || ""}
                onChange={(e) => {
                  const id = Number(e.target.value) || 0;
                  setPermUser(id);
                  setPermSelections(
                    perms.filter((item) => item.SystemUserId === id).map((item) => item.FormNameId),
                  );
                }}
                required
              >
                <option value="">اختر المستخدم ...</option>
                {users.map((u) => (
                  <option key={u.SystemUserId} value={u.SystemUserId}>
                    {u.Name} · {u.SystemUserLogin}
                  </option>
                ))}
              </select>
            </Field>
            <div className="permission-choice-grid" aria-label="اختيار الصلاحيات">
              {forms.map((f) => {
                const active = permSelections.includes(f.FormNameId);
                return (
                  <button
                    type="button"
                    key={f.FormNameId}
                    className={active ? "active" : ""}
                    onClick={() =>
                      setPermSelections((current) =>
                        current.includes(f.FormNameId)
                          ? current.filter((id) => id !== f.FormNameId)
                          : [...current, f.FormNameId],
                      )
                    }
                  >
                    <span className="permission-check" aria-hidden="true">{active ? <Check /> : <KeyRound />}</span>
                    <strong>{f.FormName}</strong>
                    <small title="رقم الشاشة في النظام">{f.FormNameId}</small>
                  </button>
                );
              })}
            </div>
            <div className="permission-selection-summary">
              <span><b>{permSelections.length}</b> صلاحية محددة من <b>{forms.length}</b></span>
              {permSelections.length ? (
                <button type="button" onClick={() => setPermSelections([])}>مسح الاختيار</button>
              ) : null}
            </div>
            <FormActions onBack={back} submitDisabled={!permUser || !permSelections.length} />
          </form>
        </Surface>
      </CatalogFormDrawer>
    ) : null;
  const scopesFormDrawer = (mode === "scopes" && page !== "index") ? (
      <CatalogFormDrawer onClose={back} label="إنشاء نطاق أكاديمي">
        <PageTitle
          eyebrow="إدارة النظام"
          subtitle="الكلية والقسم يحددان ما يظهر"
        >
          إنشاء نطاق أكاديمي
        </PageTitle>
        {error ? <Notice>{error}</Notice> : null}
        <Surface className="form-card smart-form">
          <div className="form-intro">
            <span>
              <Landmark />
            </span>
            <div>
              <strong>نطاق المستخدم</strong>
              <p>كلية وقسم مسموحان</p>
            </div>
          </div>
          <form onSubmit={saveScope}>
            <div className="form-grid">
              <Field label="اسم المستخدم" required>
                <select
                  value={scopeUser || ""}
                  onChange={(e) => setScopeUser(Number(e.target.value) || 0)}
                  required
                >
                  <option value="">اختر ...</option>
                  {users.map((u) => (
                    <option key={u.SystemUserId} value={u.SystemUserId}>
                      {u.Name} · {u.SystemUserLogin}
                    </option>
                  ))}
                </select>
                {/* Note 27: show which departments this user is already scoped to,
                    right under their name, before adding another. */}
                {scopeUser ? (
                  <p className="smart-term-hint scope-current-hint">
                    <Building2 aria-hidden="true" />
                    {(() => {
                      const mine = assigns.filter((a) => a.SystemUserId === scopeUser);
                      if (!mine.length) return "لا أقسام مسندة لهذا المستخدم بعد.";
                      const names = [...new Set(mine.map((a) => sectionById.get(a.AdSectionId)?.AdSectionName).filter(Boolean))];
                      return `مسند حالياً إلى: ${names.join(" · ")}`;
                    })()}
                  </p>
                ) : null}
              </Field>
              <Field label="اسم الكلية" required>
                <select
                  value={scopeCollege || ""}
                  onChange={(e) => {
                    setScopeCollege(Number(e.target.value) || 0);
                    setScopeSection(0);
                  }}
                  required
                >
                  <option value="">اختر ...</option>
                  {colleges.map((c) => (
                    <option key={c.AdCollegeId} value={c.AdCollegeId}>
                      {c.AdCollegeName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="اسم القسم العلمي" required>
                <select
                  value={scopeSection || ""}
                  disabled={!scopeCollege}
                  onChange={(e) => setScopeSection(Number(e.target.value) || 0)}
                  required
                >
                  <option value="">اختر ...</option>
                  {filteredSections.map((s) => (
                    <option key={s.AdSectionId} value={s.AdSectionId}>
                      {s.AdSectionName}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <FormActions onBack={back} />
          </form>
        </Surface>
      </CatalogFormDrawer>
    ) : null;

  if (mode === "backup") {
    const point = backupStatus?.latest || null;
    const exportInProgress = Boolean(exportJob && ["queued", "running", "finalizing"].includes(exportJob.status));
    const importInProgress = Boolean(importJob && importJob.status === "running");
    const importResumable = Boolean(importJob && ["running", "failed"].includes(importJob.status));
    const vaultLocked = Boolean(backupBusy) || exportInProgress || importInProgress;
    const exportPercent = exportJob?.status === "ready" ? 100
      : exportJob?.status === "finalizing" ? 99
      : exportJob?.totalUnits ? Math.max(2, Math.min(97, Math.round((exportJob.completedUnits / exportJob.totalUnits) * 97)))
      : exportJob ? 2 : 0;
    const exportStatusLabel = exportJob?.status === "ready" ? "جاهزة للتنزيل"
      : exportJob?.status === "failed" ? `توقفت مؤقتًا (${exportJob.error || "خطأ غير معروف"})`
      : exportJob?.status === "finalizing" ? "أبني الملف النهائي وأتحقق من SHA-256"
      : exportJob ? "أجمع البيانات وأحفظ نقاط التقدم" : "لم يبدأ التصدير بعد";
    const importPercent = importJob?.status === "ready" ? 100
      : importJob?.totalUnits ? Math.max(0, Math.min(99, Math.round((importJob.completedUnits / importJob.totalUnits) * 100)))
      : importUploadPercent;
    const importStatusLabel = importJob?.status === "ready" ? "اكتمل الاستيراد"
      : importJob?.status === "failed" ? "توقفت مرحلة — التقدم محفوظ"
      : importJob?.phase === "safety" ? "نقطة أمان قبل الاستيراد"
      : importJob?.phase === "apply" ? "استعادة البيانات"
      : importJob?.phase === "finalizing" ? "التحقق النهائي"
      : backupBusy === "import" && importUploadPercent >= 100 ? "الرفع اكتمل · أفحص وأجهز النسخة"
      : backupBusy === "import" && importUploadPercent ? `رفع النسخة ${importUploadPercent}%` : "جاهز للاستيراد";
    const previewCollections: Array<[string, number]> = backupPreview
      ? Object.entries(backupPreview.collectionCounts)
          .map(([name, count]) => [name, Number(count) || 0] as [string, number])
          .sort((a, b) => b[1] - a[1])
      : [];
    return (
      <div className="content-stack admin-page system-vault-page visual-minimal">
        {consoleHead()}
        <PageTitle eyebrow="إدارة النظام" subtitle="حساب الإدارة الرئيسي فقط">خزنة النظام</PageTitle>
        {backupMessage ? <Notice type="success">{backupMessage}</Notice> : null}
        {error ? <Notice>{error}</Notice> : null}
        <Surface className="system-vault-hero">
          <div className="system-vault-seal"><ShieldCheck /></div>
          <div>
            <span className="surface-kicker">نسخة سيادية كاملة</span>
            <h2>كل بيانات النظام الدائمة في ملف واحد</h2>
            <p>كل سجل دائم في قاعدة النظام يُكتشف ويُضم تلقائيًا: المستخدمون وكلمات المرور المشفّرة، الصلاحيات، الكليات، الأقسام، المقررات، الأساتذة، القاعات، الفصول، الجداول، النسخ الزمنية، المسودات، النشر، الاستبيانات، السجل، الأرشيف والبيانات الوصفية — بما فيها أي مجموعات دائمة تُضاف لاحقًا.</p>
          </div>
          <div className="system-vault-state">
            <span>{backupStatus?.data?.real ? "البيانات الحقيقية" : "وضع محلي"}</span>
            <strong>{backupStatus?.data?.mode || "—"}</strong>
          </div>
        </Surface>

        <div className="system-vault-grid">
          <Surface className="system-vault-action vault-export">
            <span className="vault-action-icon"><Download /></span>
            <div><small>01</small><h3>تصدير كامل</h3><p>تصدير متدرج وآمن: يحفظ تقدمه بعد كل دفعة، ثم يبني ملف JSON مضغوطًا مع SHA-256 دون إبقاء المتصفح منتظرًا لطلب واحد طويل.</p></div>
            {exportJob ? (
              <div className={`vault-export-progress status-${exportJob.status}`}>
                <div className="vault-export-progress-head">
                  <span>{exportStatusLabel}</span>
                  <strong>{exportPercent}%</strong>
                </div>
                <div className="vault-export-progress-track" aria-label={`تقدم التصدير ${exportPercent}%`}>
                  <i style={{ width: `${exportPercent}%` }} />
                </div>
                <div className="vault-export-progress-meta">
                  <span><b>{exportJob.documentCount.toLocaleString("ar-KW-u-nu-latn")}</b> سجل جُمِع</span>
                  <span><b>{exportJob.completedUnits.toLocaleString("ar-KW-u-nu-latn")}</b> / {exportJob.totalUnits.toLocaleString("ar-KW-u-nu-latn")} مرحلة</span>
                  {exportJob.sizeBytes ? <span><b>{(exportJob.sizeBytes / 1024 / 1024).toFixed(exportJob.sizeBytes > 10 * 1024 * 1024 ? 1 : 2)}</b> MB</span> : null}
                </div>
                {exportJob.current && exportJob.status !== "ready" ? <small className="vault-export-current" dir="ltr">{exportJob.current}</small> : null}
                {exportJob.status === "ready" && exportJob.sha256 ? <code className="vault-export-ready-hash" dir="ltr">SHA-256 · {exportJob.sha256}</code> : null}
                {exportJob.status === "failed" && exportJob.error ? <p className="vault-export-error">{exportJob.error}</p> : null}
              </div>
            ) : null}
            {exportJob?.status === "ready" ? (
              <div className="vault-inline-actions">
                <PrimaryButton type="button" disabled={Boolean(backupBusy) || importInProgress} onClick={downloadFullBackup}>
                  <Download /> تنزيل النسخة
                </PrimaryButton>
                <SecondaryButton type="button" disabled={Boolean(backupBusy) || importInProgress} onClick={() => void exportFullBackup(true)}>
                  <DatabaseBackup /> إنشاء نسخة أحدث
                </SecondaryButton>
              </div>
            ) : exportJob?.status === "failed" ? (
              <div className="vault-inline-actions">
                <PrimaryButton type="button" data-guide-ignore="إجراء تصدير إداري حساس داخل خزنة النظام" disabled={importInProgress || Boolean(backupBusy)} onClick={() => void exportFullBackup(false)}>
                  <DatabaseBackup /> {backupBusy === "export" ? `أتابع التصدير… (${exportJob.documentCount} سجل)` : `استكمال من ${exportJob.completedUnits}/${exportJob.totalUnits}`}
                </PrimaryButton>
                <SecondaryButton type="button" data-guide-ignore="إجراء نسخ احتياطي إداري حساس له مسار تأكيد مستقل" disabled={importInProgress || Boolean(backupBusy)} onClick={() => void exportFullBackup(true)}>
                  <RefreshCw /> بدء تصدير جديد
                </SecondaryButton>
                <SecondaryButton type="button" data-guide-ignore="إدارة مهمة تصدير إدارية وليست ميزة مستقلة للمرشد" disabled={importInProgress || Boolean(backupBusy)} onClick={resetExportJobs} title="إلغاء التصدير الحالي وتصفيره">
                  تصفير المهام
                </SecondaryButton>
              </div>
            ) : (
              <div className="vault-inline-actions">
                <PrimaryButton type="button" data-guide-ignore="إجراء تصدير إداري حساس داخل خزنة النظام" disabled={importInProgress || Boolean(backupBusy)} onClick={() => void exportFullBackup(false)}>
                  <DatabaseBackup /> {backupBusy === "export" ? `أتابع التصدير… (${exportJob?.documentCount || 0} سجل)` : exportInProgress ? "استكمال التصدير" : "تصدير النظام كاملًا"}
                </PrimaryButton>
                {exportJob && exportJob.status !== "ready" && (
                  <SecondaryButton type="button" disabled={importInProgress || Boolean(backupBusy)} onClick={resetExportJobs}>
                    تصفير المهام العالقة
                  </SecondaryButton>
                )}
              </div>
            )}
          </Surface>

          <Surface className="system-vault-action vault-import">
            <span className="vault-action-icon"><Upload /></span>
            <div><small>02</small><h3>استيراد كامل</h3><p>يفحص الملف والبصمة أولًا، ثم يصنع نقطة أمان كاملة ويستعيد كل مجموعة على مراحل محفوظة مع نسبة تقدم حقيقية.</p></div>
            <label className={`vault-file-picker ${importResumable ? "disabled" : ""}`}>
              <input type="file" disabled={importResumable} accept=".gz,.json,application/gzip,application/json,application/octet-stream" onChange={(event) => { setBackupFile(event.target.files?.[0] || null); setBackupPreview(null); setImportJob(null); setImportUploadPercent(0); setError(null); }} />
              <FileCheck2 /><span>{backupFile ? backupFile.name : importResumable ? "النسخة مرفوعة ومحفوظة — أكمل الاستيراد" : "اختر ملف النسخة"}</span>
            </label>
            {(importJob || (backupBusy === "import" && importUploadPercent > 0)) ? (
              <div className={`vault-export-progress vault-import-progress status-${importJob?.status || "running"}`}>
                <div className="vault-export-progress-head">
                  <span>{importStatusLabel}</span>
                  <strong>{importPercent}%</strong>
                </div>
                <div className="vault-export-progress-track" aria-label={`تقدم الاستيراد ${importPercent}%`}>
                  <i style={{ width: `${importPercent}%` }} />
                </div>
                <div className="vault-export-progress-meta">
                  {importJob ? <span><b>{importJob.completedUnits.toLocaleString("ar-KW-u-nu-latn")}</b> / {importJob.totalUnits.toLocaleString("ar-KW-u-nu-latn")} مرحلة</span> : <span><b>{importUploadPercent}%</b> رفع الملف</span>}
                  {importJob ? <span><b>{importJob.documentCount.toLocaleString("ar-KW-u-nu-latn")}</b> سجل في النسخة</span> : null}
                </div>
                {importJob?.current ? <small className="vault-export-current">{importJob.current}</small> : null}
                {importJob?.status === "failed" && importJob.error ? <p className="vault-export-error">{importJob.error}</p> : null}
              </div>
            ) : null}

            {backupPreview ? (
              <div className="vault-preview-card vault-preview-compact">
                <div className="vault-preview-head">
                  <FileCheck2 />
                  <div><strong>النسخة سليمة وجاهزة</strong><span>{new Date(backupPreview.createdAt).toLocaleString("ar-KW-u-nu-latn")} · {backupPreview.documentCount.toLocaleString("ar-KW-u-nu-latn")} سجل</span></div>
                </div>
                <div className="vault-preview-summary" aria-label="ملخص النسخة">
                  <span><b>{backupPreview.documentCount.toLocaleString("ar-KW-u-nu-latn")}</b><small>سجل</small></span>
                  <span><b>{previewCollections.length.toLocaleString("ar-KW-u-nu-latn")}</b><small>مجموعة</small></span>
                  <span><b>{backupPreview.storage === "firestore" ? "Firestore" : "محلي"}</b><small>المصدر</small></span>
                </div>
                <details className="vault-preview-details">
                  <summary>التفاصيل التقنية</summary>
                  <div className="vault-preview-hash"><span>SHA-256</span><code dir="ltr">{backupPreview.sha256}</code></div>
                  <div className="vault-counts">
                    {previewCollections.map(([name, count]) => {
                      const meta = collectionMeta[name];
                      const label = meta ? meta.label : name;
                      const Icon = meta ? meta.icon : DatabaseBackup;
                      return <span key={name} title={name}><Icon size={14} /><b>{count.toLocaleString("ar-KW-u-nu-latn")}</b>{label}</span>;
                    })}
                  </div>
                </details>
              </div>
            ) : null}

            <div className="vault-inline-actions">
              <SecondaryButton type="button" disabled={!backupFile || Boolean(backupBusy) || exportInProgress || importResumable} onClick={() => void previewBackup()}>{backupBusy === "preview" ? "أفحص…" : "فحص النسخة"}</SecondaryButton>
              <PrimaryButton type="button" data-guide-ignore="إجراء استيراد إداري حساس وله معاينة وتأكيد مستقلان" disabled={Boolean(backupBusy) || exportInProgress || (!importResumable && !backupPreview)} onClick={() => void importFullBackup()}>{backupBusy === "import" ? "أتابع الاستيراد…" : importResumable ? "استكمال الاستيراد" : "استيراد"}</PrimaryButton>
            </div>
          </Surface>

          <Surface className="system-vault-action vault-reset">
            <span className="vault-action-icon"><Eraser /></span>
            <div><small>03</small><h3>تصفير النظام</h3><p>يمسح بيانات العمل كاملة ويُبقي حساب الإدارة الرئيسي فقط كي لا تفقد باب التراجع.</p></div>
            <input className="vault-confirm-input" value={resetPhrase} onChange={(event) => setResetPhrase(event.target.value)} placeholder="اكتب: تصفير النظام" autoComplete="off" />
            <SecondaryButton type="button" disabled={resetPhrase !== "تصفير النظام" || vaultLocked} onClick={() => void resetFullSystem()}>
              <Eraser /> {backupBusy === "reset" ? "أصنع نقطة أمان ثم أصفّر…" : "تصفير"}
            </SecondaryButton>
          </Surface>

          <Surface className="system-vault-action vault-undo">
            <span className="vault-action-icon"><ArchiveRestore /></span>
            <div><small>04</small><h3>تراجع كامل</h3><p>{point ? `آخر نقطة أمان: ${point.action}` : "لا توجد عملية مدمرة محفوظة للتراجع عنها."}</p></div>
            {point ? <div className="vault-restore-meta"><strong>{new Date(point.createdAt).toLocaleString("ar-KW-u-nu-latn")}</strong><span>{point.documentCount.toLocaleString("ar-KW-u-nu-latn")} سجل</span></div> : null}
            <PrimaryButton type="button" disabled={!point || vaultLocked} onClick={() => void undoSystemOperation()}>
              <ArchiveRestore /> {backupBusy === "undo" ? "أعيد الحالة…" : "تراجع عن آخر عملية"}
            </PrimaryButton>
          </Surface>
        </div>

        <Surface className="vault-safety-note">
          <ShieldCheck /><div><strong>شبكة الأمان تلقائية</strong><p>قبل الاستيراد أو التصفير تُحفظ نسخة داخلية كاملة يمكن الرجوع إليها. يحتفظ النظام بآخر 8 نقاط أمان فقط. جلسات الدخول النشطة لا تدخل ملف التصدير لأنها مفاتيح وصول مؤقتة وليست بيانات أكاديمية دائمة.</p></div>
        </Surface>

        {backupStatus?.restorePoints?.length ? (
          <Surface className="vault-history">
            <header><ArchiveRestore /><strong>نقاط الأمان الأخيرة</strong></header>
            {backupStatus.restorePoints.slice(0, 6).map(item => (
              <article key={item.id} className={item.consumedAt ? "consumed" : ""}>
                <div><strong>{item.action}</strong><span>{new Date(item.createdAt).toLocaleString("ar-KW-u-nu-latn")}</span></div>
                <b>{item.documentCount.toLocaleString("ar-KW-u-nu-latn")}</b>
              </article>
            ))}
          </Surface>
        ) : null}

        {backupConfirm ? (
          <div className="vault-confirm-backdrop" role="dialog" aria-modal="true" aria-label="تأكيد عملية خزنة النظام" onMouseDown={(event) => { if (event.target === event.currentTarget && !backupBusy) setBackupConfirm(null); }}>
            <Surface className={`vault-confirm-sheet ${backupConfirm === "reset" ? "danger" : ""}`}>
              <span className="vault-confirm-seal">{backupConfirm === "reset" ? <Eraser /> : backupConfirm === "undo" ? <ArchiveRestore /> : <ShieldCheck />}</span>
              <div className="vault-confirm-copy">
                <small>تأكيد سيادي · حساب الإدارة الرئيسي</small>
                <h3>{backupConfirm === "import" ? "استبدال النظام بالنسخة المفحوصة؟" : backupConfirm === "reset" ? "تصفير بيانات العمل؟" : "العودة إلى نقطة الأمان؟"}</h3>
                <p>{backupConfirm === "import"
                  ? `النسخة مؤرخة ${backupPreview ? new Date(backupPreview.createdAt).toLocaleString("ar-KW-u-nu-latn") : "—"}. سيُحفظ النظام الحالي كاملًا أولًا، وإذا فشلت أي خطوة يعيده الخادم تلقائيًا.`
                  : backupConfirm === "reset"
                    ? "سيُحفظ النظام كاملًا أولًا ثم تُمسح بيانات العمل، مع إبقاء حساب الإدارة الرئيسي وباب التراجع فقط. إذا فشلت العملية يعود النظام تلقائيًا إلى حالته السابقة."
                    : `سيعود النظام إلى «${backupStatus?.latest?.action || "نقطة الأمان"}»، وسيحفظ الحالة الحالية كنقطة إعادة قبل التغيير.`}</p>
              </div>
              <div className="vault-confirm-actions">
                <SecondaryButton type="button" disabled={Boolean(backupBusy)} onClick={() => setBackupConfirm(null)}>إلغاء</SecondaryButton>
                <PrimaryButton type="button" data-guide-ignore="تأكيد سيادي حساس لا ينفذه المرشد تلقائيًا" disabled={Boolean(backupBusy)} onClick={() => {
                  if (backupConfirm === "import") void importFullBackup(true);
                  else if (backupConfirm === "reset") void resetFullSystem(true);
                  else void undoSystemOperation(true);
                }}>{backupConfirm === "import" ? "استيراد النسخة" : backupConfirm === "reset" ? "تصفير الآن" : "تنفيذ التراجع"}</PrimaryButton>
              </div>
            </Surface>
          </div>
        ) : null}
      </div>
    );
  }

  if (mode === "users") {
    const filtered = users.filter((u) =>
        `${u.Name} ${u.SystemUserLogin}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
      selected = users.find((u) => u.SystemUserId === selectedUserId) || null,
      linked = instructors.find(
        (x) => x.AdInstructorId === selected?.AdInstructorId,
      );
    return (
      <>
      <div className="content-stack admin-page master-detail-page visual-minimal">
        {consoleHead(
          <>
          <AddButton
            onClick={() => {
              resetUser();
              setPage("create");
            }}
          >
            مستخدم جديد
          </AddButton>
          </>,
        )}
        <div className="admin-quiet-summary">
          <span>
            <UsersRound />
            <b>{users.length}</b> مستخدم
          </span>
          <span>
            <ShieldCheck />
            <b>{users.filter((u) => u.IsAdminUser).length}</b> مدير
          </span>
          <span>
            <UserCog />
            <b>{users.filter((u) => u.AdInstructorId).length}</b> لوحة شخصية
          </span>
        </div>
        <div className="master-detail-shell">
          <section className="master-pane">
            <header>
              <SearchBox value={query} onChange={setQuery} placeholder="الاسم أو اسم المستخدم" />
              <span>{filtered.length}</span>
            </header>
            <div className="master-list">
              {filtered.map((u) => (
                <button
                  type="button"
                  key={u.SystemUserId}
                  className={
                    selected?.SystemUserId === u.SystemUserId ? "active" : ""
                  }
                  onClick={() => setSelectedUserId(u.SystemUserId)}
                >
                  <span className="master-avatar">
                    {u.Name.trim().charAt(0) || "د"}
                  </span>
                  <div>
                    <strong>{u.Name}</strong>
                    <small>@{u.SystemUserLogin}</small>
                  </div>
                  <Badge
                    tone={
                      u.IsLocked ? "danger" : u.IsActive ? "success" : "warning"
                    }
                  >
                    {u.IsLocked ? "مقفل" : u.IsActive ? "فعال" : "متوقف"}
                  </Badge>
                  <ChevronLeft />
                </button>
              ))}
            </div>
          </section>
          <aside className="inspector-pane">
            {selected ? (
              <>
                <div className="inspector-hero">
                  <span className="inspector-avatar">
                    {selected.Name.trim().charAt(0) || "د"}
                  </span>
                  <div>
                    <small>حساب مسؤول جدول</small>
                    <h2>{selected.Name}</h2>
                    <p>@{selected.SystemUserLogin}</p>
                  </div>
                </div>
                <div className="inspector-status">
                  <Badge tone={selected.IsAdminUser ? "info" : "neutral"}>
                    {selected.IsAdminUser ? "مدير" : "مستخدم"}
                  </Badge>
                  <Badge
                    tone={
                      selected.IsLocked
                        ? "danger"
                        : selected.IsActive
                          ? "success"
                          : "warning"
                    }
                  >
                    {selected.IsLocked
                      ? "مقفل"
                      : selected.IsActive
                        ? "فعال"
                        : "غير فعال"}
                  </Badge>
                </div>
                <div className="inspector-facts">
                  <article>
                    <span>اسم المستخدم</span>
                    <b dir="ltr">{selected.SystemUserLogin}</b>
                  </article>
                  {/* A password is a state to confirm, never a value to read:
                      the vault stays on the server, and this row answers the
                      only question an administrator has — is one set at all? */}
                  <article>
                    <span>كلمة السر</span>
                    <b className={selected.HasPassword === false ? "fact-warn" : ""}>
                      {selected.HasPassword === false ? "غير مضبوطة" : "محفوظة ومشفّرة"}
                    </b>
                  </article>
                  <article>
                    <span>لوحة الأستاذ</span>
                    <b>{linked?.AdInstructorName || "غير مربوطة"}</b>
                  </article>
                  <article>
                    <span>رقم الحساب</span>
                    <b>{selected.SystemUserId}</b>
                  </article>
                </div>
                {/* Note 26: the permission editor lives here now — pick a user on the
                    left and set exactly what they can reach, with no separate tab. */}
                <section className="inspector-permissions" aria-label="صلاحيات المستخدم">
                  <div className="inspector-perm-head">
                    <span className="surface-kicker"><KeyRound aria-hidden="true" /> صلاحيات الوصول</span>
                    <b>{permSelections.length} من {forms.length || "…"}</b>
                  </div>
                  {forms.length ? (
                    <>
                      <div className="permission-choice-grid" aria-label="اختيار صلاحيات المستخدم">
                        {forms.map((f) => {
                          const active = permSelections.includes(f.FormNameId);
                          return (
                            <button
                              type="button"
                              key={f.FormNameId}
                              className={active ? "active" : ""}
                              aria-pressed={active}
                              onClick={() =>
                                setPermSelections((current) =>
                                  current.includes(f.FormNameId)
                                    ? current.filter((id) => id !== f.FormNameId)
                                    : [...current, f.FormNameId],
                                )
                              }
                            >
                              <span className="permission-check" aria-hidden="true">{active ? <Check /> : <KeyRound />}</span>
                              <strong>{f.FormName}</strong>
                              <small title="رقم الشاشة في النظام">{f.FormNameId}</small>
                            </button>
                          );
                        })}
                      </div>
                      <div className="inspector-perm-actions">
                        <PrimaryButton onClick={() => savePermission()}>حفظ الصلاحيات</PrimaryButton>
                        {permSelections.length ? (
                          <SecondaryButton onClick={() => setPermSelections([])}>مسح الاختيار</SecondaryButton>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <p className="soft-copy">جارٍ تحميل الصلاحيات…</p>
                  )}
                </section>
                <div className="inspector-actions">
                  <PrimaryButton onClick={() => editUser(selected)}>
                    تعديل الحساب
                  </PrimaryButton>
                  <SecondaryButton
                    data-guide-ignore="إجراء حذف حساس داخل شاشة الإدارة ويستخدم تأكيد الشاشة نفسه"
                    className="danger-action"
                    onClick={() => deleteUser(selected.SystemUserId)}
                  >
                    <Trash2 /> حذف
                  </SecondaryButton>
                </div>
              </>
            ) : (
              <EmptyInspector icon={<UsersRound />} title="اختر مستخدماً" />
            )}
          </aside>
        </div>
      </div>
      {usersFormDrawer}
      </>
    );
  }

  if (mode === "permissions") {
    const filtered = perms.filter(
      (p) =>
        (!filterUser || p.SystemUserId === filterUser) &&
        `${userById.get(p.SystemUserId)?.Name || ""} ${formById.get(p.FormNameId)?.FormName || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
    const selected =
      filtered.find((p) => permKey(p) === selectedPermKey) ||
      perms.find((p) => permKey(p) === selectedPermKey) ||
      null;
    return (
      <>
      <div className="content-stack admin-page master-detail-page visual-minimal">
        {consoleHead(
          <AddButton
            onClick={() => {
              setOldPerm(null);
              setPermUser(0);
              setPermForm(0);
              setPermSelections([]);
              setPage("create");
            }}
          >
            صلاحية جديدة
          </AddButton>,
        )}
        <div className="master-detail-shell">
          <section className="master-pane">
            <header className="master-filter-stack">
              <SearchBox value={query} onChange={setQuery} placeholder="بحث بالمستخدم أو الوظيفة" />
              <select
                value={filterUser || ""}
                onChange={(e) => setFilterUser(Number(e.target.value) || 0)}
              >
                <option value="">كل المستخدمين</option>
                {users.map((u) => (
                  <option key={u.SystemUserId} value={u.SystemUserId}>
                    {u.Name}
                  </option>
                ))}
              </select>
            </header>
            <div className="master-list permission-master">
              {filtered.map((p) => (
                <button
                  type="button"
                  key={permKey(p)}
                  className={
                    selected && permKey(selected) === permKey(p) ? "active" : ""
                  }
                  onClick={() => setSelectedPermKey(permKey(p))}
                >
                  <span className="master-symbol">
                    <KeyRound />
                  </span>
                  <div>
                    <strong>
                      {formById.get(p.FormNameId)?.FormName || "صلاحية"}
                    </strong>
                    <small>{userById.get(p.SystemUserId)?.Name || ""}</small>
                  </div>
                  <ChevronLeft />
                </button>
              ))}
            </div>
          </section>
          <aside className="inspector-pane">
            {selected ? (
              <>
                <div className="inspector-hero icon">
                  <span className="inspector-avatar">
                    <KeyRound />
                  </span>
                  <div>
                    <small>صلاحية وظيفة</small>
                    <h2>
                      {formById.get(selected.FormNameId)?.FormName || "صلاحية"}
                    </h2>
                    <p>{userById.get(selected.SystemUserId)?.Name || ""}</p>
                  </div>
                </div>
                <div className="inspector-facts">
                  <article>
                    <span>المستخدم</span>
                    <b>
                      {userById.get(selected.SystemUserId)?.SystemUserLogin ||
                        "—"}
                    </b>
                  </article>
                  <article>
                    <span>رقم الصلاحية</span>
                    <b>{selected.FormNameId}</b>
                  </article>
                  <article>
                    <span>المعرّف</span>
                    <b>{selected.legacyId || "—"}</b>
                  </article>
                </div>
                <div className="inspector-actions">
                  <PrimaryButton onClick={() => editPermission(selected)}>
                    تعديل
                  </PrimaryButton>
                  <SecondaryButton
                    data-guide-ignore="إجراء حذف حساس داخل شاشة الإدارة ويستخدم تأكيد الشاشة نفسه"
                    className="danger-action"
                    onClick={() => deletePermission(selected)}
                  >
                    <Trash2 /> حذف
                  </SecondaryButton>
                </div>
              </>
            ) : (
              <EmptyInspector icon={<KeyRound />} title="اختر صلاحية" />
            )}
          </aside>
        </div>
      </div>
      {permissionsFormDrawer}
      </>
    );
  }

  if (mode === "scopes") {
    const filtered = assigns.filter(
      (a) =>
        (!filterUser || a.SystemUserId === filterUser) &&
        `${userById.get(a.SystemUserId)?.Name || ""} ${collegeById.get(a.AdCollegeId)?.AdCollegeName || ""} ${sectionById.get(a.AdSectionId)?.AdSectionName || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
    const selectedIndex = assigns.findIndex(
        (a, i) => scopeKey(a, i) === selectedScopeKey,
      ),
      selected = selectedIndex >= 0 ? assigns[selectedIndex] : null;
    return (
      <>
      <div className="content-stack admin-page master-detail-page visual-minimal">
        {consoleHead(
          <AddButton
            onClick={() => {
              setScopeUser(0);
              setScopeCollege(0);
              setScopeSection(0);
              setPage("create");
            }}
          >
            نطاق جديد
          </AddButton>,
        )}
        <div className="master-detail-shell">
          <section className="master-pane">
            <header className="master-filter-stack">
              <SearchBox value={query} onChange={setQuery} placeholder="بحث بالمستخدم أو القسم" />
              <select
                value={filterUser || ""}
                onChange={(e) => setFilterUser(Number(e.target.value) || 0)}
              >
                <option value="">كل المستخدمين</option>
                {users.map((u) => (
                  <option key={u.SystemUserId} value={u.SystemUserId}>
                    {u.Name}
                  </option>
                ))}
              </select>
            </header>
            <div className="master-list">
              {filtered.map((a, i) => {
                const key = scopeKey(a, assigns.indexOf(a));
                return (
                  <button
                    type="button"
                    key={key}
                    className={selectedScopeKey === key ? "active" : ""}
                    onClick={() => setSelectedScopeKey(key)}
                  >
                    <span className="master-symbol">
                      <Landmark />
                    </span>
                    <div>
                      <strong>
                        {sectionById.get(a.AdSectionId)?.AdSectionName || "قسم"}
                      </strong>
                      <small>{userById.get(a.SystemUserId)?.Name || ""}</small>
                    </div>
                    <ChevronLeft />
                  </button>
                );
              })}
            </div>
          </section>
          <aside className="inspector-pane">
            {selected ? (
              <>
                <div className="inspector-hero icon">
                  <span className="inspector-avatar">
                    <Landmark />
                  </span>
                  <div>
                    <small>نطاق أكاديمي</small>
                    <h2>
                      {sectionById.get(selected.AdSectionId)?.AdSectionName ||
                        "القسم"}
                    </h2>
                    <p>
                      {collegeById.get(selected.AdCollegeId)?.AdCollegeName ||
                        ""}
                    </p>
                  </div>
                </div>
                <div className="inspector-facts">
                  <article>
                    <span>المستخدم</span>
                    <b>{userById.get(selected.SystemUserId)?.Name || "—"}</b>
                  </article>
                  <article>
                    <span>اسم المستخدم</span>
                    <b dir="ltr">
                      {userById.get(selected.SystemUserId)?.SystemUserLogin ||
                        "—"}
                    </b>
                  </article>
                  <article>
                    <span>الكلية</span>
                    <b>
                      {collegeById.get(selected.AdCollegeId)?.AdCollegeName ||
                        "—"}
                    </b>
                  </article>
                  <article>
                    <span>القسم العلمي</span>
                    <b>
                      {sectionById.get(selected.AdSectionId)?.AdSectionName ||
                        "—"}
                    </b>
                  </article>
                </div>
                <div className="inspector-actions">
                  <SecondaryButton
                    data-guide-ignore="إجراء حذف حساس داخل شاشة الإدارة ويستخدم تأكيد الشاشة نفسه"
                    className="danger-action"
                    onClick={() => deleteScope(selected)}
                  >
                    <Trash2 /> حذف النطاق
                  </SecondaryButton>
                </div>
              </>
            ) : (
              <EmptyInspector icon={<Landmark />} title="اختر نطاقاً" />
            )}
          </aside>
        </div>
      </div>
      {scopesFormDrawer}
      </>
    );
  }

  /* The change sentence is searchable too, so «القاعة» finds every room move,
     and the user filter matches the sibling permission and scope screens. */
  const filteredLogs = logs.filter((x) =>
      (!filterUser || Number(x.SystemUserId) === filterUser) &&
      `${x.userName} ${x.action} ${x.entity} ${x.path} ${x.method} ${x.entityId || ""} ${x.changes || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
    selectedLog =
      logs.find((x) => String(x.id) === String(selectedLogId)) || null;
  return (
    <div className="content-stack admin-page master-detail-page visual-minimal">
      {consoleHead(
        <SecondaryButton type="button" onClick={() => void load()}>
          تحديث السجل
        </SecondaryButton>,
      )}
      <div className="master-detail-shell audit-master-detail">
        <section className="master-pane">
          <header>
            <SearchBox value={query} onChange={setQuery} placeholder="المستخدم، العملية أو ما تغيّر" />
            <select
              className="audit-user-filter"
              value={filterUser || ""}
              onChange={(e) => setFilterUser(Number(e.target.value) || 0)}
              aria-label="تصفية السجل بالمستخدم"
            >
              <option value="">كل المستخدمين</option>
              {users.map((u) => (
                <option key={u.SystemUserId} value={u.SystemUserId}>{u.Name}</option>
              ))}
            </select>
            <span>{filteredLogs.length}</span>
          </header>
          <div className="master-list audit-master">
            {filteredLogs.map((x) => (
              <button
                type="button"
                data-guide-ignore="فتح سجل تدقيق للقراءة فقط وليس إجراء التغيير المسجل"
                key={x.id}
                className={
                  String(selectedLogId) === String(x.id) ? "active" : ""
                }
                onClick={() => setSelectedLogId(x.id)}
              >
                <span className="master-symbol">
                  <Activity />
                </span>
                <div>
                  <strong>
                    {x.action} · {x.entity}
                  </strong>
                  {/* What changed, in the row itself — the log is read by
                      scanning, and the answer should not need a second click. */}
                  {x.changes ? <em className="audit-change">{x.changes}</em> : null}
                  <small>
                    {x.userName} ·{" "}
                    {new Date(x.timestamp).toLocaleString("ar-KW-u-nu-latn")}
                  </small>
                </div>
                <Badge
                  tone={
                    x.action === "حذف"
                      ? "danger"
                      : x.action === "إضافة"
                        ? "success"
                        : "info"
                  }
                >
                  {x.status}
                </Badge>
                <ChevronLeft />
              </button>
            ))}
          </div>
        </section>
        <aside className="inspector-pane">
          {selectedLog ? (
            <>
              <div className="inspector-hero icon">
                <span className="inspector-avatar">
                  <Activity />
                </span>
                <div>
                  <small>عملية مسجلة</small>
                  <h2>
                    {selectedLog.action} · {selectedLog.entity}
                  </h2>
                  <p>
                    {new Date(selectedLog.timestamp).toLocaleString("ar-KW-u-nu-latn")}
                  </p>
                </div>
              </div>
              {selectedLog.changes ? (
                <div className="audit-change-card">
                  <span>ما الذي تغيّر</span>
                  <p>{selectedLog.changes}</p>
                </div>
              ) : null}
              <div className="inspector-facts">
                <article>
                  <span>المستخدم</span>
                  <b>{selectedLog.userName}</b>
                </article>
                <article>
                  <span>الطريقة</span>
                  <b dir="ltr">{selectedLog.method}</b>
                </article>
                <article>
                  <span>المسار</span>
                  <b dir="ltr" className="inspector-path">
                    {selectedLog.path}
                  </b>
                </article>
                <article>
                  <span>العنصر</span>
                  <b>
                    {selectedLog.entityId ? `#${selectedLog.entityId}` : "—"}
                  </b>
                </article>
                <article>
                  <span>الحالة</span>
                  <b>{selectedLog.status}</b>
                </article>
              </div>
            </>
          ) : (
            <EmptyInspector icon={<Activity />} title="اختر عملية" />
          )}
        </aside>
      </div>
    </div>
  );
}
