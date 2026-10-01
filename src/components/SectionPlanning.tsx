import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, Save, X } from "lucide-react";
import { PrimaryButton, PrintPortal, SecondaryButton, useDialogDismiss } from "./ui";
import { AR, countOf } from "../utils/arabicCount";
import {
  departmentLoadWarning, departmentTypicalTotal, suggestSectionCount,
  type DepartmentTermLoad, type SimilarTermHistory,
} from "../utils/sectionCountSuggestion";

/**
 * ── تخطيط الشعب: إحصاءُ التسجيل ← مدىً يرسيه التاريخ ← تقرير ────────────────
 *
 * لكل مقرر (مرتّباً برقم المقرر): عددُ الطلبة، ومدى الشعب المقترح وسببه، والعددُ
 * المختار (يبدأ من الاقتراح). «حفظ» يحفظ الإحصاء والمختار ويفتح تقريراً شاملاً
 * يُطبع بأسلوب تقارير الموقع. الحساب في sectionCountSuggestion.ts.
 */
interface Payload {
  termName: string;
  similarTerms: string[];
  courses: Array<{ id: number; code: string; name: string; capacity: number }>;
  counts: Record<string, number>;
  accepted: Record<string, number>;
  updatedAt: string;
  history: Record<string, SimilarTermHistory[]>;
  department?: DepartmentTermLoad[];
}

/** ترتيبٌ برقم المقرر تصاعدياً (الأرقام عدداً لا حرفاً)، ثم الرمز. */
const courseNumber = (code: string) => { const m = String(code).match(/\d+/); return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER; };
const fmtDate = (iso: string) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return "—"; const d = new Date(t); const p = (n: number) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; };

