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
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpenCheck, CheckCircle2, FileSpreadsheet, Link2, Lock, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { EmptyState, MicroLoader, Notice, PageTitle, PrimaryButton, SecondaryButton } from "./ui";
import { AR, countOf } from "../utils/arabicCount";
import { CURRICULUM_LEVELS, KIND_LABEL, KINDS, byLevel, dependentsOf, describePrereq } from "../utils/curriculumRules";
import type { CourseKind, CurriculumCourseRule, ElectiveGroup } from "../types";

interface Status {
  pending: Array<{ planId: string; sectionId: number; sectionName: string }>;
  approved: Array<{ planId: string; sectionId: number; sectionName: string }>;
  sections: Array<{ sectionId: number; sectionName: string; plans: Array<{ id: string; name: string; status?: string; pending?: boolean }> }>;
  canApprove: boolean;
  canImport?: boolean;
}
interface CourseRow { id: number; code: string; name: string; credit: number; ownerSectionName: string; owned: boolean }
interface View {
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
    setView(null); setSelected(0);
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
      void loadStatus();
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

  const levels = useMemo(() => view ? byLevel(view.courses.map(c => c.id), view.rules) : new Map<number, number[]>(), [view]);
  const upstream = useMemo(() => {
    if (!view || !selected) return new Set<number>();
    const out = new Set<number>();
    const walk = (id: number) => {
      const p = view.rules.find(r => r.courseId === id)?.prereq;
      if (!p) return;
      [...p.all, ...p.anyOf.flat()].forEach(x => { if (!out.has(x)) { out.add(x); walk(x); } });
    };
    walk(selected);
    return out;
  }, [view, selected]);
  const downstream = useMemo(() => {
    if (!view || !selected) return new Set<number>();
    const out = new Set<number>();
    const walk = (id: number) => dependentsOf(view.rules, id).forEach(x => { if (!out.has(x)) { out.add(x); walk(x); } });
    walk(selected);
    return out;
  }, [view, selected]);

  if (loading) return <MicroLoader />;
  const sectionPlans = status?.sections.find(s => s.sectionId === sectionId)?.plans || [];
  const sel = view?.courses.find(c => c.id === selected);

