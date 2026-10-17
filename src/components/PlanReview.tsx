/**
 * ── مراجعةُ الصحيفة ─────────────────────────────────────────────────────────
 *
 * قواعدُ المقررات (المستوى، النوع، المسبق، المقرن، المجموعات الاختيارية) تُعرض
 * خريطةً بالمستويات: عمودٌ لكل مستوى، وبطاقةٌ لكل مقرر. وعند اختيار بطاقةٍ
 * يُضاء ما قبلها وما بعدها، فترى السلسلة لا الجدول.
 *
 * القسمُ يعدّل مقرراته وحدها — بطاقةُ مقررٍ من قسمٍ آخر مقفلةٌ تُرى ولا تُمَسّ،
 * والحارسُ الحقيقي في الخادم. والاعتمادُ لرئيس لجنة الجدول، على النسخة التي رآها.
 */
import CurriculumReferenceReview from "./CurriculumReferenceReview";
import PlanMapLines, { levelHue, planEdges } from "./PlanMapLines";
import { arabicMatchKey } from "../utils/arabicText";
/* اسمُ القسم في القائمة يحمل كليته («قسم تكنولوجيا التعليم · التربية الأساسية - بنات»): يُطابَق بالاحتواء. */
const isTechnologyEducation = (label: string) => arabicMatchKey(label).includes(arabicMatchKey("تكنولوجيا التعليم"));
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, BookOpenCheck, CheckCircle2, FileSpreadsheet, GraduationCap, Layers, Lock, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { EmptyState, MicroLoader, Notice, PageTitle, PrimaryButton, SecondaryButton } from "./ui";
import { AR, countOf } from "../utils/arabicCount";
import { CURRICULUM_LEVELS, KIND_LABEL, KINDS, byLevel, courseLevelFromCode, dependentsOf, describePrereq } from "../utils/curriculumRules";
import type { CourseKind, CurriculumCourseRule, ElectiveGroup } from "../types";

interface Status {
  pending: Array<{ planId: string; sectionId: number; sectionName: string }>;
  approved: Array<{ planId: string; sectionId: number; sectionName: string }>;
  sections: Array<{ sectionId: number; sectionName: string; plans: Array<{ id: string; name: string; status?: string; pending?: boolean }> }>;
  canApprove: boolean;
  canImport?: boolean;
}
interface CourseRow { id: number; code: string; name: string; credit: number; hours: number; capacity: number; collegeId: number; sectionId: number; ownerSectionName: string; owned: boolean; external?: boolean; category?: string }
interface View {
  /** تصنيفات الصحيفة بترتيبها (لقسم له صحيفة مرجعية)؛ فارغة لغيره فلا يظهر الفلتر. */
  categories?: string[];
  plan: { id: string; name: string; sectionId: number; sectionName: string };
  courses: CourseRow[];
  referenced: Array<{ id: number; code: string; name: string }>;
  rules: CurriculumCourseRule[];
  groups: ElectiveGroup[];
  state: { status: "review" | "approved"; version: number; updatedAt: string; updatedBy: string; approvedAt: string; approvedBy: string };
  issues: Array<{ severity: "block" | "warn"; code: string; text: string; courseId?: number; groupId?: string }>;
  blockers: number;
  can: { edit: boolean; approve: boolean };
}

const request = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error("وصل ردٌّ غير متوقّع من الخادم."); }
  if (!response.ok) throw new Error(data.error || "تعذّر تنفيذ العملية");
  return data;
};

/** رؤوسُ ورقة الصحيفة بالعربية كما يكتبها القسم ← مفاتيحُ الاستيراد. */
const SHEET_HEADERS: Array<[string, string]> = [
  ["القسم", "section"], ["الصحيفة", "plan"], ["رمز المقرر", "code"], ["المستوى", "level"], ["النوع", "kind"],
  ["المسبق (كلها)", "prereqAll"], ["المسبق (أحدها)", "prereqAny"], ["وحدات مجتازة", "minUnits"], ["المقرن", "coreq"],
  ["المجموعة الاختيارية", "group"], ["حد المقررات", "groupMinCourses"], ["حد الوحدات", "groupMinUnits"],
];

const KIND_TONE: Record<CourseKind | "none", string> = { compulsory: "ok", college: "info", university: "brass", elective: "soft", none: "none" };