export default function SectionPlanning({ collegeId, sectionId, termId }: { collegeId: number; sectionId: number; termId: number }) {
  const [data, setData] = useState<Payload | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [query, setQuery] = useState("");
  const [report, setReport] = useState(false);
  useDialogDismiss(report, () => setReport(false));

  useEffect(() => {
    if (!collegeId || !sectionId || !termId) return;
    let cancelled = false;
    setData(null); setError(null);
    fetch(`/api/registration-stats?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`)
      .then(async response => { const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error || "تعذّر تحميل الإحصاء"); return body as Payload; })
      .then(body => {
        if (cancelled) return;
        setData(body);
        setCounts(Object.fromEntries(Object.entries(body.counts || {}).map(([k, v]) => [k, String(v)])));
        setChosen(Object.fromEntries(Object.entries(body.accepted || {}).map(([k, v]) => [k, String(v)])));
        setSavedAt(body.updatedAt || "");
      })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [collegeId, sectionId, termId]);

  const rows = useMemo(() => [...(data?.courses || [])]
    .sort((a, b) => courseNumber(a.code) - courseNumber(b.code) || a.code.localeCompare(b.code))
    .map(course => {
      const key = String(course.id);
      const registered = Number(counts[key] || 0);
      const entered = counts[key] !== undefined && counts[key] !== "";
      const history = data?.history?.[key] || [];
      const suggestion = suggestSectionCount(registered, course.capacity, history);
      const pick = chosen[key] !== undefined && chosen[key] !== "" ? Number(chosen[key]) : (entered ? suggestion.suggested : null);
      return { course, key, registered, entered, history, suggestion, pick };
    }), [data, counts, chosen]);
  const visible = rows.filter(row => !query.trim() || `${row.course.code} ${row.course.name}`.includes(query.trim()));
  const planned = rows.filter(row => row.pick != null);
  const total = planned.reduce((sum, row) => sum + (row.pick || 0), 0);
  const typical = departmentTypicalTotal(data?.department || []);
  const loadWarning = departmentLoadWarning(total, data?.department || []);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const numeric = Object.fromEntries(Object.entries(counts).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)]));
      const picks = Object.fromEntries(planned.map(row => [row.key, Number(row.pick)]));
      const response = await fetch("/api/registration-stats", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, counts: numeric, accepted: picks }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "تعذّر الحفظ");
      setSavedAt(body.updatedAt || new Date().toISOString());
      setReport(true);
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
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

  const lastTerms = (history: SimilarTermHistory[]) => history.filter(item => item.sections > 0).slice(0, 3)
    .map(item => `${item.sections} (${item.termName.replace("الفصل ", "")})`).join(" · ") || "—";
  const reportBody = (
    <>
      <div className="section-plan-report-stats">
        <div><span>مجموع الشعب المختارة</span><b>{total}</b></div>
        <div><span>ما شغّله القسم عادةً (الفصول المماثلة، وإلا الأحدث)</span><b>{typical ?? "—"}</b></div>
        <div><span>المقررات المخطّطة</span><b>{planned.length}</b></div>
      </div>
      {loadWarning ? <p className="section-plan-warning">{loadWarning}</p> : null}
      <table className="section-plan-report-table">
        <thead><tr><th>رقم المقرر</th><th>اسم المقرر</th><th>الطلبة</th><th>المختار</th><th>المدى المقترح</th><th>آخر الفصول</th></tr></thead>
        <tbody>
          {planned.map(row => (
            <tr key={row.key}>
              <td dir="ltr">{row.course.code}</td>
              <td>{row.course.name}</td>
              <td>{row.entered ? row.registered : "—"}</td>
              <td><b>{row.pick}</b></td>
              <td>{row.suggestion.min == null ? "—" : row.suggestion.min === row.suggestion.max ? row.suggestion.min : `${row.suggestion.min} إلى ${row.suggestion.max}`}</td>
              <td>{lastTerms(row.history)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={3}>المجموع</td><td><b>{total}</b></td><td colSpan={2}>{typical != null ? `المعتاد للقسم: ${countOf(typical, AR.section)}` : ""}</td></tr></tfoot>
      </table>
    </>
  );

  return (
    <div className="section-plan">
      <p className="section-plan-note">
        اكتب عدد الطلبة المسجّلين لكل مقرر في «{data.termName}». يُقترح مدىً من الشعب يرسيه ما فتحه القسم فعلاً
        {data.similarTerms.length ? <> في الفصول المماثلة ({data.similarTerms.join("، ")})</> : null}، ويميل به التسجيل قليلاً.
      </p>
      <div className="section-plan-bar">
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث عن مقرر" aria-label="ابحث عن مقرر" />
        <span>المجموع المختار: <b>{total}</b>{typical != null ? <> · المعتاد للقسم: <b>{typical}</b></> : null}</span>
        <PrimaryButton data-guide-feature-id="schedule.tool.data" type="button" className="section-plan-save" onClick={save} disabled={saving}>
          <Save aria-hidden="true" /> {saving ? "يُحفظ…" : "حفظ وعرض التقرير"}
        </PrimaryButton>
      </div>
      {error ? <p className="section-plan-note" role="alert">{error}</p> : null}
      {loadWarning ? <p className="section-plan-warning" role="status">{loadWarning}</p> : null}
      <div className="section-plan-table" role="table" aria-label="إحصاء التسجيل واقتراح الشعب">
        <div className="section-plan-row head" role="row">
          <span role="columnheader">المقرر</span><span role="columnheader">الطلبة</span><span role="columnheader">السعة</span>
          <span role="columnheader">المقترح</span><span role="columnheader">السبب</span><span role="columnheader">المختار</span>
        </div>
        {visible.map(({ course, key, entered, suggestion, pick }) => (
          <div className="section-plan-row" role="row" key={key}>
            <span role="cell"><b dir="ltr">{course.code}</b> {course.name}</span>
            <span role="cell">
              <input type="number" min={0} max={1000000} inputMode="numeric" value={counts[key] ?? ""} aria-label={`عدد طلبة ${course.name}`}
                onChange={e => setCounts(current => ({ ...current, [key]: e.target.value }))} />
            </span>
            <span role="cell">{course.capacity || "—"}</span>
            <span role="cell" className="section-plan-count">{entered ? suggestion.headline.replace("يُقترح هذا الفصل ", "") : "—"}</span>
            <span role="cell" className="section-plan-reason">{entered ? <><b>{suggestion.headline}</b> — {suggestion.reason}</> : "—"}</span>
            <span role="cell">
              <input type="number" min={0} max={500} inputMode="numeric" value={chosen[key] ?? (pick ?? "")} aria-label={`الشعب المختارة لـ${course.name}`}
                onChange={e => setChosen(current => ({ ...current, [key]: e.target.value }))} />
            </span>
          </div>
        ))}
      </div>
      {savedAt ? <p className="section-plan-note">آخر حفظ: {fmtDate(savedAt)}</p> : null}

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
