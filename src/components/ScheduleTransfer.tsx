import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeftRight, BookOpen, Building2, Check, CheckCircle2, Clock, Copy, Download, History, Link2, Pencil, Plus, RotateCcw, Search, ShieldAlert, Sparkles, Trash2, Upload, UserMinus, UserPlus, UsersRound, X } from "lucide-react";
import { PrimaryButton, SecondaryButton, useDialogDismiss } from "./ui";
import { validateCivilId } from "../utils/civilId";
import { AR, countOf } from "../utils/arabicCount";
import { type ImportRow } from "./ImportPreviewTable";
import PagedImportPreview from "./PagedImportPreview";
import SchedulePublish from "./SchedulePublish";
import { sortByName } from "../utils/sorting";
import { sortTermsNewest } from "../utils/termSequence";
import { formatScheduleTimeRange } from "../utils/scheduleTime";
import { assignAuthoritySections } from "../utils/authorityAcademicCodes";
import { applySmartFills, isPlaceholderValue, proposeSmartFills, type SmartFill } from "../utils/geminiScheduleLayer";

/**
 * Moving a term in, out, and off one person's shoulders.
 *
 * Three jobs that all mean "change many appointments at once", kept in one
 * place because they share the same discipline: nothing happens until the
 * consequence has been shown and accepted. Import previews what it would add
 * and what it cannot place; retiring a member of staff previews how many
 * appointments would change hands. The commit is a second, deliberate press.
 */

interface Instructor {
  AdInstructorId: number;
  AdInstructorName: string;
  AdInstructorCivil?: string;
}

interface Props {
  collegeId: number;
  sectionId: number;
  termId: number;
  instructors: Instructor[];
  /** Ids that actually teach in the open scope, so the list is short. */
  departmentIds: number[];
  /** Every term, so the roster can be started from another one. */
  terms: Array<{ AdTermId: number; AdTermName: string }>;
  onChanged: () => void;
  onClose: () => void;
}

type Tab = "export" | "import" | "publish" | "retire" | "visiting";

