import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, ChevronDown, FileQuestion, FileUp, History, Layers, MinusCircle, PencilLine, Printer, RotateCcw, X } from "lucide-react";
import { PrimaryButton, PrintPortal, SecondaryButton, useDialogDismiss } from "./ui";
import { AR, countOf, oblique } from "../utils/arabicCount";
import {
  departmentLoadWarning, departmentTypicalTotal, suggestSectionCount,
  type DepartmentTermLoad, type SimilarTermHistory,
} from "../utils/sectionCountSuggestion";
import { manualRemainingValue, planRemainingApply, remainingOf, type CellState, type ImportAssessment, type RemainingReading } from "../utils/remainingReport";

/**
 * ── تخطيط الشعب: كشفُ المتبقي ← مدىً يرسيه التاريخ ← تقرير ─────────────────
 *
 * يُعمل قبل بناء الجدول. «المتبقي» (طلبةٌ لم يسجّلوا المقرر بعد) لا يُكتب
 * يدوياً: يُستورد من كشف عمادة التسجيل PDF، ويُرى قبل أن يُملأ. لكل مقرر
 * (مرتّباً برقمه): المتبقي، ومدى الشعب المقترح وسببه، والمختار — وخانةُ المختار
 * الفارغة تعني «المقترح». كلُّ تعديلٍ يُحفظ وحده، والتقرير يُطبع بأسلوب تقارير
 * الموقع. الحساب في sectionCountSuggestion.ts، وقراءة الكشف في remainingReport.ts.
 */
interface Payload {
  termName: string;
  similarTerms: string[];
  courses: Array<{ id: number; code: string; name: string; capacity: number }>;
  remaining: Record<string, number>;
  remainingSource: { fileName: string; importedAt: string; column?: "seats" } | null;
  /** ما حُفظ قبل اعتماد «المقاعد المتبقية» (عمودٌ آخر): يُعرض موسوماً ولا يُحسب به. */
  legacyRemaining?: { values: Record<string, number>; fileName: string; importedAt: string } | null;
  accepted: Record<string, number>;
  updatedAt: string;
  updatedBy?: string;
  history: Record<string, SimilarTermHistory[]>;
  lineage?: Record<string, string>;
  department?: DepartmentTermLoad[];
}
type ImportReading = RemainingReading & {
  assessment?: ImportAssessment;
  departmentName?: string;
  source: "text" | "scan"; pageCount: number; fileName: string; warnings: string[];
  cells?: unknown[]; headerText?: string; template?: unknown;
};
type SaveState = "idle" | "saving" | "saved" | "error";

