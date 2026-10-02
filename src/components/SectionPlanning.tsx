import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, FileUp, Info, Printer, RotateCcw, Sparkles, X } from "lucide-react";
import { PrimaryButton, PrintPortal, SecondaryButton, useDialogDismiss } from "./ui";
import { AR, countOf, oblique } from "../utils/arabicCount";
import {
  departmentLoadWarning, departmentTypicalTotal, suggestSectionCount,
  type DepartmentTermLoad, type SimilarTermHistory,
} from "../utils/sectionCountSuggestion";
import { remainingOf, remainingValues, type RemainingReading } from "../utils/remainingReport";

/**
 * ── تخطيط الشعب: المقاعد المتبقية ← مدىً يرسيه التاريخ ← تقرير ────────────
 *
 * يُعمل قبل بناء الجدول. «المقاعد المتبقية» لا تُكتب يدوياً: تُستورد من كشف
 * عمادة التسجيل PDF، ويُراجع العمود قبل أن يُملأ. لكل مقرر: المقاعد المتبقية،
 * وسعة الشعبة، وعدد الشعب المقترح، والمختار — وخانةُ المختار
 * الفارغة تعني «المقترح». كلُّ تعديلٍ يُحفظ وحده، والتقرير يُطبع بأسلوب تقارير
 * الموقع. الحساب في sectionCountSuggestion.ts، وقراءة الكشف في remainingReport.ts.
 */