export default function ScheduleTransfer({ collegeId, sectionId, termId, instructors, departmentIds, terms, onChanged, onClose }: Props) {
  useDialogDismiss(true, onClose);
  const [tab, setTab] = useState<Tab>("export");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  // Kept so a reviewer can ask for a sharper second reading of the same file.
  const [smartFile, setSmartFile] = useState<File | null>(null);
  // True only while the sharper reading is in flight, so the chip can say so
  // and refuse a second click that would spend another read for nothing.
  const [smartBusy, setSmartBusy] = useState(false);
  // Proposed cells wait here until a person approves them. Nothing is written
  // to the preview while this is set.
  const [smartProposal, setSmartProposal] = useState<{ fills: SmartFill[]; pages: number[]; conflicts: string[]; notes: string[]; token: string } | null>(null);
  /* A proposal belongs to ONE file. Carrying its own token — and being rendered
     only while that token is the file on screen — makes a stale card structurally
     impossible, instead of relying on every new-import path to remember to clear
     it. A second upload showed the first file's cells because one path forgot. */
  const smartToken = (file: File | null) => file ? `${file.name}|${file.size}|${file.lastModified}` : "";
  /* Which proposed cells the reviewer still wants. Keyed by row+field so the
     choice survives re-renders; everything starts chosen, and unticking is how
     a reading that looks wrong is refused without discarding the rest. */
  const [smartPicked, setSmartPicked] = useState<Set<string>>(new Set());
  const fillKey = (fill: SmartFill) => `${fill.rowIndex}:${fill.field}`;
  const [payload, setPayload] = useState<any>(null);
  const [xlsxPreview, setXlsxPreview] = useState<any>(null);
  const [xlsxDraft, setXlsxDraft] = useState("");
  const [importKind, setImportKind] = useState<"worksheet" | "authority-pdf">("worksheet");
  const [readProgress, setReadProgress] = useState<{ pct: number; message: string } | null>(null);
  /* The quick-edit course picker needs the department's catalogue; fetched once
     the first time a PDF preview opens, never on plain Excel imports. */
  const [deptCourses, setDeptCourses] = useState<any[]>([]);
  const [fromId, setFromId] = useState(0);
  const [toId, setToId] = useState(0);
  const [retirePreview, setRetirePreview] = useState<number | null>(null);
  const [replacementCheck, setReplacementCheck] = useState<any>(null);
  const [replacementHistory, setReplacementHistory] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [roster, setRoster] = useState<number[]>([]);
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [rosterQuery, setRosterQuery] = useState("");
  const [copyFrom, setCopyFrom] = useState(0);
  // Note 1: a department adds its own delegates from right here, without needing
  // the college-wide instructor registry.
  const [newName, setNewName] = useState("");
  const [newCivil, setNewCivil] = useState("");
  const [directoryPeople, setDirectoryPeople] = useState<Instructor[]>([]);
  const [directoryIds, setDirectoryIds] = useState<number[]>([]);
  const [editingDelegate, setEditingDelegate] = useState<number>(0);
  const [editName, setEditName] = useState("");
  const [editCivil, setEditCivil] = useState("");
  const [copyPeople, setCopyPeople] = useState<Instructor[]>([]);
  const [copyIds, setCopyIds] = useState<number[]>([]);
  const [copySelected, setCopySelected] = useState<number[]>([]);

  React.useEffect(() => {
    if ((tab !== "visiting" && tab !== "import") || !collegeId || !sectionId || !termId) return;
    setRosterLoaded(false);
    const controller = new AbortController();
    const query = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId), termId: String(termId) });
    const directoryQuery = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId) });
    Promise.all([
      fetch(`/api/visiting-roster?${query}`, { signal: controller.signal }).then(response => response.ok ? response.json() : { instructorIds: [] }),
      fetch(`/api/department-delegates?${directoryQuery}`, { signal: controller.signal }).then(response => response.ok ? response.json() : { instructorIds: [], instructors: [] }),
    ]).then(([termData, directoryData]) => {
      setRoster(termData.instructorIds || []);
      // Keep the delegate identities available on Import as well as Visiting.
      // The import table already knows which ids belong to the current-term roster;
      // it only needs the matching system person to render the tiny "منتدب" badge.
      setDirectoryIds(directoryData.instructorIds || []);
      setDirectoryPeople(sortByName(directoryData.instructors || [], (person: Instructor) => person.AdInstructorName));
      setRosterLoaded(true);
    }).catch(error => { if (error?.name !== "AbortError") setRosterLoaded(true); });
    return () => controller.abort();
  }, [tab, collegeId, sectionId, termId]);

  const saveRoster = async (ids: number[]) => {
    const previous = roster;
    const next = currentUnique(ids);
    setRoster(next);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/visiting-roster", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, instructorIds: next })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "تعذر تحديث منتدبي هذا الفصل.");
      setRoster(Array.isArray(data.instructorIds) ? data.instructorIds : next);
      onChanged();
    } catch (e: any) {
      setRoster(previous);
      setError(e?.message || "تعذر تحديث منتدبي هذا الفصل.");
    } finally { setBusy(false); }
  };

  const currentUnique = (ids: number[]) => [...new Set(ids.map(Number).filter(Boolean))];
  const mergePeople = (base: Instructor[], extra: Instructor[]) => [...new Map([...base, ...extra].map(person => [Number(person.AdInstructorId), person])).values()];
  // Add to the department directory and, for convenience, to the open term.
  // Reusing a civil number from another department is valid; the server links
  // the same person instead of creating a duplicate identity.
  const addNewDelegate = async () => {
    const name = newName.trim(), civil = newCivil.trim();
    if (!name || !civil) { setError("اكتب اسم المنتدب ورقمه المدني."); return; }
    const check = validateCivilId(civil);
    if (!check.isValid) { setError(check.message || "رقم مدني غير صالح."); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/department-delegates/instructor", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, AdInstructorCivil: civil, AdInstructorName: name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذّر إضافة المنتدب.");
      const person: Instructor = data.person;
      setNewName(""); setNewCivil("");
      setDirectoryIds(data.instructorIds || currentUnique([...directoryIds, person.AdInstructorId]));
      setDirectoryPeople(current => sortByName(mergePeople(current, [person]), row => row.AdInstructorName));
      setRoster(data.roster || currentUnique([...roster, Number(person.AdInstructorId)]));
      onChanged();
    } catch (e: any) { setError(e.message || "تعذّر إضافة المنتدب."); }
    finally { setBusy(false); }
  };

  const saveDelegateEdit = async (id: number) => {
    const check = validateCivilId(editCivil);
    if (!check.isValid) { setError(check.message || "الرقم المدني غير صحيح."); return; }
    if (editName.trim().length < 3) { setError("اكتب اسم المنتدب كاملاً."); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/department-delegates/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, AdInstructorName: editName.trim(), AdInstructorCivil: editCivil }),
      });
      const person = await response.json();
      if (!response.ok) throw new Error(person.error || "تعذر تعديل المنتدب.");
      setDirectoryPeople(current => sortByName(mergePeople(current.filter(row => row.AdInstructorId !== id), [person]), row => row.AdInstructorName));
      setEditingDelegate(0); onChanged();
    } catch (e: any) { setError(e.message || "تعذر تعديل المنتدب."); }
    finally { setBusy(false); }
  };

  const removeDelegate = async (id: number) => {
    if (!window.confirm("حذف المنتدب من قائمة منتدبي هذا القسم؟ لن يُحذف من النظام، ولن تتغير سجلات الفصول السابقة.")) return;
    setBusy(true); setError(null);
    try {
      const query = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId) });
      const response = await fetch(`/api/department-delegates/${id}?${query}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر الحذف.");
      setDirectoryIds(data.instructorIds || []);
      setDirectoryPeople(current => current.filter(person => person.AdInstructorId !== id));
      if (editingDelegate === id) setEditingDelegate(0);
      onChanged();
    } catch (e: any) { setError(e.message || "تعذر الحذف."); }
    finally { setBusy(false); }
  };

  const loadCopyRoster = async (fromTermId: number) => {
    setCopyFrom(fromTermId); setCopyIds([]); setCopySelected([]); setCopyPeople([]);
    if (!fromTermId) return;
    try {
      const query = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId), termId: String(fromTermId) });
      const response = await fetch(`/api/visiting-roster?${query}`);
      const data = response.ok ? await response.json() : { instructorIds: [], instructors: [] };
      const ids = data.instructorIds || [];
      setCopyIds(ids); setCopySelected(ids); setCopyPeople(data.instructors || []);
    } catch { setError("تعذر قراءة منتدبي الفصل المختار."); }
  };

  const copyRoster = async () => {
    if (!copyFrom || !copySelected.length) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/visiting-roster/copy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, fromTermId: copyFrom, toTermId: termId, instructorIds: copySelected })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر النسخ");
      setRoster(data.instructorIds || []);
      // Copied people also become part of this department's permanent directory.
      const selectedPeople = copyPeople.filter(person => copySelected.includes(person.AdInstructorId));
      setDirectoryPeople(current => sortByName(mergePeople(current, selectedPeople), row => row.AdInstructorName));
      setDirectoryIds(current => currentUnique([...current, ...copySelected]));
      onChanged();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const scopeReady = Boolean(collegeId && sectionId && termId);
  const named = (id: number) => instructors.find(x => x.AdInstructorId === id)?.AdInstructorName || "";
  const sortedInstructors = useMemo(() => sortByName(instructors, person => person.AdInstructorName), [instructors]);
  const directory = useMemo(() => {
    const pool = new Map([...instructors, ...directoryPeople].map(person => [Number(person.AdInstructorId), person]));
    return sortByName(directoryIds.map(id => pool.get(Number(id))).filter(Boolean) as Instructor[], person => person.AdInstructorName);
  }, [instructors, directoryPeople, directoryIds]);
  const visibleDirectory = useMemo(() => {
    const fold = (value: string) => String(value || "").replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim().toLowerCase();
    const needle = fold(rosterQuery);
    if (!needle) return directory;
    const raw = rosterQuery.trim();
    return directory.filter(person => fold(person.AdInstructorName).includes(needle) || String(person.AdInstructorCivil || "").includes(raw));
  }, [directory, rosterQuery]);
  const departmentStaff = useMemo(() => sortByName(
    departmentIds.map(id => instructors.find(x => x.AdInstructorId === id)).filter(Boolean) as Instructor[],
    person => person.AdInstructorName,
  ), [departmentIds, instructors]);
  const sortedTerms = useMemo(() => sortTermsNewest(terms), [terms]);

  const importBlockingIssues = useMemo(() => {
    if (!xlsxPreview) return [] as string[];
    const sourceIssues=(Array.isArray(xlsxPreview.issues) ? xlsxPreview.issues : []).map((item: unknown) => String(item || "").trim()).filter(Boolean);
    /* PDF row blockers are derived LIVE below. Parser prose must not remain as
       a stale blocker after the reviewer fixes or deletes the affected row. */
    const issues = new Set<string>(importKind === "authority-pdf" ? sourceIssues.filter(issue => /^تحذير:/.test(issue)) : sourceIssues);
    const rows = Array.isArray(xlsxPreview.rows) ? xlsxPreview.rows as ImportRow[] : [];
    const hasDays = (row: ImportRow) => Boolean(row.fsunday || row.fmonday || row.ftuesday || row.fwednesday || row.fthursday);
    const minutes = (value: string) => { const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/); return match ? Number(match[1]) * 60 + Number(match[2]) : -1; };
    rows.forEach((row, index) => {
      const n = (index + 1).toLocaleString("ar-KW-u-nu-latn");
      if (!Number(row.AdCourseId)) issues.add(`الصف ${n}: المقرر غير محدد.`);
      const sectionNumber=Number(String(row.SCode||""));
      if (!/^\d{3}$/.test(String(row.SCode || "").trim()) || sectionNumber < 501) issues.add(`الصف ${n}: الشعبة يجب أن تكون ضمن تسلسل المقرر 501، 502، 503…`);
      if (!hasDays(row)) issues.add(`الصف ${n}: أيام المحاضرة غير محددة.`);
      const start = minutes(row.fstarttime), end = minutes(row.fendtime);
      if (start < 0 || end <= start) issues.add(`الصف ${n}: الوقت غير مكتمل أو غير صالح.`);
      if (!row.buildingId) issues.add(`الصف ${n}: المبنى الرسمي غير محدد.`);
      if (!row.roomId && row.locationStatus !== "PENDING_ROOM") issues.add(`الصف ${n}: القاعة غير محددة.`);
      if (!Number(row.AdInstructorId)||(!departmentIds.includes(Number(row.AdInstructorId))&&!roster.includes(Number(row.AdInstructorId)))) issues.add(`الصف ${n}: أستاذ المقرر غير محدد أو غير مثبت ضمن القسم/منتدبي الفصل الحالي.`);
    });
    return [...issues];
  }, [xlsxPreview, importKind, departmentIds, roster]);
  /* An Authority PDF can legitimately end with ZERO live rows: deleting every
     imported row means “publish an empty timetable”, while the immutable
     baseline must still generate a report with every source row marked deleted. */
  const authorityBaselineCount = importKind === "authority-pdf" && Array.isArray(xlsxPreview?.baselineRows) ? xlsxPreview.baselineRows.length : 0;
  const importReady = Boolean((xlsxPreview?.rows?.length || authorityBaselineCount > 0) && importBlockingIssues.length === 0);
  const rotatedPdfGuidance = Boolean(error && /دوّر صفحات الجدول للوضع الأفقي/.test(error));
  const pdfReadinessSummary = useMemo(() => {
    if (importKind !== "authority-pdf" || !Array.isArray(xlsxPreview?.rows)) return null;
    const rows = xlsxPreview.rows as ImportRow[];
    const hasDays = (row: ImportRow) => Boolean(row.fsunday || row.fmonday || row.ftuesday || row.fwednesday || row.fthursday);
    const minutes = (value: string) => { const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/); return match ? Number(match[1]) * 60 + Number(match[2]) : -1; };
    const rowReady = (row: ImportRow) => {
      const sectionNumber = Number(String(row.SCode || ""));
      const start = minutes(row.fstarttime), end = minutes(row.fendtime);
      return Boolean(
        Number(row.AdCourseId) &&
        /^\d{3}$/.test(String(row.SCode || "").trim()) && sectionNumber >= 501 &&
        hasDays(row) && start >= 0 && end > start &&
        row.buildingId && (row.roomId || row.locationStatus === "PENDING_ROOM") &&
        Number(row.AdInstructorId) && (departmentIds.includes(Number(row.AdInstructorId)) || roster.includes(Number(row.AdInstructorId)))
      );
    };
    const ready = rows.filter(rowReady).length;
    const review = Math.max(0, rows.length - ready);
    const derived = rows.reduce((sum, row) => sum + Object.values(row.importEvidence || {}).filter((proof: any) => proof?.confidence === "CONFIRMED" && proof?.derived).length, 0);
    /* Only cells the SCAN could not read justify a second pass. A room left
       deliberately unassigned is a decision, not a failure — the page is
       correct as it stands, so it is neither re-read nor uploaded anywhere.
       importEvidence is what separates the two: it records what the reader
       could not resolve, independent of what the department chose to leave
       blank. */
    const scanFailed = (row: ImportRow) => Object.values((row as any).importEvidence || {})
      .some((proof: any) => proof?.confidence === "UNRESOLVED" || proof?.confidence === "REVIEW_REQUIRED");
    const troubledPages = [...new Set(rows.filter(scanFailed).map(row => Number((row as any).sourcePage || 1)))]
      .filter(page => page > 0).sort((a, b) => a - b);
    /* «للمراجعة» counts ROWS, but a row waits on a specific number of CELLS —
       and one row may be missing three. Showing only the row count made an
       apply look like it changed nothing. Counting both lets the card say what
       is actually left: «16 صفاً · 23 خانة». */
    const reviewCells = rows.reduce((sum, row) => sum + Object.values((row as any).importEvidence || {})
      .filter((proof: any) => proof?.confidence === "UNRESOLVED" || proof?.confidence === "REVIEW_REQUIRED").length, 0);
    return { ready, review, reviewCells, derived, troubledPages };
  }, [importKind, xlsxPreview?.rows, departmentIds, roster]);

  /* What a sharper reading could still fix: pages that carry an unresolved row
     AND have not already been re-read. When the approved engine left nothing
     open, this is empty and the offer never appears — a clean import must not
     invite an extra read, and a page is never sent twice. */
  /* ONE sharper reading per import — not one per page. Once it has run, the
     offer is gone for this file: every troubled page goes in that single pass,
     and whatever it could not resolve is the reviewer's to finish by hand. A
     fresh upload starts a fresh entitlement. */
  const smartUsed = Boolean(xlsxPreview?.smartRead);
  const smartPendingPages = useMemo(() => {
    if (smartUsed) return [] as number[];
    return pdfReadinessSummary?.troubledPages || [];
  }, [smartUsed, pdfReadinessSummary?.troubledPages]);

  const exportTerm = async (format: "xlsx" | "json" = "xlsx") => {
    const query = new URLSearchParams();
    if (collegeId) query.set("collegeId", String(collegeId));
    if (sectionId) query.set("sectionId", String(sectionId));
    if (termId) query.set("termId", String(termId));
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/schedules/export?${query}`);
      if (!response.ok) {
        let msg = "تعذر تصدير بيانات الجدول";
        try { const d = await response.json(); if (d.error) msg = d.error; } catch {}
        throw new Error(msg);
      }
      const data = await response.json();
      if (format === "xlsx") {
        const XLSX = await import("xlsx");
        const headers = ["رمز المقرر", "المقرر الدراسي", "الشعبة", "أستاذ المقرر", "الرقم المدني", "الأيام", "الوقت", "المبنى", "القاعة"];
        const rows = (data.rows || []).map((r: any) => [
          r.courseCode || "",
          r.courseName || "",
          r.section || "",
          r.instructorName || "",
          r.instructorCivil || "",
          Array.isArray(r.days) ? r.days.join(" - ") : (r.days || ""),
          (r.start && r.end) ? formatScheduleTimeRange(r.start, r.end) : "",
          r.building || "",
          r.hall || "",
        ]);
        const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        (sheet as any)["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 8 }, { wch: 22 }, { wch: 15 }, { wch: 22 }, { wch: 14 }, { wch: 9 }, { wch: 9 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, sheet, "الجدول الدراسي");
        const fileName = `جدول_${data.scope?.section || "القسم"}_${data.scope?.term || "الفصل"}.xlsx`.replace(/[\\/*?:"<>|]/g, "_");
        XLSX.writeFile(wb, fileName);
      } else {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.setAttribute("download", `schedule-${termId || "term"}.json`);
        document.body.appendChild(a);
        a.click();
        window.setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 1000);
      }
    } catch (e: any) {
      setError(e.message || "تعذر تصدير الجدول");
    } finally {
      setBusy(false);
    }
  };

  /**
   * The empty form, ready to hand to whoever fills timetables.
   *
   * One sheet with the exact columns the importer matches on, two example
   * rows written the way a person would write them, and a second sheet that
   * says the rules out loud. Generated on the user's machine — no download
   * from anywhere, no stale copy on a server.
   */
  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    /* Reversed on purpose: with Arabic headers the sheet is read right to left,
       so the hall must be the FIRST column for the row to arrive in the order a
       person fills it in — course last is how the printed timetable reads too.
       The importer matches by header name, so order is presentation only. */
    const headers = ["القاعة", "المبنى", "الوقت", "الأيام", "الرقم المدني", "أستاذ المقرر", "الشعبة", "المقرر الدراسي", "رمز المقرر"];
    /* Placeholders, not people. Numbered names cannot be mistaken for a real
       instructor, and the civil id starts with 3 — a century Kuwait has not
       issued — so a sample row left in by accident fails validation instead of
       importing as somebody. */
    const sample = [
      ["F10", "B9", "08:00-09:20", "الأحد - الثلاثاء", "300123100006", "اسم دكتور ١", "501", "اسم المقرر الأول", "١٠١"],
      ["F12", "B9", "11:00-12:20", "الاثنين - الأربعاء", "", "اسم دكتور ٢", "502", "اسم المقرر الثاني", "١٠٢"],
    ];
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...sample]);
    (sheet as any)["!cols"] = [{ wch: 9 }, { wch: 9 }, { wch: 13 }, { wch: 22 }, { wch: 15 }, { wch: 22 }, { wch: 8 }, { wch: 30 }, { wch: 12 }];
    const guide = XLSX.utils.aoa_to_sheet([
      ["كيف يفهم الاستيراد ملفك"],
      [""],
      ["المطابقة", "كل صف يُطابَق برمز المقرر داخل قسمك، والأستاذ بالرقم المدني أو بالاسم كما هو مسجل."],
      ["الأيام", "اكتب أسماء الأيام كما تنطقها: الأحد - الثلاثاء - الخميس. أي فاصل يصلح."],
      ["الوقت", "من-إلى بصيغة 24 ساعة: 08:00-09:20."],
      ["الصفوف الناقصة", "صف برمز غير معروف أو أستاذ غير معروف يظهر لك كملاحظة قبل أي حفظ — لا يُكتب شيء خفية."],
      ["ماذا يحدث بعد الرفع", "يُعرض الملف أولاً كحصيلة: كم صفاً فُهم وما المشاكل. بعد المراجعة يمكنك النشر مباشرة من أدوات البيانات. تقرير تغييرات نسخة PDF يوجد في مركز الاستعلامات والتقارير."],
    ]);
    (guide as any)["!cols"] = [{ wch: 16 }, { wch: 90 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "الجدول");
    XLSX.utils.book_append_sheet(wb, guide, "طريقة الاستخدام");
    XLSX.writeFile(wb, "نموذج-استيراد-الجدول.xlsx");
  };

  /** An Excel upload: parsed here, judged by the importer, saved as a draft. */
  const readExcel = async (file: File) => {
    setError(null); setXlsxPreview(null); setXlsxDraft(""); setImportKind("worksheet");
    setSmartProposal(null); setSmartPicked(new Set()); setSmartFile(null);
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      if (!rows.length) throw new Error("الورقة الأولى فارغة.");
      const response = await fetch("/api/intelligence/import-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, rows }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذرت قراءة الملف");
      setXlsxPreview({ ...data, fileName: file.name });
    } catch (e: any) {
      setError(e.message || "تعذرت قراءة الملف");
    } finally {
      setBusy(false);
    }
  };
  /* The deterministic reader above stays the default and runs first. A second,
     sharper reading is available only on request: nothing reaches Gemini
     without this call, and civil IDs are stripped server-side before it. */
  const readSmart = async (file: File, troubledPages: number[] = []) => {
    if (smartBusy) return;
    // The visual gate is first; this is the one that actually spends nothing.
    if (xlsxPreview?.smartRead) return;
    // Spend the entitlement on launch, not on outcome: nothing that happens
    // next can bring the offer back.
    setXlsxPreview((prev: any) => prev ? { ...prev, smartRead: true } : prev);
    setError(null); setBusy(true); setSmartBusy(true);
    const keptRows=(Array.isArray(xlsxPreview?.rows)?xlsxPreview.rows:[]) as ImportRow[];
    setReadProgress({ pct: 20, message: troubledPages.length
      ? `قراءة أدق للصفحات ${troubledPages.join("، ")}`
      : "قراءة أدق عبر Smart Import" });
    try {
      const query=new URLSearchParams({collegeId:String(collegeId),sectionId:String(sectionId),termId:String(termId),mime:file.type||"application/octet-stream"});
      if(troubledPages.length)query.set("pages",troubledPages.join(","));
      /* Naming the rows that still have blanks makes the answer small, and a
         small answer is a fast one — the model transcribes a few cells instead
         of re-emitting rows nobody asked it to touch. */
      const scanFailedRow=(row:any)=>Object.values(row.importEvidence||{}).some((proof:any)=>proof?.confidence==="UNRESOLVED"||proof?.confidence==="REVIEW_REQUIRED");
      const troubled=keptRows.filter(row=>troubledPages.includes(Number((row as any).sourcePage||1))&&scanFailedRow(row));
      const need=troubled
        .map(row=>`ص${Number((row as any).sourcePage||1)}:${String(row.SCode||"").trim()||String((row as any).referenceNumber||"").trim()}`)
        .filter(item=>!/:$/.test(item));
      if(need.length&&need.length<=40)query.set("need",[...new Set(need)].join("، "));
      /* Row targeting for the strip cutter: each troubled row's POSITION among
         its page's rows (1-based, in reading order). The server then ships only
         those bands — the clean rows of the page never travel at all. */
      const ordinalByPage=new Map<number,number>();
      const rowSlots:string[]=[];
      for(const row of keptRows){
        const page=Number((row as any).sourcePage||1);
        const ordinal=(ordinalByPage.get(page)||0)+1;
        ordinalByPage.set(page,ordinal);
        if(troubledPages.includes(page)&&scanFailedRow(row))rowSlots.push(`${page}:${ordinal}`);
      }
      if(rowSlots.length&&rowSlots.length<=60)query.set("rows",rowSlots.join(","));
      const response=await fetch(`/api/intelligence/smart-import?${query}`,{
        method:"POST",
        headers:{"Content-Type":file.type||"application/octet-stream","x-file-name":encodeURIComponent(file.name)},
        body:await file.arrayBuffer(),
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"تعذرت القراءة الأدق");
      const fresh=(Array.isArray(data.rows)?data.rows:[]) as ImportRow[];
      if(!fresh.length)throw new Error("لم تُستخرج صفوف من الصفحات المطلوبة في القراءة الأدق.");
      /* The approved engine's reading is the record. The sharper pass may only
         FILL cells that came back empty — it never replaces a row, a page, or a
         cell that was already read. Without a page list we fill nothing rather
         than risk overwriting a good table. */
      const readPages=(Array.isArray(data.pagesRead)?data.pagesRead:[]).map((page:any)=>Number(page)).filter(Boolean);
      const pages=readPages.length?readPages:troubledPages;
      const raw=proposeSmartFills(keptRows,fresh,pages);
      /* Last line of defence. Binding a placeholder is blocked server-side, but
         a stale deployment or a registry row literally named «هيئة تدريسية»
         would still surface one here — and a generic label must never be
         offered as if it were a person or a place. */
      const named=(fill:SmartFill)=>{
        if(fill.field==="AdInstructorId")return instructors.find((person:any)=>Number(person.AdInstructorId)===Number(fill.value))?.AdInstructorName||"";
        if(fill.field==="AdCourseId")return deptCourses.find((course:any)=>Number(course.AdCourseId)===Number(fill.value))?.CourseName||"";
        return fill.value;
      };
      const proposal={...raw,fills:raw.fills.filter(fill=>!isPlaceholderValue(named(fill)))};
      if(!proposal.fills.length){
        setError("لم تجد القراءة الأدق خانة ناقصة تستطيع تعبئتها بثقة. الجدول باقٍ كما هو.");
        // The page was looked at, so it is not offered again for nothing.
        // The entitlement is spent by USE, not by outcome: a pass that found
        // nothing still consumed its read.
        setXlsxPreview((prev:any)=>prev?{...prev,smartRead:true,smartPages:[...new Set([...(Array.isArray(prev?.smartPages)?prev.smartPages:[]),...pages])]}:prev);
        return;
      }
      // Nothing is written yet: the reviewer sees every proposed cell first.
      setSmartProposal({fills:proposal.fills,pages,conflicts:proposal.conflicts,notes:proposal.notes,token:smartToken(file)});
      setSmartPicked(new Set(proposal.fills.map(fill=>`${fill.rowIndex}:${fill.field}`)));
    } catch (e:any) {
      setError(e.message||"تعذرت القراءة الأدق");
    } finally {
      setBusy(false); setSmartBusy(false); setReadProgress(null);
    }
  };
  /** Approving writes exactly the ticked cells and nothing else. */
  const applySmartProposal = () => {
    if (!smartProposal) return;
    // Never write cells read from a file that is no longer the one on screen.
    if (smartProposal.token !== smartToken(smartFile)) { setSmartProposal(null); setSmartPicked(new Set()); return; }
    const chosen = smartProposal.fills.filter(fill => smartPicked.has(fillKey(fill)));
    if (!chosen.length) return;
    setXlsxPreview((prev: any) => {
      if (!prev) return prev;
      const rows = assignAuthoritySections(applySmartFills(prev.rows || [], chosen) as ImportRow[]);
      return {
        ...prev,
        rows,
        baselineRows: rows.map((row: any) => ({ ...row })),
        // Conflicts are diagnostics, not import notes: they must not leak into
        // the preview's issue list either.
        issues: Array.isArray(prev.issues) ? prev.issues : [],
        count: rows.length,
        smartRead: true,
        smartFilled: Number(prev.smartFilled || 0) + chosen.length,
        smartPages: [...new Set([...(Array.isArray(prev.smartPages) ? prev.smartPages : []), ...smartProposal.pages])],
      };
    });
    setSmartProposal(null);
    setSmartPicked(new Set());
  };
  /** Declining leaves the approved reading exactly as it was. */
  const dismissSmartProposal = () => {
    setXlsxPreview((prev: any) => prev
      ? { ...prev, smartRead: true, smartPages: [...new Set([...(Array.isArray(prev.smartPages) ? prev.smartPages : []), ...(smartProposal?.pages || [])])] }
      : prev);
    setSmartProposal(null);
    setSmartPicked(new Set());
  };
  const readPdf = async (file: File) => {
    setError(null); setXlsxPreview(null); setXlsxDraft(""); setImportKind("authority-pdf"); setBusy(true);
    setSmartProposal(null); setSmartPicked(new Set()); setSmartFile(file);
    setReadProgress({ pct: 4, message: "يجهّز الملف للقراءة" });
    try {
      const query=new URLSearchParams({collegeId:String(collegeId),sectionId:String(sectionId),termId:String(termId)});
      const response=await fetch(`/api/intelligence/pdf-import?${query}`,{
        method:"POST",
        headers:{"Content-Type":"application/octet-stream","Accept":"application/x-ndjson","x-file-name":encodeURIComponent(file.name)},
        body:await file.arrayBuffer(),
      });
      /* Reading a scan takes over a minute. The server streams one JSON object
         per line while it works, and the result on the last line, so the bar
         advances page by page instead of the button simply freezing. */
      const reader=response.body?.getReader();
      const decoder=new TextDecoder();
      let buffer="",data:any=null,failure="";
      if(reader)for(;;){
        const {value,done}=await reader.read();
        if(done)break;
        buffer+=decoder.decode(value,{stream:true});
        let cut=buffer.indexOf("\n");
        while(cut>=0){
          const line=buffer.slice(0,cut).trim(); buffer=buffer.slice(cut+1); cut=buffer.indexOf("\n");
          if(!line)continue;
          let event:any; try{event=JSON.parse(line);}catch{continue;}
          if(event.type==="progress"){
            const total=Math.max(Number(event.pages)||0,1),page=Math.max(0,Number(event.page)||0);
            const phase=String(event.phase||"");
            /* Parallel OCR pages finish out of numeric order, so progress must
               represent completed work, not the physical page number. Reserve
               a small final slice for safe rescue/matching to avoid 100% while
               the server is still validating identities. */
            const pct=phase==="match"?97:phase==="rescue"
              ?Math.min(95,84+Math.round((page/total)*11))
              :phase==="read"?Math.min(84,16+Math.round((page/total)*68))
              :phase==="orient"?15
              :phase==="render"?Math.min(14,4+Math.round((page/total)*10)):4;
            const fallback=phase==="rescue"?"تدقيق دقيق للصفحات المحتاجة":phase==="match"?"مطابقة البيانات مع السجل الرسمي":phase==="render"?"تجهيز صفحات PDF للقراءة":"قراءة الجدول";
            setReadProgress({pct,message:String(event.message||fallback)});
          }
          else if(event.type==="done")data=event.result;
          else if(event.type==="error")failure=event.error;
        }
      }
      if(failure)throw new Error(failure);
      if(!data){const rest=buffer.trim();if(rest){try{const tail=JSON.parse(rest);data=tail.result||tail;}catch{/* no trailing json */}}}
      /* A refusal (an occupied term, a permission wall) arrives as one plain
         JSON object with no newline. It used to be swallowed into an empty
         preview — zero rows, zero message. An error object IS the message. */
      if(data&&(data as any).error&&!(data as any).rows)throw new Error((data as any).error);
      if(!data)throw new Error("تعذرت قراءة PDF");
      const scannedRows=assignAuthoritySections(Array.isArray(data.rows)?data.rows:[]);
      setXlsxPreview({
        ...data,
        rows:scannedRows,
        baselineRows:scannedRows.map((row:any)=>({...row})),
        valid:Boolean(data.ready),count:Number(scannedRows.length),fileName:file.name,importLayout:"authority-pdf",
        sourceBranchCode:String(data.headerBranch?.code||""),
        sourceBranchName:String(data.headerBranch?.name||""),
      });
      if(!deptCourses.length){
        try{
          const all=await (await fetch("/api/courses")).json();
          if(Array.isArray(all))setDeptCourses(all.filter((c:any)=>Number(c.AdCollegeId)===collegeId&&Number(c.AdSectionId)===sectionId));
        }catch{/* the picker simply lists nothing until a retry */}
      }
    }catch(e:any){setError(e.message||"تعذرت قراءة PDF");}finally{setBusy(false);setReadProgress(null);}
  };

  const publishImportedDraft=async(id:string)=>{
    const response=await fetch(`/api/intelligence/drafts/${encodeURIComponent(id)}/publish`,{method:"POST",headers:{"x-schedule-confirm":"publish"}});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||data.issues?.[0]||"تعذر نشر الجدول");
    setXlsxDraft(`published:${id}`);onChanged();
  };

  const saveExcelDraft = async (publishNow=false) => {
    if (!importReady) {
      setError("أكمل ملاحظات المعاينة أولًا.");
      window.setTimeout(() => document.querySelector(".transfer-preview .import-preview-table-wrap, .transfer-preview .import-issues-fold, .transfer-preview")?.scrollIntoView({ behavior: "smooth", block: "center" }), 40);
      return;
    }
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/intelligence/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collegeId, sectionId, termId,
          source: "import",
          name: `${importKind==="authority-pdf"?"نسخة PDF المعتمدة":"استيراد النموذج"} — ${xlsxPreview.fileName || ""}`.trim(),
          rows: xlsxPreview.rows,
          baselineRows:importKind==="authority-pdf"?xlsxPreview.baselineRows:undefined,
          importLayout:importKind,
          sourceFileName:xlsxPreview.fileName,
          sourceBranchCode:importKind==="authority-pdf"?xlsxPreview.sourceBranchCode:undefined,
          sourceBranchName:importKind==="authority-pdf"?xlsxPreview.sourceBranchName:undefined,
          importReceipt:importKind==="authority-pdf"?xlsxPreview.importReceipt:undefined,
          previewIssues: importBlockingIssues,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر حفظ المسودة");
      const id=String(data.id||"");setXlsxDraft(id||"تم");
      if(publishNow&&id){
        await publishImportedDraft(id);
        /* “تعبئة ونشر” is a completed action, not another review step. Close
           the transfer sheet only after the server confirms publication. */
        onClose();
      }
    } catch (e: any) {
      setError(e.message || "تعذر حفظ المسودة");
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (file: File) => {
    /* A new file starts a new review. Anything the sharper reading proposed for
       the previous file would otherwise still be on screen, offering cells that
       belong to a table that is no longer here. */
    setSmartProposal(null); setSmartPicked(new Set()); setSmartFile(null);
    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") { await readPdf(file); return; }
    if (/\.xlsx?$/i.test(file.name)) { await readExcel(file); return; }
    setError(null); setPreview(null); setPayload(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const rows = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : null;
      if (!rows) throw new Error("الملف لا يطابق صيغة تصدير الجدول.");
      setPayload(rows);
      await run(rows, false);
    } catch (e: any) {
      setError(e.message || "تعذر قراءة الملف");
    }
  };

  const run = async (rows: any[], commit: boolean) => {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/schedules/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, rows, commit })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر الاستيراد");
      setPreview(data);
      if (commit) { onChanged(); }
    } catch (e: any) {
      setError(e.message || "تعذر الاستيراد");
    } finally {
      setBusy(false);
    }
  };

  const loadReplacementHistory = async () => {
    if (!scopeReady) return;
    try {
      const q = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId), termId: String(termId) });
      const response = await fetch(`/api/schedules/replace-instructor/history?${q}`);
      if (response.ok) setReplacementHistory(await response.json());
    } catch {}
  };

  useEffect(() => {
    if (tab === "retire") void loadReplacementHistory();
  }, [tab, collegeId, sectionId, termId]);

  useEffect(() => {
    if (tab !== "retire" || !fromId || !scopeReady) { setReplacementCheck(null); setRetirePreview(null); return; }
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/schedules/replace-instructor", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromInstructorId: fromId, toInstructorId: toId, collegeId, sectionId, termId, commit: false }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "تعذر فحص التوافق");
        setReplacementCheck(data); setRetirePreview(Number(data.affected || 0)); setError(null);
      } catch (e: any) { setReplacementCheck(null); setError(e.message || "تعذر فحص التوافق"); }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [tab, fromId, toId, collegeId, sectionId, termId]);

  const undoReplacement = async (versionId: string) => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/intelligence/versions/${encodeURIComponent(versionId)}/restore`, { method: "POST", headers: { "x-schedule-confirm": "restore" } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر التراجع");
      await loadReplacementHistory(); onChanged();
    } catch (e: any) { setError(e.message || "تعذر التراجع"); }
    finally { setBusy(false); }
  };

  const retire = async (commit: boolean) => {
    if (!fromId) { setError("اختر الأستاذ المراد استبداله."); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/schedules/replace-instructor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromInstructorId: fromId, toInstructorId: toId, collegeId, sectionId, termId, commit })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر التنفيذ");
      if (commit) {
        setRetirePreview(null); setReplacementCheck(null); setFromId(0); setToId(0); onChanged(); await loadReplacementHistory();
      } else { setRetirePreview(Number(data.affected || 0)); setReplacementCheck(data); }
    } catch (e: any) {
      setError(e.message || "تعذر التنفيذ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="transfer-backdrop no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="transfer-sheet visual-minimal" role="dialog" aria-modal="true" aria-label="نقل الجدول">
        <header>
          <div>
            <span className="surface-kicker">الجدول كوحدة واحدة</span>
            <h2>تصدير · استيراد · نشر · استبدال · منتدبون</h2>
          </div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="إغلاق"><X /></button>
        </header>

        <nav className="transfer-tabs">
          <button type="button" data-guide-feature-id="schedule.tool.data" className={tab === "export" ? "active" : ""} onClick={() => setTab("export")} title="تصدير"><Download />تصدير</button>
          <button type="button" data-guide-feature-id="schedule.tool.data" className={tab === "import" ? "active" : ""} onClick={() => setTab("import")} title="استيراد"><Upload />استيراد</button>
          <button type="button" data-guide-feature-id="schedule.tool.data" className={tab === "publish" ? "active" : ""} onClick={() => setTab("publish")} title="نشر"><Link2 />نشر</button>
          <button type="button" data-guide-feature-id="schedule.tool.data" className={tab === "retire" ? "active" : ""} onClick={() => setTab("retire")} title="استبدال"><UserMinus />استبدال</button>
          <button type="button" data-guide-feature-id="schedule.tool.data" className={tab === "visiting" ? "active" : ""} onClick={() => setTab("visiting")} title="المنتدبون"><UserPlus />المنتدبون</button>
        </nav>

        {!scopeReady ? (
          <p className="transfer-note"><AlertTriangle />اختر الكلية والقسم والفصل أولاً.</p>
        ) : null}
        {error && tab !== "visiting" ? rotatedPdfGuidance ? (
          <div className="transfer-orientation-guidance" role="alert">
            <span className="transfer-orientation-icon"><RotateCcw aria-hidden="true" /></span>
            <strong>دوّر صفحات الجدول للوضع الأفقي ثم أعد الرفع</strong>
          </div>
        ) : <p className="transfer-error"><AlertTriangle />{error}</p> : null}

        <div className="transfer-body">
          {tab === "export" ? (
            <>
              {/* The paragraph listed five things the file contains, inside
                  brackets, in a sentence. They are a list — so they are drawn
                  as one, and the sentence keeps only what a list cannot say. */}
              <div className="tool-lede">
                <span className="tool-lede-mark"><Download aria-hidden="true" /></span>
                <div>
                  <strong>الفصل كاملاً، في ملف واحد</strong>
                  <ul className="tool-lede-chips">
                    <li><BookOpen aria-hidden="true" />المقررات</li>
                    <li><UsersRound aria-hidden="true" />الأساتذة</li>
                    <li><Clock aria-hidden="true" />الأوقات</li>
                    <li><Building2 aria-hidden="true" />القاعات</li>
                  </ul>
                </div>
              </div>
              <div className="transfer-import-actions">
                <PrimaryButton type="button" data-guide-feature-id="schedule.tool.data" onClick={() => void exportTerm("xlsx")} disabled={!scopeReady || busy}>
                  <Download /> {busy ? "جاري التصدير…" : "تصدير إلى ملف Excel (.xlsx)"}
                </PrimaryButton>
                <SecondaryButton type="button" onClick={() => void exportTerm("json")} disabled={!scopeReady || busy}>
                  <Download /> {busy ? "جاري التنزيل…" : "تنزيل ملف JSON"}
                </SecondaryButton>
              </div>
            </>
          ) : null}

          {tab === "import" ? (
            <>
              <div className="transfer-import-hero">
                <span><Sparkles aria-hidden="true" /></span>
                <div><strong>المسار الافتراضي والأسهل</strong><p>نزّل النموذج، املؤه ، ثم ارفعه؛ يطابق النظام البيانات ويجهزها للنشر تلقائياً. ويمكنك أيضاً نسخ جدول الجهة المعتمد من PDF إلى فصل فارغ.</p></div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json,.xlsx,.xls,application/pdf,.pdf"
                className="transfer-file"
                onChange={event => { const file = event.target.files?.[0]; if (file) void readFile(file); event.target.value = ""; }}
              />
              <div className="transfer-import-actions">
                <PrimaryButton type="button" data-guide-ignore="تنزيل نموذج محلي لا يغير بيانات الجدول" onClick={() => void downloadTemplate()} disabled={busy} title="ملف Excel جاهز بالأعمدة الصحيحة وورقة شرح">
                  <Download />تحميل النموذج الافتراضي
                </PrimaryButton>
                <SecondaryButton type="button" data-guide-ignore="يفتح منتقي ملف محلي ومعاينة الاستيراد لها بوابة نشر مستقلة" onClick={() => fileRef.current?.click()} disabled={!scopeReady || busy}>
                  <Upload />رفع Excel أو PDF
                </SecondaryButton>
              </div>
              {readProgress ? (
                <div className="import-progress" role="status" aria-live="polite">
                  <div className="import-progress-track"><i style={{ width: `${readProgress.pct}%` }} /></div>
                  <span>{readProgress.message}</span>
                </div>
              ) : null}

              {/* While a sharper reading is in flight the table is frozen. The
                  rows to keep were captured when the request left, so an edit
                  made meanwhile would be silently overwritten by the merge. */}
              {xlsxPreview ? (
                <div className={`transfer-preview${smartBusy ? " is-smart-locked" : ""}`} aria-busy={smartBusy}>
                  <div className="transfer-counts import-summary-cards">
                    <span className="understood"><b>{Number(xlsxPreview.count || 0).toLocaleString("ar-KW-u-nu-latn")}</b><small>صفاً فُهم</small></span>
                    {importKind!=="authority-pdf"?<span className={xlsxPreview.issues?.length ? "warn" : ""}><b>{(xlsxPreview.issues?.length || 0).toLocaleString("ar-KW-u-nu-latn")}</b><small>ملاحظة</small></span>:null}
                    {importKind==="authority-pdf"?<span className="pages"><b>{Number(xlsxPreview.pages||0).toLocaleString("ar-KW-u-nu-latn")}</b><small>صفحات PDF</small></span>:null}
                    {importKind==="authority-pdf"&&pdfReadinessSummary?<span className="ready"><b>{pdfReadinessSummary.ready.toLocaleString("ar-KW-u-nu-latn")}</b><small>جاهز</small></span>:null}
                    {/* One card, two units: the rows still waiting and the exact
                        number of blanks inside them — so filling two cells of a
                        three-blank row visibly moves the smaller number even
                        when the row rightly stays. The sharper reading's tally
                        rides underneath as its receipt. */}
                    {importKind==="authority-pdf"&&pdfReadinessSummary?.review?(
                      <span className="warn review-breakdown">
                        <b>{pdfReadinessSummary.review.toLocaleString("ar-KW-u-nu-latn")}</b>
                        <small>للمراجعة</small>
                        <small className="review-units">
                          {pdfReadinessSummary.reviewCells?<em>{pdfReadinessSummary.reviewCells.toLocaleString("ar-KW-u-nu-latn")} خانة ناقصة</em>:null}
                          {Number(xlsxPreview.smartFilled||0)>0?<em className="filled">عُبّئت {Number(xlsxPreview.smartFilled).toLocaleString("ar-KW-u-nu-latn")} بالقراءة الأدق</em>:null}
                        </small>
                      </span>
                    ):null}
                  </div>
                  {/* The reading above is the approved engine's. Asking for a
                      sharper one is a deliberate click, never automatic. */}
                  {/* Offered only while it can still add something: pages that
                      read cleanly are never sent, and a page already re-read is
                      not offered twice. Nothing to gain ⇒ no chip at all. */}
                  {/* The moment it is pressed the offer is spent, so the chip
                      goes at once and the progress bar above carries the wait.
                      Keeping it on screen while busy made a one-use action look
                      like it was still available. */}
                  {importKind === "authority-pdf" && smartFile && !smartBusy && !smartUsed && smartPendingPages.length ? (
                    <div className="import-smart-retry">
                      <button
                        type="button"
                        className="import-smart-chip"
                        data-guide-ignore="إجراء اختياري داخل معاينة الاستيراد لإعادة قراءة الصفحات المتعثرة عبر Smart Import؛ ليس ميزة إرشاد مستقلة"
                        disabled={busy}
                        onClick={() => { const f = smartFile; if (f) void readSmart(f, smartPendingPages); }}
                        title={`قراءة أدق للصفحات ${smartPendingPages.join("، ")} فقط — الصفحات التي قُرئت بلا أخطاء تبقى كما هي ولا تُرسل. لا تُرسل الأرقام المدنية.`}
                      >
                        <Sparkles aria-hidden="true" />
                        <span>قراءة أدق · {countOf(smartPendingPages.length, AR.page)}</span>
                      </button>
                    </div>
                  ) : null}
                  {/* Every proposed cell, grouped by page, before one changes.
                      The token gate is what guarantees these cells belong to the
                      file currently on screen and not to the one before it. */}
                  {smartProposal && smartProposal.token === smartToken(smartFile) ? (
                    <div className="smart-proposal" role="group" aria-label="مقترح القراءة الأدق">
                      <div className="smart-proposal-head">
                        <Sparkles aria-hidden="true" />
                        <b>{countOf(smartProposal.fills.length, AR.cell)} ناقصة يمكن تعبئتها</b>
                        <small>لن يتغيّر شيء قبل موافقتك · اختر ما تثق به فقط · الخلايا المقروءة تبقى كما هي</small>
                        <span className="smart-proposal-toggle">
                          <button type="button" data-guide-ignore="تحديد كل الخلايا المقترحة داخل المعاينة" onClick={() => setSmartPicked(new Set(smartProposal.fills.map(fillKey)))} disabled={smartPicked.size === smartProposal.fills.length}>تحديد الكل</button>
                          <button type="button" data-guide-ignore="إلغاء تحديد الخلايا المقترحة داخل المعاينة" onClick={() => setSmartPicked(new Set())} disabled={!smartPicked.size}>إلغاء التحديد</button>
                        </span>
                      </div>
                      {/* Pages sit side by side so a long list reads as a few
                          short ones — the eye compares within a page, not down
                          a single column of thirty unrelated rows. */}
                      <div className="smart-proposal-grid">
                      {[...new Set<number>(smartProposal.fills.map(fill => Number(fill.page)))].sort((a, b) => a - b).map((page: number) => {
                        const pageFills = smartProposal.fills.filter(fill => fill.page === page);
                        const pagePicked = pageFills.filter(fill => smartPicked.has(fillKey(fill))).length;
                        return (
                        <div className="smart-proposal-page" key={page}>
                          <span className="smart-proposal-page-title">
                            صفحة {page.toLocaleString("ar-KW-u-nu-latn")}
                            <small>{pagePicked.toLocaleString("ar-KW-u-nu-latn")}/{pageFills.length.toLocaleString("ar-KW-u-nu-latn")}</small>
                          </span>
                          <ul>
                            {pageFills.slice(0, 40).map((fill, index) => {
                              const key = fillKey(fill);
                              const picked = smartPicked.has(key);
                              const shown = fill.field === "AdInstructorId"
                                ? (instructors.find((person: any) => Number(person.AdInstructorId) === Number(fill.value))?.AdInstructorName || `أستاذ #${fill.value}`)
                                : fill.field === "AdCourseId"
                                  ? (deptCourses.find((course: any) => Number(course.AdCourseId) === Number(fill.value))?.CourseName || `مقرر #${fill.value}`)
                                  : fill.value;
                              return (
                              <li key={`${page}-${key}-${index}`} className={picked ? "" : "is-off"}>
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={picked}
                                    onChange={() => setSmartPicked(prev => {
                                      const next = new Set(prev);
                                      if (next.has(key)) next.delete(key); else next.add(key);
                                      return next;
                                    })}
                                  />
                                  <span className="smart-proposal-where">
                                    <b>{fill.course || "مقرر بلا اسم"}</b>
                                    {fill.section ? <small>شعبة {fill.section}</small> : null}
                                  </span>
                                  {/* Field, arrow and value are one unit so the
                                      answer never wraps away from its question.
                                      An identifier is not an answer either: the
                                      name the reviewer would recognise is shown. */}
                                  <span className="smart-proposal-change">
                                    <span className="smart-proposal-field">{fill.label}</span>
                                    <span className="smart-proposal-value">{shown}</span>
                                  </span>
                                </label>
                              </li>
                            );})}
                          </ul>
                        </div>
                      );})}
                      </div>
                      {/* The reviewer approves cells, not the reasoning behind
                          them. Why a candidate was distrusted, or what generic
                          label the page printed, is engine bookkeeping: it stays
                          in the server log and out of a decision screen where it
                          only reads as noise. */}

                      <div className="smart-proposal-actions">
                        <button type="button" className="smart-proposal-apply" data-guide-ignore="يطبق الخلايا المحددة داخل المعاينة فقط ولا ينشر شيئًا" onClick={applySmartProposal} disabled={busy || !smartPicked.size}>
                          {smartPicked.size ? `تطبيق ${countOf(smartPicked.size, AR.cell)}` : "لم تحدد شيئاً"}
                        </button>
                        <button type="button" className="smart-proposal-cancel" data-guide-ignore="يتجاهل مقترح القراءة الأدق ويُبقي المعاينة كما هي" onClick={dismissSmartProposal} disabled={busy}>
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {/* Once spent, the sharper reading leaves no chip behind at
                      all: a badge that still looks like the button invites the
                      click it is meant to prevent. Its result is already on the
                      table, and the «خلية عُبّئت» card records what it did. */}
                  {importKind === "authority-pdf" ? <div className="import-color-key" aria-label="تعريف ألوان المعاينة"><span className="derived"><i/>أخضر · مكتمل</span><span className="review"><i/>ذهبي · يحتاج مراجعة</span><span className="missing"><i/>أحمر · ناقص</span></div> : null}
                  {importKind === "authority-pdf" && xlsxPreview.rows?.length ? (
                    <>
                      {/* The whole table, red on what the scan could not read,
                          and a quick edit + delete beside EVERY row. */}
                      <PagedImportPreview
                        rows={xlsxPreview.rows as ImportRow[]}
                        pageCount={Number(xlsxPreview.pages||0)}
                        pageDiagnostics={Array.isArray(xlsxPreview.pageDiagnostics)?xlsxPreview.pageDiagnostics:[]}
                        pageSummaries={Array.isArray(xlsxPreview.pageSummaries)?xlsxPreview.pageSummaries:[]}
                        courses={deptCourses as any}
                        instructors={instructors as any}
                        departmentIds={departmentIds}
                        visitingIds={roster}
                        visitingPeople={directoryPeople as any}
                        collegeId={collegeId}
                        sectionId={sectionId}
                        termId={termId}
                        onRows={next => setXlsxPreview((prev: any) => {
                          if(!prev)return prev;
                          // The visual lock is the first guard; this is the one
                          // that actually protects the data if anything slips past it.
                          if(smartBusy)return prev;
                          const normalized=assignAuthoritySections(next);
                          const documentWarnings=(Array.isArray(prev.issues)?prev.issues:[]).filter((issue:string)=>/^تحذير:/.test(String(issue)));
                          return { ...prev, rows: normalized, count: normalized.length, issues: documentWarnings, valid: normalized.length > 0 || (Array.isArray(prev.baselineRows) && prev.baselineRows.length > 0) };
                        })}
                      />
                    </>
                  ) : xlsxPreview.issues?.length ? (
                    <ul className="transfer-rejected">
                      {xlsxPreview.issues.slice(0, 8).map((issue: string, index: number) => (
                        <li key={index}><span>{issue}</span></li>
                      ))}
                      {xlsxPreview.issues.length > 8 ? <li className="muted">و{xlsxPreview.issues.length - 8} غيرها…</li> : null}
                    </ul>
                  ) : null}
                  {xlsxDraft ? (
                    <p className="transfer-done"><Check /> {xlsxDraft.startsWith("published:")
                      ? "اكتمل تعبئة الجدول ونشره بنجاح. تقرير تغييرات PDF أصبح متاحاً في مركز الاستعلامات والتقارير."
                      : "حُفظت المسودة داخل أدوات البيانات. يمكنك نشرها من هنا متى شئت."}</p>
                  ) : (
                    <div className="transfer-import-commit-wrap">
                      <div className="transfer-import-commit">
                        {importReady ? (
                          <PrimaryButton type="button" data-guide-ignore="إجراء استيراد له تحقق ومراجعة ونقطة أمان خاصة داخل نفس النافذة" onClick={() => void saveExcelDraft(true)} disabled={busy || !importReady}>
                            {busy ? "يجهّز…" : importKind === "authority-pdf" && Number(xlsxPreview.count || 0) === 0 ? "اعتماد حذف جميع مواعيد PDF ونشره" : `تعبئة ${countOf(Number(xlsxPreview.count || 0), AR.appointment)} ونشرها`}
                          </PrimaryButton>
                        ) : null}
                        {importKind==="authority-pdf" && importReady ? <SecondaryButton type="button" data-guide-ignore="حفظ مسودة الاستيراد من المعاينة إجراء محلي موثق داخل أدوات البيانات" onClick={() => void saveExcelDraft(false)} disabled={busy || !importReady}>حفظ كمسودة فقط</SecondaryButton> : null}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {preview ? (
                <div className="transfer-preview">
                  <div className="transfer-counts">
                    <span><b>{Number(preview.ready ?? preview.added ?? 0).toLocaleString("ar-KW-u-nu-latn")}</b>{preview.preview ? "جاهز للإضافة" : "أُضيف"}</span>
                    <span className="warn"><b>{(preview.rejected?.length || 0).toLocaleString("ar-KW-u-nu-latn")}</b>مرفوض</span>
                  </div>
                  {preview.rejected?.length ? (
                    <ul className="transfer-rejected">
                      {preview.rejected.slice(0, 8).map((item: any, index: number) => (
                        <li key={index}><b>{item.label}</b><span>{item.reason}</span></li>
                      ))}
                      {preview.rejected.length > 8 ? <li className="muted">و{preview.rejected.length - 8} غيرها…</li> : null}
                    </ul>
                  ) : null}
                  {preview.preview && preview.ready ? (
                    <PrimaryButton type="button" onClick={() => payload && run(payload, true)} disabled={busy}>
                      {busy ? "يستورد…" : `أضف ${Number(preview.ready).toLocaleString("ar-KW-u-nu-latn")} موعداً`}
                    </PrimaryButton>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          {tab === "publish" ? (
            <>
              <div className="tool-lede">
                <span className="tool-lede-mark"><Link2 aria-hidden="true" /></span>
                <div>
                  <strong>نشر الجدول من أدوات البيانات</strong>
                  <p className="muted">أنشئ رابط القراءة وأدر روابط النشر من هنا، بدون الانتقال إلى مركز الذكاء.</p>
                </div>
              </div>
              <div className="transfer-publish-tool">
                <SchedulePublish collegeId={collegeId} sectionId={sectionId} termId={termId} />
              </div>
            </>
          ) : null}

          {tab === "visiting" ? (
            <>
              <div className="tool-lede">
                <span className="tool-lede-mark"><UserPlus aria-hidden="true" /></span>
                <div>
                  <strong>منتدبو القسم</strong>
                  <ul className="tool-lede-chips">
                    <li><UsersRound aria-hidden="true" />قائمة خاصة بهذا القسم</li>
                    <li><Check aria-hidden="true" />اختيار مستقل لكل فصل</li>
                    <li><Copy aria-hidden="true" />نسخ بعضهم أو كلهم</li>
                  </ul>
                </div>
              </div>

              <div className="roster-copy roster-copy-rich">
                <select value={copyFrom || ""} onChange={e => void loadCopyRoster(Number(e.target.value) || 0)}>
                  <option value="">انسخ من فصل…</option>
                  {sortedTerms.filter(term => Number(term.AdTermId) !== termId).map(term => (
                    <option key={term.AdTermId} value={term.AdTermId}>{term.AdTermName}</option>
                  ))}
                </select>
                <SecondaryButton type="button" data-guide-ignore="نسخ منتدبي فصل بعد تحديدهم إجراء بيانات محلي داخل أداة المنتدبين" onClick={copyRoster} disabled={!copyFrom || !copySelected.length || busy}><Copy />انسخ المحدد</SecondaryButton>
              </div>
              {copyFrom ? <div className="roster-copy-picks">
                <header><strong>من سيتم نسخه؟</strong><button type="button" data-guide-ignore="تحديد الكل في قائمة نسخ المنتدبين لا يغير البيانات حتى الضغط على النسخ" onClick={()=>setCopySelected(copySelected.length===copyIds.length?[]:[...copyIds])}>{copySelected.length===copyIds.length&&copyIds.length?"إلغاء تحديد الكل":"تحديد الكل"}</button></header>
                {copyIds.length ? copyIds.map(id => { const person=copyPeople.find(item=>item.AdInstructorId===id)||directory.find(item=>item.AdInstructorId===id); const on=copySelected.includes(id); return <label key={id}><input type="checkbox" checked={on} onChange={()=>setCopySelected(current=>on?current.filter(x=>x!==id):[...current,id])}/><span>{person?.AdInstructorName||`منتدب ${id}`}</span></label>; }) : <small>لا يوجد منتدبون في هذا الفصل.</small>}
              </div> : null}

              <div className="roster-add">
                <div className="roster-add-head"><UserPlus aria-hidden="true" /><strong>أضف منتدباً لقائمة القسم</strong></div>
                {error && !editingDelegate ? <p className="transfer-error roster-local-error"><AlertTriangle />{error}</p> : null}
                <div className="roster-add-fields">
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="اسم المنتدب" aria-label="اسم المنتدب الجديد" />
                  <input value={newCivil} onChange={e => setNewCivil(e.target.value.replace(/[^\d]/g, ""))} onBlur={()=>{if(newCivil&& !validateCivilId(newCivil).isValid)setError(validateCivilId(newCivil).message||"الرقم المدني غير صحيح.");}} placeholder="الرقم المدني" inputMode="numeric" dir="ltr" maxLength={12} aria-label="الرقم المدني للمنتدب الجديد" />
                  <PrimaryButton type="button" data-guide-ignore="إضافة منتدب إلى دليل القسم إجراء إداري واضح داخل أداة المنتدبين" onClick={addNewDelegate} disabled={busy || !newName.trim() || !newCivil.trim()}><Plus />أضف للقسم</PrimaryButton>
                </div>
                <small className="roster-rule-note">يمكن أن يكون المنتدب نفسه مسجلاً في أكثر من قسم، لكن لا يمكن إضافته مرتين داخل القسم نفسه.</small>
              </div>

              <label className="roster-search-box"><Search aria-hidden="true"/><input className="roster-search" value={rosterQuery} onChange={e => setRosterQuery(e.target.value)} placeholder="بحث سريع بالاسم أو الرقم المدني…" aria-label="بحث في منتدبي القسم" /></label>
              <div className="roster-directory-head"><div><strong>كل منتدبي القسم</strong><small>{directory.length.toLocaleString("ar-KW-u-nu-latn")} محفوظون للقسم · علامة الفصل لا تحذف الاسم من هذه القائمة</small></div></div>
              <div className="roster-directory">
                {visibleDirectory.map(person => {
                  const on=roster.includes(person.AdInstructorId),editing=editingDelegate===person.AdInstructorId;
                  return <article key={person.AdInstructorId} className={on?"is-term-on":""}>
                    {editing ? <div className="roster-edit-wrap">
                      {error ? <p className="transfer-error roster-local-error"><AlertTriangle />{error}</p> : null}
                      <div className="roster-edit-fields">
                      <input value={editName} onChange={e=>setEditName(e.target.value)} aria-label="تعديل اسم المنتدب"/>
                      <input value={editCivil} onChange={e=>setEditCivil(e.target.value.replace(/[^\d]/g,""))} onBlur={()=>{if(editCivil && !validateCivilId(editCivil).isValid)setError(validateCivilId(editCivil).message||"الرقم المدني غير صحيح.");}} inputMode="numeric" dir="ltr" maxLength={12} aria-label="تعديل الرقم المدني"/>
                      <PrimaryButton type="button" data-guide-ignore="حفظ تعديل بيانات منتدب داخل أداة المنتدبين" onClick={()=>void saveDelegateEdit(person.AdInstructorId)} disabled={busy}>حفظ</PrimaryButton>
                      <SecondaryButton type="button" data-guide-ignore="إلغاء تحرير منتدب لا يغير البيانات" onClick={()=>{setEditingDelegate(0);setError(null);}} disabled={busy}>إلغاء</SecondaryButton>
                      </div>
                    </div> : <>
                      <button type="button" data-guide-ignore="تحديد عضوية المنتدب في الفصل الحالي إجراء واضح داخل أداة المنتدبين" className={`roster-term-toggle ${on?"on":""}`} onClick={()=>void saveRoster(on?roster.filter(id=>id!==person.AdInstructorId):[...roster,person.AdInstructorId])} aria-pressed={on}>
                        {on?<Check aria-hidden="true"/>:<Plus aria-hidden="true"/>}<span>{on?"يدرّس هذا الفصل":"أضفه لهذا الفصل"}</span>
                      </button>
                      <span className="instructor-identity"><b>{person.AdInstructorName}</b><small dir="ltr">{person.AdInstructorCivil||"—"}</small></span>
                      <div className="roster-row-actions">
                        <button type="button" data-guide-ignore="فتح تحرير المنتدب داخل صفه" onClick={()=>{setEditingDelegate(person.AdInstructorId);setEditName(person.AdInstructorName);setEditCivil(String(person.AdInstructorCivil||""));setError(null);}} aria-label={`تعديل ${person.AdInstructorName}`} title="تعديل"><Pencil/></button>
                        <button type="button" data-guide-ignore="حذف المنتدب من دليل القسم له تأكيد مستقل قبل التنفيذ" className="danger" onClick={()=>void removeDelegate(person.AdInstructorId)} aria-label={`حذف ${person.AdInstructorName} من قائمة القسم`} title="حذف من قائمة القسم"><Trash2/></button>
                      </div>
                    </>}
                  </article>;
                })}
                {rosterLoaded && !visibleDirectory.length ? <p className="roster-empty">{rosterQuery.trim()?`لا منتدب يطابق «${rosterQuery.trim()}» في هذا القسم.`:"لا توجد قائمة منتدبين لهذا القسم بعد."}</p> : null}
              </div>
            </>
          ) : null}

          {tab === "retire" ? (
            <>
              <div className="tool-lede">
                <span className="tool-lede-mark"><UserMinus aria-hidden="true" /></span>
                <div>
                  <strong>أستاذ تقاعد أو تفرّغ</strong>
                  <ul className="tool-lede-chips">
                    <li><ArrowLeftRight aria-hidden="true" />تنتقل مواعيده إلى بديل</li>
                    <li><UserPlus aria-hidden="true" />أو تُترك لتوزَّع لاحقاً</li>
                  </ul>
                  {/* Kept as a sentence on purpose: it is a promise about what
                      will NOT happen, and a chip cannot make a promise. */}
                  <small>لا يُحذف أي موعد.</small>
                </div>
              </div>
              <div className="transfer-swap">
                <label>
                  <span>من</span>
                  <select value={fromId || ""} onChange={e => { setFromId(Number(e.target.value) || 0); setRetirePreview(null); }}>
                    <option value="">اختر الأستاذ</option>
                    {departmentStaff.map(person => (
                      <option key={person.AdInstructorId} value={person.AdInstructorId}>{person.AdInstructorName}</option>
                    ))}
                  </select>
                </label>
                <ArrowLeftRight aria-hidden="true" />
                <label>
                  <span>إلى</span>
                  <select value={toId || ""} onChange={e => setToId(Number(e.target.value) || 0)}>
                    <option value="">اتركها بلا أستاذ</option>
                    {sortedInstructors.map(person => (
                      <option key={person.AdInstructorId} value={person.AdInstructorId}>{person.AdInstructorName}</option>
                    ))}
                  </select>
                </label>
              </div>
              {fromId ? (
                <div className={`replacement-compatibility ${replacementCheck?.compatible === false ? "conflict" : replacementCheck?.compatible ? "ok" : "checking"}`}>
                  <span>{replacementCheck?.compatible === false ? <ShieldAlert /> : <CheckCircle2 />}</span>
                  <div>
                    <strong>{replacementCheck?.compatible === false ? "يوجد تعارض" : replacementCheck?.compatible ? "متوافق مع جميع المواعيد" : "نفحص المواعيد…"}</strong>
                    <small>{replacementCheck?.compatible === false ? (replacementCheck.reasons?.[0] || "الأستاذ البديل مرتبط بموعد متداخل.") : retirePreview != null ? `${retirePreview.toLocaleString("ar-KW-u-nu-latn")} موعد سيتأثر` : ""}</small>
                  </div>
                </div>
              ) : null}
              {replacementCheck?.reasons?.length ? <ul className="replacement-conflicts">{replacementCheck.reasons.slice(0,4).map((reason:string,index:number)=><li key={index}>{reason}</li>)}</ul> : null}
              {retirePreview != null && retirePreview > 0 ? (
                <PrimaryButton type="button" data-guide-ignore="تنفيذ استبدال أستاذ إجراء بيانات حساس وله فحص تعارض وتأكيد مستقل" onClick={() => retire(true)} disabled={busy || replacementCheck?.compatible === false} title={replacementCheck?.compatible === false ? (replacementCheck.reasons?.[0] || "يوجد تعارض") : undefined}>
                  {busy ? "ينفّذ…" : "نفّذ الاستبدال"}
                </PrimaryButton>
              ) : null}
              <section className="replacement-history">
                <header><History /><div><strong>سجل الاستبدالات</strong><small>يمكن التراجع عن آخر القرارات بأمان.</small></div></header>
                {replacementHistory.length ? replacementHistory.slice(0,8).map(item => (
                  <article key={item.id}><div><strong>{String(item.label).replace("قبل استبدال الأستاذ: ", "")}</strong><small>{new Date(item.createdAt).toLocaleString("ar-KW-u-nu-latn")} · {item.userName}</small></div><SecondaryButton type="button" onClick={() => void undoReplacement(item.id)} disabled={busy}><RotateCcw />تراجع</SecondaryButton></article>
                )) : <p className="muted">لا توجد عمليات استبدال مسجلة لهذا الفصل.</p>}
              </section>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
