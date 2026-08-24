import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeftRight, BookOpen, Building2, Check, CheckCircle2, Clock, Copy, Download, History, Link2, Pencil, Plus, RotateCcw, Search, ShieldAlert, Sparkles, Trash2, Upload, UserMinus, UserPlus, UsersRound, X } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "./ui";
import { validateCivilId } from "../utils/civilId";
import { AR, countOf } from "../utils/arabicCount";
import ImportPreviewTable, { type ImportRow } from "./ImportPreviewTable";
import SchedulePublish from "./SchedulePublish";
import { sortByName } from "../utils/sorting";
import { sortTermsNewest } from "../utils/termSequence";
import { formatScheduleTimeRange } from "../utils/scheduleTime";

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
  const [tab, setTab] = useState<Tab>("export");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
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
    if (tab !== "visiting" || !collegeId || !sectionId || !termId) return;
    setRosterLoaded(false);
    const controller = new AbortController();
    const query = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId), termId: String(termId) });
    const directoryQuery = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId) });
    Promise.all([
      fetch(`/api/visiting-roster?${query}`, { signal: controller.signal }).then(response => response.ok ? response.json() : { instructorIds: [] }),
      fetch(`/api/department-delegates?${directoryQuery}`, { signal: controller.signal }).then(response => response.ok ? response.json() : { instructorIds: [], instructors: [] }),
    ]).then(([termData, directoryData]) => {
      setRoster(termData.instructorIds || []);
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
  const readPdf = async (file: File) => {
    setError(null); setXlsxPreview(null); setXlsxDraft(""); setImportKind("authority-pdf"); setBusy(true);
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
            const total=Math.max(Number(event.pages)||0,1);
            const seen=event.phase==="match"?total:Math.max(0,Number(event.page)||0);
            setReadProgress({pct:Math.min(97,Math.max(4,Math.round(seen/total*100))),message:String(event.message||"")});
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
      const scannedRows=Array.isArray(data.rows)?data.rows:[];
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
    if (!xlsxPreview?.valid) {
      setError("لا يمكن حفظ المسودة أو تعبئة الجدول قبل إكمال الحقول الناقصة (المميزة باللون الأحمر أعلاه مثل اسم المقرر، أستاذ المقرر، الوقت أو القاعة). يرجى الضغط على زر التعديل (✏️) بجانب الصفوف غير المكتملة لتعديلها.");
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
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر حفظ المسودة");
      const id=String(data.id||"");setXlsxDraft(id||"تم");
      if(publishNow&&id)await publishImportedDraft(id);
    } catch (e: any) {
      setError(e.message || "تعذر حفظ المسودة");
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (file: File) => {
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
        {error && tab !== "visiting" ? <p className="transfer-error"><AlertTriangle />{error}</p> : null}

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

              {xlsxPreview ? (
                <div className="transfer-preview">
                  <div className="transfer-counts">
                    <span><b>{Number(xlsxPreview.count || 0).toLocaleString("ar-KW-u-nu-latn")}</b>صفاً فُهم</span>
                    <span className={xlsxPreview.issues?.length ? "warn" : ""}><b>{(xlsxPreview.issues?.length || 0).toLocaleString("ar-KW-u-nu-latn")}</b>ملاحظة</span>
                    {importKind==="authority-pdf"?<span><b>{Number(xlsxPreview.pages||0).toLocaleString("ar-KW-u-nu-latn")}</b>صفحات PDF</span>:null}
                  </div>
                  {importKind === "authority-pdf" && xlsxPreview.rows?.length ? (
                    <>
                      {/* The whole table, red on what the scan could not read,
                          and a quick edit + delete beside EVERY row. */}
                      <ImportPreviewTable
                        rows={xlsxPreview.rows as ImportRow[]}
                        courses={deptCourses as any}
                        instructors={instructors as any}
                        collegeId={collegeId}
                        sectionId={sectionId}
                        termId={termId}
                        onRows={next => setXlsxPreview((prev: any) => prev ? { ...prev, rows: next, count: next.length, valid: next.length > 0 } : prev)}
                      />
                      {xlsxPreview.issues?.length ? (
                        <details className="import-issues-fold">
                          <summary>ملاحظات القراءة ({Number(xlsxPreview.issues.length).toLocaleString("ar-KW-u-nu-latn")}) — الخانات الحمراء أعلاه هي مواضعها</summary>
                          <ul className="transfer-rejected">
                            {xlsxPreview.issues.map((issue: string, index: number) => (
                              <li key={index}><span>{issue}</span></li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
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
                        <PrimaryButton type="button" data-guide-ignore="إجراء استيراد له تحقق ومراجعة ونقطة أمان خاصة داخل نفس النافذة" onClick={() => void saveExcelDraft(true)} disabled={busy}>
                          {busy ? "يجهّز…" : `تعبئة ${countOf(Number(xlsxPreview.count || 0), AR.appointment)} ونشرها`}
                        </PrimaryButton>
                        {importKind==="authority-pdf" ? <SecondaryButton type="button" data-guide-ignore="حفظ مسودة الاستيراد من المعاينة إجراء محلي موثق داخل أدوات البيانات" onClick={() => void saveExcelDraft(false)} disabled={busy}>حفظ كمسودة فقط</SecondaryButton> : null}
                      </div>
                      {!xlsxPreview.valid ? (
                        <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2.5 text-xs mt-2">
                          ⚠️ تنبيه: توجد صفوف بحاجة لإكمال بياناتها (المقرر، الوقت، اليوم، المبنى/القاعة، أو أستاذ المقرر). اضغط على زر <b>تعديل (✏️)</b> في يمين أي صف ملون بالأحمر لتصحيحه، ثم اضغط حفظ لتعبئة ونشر الجدول.
                        </p>
                      ) : null}
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