/** استيرادُ ورقة الصحائف (إدارةُ النظام): مسوّداتٌ تُراجَع لا اعتماد، وما لم يُفهم يُقال بسطره. */
function ImportPanel({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: string[]; diagnostics: Array<{ line: number; text: string }>; diagnosticsTotal: number } | null>(null);
  const [error, setError] = useState("");
  const template = async () => {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.aoa_to_sheet([
      SHEET_HEADERS.map(h => h[0]),
      ["قسم التربية الإسلامية", "الجديدة", "ISL101", 1, "إجباري", "", "", "", "", "", "", ""],
      ["قسم التربية الإسلامية", "الجديدة", "ISL201", 2, "إجباري", "ISL101", "", "", "", "", "", ""],
      ["قسم التربية الإسلامية", "الجديدة", "ISL305", "", "اختياري", "", "", "", "", "اختياري القسم", 1, 3],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "قواعد المقررات");
    XLSX.writeFile(wb, "نموذج_قواعد_الصحائف.xlsx");
  };
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const XLSX = await import("xlsx");
      /* CSV نصٌّ UTF-8 (العربيةُ تتلف إن قُرئ كبايتات)؛ وExcel ثنائيّ. */
      const book = /\.csv$/i.test(file.name) ? XLSX.read((await file.text()).replace(/^\uFEFF/, ""), { type: "string" }) : XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grid: any[][] = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: "", raw: false });
      const head = (grid[0] || []).map(cell => String(cell).trim());
      const keyOf = (cell: string) => SHEET_HEADERS.find(h => h[0] === cell || h[1] === cell)?.[1];
      const rows = grid.slice(1).filter(line => line.some(cell => String(cell).trim())).map(line => {
        const row: Record<string, string> = {};
        head.forEach((cell, i) => { const key = keyOf(cell); if (key) row[key] = String(line[i] ?? "").trim(); });
        return row;
      });
      if (!rows.length) throw new Error("لا أسطر في الملف. استخدم النموذج.");
      setResult(await request("/api/plan-review/import", { method: "POST", body: JSON.stringify({ rows }) }));
      onDone();
    } catch (e: any) { setError(e.message || "تعذّر قراءة الملف"); }
    finally { setBusy(false); }
  };
  return (
    <section className="pr-import">
      <div className="pr-import-head">
        <span className="pr-import-ic"><FileSpreadsheet /></span>
        <div><b>استيراد قواعد الصحائف</b><small>ورقةٌ بسطرٍ لكل مقرر؛ تُنشأ مسوّداتٌ تُراجعها الأقسام ويعتمدها رئيس اللجنة.</small></div>
        <div className="pr-import-actions">
          <SecondaryButton onClick={template} data-guide-ignore="نموذج الاستيراد داخل شاشةٍ مسجّلة في المرشد باسم page.planReview">نموذج فارغ</SecondaryButton>
          <label className={`btn btn-primary${busy ? " is-busy" : ""}`}>
            {busy ? "جارٍ القراءة…" : "اختر ملف Excel أو CSV"}
            <input type="file" accept=".xlsx,.xls,.csv" hidden disabled={busy} onChange={e => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
      </div>
      {error ? <Notice type="error" onDismiss={() => setError("")}>{error}</Notice> : null}
      {result ? (
        <div className="pr-import-result">
          <Notice type={result.created ? "success" : "warning"} inline>
            أُنشئت {countOf(result.created, AR.draft)}
            {result.skipped.length ? ` · تُرك ما هو قيد المراجعة (${result.skipped.join("، ")})` : ""}
            {result.diagnosticsTotal ? ` · ${countOf(result.diagnosticsTotal, AR.note)}` : ""}.
          </Notice>
          {result.diagnostics.length ? <ul className="pr-issues">{result.diagnostics.slice(0, 8).map((d, i) => <li key={i} className="warn"><AlertTriangle size={14} /> السطر {d.line + 1}: {d.text}</li>)}</ul> : null}
        </div>
      ) : null}
    </section>
  );
}