/** ترتيبٌ برقم المقرر تصاعدياً (الأرقام عدداً لا حرفاً)، ثم الرمز. */
const courseNumber = (code: string) => { const m = String(code).match(/\d+/); return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER; };
const fmtDate = (iso: string) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return "—"; const d = new Date(t); const p = (n: number) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; };
const fmtTime = (iso: string) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return ""; const d = new Date(t); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
/** البحث لا يتعثّر بالهمزات والتاء المربوطة وحالة الأحرف والأرقام الهندية. */
const fold = (value: string) => String(value || "").normalize("NFKC")
  .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[ً-ْـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
  .toLowerCase().replace(/\s+/g, " ").trim();
const asText = (map: Record<string, number> | undefined) => Object.fromEntries(Object.entries(map || {}).map(([k, v]) => [k, String(v)]));
const asNumbers = (map: Record<string, string>) => Object.fromEntries(Object.entries(map).filter(([, v]) => v !== "" && Number.isFinite(Number(v))).map(([k, v]) => [k, Math.max(0, Math.floor(Number(v)))]));

export default function SectionPlanning({ collegeId, sectionId, termId }: { collegeId: number; sectionId: number; termId: number }) {
  const [data, setData] = useState<Payload | null>(null);
  const [remaining, setRemaining] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [source, setSource] = useState<Payload["remainingSource"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState("");
  const [savedBy, setSavedBy] = useState("");
  const [query, setQuery] = useState("");
  const [report, setReport] = useState(false);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<ImportReading | null>(null);
  /* قيمٌ كتبها المستخدم بيده لخاناتٍ لم تُقرأ، وتأكيده أن الكشف لقسمه حين لم يُقرأ رأسه. */
  const [manual, setManual] = useState<Record<string, string>>({});
  const [deptConfirmed, setDeptConfirmed] = useState(false);
  const [openWhy, setOpenWhy] = useState<Record<string, boolean>>({});
  const [readingNote, setReadingNote] = useState("");
  const [edits, setEdits] = useState(0);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const timer = useRef<number | null>(null);
  useDialogDismiss(report, () => setReport(false));
  useDialogDismiss(Boolean(preview), () => setPreview(null));

  useEffect(() => {
    if (!collegeId || !sectionId || !termId) return;
    let cancelled = false;
    /* ما بقي معلّقاً من النطاق السابق أُرسل إليه وهو يُغلق (أدناه)؛ ولا يُحفظ شيءٌ هنا قبل أن يُحمَّل النطاق الجديد. */
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    setData(null); setError(null); setEdits(0); setSaveState("idle");
    fetch(`/api/registration-stats?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`)
      .then(async response => { const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error || "تعذّر تحميل تخطيط الشعب"); return body as Payload; })
      .then(body => {
        if (cancelled) return;
        setData(body);
        setRemaining(asText(body.remaining));
        setChosen(asText(body.accepted));
        setSource(body.remainingSource || null);
        setSavedAt(body.updatedAt || ""); setSavedBy(body.updatedBy || "");
      })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [collegeId, sectionId, termId]);

  /* ── يُحفظ وحده ──────────────────────────────────────────────────────────
     كان «حفظ» زرّاً، والأرقام تضيع بلا تنبيه إن انتقل القسم إلى تبويبٍ آخر أو
     أغلق النافذة قبله. الآن كلُّ تعديلٍ يُحفظ بعد لحظة، وما بقي معلّقاً حين
     تُغلق الشاشة يُرسل وهي تُغلق. «المختار» المحفوظ هو ما كتبه القسم بيده
     فقط؛ الخانة الفارغة تتبع المقترح وإن تغيّر المتبقي. */
  const latest = useRef({ remaining, chosen, source });
  latest.current = { remaining, chosen, source };
  const body = useCallback(() => JSON.stringify({
    collegeId, sectionId, termId,
    remaining: asNumbers(latest.current.remaining), accepted: asNumbers(latest.current.chosen), remainingSource: latest.current.source,
  }), [collegeId, sectionId, termId]);
  const persist = useCallback(async () => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    setSaveState("saving");
    try {
      const response = await fetch("/api/registration-stats", { method: "PUT", headers: { "Content-Type": "application/json" }, body: body() });
      const saved = await response.json().catch(() => null);
      if (!response.ok) throw new Error(saved?.error || "تعذّر الحفظ");
      setSavedAt(saved?.updatedAt || new Date().toISOString()); setSavedBy(saved?.updatedBy || "");
      setSaveState("saved");
    } catch { setSaveState("error"); }
  }, [body]);
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(() => {
    if (!edits) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void persistRef.current(); }, 900);
  }, [edits]);
  useEffect(() => {
    const flush = () => {
      if (!timer.current) return;
      window.clearTimeout(timer.current); timer.current = null;
      try { void fetch("/api/registration-stats", { method: "PUT", keepalive: true, headers: { "Content-Type": "application/json" }, body: body() }); } catch { /* the page is going away */ }
    };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, [body]);
  const edit = (setter: React.Dispatch<React.SetStateAction<Record<string, string>>>, key: string, value: string) => {
    setter(current => ({ ...current, [key]: value }));
    setEdits(n => n + 1);
  };

  const rows = useMemo(() => [...(data?.courses || [])]
    .sort((a, b) => courseNumber(a.code) - courseNumber(b.code) || a.code.localeCompare(b.code))
    .map(course => {
      const key = String(course.id);
      const entered = remaining[key] !== undefined && remaining[key] !== "";
      const history = data?.history?.[key] || [];
      const suggestion = suggestSectionCount(entered ? Number(remaining[key]) : null, course.capacity, history);
      const explicit = chosen[key] !== undefined && chosen[key] !== "";
      const pick = explicit ? Number(chosen[key]) : suggestion.suggested;
      const outside = explicit && suggestion.min != null && suggestion.max != null && (pick! < suggestion.min || pick! > suggestion.max);
      return { course, key, entered, history, suggestion, explicit, pick, outside, lineage: data?.lineage?.[key] || "" };
    }), [data, remaining, chosen]);
  const needle = fold(query);
  const visible = rows.filter(row => !needle || fold(`${row.course.code} ${row.course.name}`).includes(needle));
  const planned = rows.filter(row => row.pick != null);
  const total = planned.reduce((sum, row) => sum + (row.pick || 0), 0);
  const typical = departmentTypicalTotal(data?.department || []);
  const loadWarning = departmentLoadWarning(total, data?.department || []);
  const backlogs = rows.filter(row => row.suggestion.backlog);
  const imported = rows.filter(row => row.entered).length;

  /* ── كشف المتبقي ← معاينة ← تعبئة ─────────────────────────────────────── */
  /* كشفٌ PDF، أو صور صفحاته (تصوير الهاتف): كلُّ صورةٍ تُقرأ وحدها وتحمل
     معها عناوين الأولى، ثم تُقرأ صفحاتها معاً فتتطابق أعمدتها. */
  const showPreview = (found: ImportReading) => { setManual({}); setDeptConfirmed(false); setPreview(found); };
  const readFiles = async (files: File[]) => {
    setReading(true); setError(null); setReadingNote("");
    try {
      const results: ImportReading[] = [];
      let template: unknown = null;
      /* صورُ صفحاتِ كشفٍ واحد (حتى أربع) تُرسل معاً في طلبٍ واحد فتُقرأ معاً. */
      const isImage = (file: File) => /^image\//.test(file.type) || /\.(jpe?g|png|heic|heif)$/i.test(file.name);
      if (files.length > 1 && files.length <= 4 && files.every(isImage)) {
        setReadingNote(`يقرأ ${countOf(files.length, AR.page)}…`);
        const response = await fetch(`/api/registration-stats/remaining-pdf?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", "x-file-name": encodeURIComponent(files.map(file => file.name).join("، ")), "x-page-sizes": files.map(file => file.size).join(",") },
          body: new Blob(files),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error || "تعذّرت قراءة الكشف");
        const found = result as ImportReading;
        showPreview(found);
        return;
      }
      for (const [index, file] of files.entries()) {
        if (files.length > 1) setReadingNote(`يقرأ ${index + 1} من ${files.length}…`);
        const response = await fetch(`/api/registration-stats/remaining-pdf?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, {
          method: "POST",
          headers: {
            "Content-Type": file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : "application/octet-stream"), "x-file-name": encodeURIComponent(file.name),
            ...(template ? { "x-report-template": encodeURIComponent(JSON.stringify(template)) } : {}),
          },
          body: file,
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(`${files.length > 1 ? `«${file.name}»: ` : ""}${result?.error || "تعذّرت قراءة الكشف"}`);
        results.push(result as ImportReading);
        template ??= result?.template || null;
      }
      let found = results[0];
      if (results.length > 1) {
        const response = await fetch("/api/registration-stats/remaining-cells", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collegeId, sectionId, termId, pages: results.flatMap(item => item.cells || []), headerText: results[0].headerText || "" }),
        });
        const merged = await response.json().catch(() => null);
        if (!response.ok) throw new Error(merged?.error || "تعذّرت قراءة الصفحات معاً");
        found = { ...merged, source: results.some(item => item.source === "scan") ? "scan" : "text",
          pageCount: results.reduce((sum, item) => sum + item.pageCount, 0), fileName: files.map(file => file.name).join("، ") };
      }
      showPreview(found);
    } catch (e: any) { setError(e.message); } finally { setReading(false); setReadingNote(""); if (fileInput.current) fileInput.current.value = ""; }
  };
  /* التعبئة تكتب المقروءَ بوضوح وما كتبه المستخدم وحده (planRemainingApply)؛ ما لم يُقرأ يبقى فارغاً
     أو على قيمته المحفوظة، ولا يصير صفراً ولا يُخمَّن. القسم غير المتحقَّق منه يلزمه تأكيدٌ صريح. */
  const plan = useMemo(() => preview && preview.column != null ? planRemainingApply(preview, preview.column, manual, remaining) : null, [preview, manual, remaining]);
  const needsConfirm = Boolean(preview?.assessment?.needsDepartmentConfirmation);
  const canApply = Boolean(plan && plan.total > 0 && (!needsConfirm || deptConfirmed));
  const applyImport = () => {
    if (!preview || !plan || !canApply) return;
    setRemaining(asText(plan.next));
    setSource({ fileName: preview.fileName, importedAt: new Date().toISOString(), column: "seats" });
    setPreview(null);
    setEdits(n => n + 1);
  };

  const openReport = async () => {
    if (timer.current || saveState === "error") await persist();
    setReport(true);
  };
  const print = () => {
    const root = document.documentElement;
    root.dataset.printKind = "section-plan";
    const done = () => { delete root.dataset.printKind; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done, { once: true });
    window.setTimeout(() => { try { window.print(); } catch { done(); } }, 30);
    window.setTimeout(done, 4000);
  };

  if (error && !data) return <p className="section-plan-note" role="alert">{error}</p>;
  if (!data) return <p className="section-plan-note">يُحمَّل…</p>;

  const courseName = new Map<number, Payload["courses"][number]>(data.courses.map(course => [course.id, course]));
  const rangeText = (s: { min: number | null; max: number | null }) => s.min == null ? "—" : s.min === s.max ? String(s.min) : `${s.min} إلى ${s.max}`;
  const lastTerms = (history: SimilarTermHistory[]) => history.filter(item => item.sections > 0).slice(0, 3)
    .map(item => `${item.sections} (${item.termName.replace("الفصل ", "")})`).join(" · ") || "—";
  /* اسم الملف لاتينيٌّ غالباً: يُعزل اتجاهه كي لا تنقلب الأقواس حوله. */
  const sourceLine = source ? `المقاعد المتبقية من «\u2068${source.fileName}\u2069» — استُورد ${fmtDate(source.importedAt)} ${fmtTime(source.importedAt)}` : "لم يُستورد كشف المقاعد المتبقية لهذا الفصل بعد";
  const saveLine = saveState === "saving" ? "يُحفظ…"
    : saveState === "error" ? "تعذّر الحفظ"
    : savedAt ? `حُفظ ${fmtDate(savedAt)} ${fmtTime(savedAt)}${savedBy ? ` — ${savedBy}` : ""}` : "";
  const reportBody = (
    <>
      <div className="section-plan-report-stats">
        <div><span>مجموع الشعب المختارة</span><b>{total}</b></div>
        <div><span>ما شغّله القسم عادةً (الفصول المماثلة، وإلا الأحدث)</span><b>{typical ?? "—"}</b></div>
        <div><span>المقررات المخطّطة</span><b>{planned.length}</b></div>
      </div>
      <p className="section-plan-source">{sourceLine}</p>
      {loadWarning ? <p className="section-plan-warning">{loadWarning}</p> : null}
      <table className="section-plan-report-table">
        <thead><tr><th>رقم المقرر</th><th>اسم المقرر</th><th>المقاعد المتبقية</th><th>المختار</th><th>المدى المقترح</th><th>آخر الفصول</th></tr></thead>
        <tbody>
          {planned.map(row => (
            <tr key={row.key} className={row.outside ? "is-outside" : undefined}>
              <td dir="ltr">{row.course.code}</td>
              <td>{row.course.name}</td>
              <td>{row.entered ? remaining[row.key] : "—"}</td>
              <td><b>{row.pick}</b>{row.outside ? " *" : ""}</td>
              <td>{rangeText(row.suggestion)}</td>
              <td>{lastTerms(row.history)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={3}>المجموع</td><td><b>{total}</b></td><td colSpan={2}>{typical != null ? `المعتاد للقسم: ${countOf(typical, AR.section)}` : ""}</td></tr></tfoot>
      </table>
      {planned.some(row => row.outside) ? <p className="section-plan-note">* اختيار القسم خارج المدى المقترح.</p> : null}
      {backlogs.length ? (
        <div className="section-plan-backlog">
          <strong>مقرراتٌ يتراكم عليها الطلبة</strong>
          <ul>{backlogs.map(row => <li key={row.key}><b dir="ltr">{row.course.code}</b> {row.course.name}: {row.suggestion.backlog}</li>)}</ul>
        </div>
      ) : null}
    </>
  );

  const legacy = data.legacyRemaining && Object.keys(data.legacyRemaining.values || {}).length ? data.legacyRemaining : null;
  const STATE_NOTE: Record<Exclude<CellState, "read">, string> = {
    unread: "لم تُقرأ الخانة", lowConfidence: "قراءة غير واضحة", mismatch: "تخالف حساب الكشف (السعة − المسجلين)", noSections: "لا شعب له في الكشف — لا قيمة",
  };
  const previewCourses = preview ? [...preview.rows].sort((a, b) => courseNumber(courseName.get(a.courseId)?.code || "") - courseNumber(courseName.get(b.courseId)?.code || "")) : [];
  const previewRead = preview && preview.column != null ? previewCourses.map(row => {
    const cell = remainingOf(row, preview.column!);
    const typed = manualRemainingValue(manual[String(row.courseId)]);
    return { row, ...cell, typed, review: cell.state !== "read" && cell.state !== "noSections" };
  }) : [];
  const nRead = previewRead.filter(item => item.state === "read").length;
  const nReview = previewRead.filter(item => item.review).length;
  const nNoSections = previewRead.filter(item => item.state === "noSections").length;
  const nMissing = preview?.missing.length || 0;

  return (
    <div className="section-plan">
      <div className="section-plan-import">
        <PrimaryButton data-guide-feature-id="schedule.tool.data" type="button" className="section-plan-save" onClick={() => fileInput.current?.click()} disabled={reading}>
          <FileUp aria-hidden="true" /> {reading ? (readingNote || "يقرأ الكشف…") : source ? "استيراد كشف أحدث" : "استيراد كشف المقاعد المتبقية"}
        </PrimaryButton>
        <input ref={fileInput} type="file" accept="application/pdf,.pdf,image/*,.heic,.heif" multiple hidden aria-label="كشف المقاعد المتبقية من عمادة التسجيل: PDF أو صور صفحاته (أفقية)"
          onChange={e => { const files = [...(e.target.files || [])].slice(0, 12); if (files.length) void readFiles(files); }} />
        <div className="section-plan-import-text">
          <strong>الخطة تُبنى على عمود «المقاعد المتبقية» من كشف العمادة</strong>
          <span className="section-plan-source">
            {reading ? "الكشف PDF من النظام يُقرأ في ثوانٍ؛ والممسوح أو صور الهاتف (أفقية) قرابة نصف دقيقة للصفحة." : <>{sourceLine}{source ? ` · في ${countOf(imported, oblique(AR.course))}` : ""}</>}
          </span>
        </div>
      </div>
      {legacy ? (
        <p className="section-plan-warning" role="status">
          <AlertTriangle aria-hidden="true" /> بياناتٌ قديمة: حُفظ لهذا الفصل{legacy.fileName ? <> من «<bdi>{legacy.fileName}</bdi>»</> : null} عمودٌ آخر غير «المقاعد المتبقية» ({countOf(Object.keys(legacy.values).length, AR.course)}). لا يُبنى عليه الاقتراح — أعد استيراد الكشف.
        </p>
      ) : null}
      <div className="section-plan-summary" aria-label="ملخص الخطة">
        <div className="is-main"><Layers aria-hidden="true" /><span>مجموع الشعب المختارة</span><b>{total}</b></div>
        <div><CheckCircle2 aria-hidden="true" /><span>المقررات المخطّطة</span><b>{planned.length}<small> / {rows.length}</small></b></div>
        <div><FileUp aria-hidden="true" /><span>مقرراتٌ لها مقاعد متبقية مستوردة</span><b>{imported}</b></div>
        {typical != null ? <div><History aria-hidden="true" /><span>المعتاد للقسم</span><b>{typical}</b></div> : null}
      </div>
      <div className="section-plan-bar">
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث عن مقرر" aria-label="ابحث عن مقرر" />
        <span className={`section-plan-saved${saveState === "error" ? " is-error" : ""}`} role="status">
          {saveLine}
          {saveState === "error" ? <button data-guide-feature-id="schedule.tool.data" type="button" className="section-plan-retry" onClick={() => void persist()}><RotateCcw aria-hidden="true" /> أعد المحاولة</button> : null}
        </span>
        <SecondaryButton data-guide-feature-id="schedule.tool.data" type="button" onClick={() => void openReport()}>
          <Printer aria-hidden="true" /> التقرير والطباعة
        </SecondaryButton>
      </div>
      {error ? <p className="section-plan-warning" role="alert"><AlertTriangle aria-hidden="true" /> {error}</p> : null}
      {loadWarning ? <p className="section-plan-warning" role="status">{loadWarning}</p> : null}
      <div className="section-plan-table" role="table" aria-label="المقاعد المتبقية واقتراح الشعب">
        <div className="section-plan-row head" role="row">
          <span role="columnheader">المقرر</span><span role="columnheader">المقاعد المتبقية</span>
          <span role="columnheader">المقترح</span><span role="columnheader">المختار</span><span role="columnheader"><span className="sr-only">التفاصيل</span></span>
        </div>
        {visible.map(({ course, key, suggestion, outside, lineage, history }) => (
          <React.Fragment key={key}>
            <div className={`section-plan-row${outside ? " is-outside" : ""}`} role="row">
              <span role="cell" className="section-plan-course"><b dir="ltr">{course.code}</b> {course.name}</span>
              <span role="cell" className="section-plan-left" data-label="المقاعد المتبقية">
                <input type="number" min={0} max={100000} inputMode="numeric" value={remaining[key] ?? ""} placeholder="—" aria-label={`المقاعد المتبقية في ${course.name}`}
                  title="من كشف عمادة التسجيل؛ يُصحَّح هنا إن أخطأت القراءة"
                  onChange={e => edit(setRemaining, key, e.target.value)} />
              </span>
              <span role="cell" className="section-plan-count" data-label="المقترح">{suggestion.min == null ? "—" : rangeText(suggestion)}</span>
              <span role="cell" className="section-plan-pick" data-label="المختار">
                <input type="number" min={0} max={500} inputMode="numeric" value={chosen[key] ?? ""} placeholder={suggestion.suggested == null ? "" : String(suggestion.suggested)}
                  aria-label={`الشعب المختارة لـ${course.name}`} title="اتركها فارغة ليُعتمد المقترح"
                  onChange={e => edit(setChosen, key, e.target.value)} />
                {outside ? <small className="section-plan-outside">خارج المدى</small> : null}
              </span>
              <span role="cell" className="section-plan-why-cell">
                <button data-guide-feature-id="schedule.tool.data" type="button" className={`section-plan-why-toggle${openWhy[key] ? " is-open" : ""}${suggestion.backlog ? " is-warn" : ""}`}
                  aria-expanded={Boolean(openWhy[key])} aria-label={`سبب الاقتراح لـ${course.name}`} onClick={() => setOpenWhy(current => ({ ...current, [key]: !current[key] }))}>
                  {suggestion.backlog ? <AlertTriangle aria-hidden="true" /> : null}<span>لماذا؟</span><ChevronDown aria-hidden="true" />
                </button>
              </span>
            </div>
            {openWhy[key] ? (
              <div className="section-plan-why" role="row">
                <dl role="cell">
                  <div><dt>المقاعد المتبقية</dt><dd>{remaining[key] !== undefined && remaining[key] !== "" ? remaining[key] : "لم تُستورد"}</dd></div>
                  <div><dt>سعة الشعبة</dt><dd>{course.capacity || "—"}{course.capacity && remaining[key] ? ` · تكفي المقاعدَ ${countOf(Math.max(1, Math.ceil(Number(remaining[key]) / course.capacity)), AR.section)}` : ""}</dd></div>
                  <div><dt>آخر الفصول</dt><dd>{lastTerms(history)}{lineage ? ` · من رقمه السابق ${lineage}` : ""}</dd></div>
                </dl>
                <p>{suggestion.headline} — {suggestion.reason}</p>
                {suggestion.backlog ? <p className="section-plan-backlog-note"><AlertTriangle aria-hidden="true" /> {suggestion.backlog}</p> : null}
              </div>
            ) : null}
          </React.Fragment>
        ))}
      </div>
      <p className="section-plan-note">
        المدى المقترح يرسيه ما فتحه القسم فعلاً{data.similarTerms.length ? <> في الفصول المماثلة ({data.similarTerms.join("، ")})</> : null}، و«المقاعد المتبقية» تميل به وتُذكر حين لا توافقه. خانة «المختار» الفارغة تعني المقترح.
      </p>

      {preview ? createPortal(
        <div className="student-qr-backdrop no-print" onClick={() => setPreview(null)}>
          <div className="section-plan-report section-plan-import-preview" role="dialog" aria-modal="true" aria-label="مراجعة كشف المقاعد المتبقية" onClick={e => e.stopPropagation()}>
            <header>
              <div><span className="surface-kicker">مراجعة قبل التعبئة — عمود «المقاعد المتبقية»</span><h2><bdi>{preview.fileName}</bdi></h2></div>
              <button data-guide-feature-id="schedule.tool.data" type="button" className="student-qr-close" onClick={() => setPreview(null)} aria-label="إغلاق"><X aria-hidden="true" /></button>
            </header>
            <p className="section-plan-source">
              {countOf(preview.pageCount || 1, AR.page)}{preview.source === "scan" ? " · ممسوح/مصوَّر" : ""} · استُورد {fmtDate(new Date().toISOString())} · «المقاعد المتبقية» المستوردة هي ما تُبنى عليه خطة الشعب
            </p>
            <div className="import-summary-cards" aria-label="ملخص قراءة الكشف">
              <span className="ready"><CheckCircle2 aria-hidden="true" /><b>{nRead.toLocaleString("ar-KW-u-nu-latn")}</b><small>مقروء</small></span>
              <span className={nReview ? "warn" : ""}><AlertTriangle aria-hidden="true" /><b>{nReview.toLocaleString("ar-KW-u-nu-latn")}</b><small>يحتاج مراجعة</small></span>
              <span><MinusCircle aria-hidden="true" /><b>{nNoSections.toLocaleString("ar-KW-u-nu-latn")}</b><small>بلا شعب</small></span>
              <span><FileQuestion aria-hidden="true" /><b>{nMissing.toLocaleString("ar-KW-u-nu-latn")}</b><small>غير وارد</small></span>
            </div>
            {nReview ? (
              <p className="section-plan-yellow-note" role="status">
                <AlertTriangle aria-hidden="true" />
                <span>لم تُقرأ بوضوح «المقاعد المتبقية» لـ{countOf(nReview, AR.course)}: خاناتها صفراء وفارغة، ولن تُعبَّأ إلا إن كتبتَ قيمتها بيدك — لا تصير صفراً ولا تؤخذ من عمودٍ مجاور.</span>
              </p>
            ) : null}
            {(preview.assessment?.notes || []).map(note => <p key={note} className="section-plan-yellow-note" role="status"><AlertTriangle aria-hidden="true" /><span>{note}</span></p>)}
            {(preview.warnings || []).map(warning => <p key={warning} className="section-plan-yellow-note" role="status"><AlertTriangle aria-hidden="true" /><span>{warning}</span></p>)}
            {preview.foreign.length ? <p className="section-plan-note">{countOf(preview.foreign.length, AR.course)} من خارج القسم في الكشف — تُتجاهل، فالتخطيط لمقررات القسم وحدها.</p> : null}
            <div className="import-preview-table-wrap">
              <table className="import-preview-table section-plan-import-table">
                <thead><tr><th>رقم المقرر</th><th>اسم المقرر</th><th>المقاعد المتبقية في الكشف</th><th>الحالة</th><th>الحالي</th></tr></thead>
                <tbody>
                  {previewRead.map(({ row, value, state, typed, review }) => {
                    const key = String(row.courseId);
                    const current = remaining[key];
                    const course = courseName.get(row.courseId);
                    const shown = typed ?? value;
                    return (
                      <tr key={row.courseId} className={state === "noSections" ? "is-muted" : undefined}>
                        <td dir="ltr">{course?.code || row.printed}</td>
                        <td className="import-cell-course">{course?.name || ""}{row.occurrences > 1 ? <small> (ورد {countOf(row.occurrences, oblique(AR.visit))} — جُمع)</small> : null}</td>
                        {review ? (
                          <td className={typed !== undefined ? "import-cell-manual" : "import-cell-review"}>
                            <input type="number" min={0} max={100000} inputMode="numeric" value={manual[key] ?? ""} placeholder="—" aria-label={`المقاعد المتبقية في ${course?.name || row.printed} (اكتبها بيدك)`}
                              onChange={e => setManual(currentManual => ({ ...currentManual, [key]: e.target.value }))} />
                            <br />
                            {typed !== undefined
                              ? <span className="section-plan-reason-chip is-manual"><PencilLine aria-hidden="true" /> أُدخلت يدوياً</span>
                              : <span className="section-plan-reason-chip"><AlertTriangle aria-hidden="true" /> {STATE_NOTE[state as Exclude<CellState, "read">]}</span>}
                          </td>
                        ) : state === "noSections" ? (
                          <td><small className="section-plan-cell-note">{STATE_NOTE.noSections}</small></td>
                        ) : <td><b>{shown}</b></td>}
                        <td>
                          {state === "noSections" ? <span className="section-plan-state"><MinusCircle aria-hidden="true" /> بلا شعب</span>
                            : typed !== undefined ? <span className="section-plan-state is-manual"><PencilLine aria-hidden="true" /> يدوي</span>
                            : review ? <span className="section-plan-state is-review"><AlertTriangle aria-hidden="true" /> يحتاج مراجعة</span>
                            : <span className="section-plan-state is-read"><CheckCircle2 aria-hidden="true" /> مقروء</span>}
                        </td>
                        <td>{current !== undefined && current !== "" && Number(current) !== shown ? current : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {preview.foreign.length ? <details className="section-plan-note"><summary>رموز المقررات المتجاهلة</summary><bdi>{preview.foreign.slice(0, 20).join("، ")}</bdi>{preview.foreign.length > 20 ? "…" : ""}</details> : null}
            {nMissing ? (
              <details className="section-plan-missing-list">
                <summary>غير واردة في الكشف: {countOf(nMissing, AR.course)} — تبقى خاناتها على حالها</summary>
                <ul>{preview.missing.map(id => courseName.get(id)).filter(Boolean).map(course => <li key={course!.id}><b dir="ltr">{course!.code}</b> {course!.name}</li>)}</ul>
              </details>
            ) : null}
            {needsConfirm ? (
              <div className="section-plan-yellow-note" role="status">
                <AlertTriangle aria-hidden="true" />
                <label className="section-plan-confirm">
                  <input type="checkbox" checked={deptConfirmed} onChange={e => setDeptConfirmed(e.target.checked)} />
                  <span>أؤكد أن هذا الكشف لقسم «{preview.departmentName || "هذا القسم"}» — لم يُقرأ رمز القسم ولا اسمه في رأس الكشف.</span>
                </label>
              </div>
            ) : null}
            <div className="section-plan-report-actions">
              <PrimaryButton data-guide-feature-id="schedule.tool.data" type="button" onClick={applyImport} disabled={!canApply}>
                {plan && plan.total > 0 ? `تعبئة ${countOf(plan.total, AR.course)}${plan.manual ? ` (منها ${countOf(plan.manual, AR.course)} يدوياً)` : ""}` : "لا شيء يُعبَّأ"}
              </PrimaryButton>
              <SecondaryButton data-guide-feature-id="schedule.tool.data" type="button" onClick={() => setPreview(null)}>إلغاء</SecondaryButton>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      {report ? createPortal(
        <div className="student-qr-backdrop no-print" onClick={() => setReport(false)}>
          <div className="section-plan-report" role="dialog" aria-modal="true" aria-label="تقرير تخطيط الشعب" onClick={e => e.stopPropagation()}>
            <header>
              <div><span className="surface-kicker">تقرير تخطيط الشعب</span><h2>{data.termName}</h2></div>
              <div className="section-plan-report-actions">
                <SecondaryButton data-guide-feature-id="schedule.tool.data" type="button" onClick={print}><Printer aria-hidden="true" /> طباعة</SecondaryButton>
                <button data-guide-feature-id="schedule.tool.data" type="button" className="student-qr-close" onClick={() => setReport(false)} aria-label="إغلاق"><X aria-hidden="true" /></button>
              </div>
            </header>
            {reportBody}
          </div>
        </div>,
        document.body,
      ) : null}
      <PrintPortal className="section-plan-print-host">
        <div className="section-plan-print">
          <header className="section-plan-print-head">
            <h1>تخطيط الشعب — {data.termName}</h1>
            <p>{fmtDate(savedAt || new Date().toISOString())}</p>
          </header>
          {reportBody}
        </div>
      </PrintPortal>
    </div>
  );
}
