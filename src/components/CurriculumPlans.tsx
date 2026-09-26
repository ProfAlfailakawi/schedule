import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  GraduationCap,
  Layers3,
  Link2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { AdCourse, AdSection, CurriculumPlan, CurriculumPlanCourse, CourseTransition } from "../types";
import {
  CatalogFormDrawer,
  EmptyState,
  Notice,
  PageTitle,
  PrimaryButton,
  SecondaryButton,
  Surface,
  visualConfirm,
} from "./ui";
import { sortByName } from "../utils/sorting";
import { AR, countOf, nounFor } from "../utils/arabicCount";

type Rule = { degreeUnits: number; fieldTrainingRequired: number; graduateRegularPassed: number; graduateSummerPassed: number };
type Overview = {
  section: AdSection;
  plans: CurriculumPlan[];
  memberships: CurriculumPlanCourse[];
  transitions: CourseTransition[];
  courses: AdCourse[];
  operationalCourseIds: number[];
  bootstrap: boolean;
  /** The rule each plan's graduates are measured by — the server's own answer. */
  planRules?: Record<string, { rule: Rule | null; inherited: boolean }>;
};
type Tab = "new" | "old" | "map";

const RULE_FIELDS: Array<[keyof Rule, string, string]> = [
  ["degreeUnits", "مجموع وحدات الدرجة", "كما في «الوحدات المطلوبة» بصحيفة التخرج"],
  ["fieldTrainingRequired", "لفتح التدريب الميداني", "الوحدات المجتازة قبل الميداني"],
  ["graduateRegularPassed", "خريج / متوقع · فصل عادي", "حدّ طلب الخريج في الفصل العادي"],
  ["graduateSummerPassed", "خريج / متوقع · فصل صيفي", "حدّ طلب الخريج في الفصل الصيفي"],
];
const num = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn");
const courseLine = (course: AdCourse) => `${course.CourseCode} — ${course.CourseName}`;

/*
 * This project intentionally omits @types/react. In that setup TypeScript does
 * not know that `key` is a reserved JSX attribute on custom components, even
 * though React consumes it correctly at runtime. Keep the workaround local to
 * the mapped plan cards instead of weakening the shared Surface contract.
 */
const PlanSurface = Surface as unknown as (props: {
  children?: React.ReactNode;
  className?: string;
  key?: string | number;
}) => any;

/**
 * ── الصحائف الأكاديمية: صحيفتان تعملان معاً ──────────────────────────────
 *
 * في سنوات الانتقال يدرس في القسم جيلان: كلُّ طالبٍ على صحيفته، بمقرراتها
 * وشروط تخرجها. هذه الشاشة تُجيب عن ثلاثة أسئلة فقط، بالترتيب الذي يحتاجه
 * القسم: هل بدأت الصحيفة الجديدة؟ ما مقرراتها؟ وما شروط التخرج لكل صحيفة؟
 * أما ربط المقرر القديم بمقابله فاختياري، وموضعه آخر الشاشة.
 */