export default function PlanReview({ onNavigate }: { onNavigate?: (view: "courses") => void } = {}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [sectionId, setSectionId] = useState(0);
  const [planId, setPlanId] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [focus, setFocus] = useState(0);
  const [cat, setCat] = useState("");
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const next: Status = await request("/api/plan-review/status");
      setStatus(next);
      return next;
    } catch (e: any) { setError(e.message); return null; }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void loadStatus().then(next => {
      if (!next) return;
      const first = next.pending[0] || next.sections.flatMap(s => s.plans.map(p => ({ planId: p.id, sectionId: s.sectionId })))[0];
      if (first) { setSectionId(first.sectionId); setPlanId(first.planId); }
      else if (next.sections[0]) setSectionId(next.sections[0].sectionId);
    });
  }, [loadStatus]);

  useEffect(() => {
    if (!planId || !sectionId) { setView(null); return; }
    let live = true;
    setView(null); setSelected(0); setFocus(0); setCat("");
    request(`/api/plan-review/plan?planId=${encodeURIComponent(planId)}&sectionId=${sectionId}`)
      .then(next => { if (live) { setView(next); setError(""); } })
      .catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [planId, sectionId]);

  const act = async (url: string, method: string, body: unknown) => {
    setBusy(true); setError("");
    try {
      const next: View = await request(url, { method, body: JSON.stringify({ planId, sectionId, ...(body as object) }) });
      setView(next);
      await loadStatus();
      window.dispatchEvent(new Event("schedule:plan-review-updated"));
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const saveCourseDetails = async (course: CourseRow, values: { credit: number; hours: number; capacity: number }) => {
    setBusy(true); setError("");
    try {
      await request("/api/plan-review/course-details", { method: "PUT", body: JSON.stringify({ planId, sectionId, courseId: course.id, ...values }) });
      const next: View = await request(`/api/plan-review/plan?planId=${encodeURIComponent(planId)}&sectionId=${sectionId}`);
      setView(next);
      await loadStatus();
      window.dispatchEvent(new Event("schedule:plan-review-updated"));
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const openCatalogCorrection = (action: { kind: "edit" | "create"; sectionId: number; collegeId: number; courseId?: number; code: string; name: string; credit: number; hours: number }) => {
    sessionStorage.setItem("schedule-reference-course-action", JSON.stringify(action));
    onNavigate?.("courses");
  };

  const names = useMemo(() => {
    const map = new Map<number, CourseRow | { id: number; code: string; name: string }>();
    view?.courses.forEach(c => map.set(c.id, c));
    view?.referenced.forEach(c => map.set(c.id, c));
    return map;
  }, [view]);
  const nameOf = (id: number) => names.get(id)?.name || `مقرر ${id}`;
  const ruleOf = (id: number) => view?.rules.find(r => r.courseId === id);

  const levels = useMemo(() => view ? byLevel(view.courses.map(c => c.id), view.rules, new Map(view.courses.map(c => [c.id, c.code]))) : new Map<number, number[]>(), [view]);
  const upstream = useMemo(() => {
    if (!view || !focus) return new Set<number>();
    const out = new Set<number>();
    const walk = (id: number) => {
      const p = view.rules.find(r => r.courseId === id)?.prereq;
      if (!p) return;
      [...p.all, ...p.anyOf.flat()].forEach(x => { if (!out.has(x)) { out.add(x); walk(x); } });
    };
    walk(focus);
    return out;
  }, [view, focus]);
  const downstream = useMemo(() => {
    if (!view || !focus) return new Set<number>();
    const out = new Set<number>();
    const walk = (id: number) => dependentsOf(view.rules, id).forEach(x => { if (!out.has(x)) { out.add(x); walk(x); } });
    walk(focus);
    return out;
  }, [view, focus]);
  /* لكل مقررٍ له أسهمٌ خارجة لونٌ مميّز (من عشرة): رقمُه وأسهمُه بلونٍ واحد، فيُتتبَّع السهم إلى مصدره. */
  const { edges, series } = useMemo(() => {
    const none = { edges: [] as ReturnType<typeof planEdges>, series: new Map<number, number>() };
    if (!view) return none;
    const raw = planEdges(view.rules, new Set(view.courses.map(c => c.id)));
    const codeOf = new Map(view.courses.map(c => [c.id, c.code] as const));
    const sources = [...new Set(raw.map(e => Number(e.from)))].sort((a, b) => String(codeOf.get(a)).localeCompare(String(codeOf.get(b)), "en", { numeric: true }));
    const map = new Map(sources.map((id, i) => [id, i % 10 + 1] as const));
    return { edges: raw.map(e => ({ ...e, hue: map.get(Number(e.from)) })), series: map };
  }, [view]);

  /* الفلتر: مقررات القسم نفسه في التصنيف المختار فعّالة، وما سواها (تصنيفٌ آخر أو مقررات أقسامٍ أخرى) غير فعال. */
  const deptCourses = view ? view.courses.filter(c => c.sectionId === view.plan.sectionId && !c.external) : [];
  const isActive = (c: CourseRow) => !cat || (c.category === cat && c.sectionId === view?.plan.sectionId && !c.external);
  const offIds = useMemo(() => new Set<number>(view && cat ? view.courses.filter(c => !(c.category === cat && c.sectionId === view.plan.sectionId && !c.external)).map(c => c.id) : []), [view, cat]);
  const pickCat = (name: string) => { setCat(name); const f = view?.courses.find(c => c.id === focus); if (f && name && !(f.category === name && f.sectionId === view?.plan.sectionId && !f.external)) setFocus(0); };

  if (loading) return <MicroLoader />;
  const sectionPlans = status?.sections.find(s => s.sectionId === sectionId)?.plans || [];
  const isTechSection = isTechnologyEducation(status?.sections.find(s => s.sectionId === sectionId)?.sectionName || "");
  const sel = view?.courses.find(c => c.id === selected);
  const focusCourse = view?.courses.find(c => c.id === focus);
  const focusRule = focusCourse ? ruleOf(focusCourse.id) : undefined;
  const focusOpens = focusCourse && view ? dependentsOf(view.rules, focusCourse.id) : [];

  return (
    <div className="pr-page" dir="rtl">
      <PageTitle eyebrow="مراجعة الصحيفة" subtitle="مستوى كل مقرر ونوعه وما يسبقه، ثم يعتمدها رئيس لجنة الجدول.">قواعد المقررات</PageTitle>
      {error ? <Notice type="error" onDismiss={() => setError("")}>{error}</Notice> : null}
      {status?.canImport ? <ImportPanel onDone={() => { void loadStatus().then(() => window.dispatchEvent(new Event("schedule:plan-review-updated"))); }} /> : null}
      {!status?.sections.length ? <EmptyState title="لا صحائف في نطاقك" detail="تظهر هنا صحائف الأقسام التي تملك نطاقها." /> : (
        <>
          {!isTechSection ? (
            <div className="pr-pickers">
              {status.sections.length > 1 ? (
                <select aria-label="القسم" value={sectionId} onChange={e => { const s = status.sections.find(x => x.sectionId === Number(e.target.value)); setSectionId(Number(e.target.value)); setPlanId(s?.plans[0]?.id || ""); setSelected(0); }}>
                  {status.sections.map(s => <option key={s.sectionId} value={s.sectionId}>{s.sectionName}{status.pending.some(p => p.sectionId === s.sectionId) ? " • بانتظار المراجعة" : ""}</option>)}
                </select>
              ) : <strong className="pr-sec">{status.sections[0].sectionName}</strong>}
              <div className="pr-plans" role="tablist">
                {sectionPlans.map(p => (
                  <button key={p.id} type="button" role="tab" aria-selected={p.id === planId} className={`pr-plan${p.id === planId ? " on" : ""}`} onClick={() => setPlanId(p.id)} data-guide-ignore="تبديلُ الصحيفة داخل شاشة مراجعة الصحيفة؛ لا يكتب شيئاً">{p.name}{p.pending ? " • قيد المراجعة" : ""}</button>
                ))}
              </div>
            </div>
          ) : null}

          <CurriculumReferenceReview sectionId={sectionId} canApply={Boolean(status?.canImport)}
            onPick={(id, _ref, plan) => { setSectionId(id); const own = status.sections.find(x => x.sectionId === id); setPlanId(plan || own?.plans[0]?.id || ""); setSelected(0); }}
            others={status.sections.filter(x => !isTechnologyEducation(x.sectionName)).map(x => ({ sectionId: x.sectionId, label: x.sectionName }))}
            onPickOther={id => { const own = status.sections.find(x => x.sectionId === id); setSectionId(id); setPlanId(own?.plans[0]?.id || ""); setSelected(0); }} onCatalogAction={onNavigate ? openCatalogCorrection : undefined} />
          {!planId ? <EmptyState title="لم تُجهّز صحيفة تشغيلية بعد" detail="المرجع المرفق متاح للمطابقة. إنشاء الصحيفة وربط مقرراتها يسبق اعتماد قواعدها." /> : !view ? <MicroLoader /> : (
            <>
              <div className={`pr-state ${view.state.status}`}>
                <span className="pr-state-ic">{view.state.status === "approved" ? <ShieldCheck /> : <BookOpenCheck />}</span>
                <div>
                  <strong>{view.state.status === "approved" ? `معتمدة · الإصدار ${view.state.version}` : "قيد المراجعة"}</strong>
                  <small>{view.state.status === "approved" ? `${view.state.approvedBy || ""}` : view.state.updatedBy ? `آخر تعديل: ${view.state.updatedBy}` : "لم تُعدَّل بعد"}</small>
                </div>
                {view.can.approve && view.state.status === "review" ? (
                  <PrimaryButton disabled={busy || view.blockers > 0} onClick={() => setConfirmApprove(true)} data-guide-ignore="اعتمادُ الصحيفة داخل شاشةٍ مسجّلة في المرشد باسم page.planReview">
                    <CheckCircle2 size={16} /> اعتماد الصحيفة
                  </PrimaryButton>
                ) : null}
              </div>

              {view.courses.some(c => c.external) ? (
                <p className="pr-ext-note" role="status"><Lock size={14} aria-hidden="true" /> {countOf(view.courses.filter(c => c.external).length, AR.course)} عامّاً ({countOf(view.courses.filter(c => c.external).reduce((sum, c) => sum + c.credit, 0), AR.unit)}) تُحتسب في صحيفتك وتبقى لأقسامها: تراها ولا تعدّلها.</p>
              ) : null}
              {confirmApprove ? (
                <div className="pr-confirm" role="alertdialog" aria-modal="false" aria-labelledby="pr-confirm-title">
                  <span className="pr-confirm-ic" aria-hidden="true"><ShieldCheck /></span>
                  <div>
                    <b id="pr-confirm-title">تأكيد اعتماد الصحيفة</b>
                    <ul>
                      <li>تصير الصحيفة معتمدة (إصدار {view.state.version + 1}) وتصل المحرّك وبابَ الطالب.</li>
                      <li>تختفي أيقونةُ «مراجعة الصحيفة» من القسم إن لم تبقَ صحيفةٌ أخرى قيد المراجعة.</li>
                      <li>وتعود الأيقونةُ إن عُدّلت الصحيفةُ لاحقاً (تعود قيد المراجعة).</li>
                    </ul>
                  </div>
                  <div className="pr-confirm-actions">
                    <PrimaryButton disabled={busy} onClick={async () => { await act("/api/plan-review/approve", "POST", { updatedAt: view.state.updatedAt }); setConfirmApprove(false); }} data-guide-ignore="تأكيدُ اعتماد الصحيفة داخل شاشة مراجعة الصحيفة">نعم، اعتمد</PrimaryButton>
                    <SecondaryButton disabled={busy} onClick={() => setConfirmApprove(false)} data-guide-ignore="تراجعٌ عن اعتماد الصحيفة دون أي تغيير">تراجع</SecondaryButton>
                  </div>
                </div>
              ) : null}

              {view.issues.length ? (
                <ul className="pr-issues">
                  {view.issues.map((i, k) => (
                    <li key={k} className={i.severity} onClick={() => { if (i.courseId) { setFocus(i.courseId); setSelected(i.courseId); } }}>
                      <AlertTriangle size={14} /> {i.text}
                    </li>
                  ))}
                </ul>
              ) : null}
              {view.blockers ? <Notice type="block" inline>{countOf(view.blockers, AR.blocker)} يمنع الاعتماد حتى يُصلَح.</Notice> : null}

              <section className="pr-infographic" aria-label="ملخص الصحيفة">
                <div className="pr-infographic-stat"><span><GraduationCap /></span><div><small>مقررات الصحيفة</small><strong>{view.courses.length.toLocaleString("ar-KW-u-nu-latn")}</strong></div></div>
                <div className="pr-infographic-stat"><span><Layers /></span><div><small>المستويات</small><strong>{levels.size.toLocaleString("ar-KW-u-nu-latn")}</strong></div></div>
                <div className="pr-level-ribbon" aria-label="توزيع المقررات على المستويات">
                  {[...levels.entries()].map(([level, ids]) => <div className="pr-level-chip" key={level} title={`${level ? `المستوى ${level}` : "بلا مستوى"}: ${countOf(ids.length, AR.course)}`}>
                    <span className="pr-level-chip-icon"><Layers size={15} aria-hidden="true" /></span><span className="pr-level-chip-label"><b>{level ? `المستوى ${level}` : "بلا مستوى"}</b><small>{countOf(ids.length, AR.course)}</small><i><b style={{ inlineSize: `${view.courses.length ? ids.length / view.courses.length * 100 : 0}%` }} /></i></span>
                  </div>)}
                </div>
              </section>

              {view.categories?.length ? (
                <nav className="pr-cats" aria-label="تصفية مقررات الصحيفة بحسب تصنيفها">
                  {[{ name: "", label: "كل الأقسام", rows: deptCourses }, ...view.categories.map(name => ({ name, label: name, rows: deptCourses.filter(c => c.category === name) }))].map(chip => (
                    <button key={chip.name || "all"} type="button" className={`pr-cat${cat === chip.name ? " on" : ""}`} aria-pressed={cat === chip.name} disabled={chip.name !== "" && !chip.rows.length} onClick={() => pickCat(chip.name)} data-guide-ignore="تصفية مقررات الصحيفة بحسب قسمها: ثقافة عامة وتخصصية ومهنية وتدريب ميداني">
                      <b>{chip.label}</b><small>{countOf(chip.rows.length, AR.course)} · {countOf(chip.rows.reduce((sum, c) => sum + c.credit, 0), AR.unit)}</small>
                    </button>
                  ))}
                </nav>
              ) : null}

              <div className="pr-map" ref={mapRef} style={{ ["--cols" as string]: levels.size }} aria-label="خريطة المستويات">
                {[...levels.entries()].map(([level, ids]) => (
                  <section key={level} className="pr-col" data-lvl={levelHue(level)}>
                    <div className="pr-level-head">
                      <span className="pr-level-head-icon"><GraduationCap size={16} aria-hidden="true" /></span><span><b>{level ? `المستوى ${level}` : "بلا مستوى"}</b><small>{countOf(ids.length, AR.course)} · {countOf(ids.reduce((sum, id) => sum + (view.courses.find(course => course.id === id)?.credit || 0), 0), AR.unit)}</small></span>
                    </div>
                    {ids.map(id => {
                      const c = view.courses.find(x => x.id === id)!;
                      const rule = ruleOf(id);
                      const opens = dependentsOf(view.rules, id).length;
                      const cls = ["pr-card", `k-${KIND_TONE[rule?.kind || "none"]}`, focus === id ? "sel" : "", upstream.has(id) ? "up" : "", downstream.has(id) ? "down" : "", focus && focus !== id && !upstream.has(id) && !downstream.has(id) ? "dim" : "", cat && !isActive(c) ? "off" : "", c.owned ? "" : "lock"].join(" ");
                      return (
                        <button key={id} type="button" data-cid={id} disabled={cat ? !isActive(c) : false} title={cat && !isActive(c) ? "خارج التصنيف المحدد" : undefined} aria-pressed={focus === id} className={cls} style={{ ["--src" as string]: series.has(id) ? `var(--series-${series.get(id)})` : undefined }} onClick={() => setFocus(focus === id ? 0 : id)} data-guide-ignore="بطاقةُ مقررٍ داخل خريطة شاشةٍ مسجّلة في المرشد باسم page.planReview">
                          <i className="pr-credit" aria-hidden="true">{c.credit}</i>
                          <span className="pr-name">{c.name}{c.external ? <em className="pr-ext" title={`مقرر عام يملكه ${c.ownerSectionName || "قسمٌ آخر"}`}>عام</em> : null}{c.owned ? null : <Lock size={11} aria-hidden="true" />}</span>
                          <b className="pr-code">{c.code}</b>
                          <span className="sr-only">{countOf(c.credit, AR.unit)}{opens ? ` · يفتح ${countOf(opens, AR.course)}` : ""}</span>
                        </button>
                      );
                    })}
                  </section>
                ))}
                <PlanMapLines mapRef={mapRef} edges={edges} focus={focus} up={upstream} down={downstream} off={offIds} layoutKey={`${view.courses.length}:${levels.size}`} />
              </div>

              {edges.length ? <p className="pr-key">السهم يصل إلى المقرر الذي يتطلبه · ولون الرقم هو لون أسهمه</p> : null}

              {focusCourse ? (
                <section className="pr-focus" aria-live="polite">
                  <div className="pr-focus-head">
                    <div><b><bdi dir="ltr">{focusCourse.code}</bdi> · {focusCourse.name}</b><small>{focusRule?.kind ? KIND_LABEL[focusRule.kind] : "بلا نوع"} · {countOf(focusCourse.credit, AR.unit)}</small></div>
                    <div className="pr-focus-actions">
                      <SecondaryButton onClick={() => setSelected(focusCourse.id)} data-guide-ignore="فتح محرّر قواعد المقرر من لوحة الخريطة">{view.can.edit && focusCourse.owned ? "تعديل القواعد" : "عرض التفاصيل"}</SecondaryButton>
                      <button type="button" className="pr-focus-x" aria-label="إلغاء التحديد" onClick={() => setFocus(0)} data-guide-ignore="إلغاء تحديد المقرر في الخريطة"><X size={14} /></button>
                    </div>
                  </div>
                  <p><em>يتطلب</em> {focusRule?.prereq ? describePrereq(focusRule.prereq, nameOf) : "لا شيء — مقرر مفتوح من البداية"}</p>
                  <p><em>يفتح</em> {focusOpens.length ? focusOpens.map(nameOf).join("، ") : "لا يتطلبه مقرر آخر"}</p>
                </section>
              ) : null}

              {sel ? <CourseEditor key={sel.id} course={sel} rule={ruleOf(sel.id)} view={view} nameOf={nameOf} busy={busy} onClose={() => setSelected(0)}
                onSaveCourse={values => saveCourseDetails(sel, values)}
                onSave={rule => act("/api/plan-review/rule", "PUT", { rule })} /> : null}

              <GroupsPanel view={view} nameOf={nameOf} busy={busy}
                onSave={group => act("/api/plan-review/group", "PUT", { group })}
                onDelete={groupId => act("/api/plan-review/group/delete", "POST", { groupId })} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function CourseEditor({ course, rule, view, nameOf, busy, onClose, onSave, onSaveCourse }: {
  key?: React.Key; course: CourseRow; rule?: CurriculumCourseRule; view: View; nameOf: (id: number) => string; busy: boolean; onClose: () => void;
  onSave: (rule: CurriculumCourseRule) => void; onSaveCourse: (values: { credit: number; hours: number; capacity: number }) => void;
}) {
  const editable = view.can.edit && course.owned;
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const [level, setLevel] = useState(rule?.level || courseLevelFromCode(course.code) || 0);
  const [kind, setKind] = useState<CourseKind | "">(rule?.kind || "");
  const [all, setAll] = useState<number[]>(rule?.prereq?.all || []);
  const [anyOf, setAnyOf] = useState<number[][]>(rule?.prereq?.anyOf || []);
  const [minUnits, setMinUnits] = useState(rule?.prereq?.minUnits || 0);
  const [coreq, setCoreq] = useState<number[]>(rule?.coreq || []);
  const [credit, setCredit] = useState(course.credit);
  const [hours, setHours] = useState(course.hours);
  const [capacity, setCapacity] = useState(course.capacity);
  const options = view.courses.filter(c => c.id !== course.id).sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true, sensitivity: "base" }));
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { closeRef.current(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),[tabindex]:not([tabindex="-1"])')];
      if (!controls.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  const pick = (current: number[], set: (v: number[]) => void) => (
    <select aria-label="إضافة مقرر" value="" disabled={!editable} onChange={e => { const id = Number(e.target.value); if (id && !current.includes(id)) set([...current, id]); }}>
      <option value="">＋ إضافة</option>
      {options.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
    </select>
  );
  const chips = (list: number[], set: (v: number[]) => void) => list.map(id => (
    <span key={id} className="pr-chip">{nameOf(id)}{editable ? <button type="button" aria-label="إزالة" onClick={() => set(list.filter(x => x !== id))} data-guide-ignore="إزالةُ مقررٍ من شرطٍ داخل محرّر شاشةٍ مسجّلة في المرشد باسم page.planReview"><X size={12} /></button> : null}</span>
  ));
  const editor = (
    <div className="pr-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="pr-editor pr-course-dialog" role="dialog" aria-modal="true" aria-labelledby="pr-course-dialog-title" tabIndex={-1}>
      <header>
        <div id="pr-course-dialog-title"><bdi dir="ltr">{course.code}</bdi> · {course.name}</div>
        <button type="button" aria-label="إغلاق" onClick={onClose} data-guide-ignore="إغلاقُ محرّر المقرر داخل شاشةٍ مسجّلة في المرشد باسم page.planReview"><X size={16} /></button>
      </header>
      {!course.owned ? <Notice type="info" inline><Lock size={14} /> {course.external ? "متطلبٌ عام: " : "هذا المقرر من "}{course.ownerSectionName || "قسمٍ آخر"} — {course.external ? "يُحتسب في صحيفتك ويعدّله قسمُه." : "يعدّل قواعده قسمُه."}</Notice> : null}
      <section className="pr-course-facts" aria-label="بيانات المقرر الأكاديمية">
        <p className="pr-sum">بيانات المقرر · تظهر في الصحيفة القديمة والجديدة إذا كان السجل مشتركًا</p>
        <div className="pr-grid">
          <label>الوحدات
            <input type="number" min={0} max={20} step={1} value={credit} disabled={!editable} onChange={e => setCredit(Number(e.target.value) || 0)} />
          </label>
          <label>الساعات
            <input type="number" min={0} max={40} step="0.5" value={hours} disabled={!editable} onChange={e => setHours(Number(e.target.value) || 0)} />
          </label>
          <label>السعة
            <input type="number" min={0} max={200} step={1} value={capacity} disabled={!editable} onChange={e => setCapacity(Number(e.target.value) || 0)} />
          </label>
        </div>
        {editable ? <footer><PrimaryButton disabled={busy || (credit === course.credit && hours === course.hours && capacity === course.capacity)} onClick={() => onSaveCourse({ credit, hours, capacity })} data-guide-ignore="حفظ بيانات المقرر من محرر الصحيفة السريع">حفظ بيانات المقرر</PrimaryButton></footer> : null}
      </section>
      {rule?.prereq ? <p className="pr-sum">{describePrereq(rule.prereq, nameOf)}</p> : null}
      <div className="pr-grid">
        <label>المستوى
          <select value={level} disabled={!editable} onChange={e => setLevel(Number(e.target.value))}>
            <option value={0}>—</option>
            {CURRICULUM_LEVELS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>النوع
          <select value={kind} disabled={!editable} onChange={e => setKind(e.target.value as CourseKind | "")}>
            <option value="">—</option>
            {KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label>وحداتٌ مجتازة لا تقلّ عن
          <input type="number" min={0} max={200} value={minUnits} disabled={!editable} onChange={e => setMinUnits(Number(e.target.value) || 0)} />
        </label>
      </div>
      <div className="pr-field"><span>مسبقاتٌ كلُّها لازمة</span><div>{chips(all, setAll)}{pick(all, setAll)}</div></div>
      <div className="pr-field"><span>يكفي واحدٌ منها</span>
        <div>
          {anyOf.map((group, i) => (
            <div key={i} className="pr-any">{chips(group, g => setAnyOf(anyOf.map((x, j) => j === i ? g : x)))}{pick(group, g => setAnyOf(anyOf.map((x, j) => j === i ? g : x)))}
              {editable ? <button type="button" aria-label="حذف المجموعة" onClick={() => setAnyOf(anyOf.filter((_, j) => j !== i))} data-guide-ignore="حذفُ مجموعة بدائل داخل محرّر شاشةٍ مسجّلة في المرشد باسم page.planReview"><Trash2 size={13} /></button> : null}
            </div>
          ))}
          {editable ? <SecondaryButton onClick={() => setAnyOf([...anyOf, []])} data-guide-ignore="مجموعةُ بدائل جديدة داخل محرّر شاشةٍ مسجّلة في المرشد باسم page.planReview"><Plus size={14} /> مجموعة بدائل</SecondaryButton> : null}
        </div>
      </div>
      <div className="pr-field"><span>مقرن (يُسجَّل معه)</span><div>{chips(coreq, setCoreq)}{pick(coreq, setCoreq)}</div></div>
      {editable ? (
        <footer>
          <PrimaryButton disabled={busy} onClick={() => onSave({ courseId: course.id, ...(level ? { level } : {}), ...(kind ? { kind } : {}), prereq: { all, anyOf, ...(minUnits ? { minUnits } : {}) }, coreq })} data-guide-ignore="حفظُ قواعد المقرر داخل شاشةٍ مسجّلة في المرشد باسم page.planReview">حفظ</PrimaryButton>
        </footer>
      ) : null}
    </section>
    </div>
  );
  return createPortal(editor, document.body);
}

function GroupsPanel({ view, nameOf, busy, onSave, onDelete }: { view: View; nameOf: (id: number) => string; busy: boolean; onSave: (g: ElectiveGroup) => void; onDelete: (id: string) => void }) {
  const [draft, setDraft] = useState<ElectiveGroup | null>(null);
  const electives = [...view.courses].sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true, sensitivity: "base" }));
  return (
    <section className="pr-groups">
      <h3>المجموعات الاختيارية</h3>
      {view.groups.length === 0 && !draft ? <p className="pr-none">لا مجموعات — اختر «مجموعة جديدة» إن كان في الصحيفة اختياراتٌ يُنتقى منها.</p> : null}
      <div className="pr-group-list">
        {view.groups.map(g => (
          <article key={g.id} className="pr-group">
            <b>{g.name}</b>
            <small>اختر {countOf(g.minCourses, AR.course)} · لا يقل عن {countOf(g.minUnits, AR.unit)}</small>
            <div>{g.courseIds.map(id => <span key={id} className="pr-chip">{nameOf(id)}</span>)}</div>
            {view.can.edit ? (
              <div className="pr-group-actions">
                <SecondaryButton onClick={() => setDraft(g)} data-guide-ignore="تعديلُ مجموعةٍ اختيارية داخل شاشةٍ مسجّلة في المرشد باسم page.planReview">تعديل</SecondaryButton>
                <SecondaryButton disabled={busy} onClick={() => onDelete(g.id)} data-guide-ignore="حذفُ مجموعةٍ اختيارية داخل شاشةٍ مسجّلة في المرشد باسم page.planReview"><Trash2 size={14} /></SecondaryButton>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {view.can.edit && !draft ? <SecondaryButton onClick={() => setDraft({ id: `g-${Date.now().toString(36)}`, name: "", minCourses: 1, minUnits: 3, courseIds: [] })} data-guide-ignore="مجموعةٌ اختيارية جديدة داخل شاشةٍ مسجّلة في المرشد باسم page.planReview"><Plus size={14} /> مجموعة جديدة</SecondaryButton> : null}
      {draft ? (
        <div className="pr-editor">
          <div className="pr-grid">
            <label>الاسم<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
            <label>عدد المقررات<input type="number" min={0} value={draft.minCourses} onChange={e => setDraft({ ...draft, minCourses: Number(e.target.value) || 0 })} /></label>
            <label>الوحدات<input type="number" min={0} value={draft.minUnits} onChange={e => setDraft({ ...draft, minUnits: Number(e.target.value) || 0 })} /></label>
          </div>
          <div className="pr-pick">
            {electives.map(c => (
              <label key={c.id} className="pr-opt"><input type="checkbox" checked={draft.courseIds.includes(c.id)} onChange={e => setDraft({ ...draft, courseIds: e.target.checked ? [...draft.courseIds, c.id] : draft.courseIds.filter(x => x !== c.id) })} />{c.code} · {c.name}</label>
            ))}
          </div>
          <footer>
            <PrimaryButton disabled={busy || !draft.name.trim()} onClick={() => { onSave(draft); setDraft(null); }} data-guide-ignore="حفظُ المجموعة الاختيارية داخل شاشةٍ مسجّلة في المرشد باسم page.planReview">حفظ المجموعة</PrimaryButton>
            <SecondaryButton onClick={() => setDraft(null)} data-guide-ignore="إلغاءُ تحرير المجموعة داخل شاشةٍ مسجّلة في المرشد باسم page.planReview">إلغاء</SecondaryButton>
          </footer>
        </div>
      ) : null}
    </section>
  );
}
