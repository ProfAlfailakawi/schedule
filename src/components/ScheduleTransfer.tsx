import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Check, CheckCircle2, Copy, Download, History, Plus, RotateCcw, ShieldAlert, Upload, UserMinus, UserPlus, X } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "./ui";
import { validateCivilId } from "../utils/civilId";
import { AR, countOf } from "../utils/arabicCount";
import { sortByName } from "../utils/sorting";
import { sortTermsNewest } from "../utils/termSequence";

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

type Tab = "export" | "import" | "retire" | "visiting";

export default function ScheduleTransfer({ collegeId, sectionId, termId, instructors, departmentIds, terms, onChanged, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("export");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [payload, setPayload] = useState<any>(null);
  const [xlsxPreview, setXlsxPreview] = useState<any>(null);
  const [xlsxDraft, setXlsxDraft] = useState("");
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

  React.useEffect(() => {
    if (tab !== "visiting" || !scopeReadyRef.current) return;
    const query = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId), termId: String(termId) });
    fetch(`/api/visiting-roster?${query}`)
      .then(response => (response.ok ? response.json() : { instructorIds: [] }))
      .then(data => { setRoster(data.instructorIds || []); setRosterLoaded(true); })
      .catch(() => setRosterLoaded(true));
  }, [tab, collegeId, sectionId, termId]);

  const saveRoster = async (ids: number[]) => {
    setRoster(ids);
    setBusy(true);
    try {
      await fetch("/api/visiting-roster", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, instructorIds: ids })
      });
      onChanged();
    } finally { setBusy(false); }
  };

  // Create a brand-new delegate and drop them straight into this term's roster,
  // so "where do I add my delegates?" has one answer: right here (Note 1).
  const addNewDelegate = async () => {
    const name = newName.trim(), civil = newCivil.trim();
    if (!name || !civil) { setError("اكتب اسم المنتدب ورقمه المدني."); return; }
    const check = validateCivilId(civil);
    if (!check.isValid) { setError(check.message || "رقم مدني غير صالح."); return; }
    if (instructors.some(person => String(person.AdInstructorCivil || "") === civil)) {
      setError("هذا الرقم المدني مسجّل بالفعل — ابحث عن الاسم أعلاه وأضِفه.");
      return;
    }
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/instructors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ AdInstructorCivil: civil, AdInstructorName: name, AdInstructorMobile: "" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذّر إضافة المنتدب.");
      setNewName(""); setNewCivil("");
      onChanged();
      await saveRoster([...roster, Number(data.AdInstructorId)]);
    } catch (e: any) { setError(e.message || "تعذّر إضافة المنتدب."); }
    finally { setBusy(false); }
  };

  const copyRoster = async () => {
    if (!copyFrom) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/visiting-roster/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, fromTermId: copyFrom, toTermId: termId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر النسخ");
      setRoster(data.instructorIds || []);
      onChanged();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const scopeReady = Boolean(collegeId && sectionId && termId);
  const scopeReadyRef = useRef(scopeReady);
  scopeReadyRef.current = scopeReady;
  const named = (id: number) => instructors.find(x => x.AdInstructorId === id)?.AdInstructorName || "";
  const sortedInstructors = useMemo(() => sortByName(instructors, person => person.AdInstructorName), [instructors]);
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
          (r.start && r.end) ? `${r.start}-${r.end}` : "",
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
    const headers = ["رمز المقرر", "المقرر الدراسي", "الشعبة", "أستاذ المقرر", "الرقم المدني", "الأيام", "الوقت", "المبنى", "القاعة"];
    const sample = [
      ["112", "ورشة إنتاج مواد تعليمية", "501", "د. منى حسن", "285010112345", "الأحد - الثلاثاء", "08:00-09:20", "B9", "F10"],
      ["491", "الوسائط المتعددة", "503", "د. خالد المطيري", "", "الاثنين - الأربعاء", "11:00-12:20", "B9", "F12"],
    ];
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...sample]);
    (sheet as any)["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 8 }, { wch: 22 }, { wch: 15 }, { wch: 22 }, { wch: 13 }, { wch: 9 }, { wch: 9 }];
    const guide = XLSX.utils.aoa_to_sheet([
      ["كيف يفهم الاستيراد ملفك"],
      [""],
      ["المطابقة", "كل صف يُطابَق برمز المقرر داخل قسمك، والأستاذ بالرقم المدني أو بالاسم كما هو مسجل."],
      ["الأيام", "اكتب أسماء الأيام كما تنطقها: الأحد - الثلاثاء - الخميس. أي فاصل يصلح."],
      ["الوقت", "من-إلى بصيغة 24 ساعة: 08:00-09:20."],
      ["الصفوف الناقصة", "صف برمز غير معروف أو أستاذ غير معروف يظهر لك كملاحظة قبل أي حفظ — لا يُكتب شيء خفية."],
      ["ماذا يحدث بعد الرفع", "يُعرض الملف أولاً كحصيلة: كم صفاً فُهم وما المشاكل. الموافقة تنشئ مسودة في مركز الذكاء، ومن هناك تُنشر فتحل محل جدول القسم لهذا الفصل، مع نقطة أمان تلقائية قبل النشر تسمح بالرجوع."],
    ]);
    (guide as any)["!cols"] = [{ wch: 16 }, { wch: 90 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "الجدول");
    XLSX.utils.book_append_sheet(wb, guide, "طريقة الاستخدام");
    XLSX.writeFile(wb, "نموذج-استيراد-الجدول.xlsx");
  };

  /** An Excel upload: parsed here, judged by the importer, saved as a draft. */
  const readExcel = async (file: File) => {
    setError(null); setXlsxPreview(null); setXlsxDraft("");
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
  const saveExcelDraft = async () => {
    if (!xlsxPreview?.valid) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/intelligence/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collegeId, sectionId, termId,
          source: "import",
          name: `استيراد Excel — ${xlsxPreview.fileName || ""}`.trim(),
          rows: xlsxPreview.rows,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر حفظ المسودة");
      setXlsxDraft(String(data.id || "تم"));
    } catch (e: any) {
      setError(e.message || "تعذر حفظ المسودة");
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (file: File) => {
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
      <section className="transfer-sheet" role="dialog" aria-modal="true" aria-label="نقل الجدول">
        <header>
          <div>
            <span className="surface-kicker">الجدول كوحدة واحدة</span>
            <h2>تصدير · استيراد · استبدال · منتدبون</h2>
          </div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="إغلاق"><X /></button>
        </header>

        <nav className="transfer-tabs">
          <button type="button" className={tab === "export" ? "active" : ""} onClick={() => setTab("export")}><Download />تصدير</button>
          <button type="button" className={tab === "import" ? "active" : ""} onClick={() => setTab("import")}><Upload />استيراد</button>
          <button type="button" className={tab === "retire" ? "active" : ""} onClick={() => setTab("retire")}><UserMinus />استبدال</button>
          <button type="button" className={tab === "visiting" ? "active" : ""} onClick={() => setTab("visiting")}><UserPlus />المنتدبون</button>
        </nav>

        {!scopeReady ? (
          <p className="transfer-note"><AlertTriangle />اختر الكلية والقسم والفصل أولاً.</p>
        ) : null}
        {error ? <p className="transfer-error"><AlertTriangle />{error}</p> : null}

        <div className="transfer-body">
          {tab === "export" ? (
            <>
              <p>تصدير الفصل الدراسي الحالي ببياناته الكاملة (المقررات، الأساتذة، الأوقات، القاعات، الأيام) مباشرة إلى ملف Excel أو JSON للأرشفة والمشاركة.</p>
              <div className="transfer-import-actions">
                <PrimaryButton type="button" onClick={() => void exportTerm("xlsx")} disabled={!scopeReady || busy}>
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
              <p>يُطابَق كل صف بـ <b>رمز المقرر</b> و<b>الرقم المدني للأستاذ</b>، لا بالمعرّفات الداخلية. لا يُكتب شيء قبل أن ترى الحصيلة وتوافق.</p>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json,.xlsx,.xls"
                className="transfer-file"
                onChange={event => { const file = event.target.files?.[0]; if (file) void readFile(file); event.target.value = ""; }}
              />
              <div className="transfer-import-actions">
                <SecondaryButton type="button" onClick={() => void downloadTemplate()} disabled={busy} title="ملف Excel فارغ بالأعمدة الصحيحة وورقة شرح">
                  <Download />نموذج Excel فارغ
                </SecondaryButton>
                <SecondaryButton type="button" onClick={() => fileRef.current?.click()} disabled={!scopeReady || busy}>
                  <Upload />اختر ملفاً (Excel أو JSON)
                </SecondaryButton>
              </div>

              {xlsxPreview ? (
                <div className="transfer-preview">
                  <div className="transfer-counts">
                    <span><b>{Number(xlsxPreview.count || 0).toLocaleString("ar-KW-u-nu-latn")}</b>صفاً فُهم</span>
                    <span className={xlsxPreview.issues?.length ? "warn" : ""}><b>{(xlsxPreview.issues?.length || 0).toLocaleString("ar-KW-u-nu-latn")}</b>ملاحظة</span>
                  </div>
                  {xlsxPreview.issues?.length ? (
                    <ul className="transfer-rejected">
                      {xlsxPreview.issues.slice(0, 8).map((issue: string, index: number) => (
                        <li key={index}><span>{issue}</span></li>
                      ))}
                      {xlsxPreview.issues.length > 8 ? <li className="muted">و{xlsxPreview.issues.length - 8} غيرها…</li> : null}
                    </ul>
                  ) : null}
                  {xlsxDraft ? (
                    <p className="transfer-done"><Check /> حُفظت مسودة الاستيراد. راجعها وانشرها من <b>مركز الذكاء → الاستيراد</b> — النشر يحل محل جدول القسم لهذا الفصل بعد نقطة أمان تلقائية.</p>
                  ) : xlsxPreview.valid ? (
                    <PrimaryButton type="button" onClick={() => void saveExcelDraft()} disabled={busy}>
                      {busy ? "يحفظ…" : `احفظ ${countOf(Number(xlsxPreview.count || 0), AR.appointment)} كمسودة للنشر`}
                    </PrimaryButton>
                  ) : (
                    <p className="muted">صحّح الملاحظات في الملف ثم ارفعه مجدداً — لا يُحفظ استيراد فيه أخطاء.</p>
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

          {tab === "visiting" ? (
            <>
              <p>قائمة المنتدبين لهذا الفصل. من تختاره هنا يظهر في الجدول بعلامة «منتدب» بجانب اسمه، ويمكنك بدء الفصل الجديد بنسخ قائمة فصل سابق بدل كتابتها من جديد.</p>
              <div className="roster-copy">
                <select value={copyFrom || ""} onChange={e => setCopyFrom(Number(e.target.value) || 0)}>
                  <option value="">انسخ من فصل…</option>
                  {sortedTerms.filter(term => Number(term.AdTermId) !== termId).map(term => (
                    <option key={term.AdTermId} value={term.AdTermId}>{term.AdTermName}</option>
                  ))}
                </select>
                <SecondaryButton type="button" onClick={copyRoster} disabled={!copyFrom || busy}><Copy />انسخ</SecondaryButton>
              </div>
              <div className="roster-add">
                <div className="roster-add-head"><UserPlus aria-hidden="true" /><strong>أضف منتدباً جديداً لقسمك</strong></div>
                <div className="roster-add-fields">
                  <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="اسم المنتدب"
                    aria-label="اسم المنتدب الجديد"
                  />
                  <input
                    value={newCivil}
                    onChange={e => setNewCivil(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="الرقم المدني"
                    inputMode="numeric"
                    dir="ltr"
                    maxLength={12}
                    aria-label="الرقم المدني للمنتدب الجديد"
                  />
                  <PrimaryButton type="button" onClick={addNewDelegate} disabled={busy || !newName.trim() || !newCivil.trim()}>
                    <Plus />أضف وأدرِج
                  </PrimaryButton>
                </div>
              </div>
              <input
                className="roster-search"
                value={rosterQuery}
                onChange={e => setRosterQuery(e.target.value)}
                placeholder="ابحث عن اسم لإضافته"
                aria-label="ابحث عن أستاذ"
              />
              <div className="roster-list">
                {/* Arabic names differ in ways that must never hide a match: the
                    definite article, hamza seats, taa marbuta, and the titles
                    that may or may not be written. */}
                {(rosterQuery.trim()
                  ? sortedInstructors
                      .filter(person => {
                        const fold = (value: string) => String(value || "")
                          .replace(/[\u064B-\u0652\u0640]/g, "")
                          .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
                          .replace(/\s+/g, " ").trim().toLowerCase();
                        const needle = fold(rosterQuery);
                        return fold(person.AdInstructorName).includes(needle) ||
                          String(person.AdInstructorCivil || "").includes(rosterQuery.trim());
                      })
                      .slice(0, 25)
                  : sortedInstructors.filter(person => roster.includes(person.AdInstructorId))
                ).map(person => {
                  const on = roster.includes(person.AdInstructorId);
                  return (
                    <button
                      type="button"
                      key={person.AdInstructorId}
                      className={on ? "on" : ""}
                      onClick={() => saveRoster(on
                        ? roster.filter(id => id !== person.AdInstructorId)
                        : [...roster, person.AdInstructorId])}
                    >
                      {on ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                      <span className="instructor-identity">
                        <b>{person.AdInstructorName}</b>
                        <small dir="ltr">{person.AdInstructorCivil || "—"}</small>
                      </span>
                    </button>
                  );
                })}
                {rosterLoaded && !rosterQuery.trim() && !roster.length ? (
                  <p className="roster-empty">لا منتدبين في هذا الفصل بعد — ابحث عن اسم أو انسخ قائمة فصل سابق.</p>
                ) : null}
                {rosterQuery.trim() && !instructors.some(person =>
                  person.AdInstructorName.includes(rosterQuery.trim()) ||
                  String(person.AdInstructorCivil || "").includes(rosterQuery.trim())) ? (
                  <p className="roster-empty">لا اسم يطابق «{rosterQuery.trim()}» — أضِفه بنموذج «أضف منتدباً جديداً» أعلاه.</p>
                ) : null}
              </div>
            </>
          ) : null}

          {tab === "retire" ? (
            <>
              <p>لأستاذ تقاعد أو استقال أو تفرّغ: تنتقل كل مواعيده في هذا الفصل إلى بديل بضغطة واحدة، أو تُترك بلا أستاذ لتوزَّع لاحقاً. لا يُحذف أي موعد.</p>
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
                <PrimaryButton type="button" onClick={() => retire(true)} disabled={busy || replacementCheck?.compatible === false} title={replacementCheck?.compatible === false ? (replacementCheck.reasons?.[0] || "يوجد تعارض") : undefined}>
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