interface Payload {
  termName: string;
  similarTerms: string[];
  courses: Array<{ id: number; code: string; name: string; capacity: number }>;
  remaining: Record<string, number>;
  remainingSource: { fileName: string; importedAt: string; kind?: "seats" } | null;
  accepted: Record<string, number>;
  updatedAt: string;
  updatedBy?: string;
  history: Record<string, SimilarTermHistory[]>;
  lineage?: Record<string, string>;
  department?: DepartmentTermLoad[];
}
type ImportReading = RemainingReading & {
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
  const [column, setColumn] = useState<number | null>(null);
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
        setColumn(found.column ?? (found.columns.length === 1 ? found.columns[0].id : null));
        setPreview(found);
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
          body: JSON.stringify({ collegeId, sectionId, termId, pages: results.flatMap(item => item.cells || []), headerText: results[0].headerText || "", scanned: results.some(item => item.source === "scan") }),
        });
        const merged = await response.json().catch(() => null);
        if (!response.ok) throw new Error(merged?.error || "تعذّرت قراءة الصفحات معاً");
        found = { ...merged, source: results.some(item => item.source === "scan") ? "scan" : "text",
          pageCount: results.reduce((sum, item) => sum + item.pageCount, 0), fileName: files.map(file => file.name).join("، ") };
      }
      setColumn(found.column ?? (found.columns.length === 1 ? found.columns[0].id : null));
      setPreview(found);
    } catch (e: any) { setError(e.message); } finally { setReading(false); setReadingNote(""); if (fileInput.current) fileInput.current.value = ""; }
  };
  const applyImport = () => {
    if (!preview || column == null) return;
    const values: Record<string, number> = { ...remainingValues(preview, column) };
    setRemaining(current => ({ ...current, ...asText(values) }));
    setSource({ fileName: preview.fileName, importedAt: new Date().toISOString(), kind: "seats" });
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
  const sourceLine = source ? `المقاعد المتبقية من «\u2068${source.fileName}\u2069» — استُورد ${fmtDate(source.importedAt)}` : "لم يُستورد عدد المقاعد المتبقية لهذا الفصل بعد";
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

  return (
    <div className="section-plan">
      <p className="section-plan-note">
        يُبنى اقتراح الشعب لكل مقرر في «{data.termName}» على المقاعد المتبقية وسعة الشعبة، مع الاسترشاد بما فتحه القسم فعلاً
        {data.similarTerms.length ? <> في الفصول المماثلة ({data.similarTerms.join("، ")})</> : null}، ويُظهر سبب الاقتراح عند فتح «التفاصيل».
      </p>
      <div className="section-plan-import">
        <PrimaryButton data-guide-feature-id="schedule.tool.data" type="button" className="section-plan-save" onClick={() => fileInput.current?.click()} disabled={reading}>
          <FileUp aria-hidden="true" /> {reading ? (readingNote || "يقرأ الكشف…") : source ? "استيراد كشف أحدث" : "استيراد المقاعد المتبقية"}
        </PrimaryButton>
        <input ref={fileInput} type="file" accept="application/pdf,.pdf,image/*,.heic,.heif" multiple hidden aria-label="كشف المقاعد المتبقية من عمادة التسجيل: PDF أو صور صفحاته"
          onChange={e => { const files = [...(e.target.files || [])].slice(0, 12); if (files.length) void readFiles(files); }} />
        <span className="section-plan-source">
          {reading ? "الكشف PDF من النظام يُقرأ في ثوانٍ؛ والممسوح أو صور الهاتف قرابة نصف دقيقة للصفحة." : <>{sourceLine}{source ? ` · في ${countOf(imported, oblique(AR.course))}` : ""}</>}
        </span>
      </div>
      <div className="section-plan-bar">
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث عن مقرر" aria-label="ابحث عن مقرر" />
        <span>المجموع المختار: <b>{total}</b>{typical != null ? <> · المعتاد للقسم: <b>{typical}</b></> : null}</span>
        <span className={`section-plan-saved${saveState === "error" ? " is-error" : ""}`} role="status">
          {saveLine}
          {saveState === "error" ? <button data-guide-feature-id="schedule.tool.data" type="button" className="section-plan-retry" onClick={() => void persist()}><RotateCcw aria-hidden="true" /> أعد المحاولة</button> : null}
        </span>
        <SecondaryButton data-guide-feature-id="schedule.tool.data" type="button" onClick={() => void openReport()}>
          <Printer aria-hidden="true" /> عرض التقرير
        </SecondaryButton>
      </div>
      {error ? <p className="section-plan-note" role="alert">{error}</p> : null}
      {loadWarning ? <p className="section-plan-warning" role="status">{loadWarning}</p> : null}
      <div className="section-plan-table" role="table" aria-label="المقاعد المتبقية واقتراح الشعب">
        <div className="section-plan-row head" role="row">
          <span role="columnheader">المقرر</span><span role="columnheader">المقاعد المتبقية</span><span role="columnheader">السعة</span>
          <span role="columnheader">المقترح</span><span role="columnheader">المختار</span>
        </div>
        {visible.map(({ course, key, suggestion, outside, lineage }) => (
          <div className="section-plan-row" role="row" key={key}>
            <span role="cell" className="section-plan-course"><b dir="ltr">{course.code}</b> {course.name}</span>
            <span role="cell" className="section-plan-left" data-label="المقاعد المتبقية">
              <input type="number" min={0} max={100000} inputMode="numeric" value={remaining[key] ?? ""} placeholder="—" aria-label={`المقاعد المتبقية في ${course.name}`}
                title="عدد المقاعد المتبقية من كشف الهيئة؛ يُصحَّح هنا إن أخطأت القراءة"
                onChange={e => edit(setRemaining, key, e.target.value)} />
            </span>
            <span role="cell" className="section-plan-cap" data-label="السعة">{course.capacity || "—"}</span>
            <span role="cell" className="section-plan-count" data-label="المقترح" title={suggestion.reason}>
              <span className="section-plan-proposal-value"><Sparkles aria-hidden="true" /><b>{suggestion.suggested ?? "—"}</b><small>شعبة</small></span>
              <span className="section-plan-proposal-range">{suggestion.min == null ? "لا اقتراح بعد" : rangeText(suggestion)}</span>
              {lineage ? <span className="section-plan-lineage">تاريخ المقرر: {lineage}</span> : null}
              {suggestion.backlog ? <em className="section-plan-backlog-note"><AlertTriangle aria-hidden="true" /> {suggestion.backlog}</em> : null}
              <details className="section-plan-why"><summary aria-label={`لماذا هذا المقترح؟ ${course.name}`}><Info aria-hidden="true" /><span>التفاصيل</span></summary><p>{suggestion.reason}</p></details>
            </span>
            <span role="cell" className="section-plan-pick" data-label="المختار">
              <input type="number" min={0} max={500} inputMode="numeric" value={chosen[key] ?? ""} placeholder={suggestion.suggested == null ? "" : String(suggestion.suggested)}
                aria-label={`الشعب المختارة لـ${course.name}`} title="اتركها فارغة ليُعتمد المقترح"
                onChange={e => edit(setChosen, key, e.target.value)} />
              {outside ? <small className="section-plan-outside" title="اختيارك خارج المدى المقترح بعد آخر متبقٍّ — امسح الخانة ليُعتمد المقترح">خارج المدى</small> : null}
            </span>
          </div>
        ))}
      </div>

      {preview ? createPortal(
        <div className="student-qr-backdrop no-print" onClick={() => setPreview(null)}>
          <div className="section-plan-report section-plan-import-preview" role="dialog" aria-modal="true" aria-label="معاينة كشف المتبقي" onClick={e => e.stopPropagation()}>
            <header>
              <div><span className="surface-kicker">كشف المتبقي — معاينة قبل التعبئة</span><h2><bdi>{preview.fileName}</bdi></h2></div>
              <button data-guide-feature-id="schedule.tool.data" type="button" className="student-qr-close" onClick={() => setPreview(null)} aria-label="إغلاق"><X aria-hidden="true" /></button>
            </header>
            <ul className="section-plan-import-summary">
              <li><b>{countOf(preview.rows.length, AR.course)}</b> من مقررات القسم في الكشف</li>
              {preview.missing.length ? <li>لم يرد في الكشف: <b>{countOf(preview.missing.length, AR.course)}</b> — تبقى مقاعدها كما هي</li> : null}
              {preview.foreign.length ? <li>رموزٌ ليست من مقررات القسم: <b>{preview.foreign.length}</b> — لا تُستورد</li> : null}
              {preview.source === "scan" ? <li className="is-warn">كشف مصوّر: راجع المقاعد المتبقية قبل التعبئة</li> : null}
              {column != null && preview.rows.some(row => remainingOf(row, column).value == null) ? <li className="is-warn">لم تُقرأ المقاعد المتبقية في: <b>{countOf(preview.rows.filter(row => remainingOf(row, column).value == null).length, AR.course)}</b> — تُراجع بعد التعبئة</li> : null}
            </ul>
            {(preview.warnings || []).map(warning => <p key={warning} className="section-plan-warning" role="alert"><AlertTriangle aria-hidden="true" /> {warning}</p>)}
            <table className="section-plan-report-table">
              <thead><tr><th>رقم المقرر</th><th>اسم المقرر</th><th>المقاعد المتبقية</th><th>المحفوظ حالياً</th></tr></thead>
              <tbody>
                {[...preview.rows].sort((a, b) => courseNumber(courseName.get(a.courseId)?.code || "") - courseNumber(courseName.get(b.courseId)?.code || "")).map(row => {
                  const read = column == null ? { value: undefined, fromFallback: false } : remainingOf(row, column);
                  const value = read.value;
                  const current = remaining[String(row.courseId)];
                  return (
                    <tr key={row.courseId}>
                      <td dir="ltr">{courseName.get(row.courseId)?.code || row.printed}</td>
                      <td>{courseName.get(row.courseId)?.name || ""}{row.occurrences > 1 ? <small> (ورد {countOf(row.occurrences, oblique(AR.visit))} — جُمع)</small> : null}</td>
                      <td>
                        <b>{value ?? "—"}</b>
                        {read.value == null && column != null ? <small className="section-plan-cell-note is-unread"> لم تُقرأ خانته — أدخلها بعد التعبئة</small> : null}
                      </td>
                      <td>{current !== undefined && current !== "" && Number(current) !== value ? current : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {preview.missing.length ? (
              <p className="section-plan-note">لم يرد في الكشف: {preview.missing.map(id => courseName.get(id)?.code).filter(Boolean).slice(0, 20).join("، ")}{preview.missing.length > 20 ? "…" : ""}</p>
            ) : null}
            <div className="section-plan-report-actions">
              <PrimaryButton data-guide-feature-id="schedule.tool.data" type="button" onClick={applyImport} disabled={column == null}>تعبئة المقاعد المتبقية</PrimaryButton>
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