  return (
    <div className="pr-page" dir="rtl">
      <PageTitle eyebrow="مراجعة الصحيفة" subtitle="مستوى كل مقرر ونوعه وما يسبقه، ثم يعتمدها رئيس لجنة الجدول.">قواعد المقررات</PageTitle>
      {error ? <Notice type="error" onDismiss={() => setError("")}>{error}</Notice> : null}
      {status?.canImport ? <ImportPanel onDone={() => void loadStatus()} /> : null}
      {!status?.sections.length ? <EmptyState title="لا صحائف في نطاقك" detail="تظهر هنا صحائف الأقسام التي تملك نطاقها." /> : (
        <>
          <div className="pr-pickers">
            {status.sections.length > 1 ? (
              <select aria-label="القسم" value={sectionId} onChange={e => { const s = status.sections.find(x => x.sectionId === Number(e.target.value)); setSectionId(Number(e.target.value)); setPlanId(s?.plans[0]?.id || ""); }}>
                {status.sections.map(s => <option key={s.sectionId} value={s.sectionId}>{s.sectionName}{status.pending.some(p => p.sectionId === s.sectionId) ? " • بانتظار المراجعة" : ""}</option>)}
              </select>
            ) : <strong className="pr-sec">{status.sections[0].sectionName}</strong>}
            <div className="pr-plans" role="tablist">
              {sectionPlans.map(p => (
                <button key={p.id} type="button" role="tab" aria-selected={p.id === planId} className={`pr-plan${p.id === planId ? " on" : ""}`} onClick={() => setPlanId(p.id)} data-guide-ignore="تبديلُ الصحيفة داخل شاشةٍ مسجّلة في المرشد باسم page.planReview">{p.name}</button>
              ))}
            </div>
          </div>

          <CurriculumReferenceReview sectionId={sectionId} onCatalogAction={onNavigate ? openCatalogCorrection : undefined} />
          {!planId ? <EmptyState title="لم تُجهّز صحيفة تشغيلية بعد" detail="المرجع المرفق متاح للمطابقة. إنشاء الصحيفة وربط مقرراتها يسبق اعتماد قواعدها." /> : !view ? <MicroLoader /> : (
            <>
              <div className={`pr-state ${view.state.status}`}>
                <span className="pr-state-ic">{view.state.status === "approved" ? <ShieldCheck /> : <BookOpenCheck />}</span>
                <div>
                  <strong>{view.state.status === "approved" ? `معتمدة · الإصدار ${view.state.version}` : "قيد المراجعة"}</strong>
                  <small>{view.state.status === "approved" ? `${view.state.approvedBy || ""}` : view.state.updatedBy ? `آخر تعديل: ${view.state.updatedBy}` : "لم تُعدَّل بعد"}</small>
                </div>
                {view.can.approve && view.state.status === "review" ? (
                  <PrimaryButton disabled={busy || view.blockers > 0} onClick={() => act("/api/plan-review/approve", "POST", { updatedAt: view.state.updatedAt })} data-guide-ignore="اعتمادُ الصحيفة داخل شاشةٍ مسجّلة في المرشد باسم page.planReview">
                    <CheckCircle2 size={16} /> اعتماد الصحيفة
                  </PrimaryButton>
                ) : null}
              </div>

              {view.issues.length ? (
                <ul className="pr-issues">
                  {view.issues.map((i, k) => (
                    <li key={k} className={i.severity} onClick={() => i.courseId && setSelected(i.courseId)}>
                      <AlertTriangle size={14} /> {i.text}
                    </li>
                  ))}
                </ul>
              ) : null}
              {view.blockers ? <Notice type="block" inline>{countOf(view.blockers, AR.blocker)} يمنع الاعتماد حتى يُصلَح.</Notice> : null}

              <div className="pr-map" aria-label="خريطة المستويات">
                {[...levels.entries()].map(([level, ids]) => (
                  <section key={level} className="pr-col">
                    <h4>{level ? `المستوى ${level}` : "بلا مستوى"}</h4>
                    {ids.map(id => {
                      const c = view.courses.find(x => x.id === id)!;
                      const rule = ruleOf(id);
                      const cls = ["pr-card", `k-${KIND_TONE[rule?.kind || "none"]}`, selected === id ? "sel" : "", upstream.has(id) ? "up" : "", downstream.has(id) ? "down" : "", c.owned ? "" : "lock"].join(" ");
                      return (
                        <button key={id} type="button" className={cls} onClick={() => setSelected(selected === id ? 0 : id)} data-guide-ignore="بطاقةُ مقررٍ داخل خريطة شاشةٍ مسجّلة في المرشد باسم page.planReview">
                          <b>{c.code}</b><span>{c.name}</span>
                          <i>{countOf(c.credit, AR.unit)}{rule?.prereq ? " · " : ""}{rule?.prereq ? <Link2 size={11} /> : null}{c.owned ? null : <Lock size={11} />}</i>
                        </button>
                      );
                    })}
                  </section>
                ))}
              </div>

              {sel ? <CourseEditor key={sel.id} course={sel} rule={ruleOf(sel.id)} view={view} nameOf={nameOf} busy={busy} onClose={() => setSelected(0)}
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

function CourseEditor({ course, rule, view, nameOf, busy, onClose, onSave }: {
  key?: React.Key; course: CourseRow; rule?: CurriculumCourseRule; view: View; nameOf: (id: number) => string; busy: boolean; onClose: () => void; onSave: (rule: CurriculumCourseRule) => void;
}) {
  const editable = view.can.edit && course.owned;
  const [level, setLevel] = useState(rule?.level || 0);
  const [kind, setKind] = useState<CourseKind | "">(rule?.kind || "");
  const [all, setAll] = useState<number[]>(rule?.prereq?.all || []);
  const [anyOf, setAnyOf] = useState<number[][]>(rule?.prereq?.anyOf || []);
  const [minUnits, setMinUnits] = useState(rule?.prereq?.minUnits || 0);
  const [coreq, setCoreq] = useState<number[]>(rule?.coreq || []);
  const options = view.courses.filter(c => c.id !== course.id);
  const pick = (current: number[], set: (v: number[]) => void) => (
    <select aria-label="إضافة مقرر" value="" disabled={!editable} onChange={e => { const id = Number(e.target.value); if (id && !current.includes(id)) set([...current, id]); }}>
      <option value="">＋ إضافة</option>
      {options.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
    </select>
  );
  const chips = (list: number[], set: (v: number[]) => void) => list.map(id => (
    <span key={id} className="pr-chip">{nameOf(id)}{editable ? <button type="button" aria-label="إزالة" onClick={() => set(list.filter(x => x !== id))} data-guide-ignore="إزالةُ مقررٍ من شرطٍ داخل محرّر شاشةٍ مسجّلة في المرشد باسم page.planReview"><X size={12} /></button> : null}</span>
  ));
  return (
    <section className="pr-editor" aria-label={`قواعد ${course.name}`}>
      <header>
        <div><b>{course.code}</b> {course.name}</div>
        <button type="button" aria-label="إغلاق" onClick={onClose} data-guide-ignore="إغلاقُ محرّر المقرر داخل شاشةٍ مسجّلة في المرشد باسم page.planReview"><X size={16} /></button>
      </header>
      {!course.owned ? <Notice type="info" inline><Lock size={14} /> هذا المقرر من {course.ownerSectionName || "قسمٍ آخر"} — يعدّل قواعده قسمُه.</Notice> : null}
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
  );
}

function GroupsPanel({ view, nameOf, busy, onSave, onDelete }: { view: View; nameOf: (id: number) => string; busy: boolean; onSave: (g: ElectiveGroup) => void; onDelete: (id: string) => void }) {
  const [draft, setDraft] = useState<ElectiveGroup | null>(null);
  const electives = view.courses;
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