export default function CurriculumPlans({
  sections,
  initialSectionId,
  onClose,
  onChanged,
  onCreateCourse,
}: {
  sections: AdSection[];
  initialSectionId?: number;
  onClose: () => void;
  onChanged?: () => void;
  /** Opens the course editor for this department; the new course joins the current plan. */
  onCreateCourse?: (sectionId: number) => void;
}) {
  const [sectionId, setSectionId] = useState(Number(initialSectionId || sections[0]?.AdSectionId || 0));
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [planName, setPlanName] = useState("");
  const [showNextGeneration, setShowNextGeneration] = useState(false);
  const [tab, setTab] = useState<Tab>("new");
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [ruleDraft, setRuleDraft] = useState<{ planId: string; values: Record<string, string> } | null>(null);
  const [nameDraft, setNameDraft] = useState<{ planId: string; value: string } | null>(null);
  const [fromCourseId, setFromCourseId] = useState(0);
  const [toCourseId, setToCourseId] = useState(0);

  /* The department on screen now. A reply for a department the admin has
     already switched away from is dropped, so plans never render under the
     wrong selector. */
  const currentSection = useRef(sectionId);
  currentSection.current = sectionId;
  const accept = (sid: number, overview: Overview | undefined) => {
    if (overview && Number(sid) === Number(currentSection.current)) setData(overview);
  };
  const load = async (sid = sectionId) => {
    if (!sid) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/curriculum/sections/${sid}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "تعذر تحميل الصحائف الأكاديمية");
      accept(sid, body);
    } catch (e: any) {
      if (Number(sid) === Number(currentSection.current)) setError(String(e?.message || "تعذر تحميل الصحائف الأكاديمية"));
    } finally { if (Number(sid) === Number(currentSection.current)) setLoading(false); }
  };
  useEffect(() => {
    setRuleDraft(null); setNameDraft(null); setPicking(false); setPicked(new Set()); setQuery(""); setReceipt(null); setTab("new");
    void load(sectionId);
  }, [sectionId]);

  const courses = useMemo<AdCourse[]>(() => sortByName<AdCourse>(data?.courses ?? [], row => row.CourseName), [data?.courses]);
  const byId = useMemo(() => new Map(courses.map(course => [Number(course.AdCourseId), course])), [courses]);
  const livePlans = (data?.plans || []).filter(plan => plan.status !== "archived");
  const active = data?.bootstrap ? null : livePlans.find(plan => plan.status === "active") || null;
  const previous = data?.bootstrap ? null : livePlans.find(plan => plan.status === "transition") || null;
  const archivedPlans = (data?.plans || []).filter(plan => plan.status === "archived");
  const idsOf = (planId?: string) => new Set((data?.memberships || []).filter(row => row.planId === planId).map(row => Number(row.AdCourseId)));
  const activeIds = idsOf(active?.id);
  const previousIds = idsOf(previous?.id);
  const activeCourses = courses.filter(course => activeIds.has(Number(course.AdCourseId)));
  const previousCourses = courses.filter(course => previousIds.has(Number(course.AdCourseId)));
  const carryable = previousCourses.filter(course => !activeIds.has(Number(course.AdCourseId)));
  const ruleOf = (planId?: string) => (planId && data?.planRules?.[planId]) || { rule: null, inherited: false };
  const transitions = (data?.transitions || []).filter(row => row.fromPlanId === previous?.id && row.toPlanId === active?.id);

  /* Two live plans with the same total but different thresholds cannot be told
     apart from a student's sheet; say so where the rules are typed. */
  const rulesClash = useMemo(() => {
    const ruled = livePlans.map(plan => ruleOf(plan.id).rule).filter(Boolean) as Rule[];
    return ruled.some((a, i) => ruled.some((b, j) => j > i && a.degreeUnits === b.degreeUnits
      && (a.graduateRegularPassed !== b.graduateRegularPassed || a.graduateSummerPassed !== b.graduateSummerPassed)));
  }, [data]);

  const filterList = (list: AdCourse[]) => {
    const q = query.trim().toLowerCase();
    return q ? list.filter(course => `${course.CourseCode} ${course.CourseName}`.toLowerCase().includes(q)) : list;
  };

  const mutate = async (url: string, options: RequestInit, done?: string) => {
    if (busy) return null;
    const sid = sectionId;
    setBusy(true); setError(null); setReceipt(null);
    try {
      const response = await fetch(url, options);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "تعذر إتمام العملية");
      if (body.overview) accept(sid, body.overview); else await load(sid);
      if (done) setReceipt(done);
      onChanged?.();
      return body;
    } catch (e: any) {
      setError(String(e?.message || "تعذر إتمام العملية"));
      return null;
    } finally { setBusy(false); }
  };
  const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const createPlan = async () => {
    const name = planName.trim();
    if (!name) { setError("اكتب اسم الصحيفة الجديدة، مثل «صحيفة 2026»"); return; }
    const body = await mutate("/api/curriculum/plans", json("POST", { AdSectionId: sectionId, name }),
      `بدأت «${name}». أضف مقرراتها، ثم أدخل شروط تخرجها.`);
    if (body) { setPlanName(""); setShowNextGeneration(false); setTab("new"); }
  };
  const saveName = async () => {
    if (!nameDraft) return;
    const body = await mutate(`/api/curriculum/plans/${encodeURIComponent(nameDraft.planId)}`, json("PUT", { AdSectionId: sectionId, name: nameDraft.value.trim() }), "حُفظ اسم الصحيفة.");
    if (body) setNameDraft(null);
  };
  const startRule = (plan: CurriculumPlan) => {
    const current = ruleOf(plan.id).rule;
    const seed = current || ruleOf(livePlans.find(row => row.id !== plan.id)?.id).rule;
    setRuleDraft({ planId: plan.id, values: Object.fromEntries(RULE_FIELDS.map(([key]) => [key, seed ? String(seed[key]) : ""])) });
  };
  const saveRule = async () => {
    if (!ruleDraft) return;
    const values = Object.fromEntries(RULE_FIELDS.map(([key]) => [key, Number(ruleDraft.values[key])]));
    const body = await mutate(`/api/curriculum/plans/${encodeURIComponent(ruleDraft.planId)}`, json("PUT", { AdSectionId: sectionId, degreeRule: values }),
      "حُفظت شروط التخرج. يقيس الاستبيان عليها طلبة هذه الصحيفة من الآن.");
    if (body) setRuleDraft(null);
  };
  const addPicked = async () => {
    if (!active || !picked.size) return;
    const count = picked.size;
    const body = await mutate(`/api/curriculum/plans/${encodeURIComponent(active.id)}/courses`, json("POST", { AdCourseIds: [...picked] }),
      `أُضيف ${countOf(count, AR.course)} إلى «${active.name}».`);
    if (body) { setPicked(new Set()); setPicking(false); }
  };
  const removeFromActive = async (course: AdCourse) => {
    if (!active) return;
    if (!(await visualConfirm({ title: "إخراج المقرر من الصحيفة الجديدة", message: `سيخرج «${course.CourseName}» من «${active.name}». إن لم يكن في الصحيفة السابقة أيضاً فسيختفي من التشغيل. لا يُحذف سجله ولا تاريخه.`, confirmLabel: "إخراج المقرر", tone: "danger", compact: true }))) return;
    await mutate(`/api/curriculum/plans/${encodeURIComponent(active.id)}/courses/${course.AdCourseId}`, { method: "DELETE" });
  };
  const saveTransition = async () => {
    if (!active || !previous || !fromCourseId || !toCourseId) return;
    const from = byId.get(fromCourseId), to = byId.get(toCourseId);
    /* The distinction the department cares about is «this is its counterpart»;
       the finer kind is read from the two records, not asked for. */
    const sameName = String(from?.CourseName || "").trim() === String(to?.CourseName || "").trim();
    const sameCode = String(from?.CourseCode || "").trim() === String(to?.CourseCode || "").trim();
    const kind = sameName && !sameCode ? "renumbered" : sameCode && !sameName ? "renamed" : "replaced";
    const body = await mutate("/api/curriculum/transitions", json("POST", { AdSectionId: sectionId, fromPlanId: previous.id, toPlanId: active.id, fromCourseId, toCourseId, kind }), "حُفظ الربط.");
    if (body) { setFromCourseId(0); setToCourseId(0); }
  };
  const deleteTransition = async (id: string) => {
    if (!(await visualConfirm({ title: "حذف الربط", message: "يُحذف الربط وحده، ولا يتغير أي مقرر أو جدول.", confirmLabel: "حذف الربط", tone: "danger", compact: true }))) return;
    await mutate(`/api/curriculum/transitions/${encodeURIComponent(id)}`, { method: "DELETE" });
  };
  const archivePlan = async (plan: CurriculumPlan) => {
    if (busy) return;
    setBusy(true); setError(null); setReceipt(null);
    try {
      const response = await fetch(`/api/curriculum/plans/${encodeURIComponent(plan.id)}/archive-readiness?sectionId=${sectionId}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "تعذر فحص جاهزية الصحيفة");
      const readiness = body.readiness || {};
      const offerings = Number(readiness.currentOfferings || 0);
      const requests = Number(readiness.linkedStudentRequests || 0);
      if (offerings || requests) {
        setError(`لا يمكن أرشفة «${plan.name}» الآن: ما زال لمقرراتها الخاصة ${countOf(offerings, AR.offering, "لا طرح")} في الفصل الحالي و${countOf(requests, AR.request, "لا طلبات")} من الطلبة في أحدث فصل. تُؤرشف حين يتخرج آخر طلبتها.`);
        return;
      }
      const shared = Number(readiness.sharedCourses || 0);
      const oldOnly = Number(readiness.oldOnlyCourses || 0);
      if (!(await visualConfirm({
        title: "الصحيفة جاهزة للأرشفة",
        message: `الفحص ناجح: لا طروحات حالية ولا طلبات طلبة عليها. سيختفي من التشغيل ما يخصها وحدها (${countOf(oldOnly, AR.course)})، ويبقى المشترك مع الصحيفة الجديدة (${countOf(shared, AR.course)}). التاريخ والتقارير القديمة لا تتغير.`,
        confirmLabel: "أرشفة الصحيفة", tone: "danger", compact: true,
      }))) return;
      const archived = await fetch(`/api/curriculum/plans/${encodeURIComponent(plan.id)}/archive`, json("POST", { AdSectionId: sectionId }));
      const archivedBody = await archived.json();
      if (!archived.ok) throw new Error(archivedBody.error || "تعذر أرشفة الصحيفة");
      if (archivedBody.overview) accept(sectionId, archivedBody.overview); else await load();
      setReceipt(`أُرشفت «${plan.name}». تبقى في التقارير والتاريخ.`);
      onChanged?.();
    } catch (e: any) {
      setError(String(e?.message || "تعذر أرشفة الصحيفة"));
    } finally { setBusy(false); }
  };

  /* ── the three steps of a transition, and where the department stands ── */
  const steps = active ? [
    { done: true, label: "بدأت الصحيفة الجديدة", detail: active.name },
    { done: activeCourses.length > 0, label: "مقررات الصحيفة الجديدة", detail: activeCourses.length ? countOf(activeCourses.length, AR.course) : "لم تُضف بعد" },
    {
      done: livePlans.every(plan => Boolean(ruleOf(plan.id).rule)),
      label: "شروط التخرج لكل صحيفة",
      detail: livePlans.map(plan => `${plan.name}: ${ruleOf(plan.id).rule ? "معتمدة" : "ناقصة"}`).join(" · "),
    },
  ] : [];
  const stepsDone = steps.filter(step => step.done).length;

  const ruleBlock = (plan: CurriculumPlan) => {
    const { rule, inherited } = ruleOf(plan.id);
    const editing = ruleDraft?.planId === plan.id ? ruleDraft : null;
    if (editing) {
      return (
        <div className="plan-rule is-editing">
          <div className="plan-rule-grid">
            {RULE_FIELDS.map(([key, label, hint]) => (
              <label key={key}>
                <span>{label}</span>
                <input type="number" min={30} max={300} inputMode="numeric" dir="ltr" value={editing.values[key]}
                  onChange={e => setRuleDraft({ planId: plan.id, values: { ...editing.values, [key]: e.target.value } })}
                  aria-label={`${label} — ${plan.name}`} />
                <small>{hint}</small>
              </label>
            ))}
          </div>
          <div className="plan-rule-actions">
            <PrimaryButton data-guide-ignore="حفظ شروط التخرج لهذه الصحيفة" onClick={saveRule} disabled={busy || RULE_FIELDS.some(([key]) => !editing.values[key])}><Check /> حفظ الشروط</PrimaryButton>
            <SecondaryButton data-guide-ignore="إلغاء تعديل شروط التخرج" onClick={() => setRuleDraft(null)} disabled={busy}>إلغاء</SecondaryButton>
          </div>
        </div>
      );
    }
    if (!rule) {
      return (
        <div className="plan-rule is-missing">
          <p><strong>شروط التخرج لم تُعتمد بعد.</strong> لن يُتحقق من صحيفة تخرج أي طالب على هذه الصحيفة قبل إدخالها.</p>
          <PrimaryButton data-guide-ignore="إدخال شروط التخرج لهذه الصحيفة" onClick={() => startRule(plan)} disabled={busy}><GraduationCap /> إدخال شروط التخرج</PrimaryButton>
        </div>
      );
    }
    return (
      <div className="plan-rule">
        <dl className="plan-rule-grid">
          {RULE_FIELDS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{num(rule[key])}</dd></div>)}
        </dl>
        <div className="plan-rule-foot">
          <small>{inherited ? "منقولة من قواعد القسم السابقة" : "شروط تخرج معتمدة لهذه الصحيفة"}</small>
          <button type="button" className="plan-link-btn" data-guide-ignore="تعديل شروط التخرج لهذه الصحيفة" onClick={() => startRule(plan)} disabled={busy}><Pencil /> تعديل</button>
        </div>
      </div>
    );
  };

  const planCard = (plan: CurriculumPlan) => {
    const isNew = plan.status === "active";
    const count = (isNew ? activeIds : previousIds).size;
    const renaming = nameDraft?.planId === plan.id ? nameDraft : null;
    return (
      <PlanSurface key={plan.id} className={`plan-card ${isNew ? "is-new" : "is-old"}`}>
        <header className="plan-card-head">
          <span className="plan-card-icon">{isNew ? <Sparkles /> : <Layers3 />}</span>
          <div className="plan-card-title">
            <span className={`plan-chip ${isNew ? "is-new" : "is-old"}`}>{isNew ? "الصحيفة الجديدة" : "الصحيفة السابقة"}</span>
            {renaming ? (
              <div className="plan-rename">
                <input value={renaming.value} onChange={e => setNameDraft({ planId: plan.id, value: e.target.value })} aria-label="اسم الصحيفة" autoFocus
                  onKeyDown={e => { if (e.key === "Enter") void saveName(); if (e.key === "Escape") setNameDraft(null); }} />
                <button type="button" className="plan-icon-btn" data-guide-ignore="حفظ اسم الصحيفة" onClick={saveName} disabled={busy || !renaming.value.trim()} aria-label="حفظ الاسم"><Check /></button>
              </div>
            ) : (
              <h3>{plan.name}<button type="button" className="plan-icon-btn" data-guide-ignore="تعديل اسم الصحيفة" onClick={() => setNameDraft({ planId: plan.id, value: plan.name })} aria-label={`تعديل اسم ${plan.name}`} title="تعديل الاسم"><Pencil /></button></h3>
            )}
            <p>{isNew ? "للطلبة المقبولين عليها. كل مقرر جديد تنشئه يدخلها تلقائياً." : "لطلبتها الحاليين حتى يتخرج آخرهم. مقرراتها محفوظة كما هي."}</p>
          </div>
          <b className="plan-card-count">{num(count)}<small>{nounFor(count, AR.course)}</small></b>
        </header>
        {ruleBlock(plan)}
        {!isNew && !plan.virtual ? (
          <footer className="plan-card-foot">
            <button type="button" className="plan-link-btn" data-guide-ignore="أرشفة صحيفة أكاديمية بعد فحص الجاهزية" onClick={() => archivePlan(plan)} disabled={busy}><Archive /> أرشفة الصحيفة بعد تخرج طلبتها</button>
          </footer>
        ) : null}
      </PlanSurface>
    );
  };

  const newTab = active ? (
    <>
      <div className="plan-list-tools">
        <label className="plan-search"><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث بالرقم أو الاسم" aria-label="بحث في المقررات" /></label>
        {onCreateCourse ? <PrimaryButton data-guide-ignore="فتح نموذج إنشاء مقرر جديد في الصحيفة الجديدة" onClick={() => onCreateCourse(sectionId)} disabled={busy}><Plus /> مقرر جديد</PrimaryButton> : null}
        {carryable.length ? <SecondaryButton data-guide-ignore="اختيار مقررات بقيت كما هي من الصحيفة السابقة" onClick={() => { setPicking(v => !v); setPicked(new Set()); }} disabled={busy}><ArrowLeftRight /> مقررات لم تتغير</SecondaryButton> : null}
      </div>
      {picking ? (
        <div className="plan-picker">
          <header>
            <div><strong>مقررات بقيت كما هي</strong><span>اختر من الصحيفة السابقة ما بقي برقمه واسمه في الجديدة، فيصير مشتركاً بين الصحيفتين.</span></div>
            <button type="button" className="plan-link-btn" data-guide-ignore="تحديد كل المقررات الظاهرة أو إلغاء التحديد" onClick={() => {
              const visible = filterList(carryable).map(course => Number(course.AdCourseId));
              const all = visible.every(id => picked.has(id));
              setPicked(all ? new Set([...picked].filter(id => !visible.includes(id))) : new Set([...picked, ...visible]));
            }}>{filterList(carryable).every(course => picked.has(Number(course.AdCourseId))) ? "إلغاء التحديد" : "تحديد الظاهر"}</button>
          </header>
          <div className="plan-picker-list">
            {filterList(carryable).map(course => {
              const id = Number(course.AdCourseId), on = picked.has(id);
              return (
                <label key={id} className={on ? "is-on" : ""}>
                  <input type="checkbox" checked={on} onChange={() => { const next = new Set(picked); if (on) next.delete(id); else next.add(id); setPicked(next); }} />
                  <span className="course-code">{course.CourseCode}</span><span>{course.CourseName}</span>
                </label>
              );
            })}
            {!filterList(carryable).length ? <p className="plan-muted">لا نتائج لهذا البحث.</p> : null}
          </div>
          <div className="plan-rule-actions">
            <PrimaryButton data-guide-ignore="إضافة المقررات المحددة إلى الصحيفة الجديدة" onClick={addPicked} disabled={busy || !picked.size}><Plus /> إضافة {picked.size ? countOf(picked.size, AR.course) : "المحدد"}</PrimaryButton>
            <SecondaryButton data-guide-ignore="إغلاق قائمة المقررات المشتركة" onClick={() => { setPicking(false); setPicked(new Set()); }}>إغلاق</SecondaryButton>
          </div>
        </div>
      ) : null}
      <div className="plan-course-list">
        {filterList(activeCourses).length ? filterList(activeCourses).map(course => (
          <article key={course.AdCourseId}>
            <span className="course-code">{course.CourseCode}</span>
            <div><strong>{course.CourseName}</strong><small>{countOf(course.CourseCredit, AR.unit)} · {countOf(course.CourseHours, AR.hour)}{previousIds.has(Number(course.AdCourseId)) ? " · مشترك مع السابقة" : ""}</small></div>
            <button type="button" data-guide-ignore="إخراج مقرر من الصحيفة الجديدة مع حماية الاستخدام الجاري" onClick={() => removeFromActive(course)} aria-label={`إخراج ${course.CourseName} من الصحيفة`} title="إخراج من الصحيفة"><Trash2 /></button>
          </article>
        )) : query ? <p className="plan-muted">لا نتائج لهذا البحث.</p> : (
          <EmptyState title="الصحيفة الجديدة فارغة" detail="أنشئ مقرراتها بأرقامها الجديدة من «مقرر جديد»، وأضف ما بقي كما هو من «مقررات لم تتغير»." />
        )}
      </div>
    </>
  ) : null;

  const oldTab = previous ? (
    <>
      <div className="plan-list-tools">
        <label className="plan-search"><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث بالرقم أو الاسم" aria-label="بحث في المقررات" /></label>
      </div>
      <p className="plan-muted">مقررات الصحيفة السابقة محفوظة كما كانت يوم بدء الانتقال، وتبقى متاحة في الجدول والاستبيان لطلبتها.</p>
      <div className="plan-course-list">
        {filterList(previousCourses).map(course => (
          <article key={course.AdCourseId}>
            <span className="course-code">{course.CourseCode}</span>
            <div><strong>{course.CourseName}</strong><small>{countOf(course.CourseCredit, AR.unit)} · {countOf(course.CourseHours, AR.hour)}</small></div>
            {activeIds.has(Number(course.AdCourseId)) ? <span className="plan-chip is-shared">مشترك</span> : <span />}
          </article>
        ))}
        {!filterList(previousCourses).length ? <p className="plan-muted">لا نتائج.</p> : null}
      </div>
    </>
  ) : null;

  const mapTab = active && previous ? (
    <>
      <p className="plan-muted">اختياري. اربط مقرراً قديماً بمقابله في الصحيفة الجديدة إن كان له مقابل، ليعرف من يقرأ السجل أنهما متقابلان. المقرر الجديد كلياً لا يحتاج ربطاً.</p>
      <div className="plan-map-form">
        <select value={fromCourseId} onChange={e => setFromCourseId(Number(e.target.value))} aria-label="المقرر في الصحيفة السابقة">
          <option value={0}>من الصحيفة السابقة…</option>
          {previousCourses.filter(course => !activeIds.has(Number(course.AdCourseId))).map(course => <option key={course.AdCourseId} value={course.AdCourseId}>{courseLine(course)}</option>)}
        </select>
        <ArrowLeftRight aria-hidden="true" />
        <select value={toCourseId} onChange={e => setToCourseId(Number(e.target.value))} aria-label="مقابله في الصحيفة الجديدة">
          <option value={0}>مقابله في الجديدة…</option>
          {activeCourses.map(course => <option key={course.AdCourseId} value={course.AdCourseId}>{courseLine(course)}</option>)}
        </select>
        <PrimaryButton data-guide-ignore="حفظ ربط مقرر قديم بمقابله الجديد" onClick={saveTransition} disabled={busy || !fromCourseId || !toCourseId}><Link2 /> ربط</PrimaryButton>
      </div>
      <div className="plan-course-list">
        {transitions.length ? transitions.map(row => {
          const from = byId.get(Number(row.fromCourseId)), to = row.toCourseId ? byId.get(Number(row.toCourseId)) : null;
          return (
            <article key={row.id} className="plan-map-row">
              <span className="course-code">{from?.CourseCode || "—"}</span>
              <div><strong>{from?.CourseName || "مقرر قديم"}</strong><small>{to ? `← ${to.CourseCode} ${to.CourseName}` : "أُلغي في الصحيفة الجديدة"}</small></div>
              <button type="button" data-guide-ignore="حذف ربط مقرر قديم بمقابله فقط" onClick={() => deleteTransition(row.id)} aria-label="حذف الربط"><Trash2 /></button>
            </article>
          );
        }) : <p className="plan-muted">لا روابط بعد — وهذا طبيعي إن كانت أغلب المقررات جديدة.</p>}
      </div>
    </>
  ) : null;

  return (
    <CatalogFormDrawer onClose={onClose} label="الصحائف الأكاديمية" wide>
      <div className="curriculum-admin">
        <PageTitle eyebrow="المرحلة الانتقالية" subtitle="صحيفتان تعملان معاً — كل طالب على صحيفته ومقرراتها وشروط تخرجها">
          الصحائف الأكاديمية
        </PageTitle>
        {error ? <Notice onDismiss={() => setError(null)}>{error}</Notice> : null}
        {receipt ? <Notice type="success" onDismiss={() => setReceipt(null)}>{receipt}</Notice> : null}

        <Surface className="curriculum-section-bar">
          <div className="curriculum-section-icon"><GraduationCap /></div>
          <div><strong>القسم العلمي</strong><span>لكل قسم صحائفه وشروطه</span></div>
          <select value={sectionId} onChange={e => setSectionId(Number(e.target.value))} aria-label="القسم العلمي">
            {sortByName(sections, row => row.AdSectionName).map(section => <option key={section.AdSectionId} value={section.AdSectionId}>{section.AdSectionName}</option>)}
          </select>
        </Surface>

        {loading && !data ? <Surface className="curriculum-loading">يجري تحميل صحائف القسم…</Surface> : data ? <>
          {data.bootstrap ? (
            <Surface className="plan-start">
              <div className="plan-start-copy">
                <span className="plan-chip is-old">صحيفة واحدة حالياً</span>
                <h2>بدء الصحيفة الجديدة لهذا القسم</h2>
                <p>كل المقررات الحالية فعّالة تلقائياً ({countOf(courses.length, AR.course)}). عند البدء يحدث ثلاثة أشياء:</p>
                <ol>
                  <li><strong>تُحفظ المقررات الحالية كما هي</strong> في «الصحيفة السابقة»، ويبقى طلبتها عليها حتى يتخرجوا.</li>
                  <li><strong>تبدأ الصحيفة الجديدة فارغة</strong> — لا نسخة مكررة تحذف منها 90٪ — وتضيف مقرراتها بأرقامها الجديدة.</li>
                  <li><strong>تنتقل شروط التخرج الحالية</strong> إلى الصحيفة السابقة، وتُدخل شروط الجديدة.</li>
                </ol>
              </div>
              <div className="plan-start-form">
                <label htmlFor="plan-name">اسم الصحيفة الجديدة</label>
                <input id="plan-name" value={planName} onChange={e => setPlanName(e.target.value)} placeholder="مثال: صحيفة 2026"
                  onKeyDown={e => { if (e.key === "Enter") void createPlan(); }} />
                <PrimaryButton data-guide-ignore="إنشاء صحيفة أكاديمية جديدة وتفعيلها" onClick={createPlan} disabled={busy || !planName.trim()}><Plus /> بدء الصحيفة الجديدة</PrimaryButton>
                <small>يمكن تعديل اسمي الصحيفتين لاحقاً.</small>
              </div>
            </Surface>
          ) : null}

          {active ? (
            <Surface className="plan-steps" aria-label="خطوات الانتقال">
              <div className="plan-steps-head"><strong>خطوات الانتقال</strong><span>{num(stepsDone)} من {num(steps.length)}</span></div>
              <ol>
                {steps.map((step, index) => (
                  <li key={step.label} className={step.done ? "is-done" : ""}>
                    <span className="plan-step-mark">{step.done ? <Check /> : num(index + 1)}</span>
                    <div><strong>{step.label}</strong><small>{step.detail}</small></div>
                  </li>
                ))}
              </ol>
            </Surface>
          ) : null}

          {rulesClash ? <Notice type="warning">صحيفتان في هذا القسم بمجموع الوحدات نفسه وشروط مختلفة. لن يستطيع الاستبيان معرفة صحيفة الطالب من صحيفة تخرجه، فسيُحال الخريج إلى القسم.</Notice> : null}

          {active ? <div className="plan-grid">{[active, previous].filter(Boolean).map(plan => planCard(plan as CurriculumPlan))}</div> : null}

          {active ? (
            <Surface className="plan-courses">
              <div className="plan-tabs" role="tablist" aria-label="مقررات الصحائف">
                <button type="button" role="tab" aria-selected={tab === "new"} className={tab === "new" ? "is-on" : ""} data-guide-ignore="عرض مقررات الصحيفة الجديدة" onClick={() => { setTab("new"); setQuery(""); }}>مقررات الجديدة <b>{num(activeCourses.length)}</b></button>
                {previous ? <button type="button" role="tab" aria-selected={tab === "old"} className={tab === "old" ? "is-on" : ""} data-guide-ignore="عرض مقررات الصحيفة السابقة" onClick={() => { setTab("old"); setQuery(""); setPicking(false); }}>مقررات السابقة <b>{num(previousCourses.length)}</b></button> : null}
                {previous ? <button type="button" role="tab" aria-selected={tab === "map"} className={tab === "map" ? "is-on" : ""} data-guide-ignore="خريطة الانتقال الاختيارية بين المقررات" onClick={() => { setTab("map"); setPicking(false); }}>خريطة الانتقال <small>اختياري</small></button> : null}
              </div>
              <div className="plan-tab-body">{tab === "old" ? oldTab : tab === "map" ? mapTab : newTab}</div>
            </Surface>
          ) : null}

          {active ? (
            <div className="plan-next">
              {showNextGeneration ? (
                <Surface className="plan-next-form">
                  <p>نادراً ما يُحتاج: صحيفة ثالثة بعد الجديدة. تصير «{active.name}» سابقةً وتبدأ الأحدث فارغة.</p>
                  <input value={planName} onChange={e => setPlanName(e.target.value)} placeholder="اسم الصحيفة الأحدث" aria-label="اسم الصحيفة الأحدث" />
                  <PrimaryButton data-guide-ignore="إنشاء جيل أحدث من الصحيفة" onClick={createPlan} disabled={busy || !planName.trim()}><Plus /> إنشاء</PrimaryButton>
                  <SecondaryButton data-guide-ignore="إلغاء إنشاء صحيفة أحدث" onClick={() => setShowNextGeneration(false)}>إلغاء</SecondaryButton>
                </Surface>
              ) : (
                <button type="button" className="plan-link-btn" data-guide-ignore="إظهار نموذج إنشاء الجيل التالي من الصحيفة" onClick={() => setShowNextGeneration(true)}><Plus /> صحيفة أحدث (جيل ثالث)</button>
              )}
            </div>
          ) : null}

          {archivedPlans.length ? <Surface className="curriculum-archive-strip">
            <ShieldCheck /><div><strong>الأرشيف الأكاديمي</strong><span>{archivedPlans.map(plan => plan.name).join(" · ")} — محفوظ للتقارير والتاريخ ولا يدخل في أي تشغيل جديد.</span></div>
          </Surface> : null}
          {!active && !data.bootstrap ? <Notice type="warning"><CheckCircle2 /> لا توجد صحيفة حالية لهذا القسم.</Notice> : null}
        </> : null}
      </div>
    </CatalogFormDrawer>
  );
}
