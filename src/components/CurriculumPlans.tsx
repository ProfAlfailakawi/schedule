import React, { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowLeftRight,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Layers3,
  Link2,
  Plus,
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

type Overview = {
  section: AdSection;
  plans: CurriculumPlan[];
  memberships: CurriculumPlanCourse[];
  transitions: CourseTransition[];
  courses: AdCourse[];
  operationalCourseIds: number[];
  bootstrap: boolean;
};

const STATUS: Record<string, { label: string; note: string }> = {
  active: { label: "الصحيفة الحالية", note: "تستقبل المقررات الجديدة وتظهر افتراضياً في التشغيل" },
  transition: { label: "انتقالية", note: "ما زالت فعّالة للطلبة القدامى حتى انتهاء آخر حالة" },
  archived: { label: "مؤرشفة", note: "للتاريخ فقط ولا تظهر في التشغيل اليومي" },
};
const KIND: Record<string, string> = {
  renumbered: "تغيّر الرقم فقط",
  renamed: "تغيّر الاسم فقط",
  "renumbered-renamed": "تغيّر الرقم والاسم",
  replaced: "استُبدل بمقرر آخر",
  removed: "أُلغي من الصحيفة الجديدة",
};

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

export default function CurriculumPlans({
  sections,
  initialSectionId,
  onClose,
  onChanged,
}: {
  sections: AdSection[];
  initialSectionId?: number;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [sectionId, setSectionId] = useState(Number(initialSectionId || sections[0]?.AdSectionId || 0));
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planName, setPlanName] = useState("");
  const [planCode, setPlanCode] = useState("");
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [addCourseId, setAddCourseId] = useState(0);
  const [fromCourseId, setFromCourseId] = useState(0);
  const [toCourseId, setToCourseId] = useState(0);
  const [kind, setKind] = useState("renumbered");
  const [note, setNote] = useState("");

  const load = async (sid = sectionId) => {
    if (!sid) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/curriculum/sections/${sid}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "تعذر تحميل الصحائف الأكاديمية");
      setData(body);
    } catch (e: any) {
      setError(String(e?.message || "تعذر تحميل الصحائف الأكاديمية"));
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(sectionId); }, [sectionId]);

  const courses = useMemo<AdCourse[]>(() => sortByName<AdCourse>(data?.courses ?? [], row => row.CourseName), [data?.courses]);
  const byId = useMemo(() => new Map(courses.map(course => [Number(course.AdCourseId), course])), [courses]);
  const active = data?.plans.find(plan => plan.status === "active") || null;
  const transitionPlans = data?.plans.filter(plan => plan.status === "transition") || [];
  const archivedPlans = data?.plans.filter(plan => plan.status === "archived") || [];
  const membershipFor = (planId: string) => (data?.memberships || []).filter(row => row.planId === planId);
  const activeIds = new Set(active ? membershipFor(active.id).map(row => Number(row.AdCourseId)) : []);
  const activeCourses = courses.filter(course => activeIds.has(Number(course.AdCourseId)));
  const addable = courses.filter(course => !activeIds.has(Number(course.AdCourseId)));
  const primaryTransition = transitionPlans[0] || null;
  const oldIds = new Set(primaryTransition ? membershipFor(primaryTransition.id).map(row => Number(row.AdCourseId)) : []);
  const oldCourses = courses.filter(course => oldIds.has(Number(course.AdCourseId)));
  const currentTransitions = (data?.transitions || []).filter(row => row.fromPlanId === primaryTransition?.id && row.toPlanId === active?.id);

  const mutate = async (url: string, options: RequestInit) => {
    if (busy) return null;
    setBusy(true); setError(null);
    try {
      const response = await fetch(url, options);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "تعذر إتمام العملية");
      if (body.overview) setData(body.overview); else await load();
      onChanged?.();
      return body;
    } catch (e: any) {
      setError(String(e?.message || "تعذر إتمام العملية"));
      return null;
    } finally { setBusy(false); }
  };

  const createPlan = async () => {
    if (!planName.trim()) { setError("اكتب اسم الصحيفة الجديدة"); return; }
    const body = await mutate("/api/curriculum/plans", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ AdSectionId: sectionId, name: planName.trim(), code: planCode.trim() }),
    });
    if (body) { setPlanName(""); setPlanCode(""); setShowNewPlan(false); }
  };
  const addCourse = async () => {
    if (!active || !addCourseId) return;
    const body = await mutate(`/api/curriculum/plans/${encodeURIComponent(active.id)}/courses`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ AdCourseId: addCourseId }),
    });
    if (body) setAddCourseId(0);
  };
  const removeFromActive = async (courseId: number) => {
    if (!active) return;
    if (!(await visualConfirm({ title: "إخراج المقرر من الصحيفة الحالية", message: "سيختفي هذا المقرر من التشغيل إذا لم يكن تابعاً لصحيفة انتقالية أخرى. لن يُحذف سجله أو تاريخه.", confirmLabel: "إخراج المقرر", tone: "danger", compact: true }))) return;
    await mutate(`/api/curriculum/plans/${encodeURIComponent(active.id)}/courses/${courseId}`, { method: "DELETE" });
  };
  const saveTransition = async () => {
    if (!active || !primaryTransition || !fromCourseId || (kind !== "removed" && !toCourseId)) {
      setError("أكمل طرفي علاقة الانتقال ونوع التغيير"); return;
    }
    const body = await mutate("/api/curriculum/transitions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ AdSectionId: sectionId, fromPlanId: primaryTransition.id, toPlanId: active.id, fromCourseId, toCourseId: kind === "removed" ? undefined : toCourseId, kind, note }),
    });
    if (body) { setFromCourseId(0); setToCourseId(0); setNote(""); }
  };
  const deleteTransition = async (id: string) => {
    if (!(await visualConfirm({ title: "حذف علاقة الانتقال", message: "سيُحذف الربط التفسيري فقط، ولن يتغير أي مقرر أو جدول تاريخي.", confirmLabel: "حذف الربط", tone: "danger", compact: true }))) return;
    const body = await mutate(`/api/curriculum/transitions/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (body) await load();
  };
  const archivePlan = async (plan: CurriculumPlan) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/curriculum/plans/${encodeURIComponent(plan.id)}/archive-readiness?sectionId=${sectionId}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "تعذر فحص جاهزية الصحيفة");
      const readiness = body.readiness || {};
      const offerings = Number(readiness.currentOfferings || 0);
      const requests = Number(readiness.linkedStudentRequests || 0);
      if (offerings || requests) {
        setError(`لا يمكن أرشفة ${plan.name} الآن: ${offerings} طرح حالي لمقرر خاص بها، و${requests} طلب طلابي مرتبط بها في أحدث فصل.`);
        return;
      }
      const shared = Number(readiness.sharedCourses || 0);
      const oldOnly = Number(readiness.oldOnlyCourses || 0);
      if (!(await visualConfirm({
        title: "الصحيفة جاهزة للأرشفة",
        message: `الفحص ناجح: لا توجد طروحات حالية ولا طلبات طلابية مرتبطة بها. سيختفي ${oldOnly} مقرر خاص بهذه الصحيفة من التشغيل، بينما يبقى ${shared} مقرر مشتركاً عبر الصحائف الفعالة. التاريخ والتقارير القديمة لن تتغير.`,
        confirmLabel: "أرشفة الصحيفة", tone: "danger", compact: true,
      }))) return;
      const archived = await fetch(`/api/curriculum/plans/${encodeURIComponent(plan.id)}/archive`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ AdSectionId: sectionId }),
      });
      const archivedBody = await archived.json();
      if (!archived.ok) throw new Error(archivedBody.error || "تعذر أرشفة الصحيفة");
      if (archivedBody.overview) setData(archivedBody.overview); else await load();
      onChanged?.();
    } catch (e: any) {
      setError(String(e?.message || "تعذر أرشفة الصحيفة"));
    } finally { setBusy(false); }
  };

  return (
    <CatalogFormDrawer onClose={onClose} label="إدارة الصحائف الأكاديمية" wide>
      <div className="curriculum-admin">
        <PageTitle eyebrow="إدارة الانتقال الأكاديمي" subtitle="صحيفة حالية، صحيفة انتقالية، وتاريخ محفوظ بلا خلط">
          الصحائف الأكاديمية
        </PageTitle>
        {error ? <Notice>{error}</Notice> : null}

        <Surface className="curriculum-section-bar">
          <div className="curriculum-section-icon"><GraduationCap /></div>
          <div><strong>القسم العلمي</strong><span>كل صحيفة تُدار داخل قسمها فقط</span></div>
          <select value={sectionId} onChange={e => setSectionId(Number(e.target.value))} aria-label="القسم العلمي">
            {sortByName(sections, row => row.AdSectionName).map(section => <option key={section.AdSectionId} value={section.AdSectionId}>{section.AdSectionName}</option>)}
          </select>
        </Surface>

        {loading ? <Surface className="curriculum-loading">يجري بناء صورة الصحائف…</Surface> : data ? <>
          {data.bootstrap ? (
            <Surface className="curriculum-bootstrap">
              <div className="curriculum-bootstrap-mark"><Sparkles /></div>
              <div>
                <span className="surface-kicker">الوضع الانتقالي الحالي</span>
                <h2>كل المقررات الحالية فعّالة تلقائياً</h2>
                <p>لم تُنشأ صحيفة جديدة بعد. عند إنشاء أول صحيفة، سيثبّت النظام هذه القائمة كما هي في «الصحيفة السابقة» ويبدأ الصحيفة الجديدة فارغة؛ لن تحتاج إلى حذف 90٪ من نسخة مكررة.</p>
              </div>
              <b>{courses.length.toLocaleString("ar-KW-u-nu-latn")} <small>مقرر</small></b>
            </Surface>
          ) : null}

          <div className="curriculum-plan-grid">
            {data.plans.filter(plan => plan.status !== "archived").map(plan => {
              const count = membershipFor(plan.id).length;
              const status = STATUS[plan.status] || STATUS.transition;
              return <PlanSurface key={plan.id} className={`curriculum-plan-card ${plan.status}`}>
                <div className="curriculum-plan-head">
                  <span className="curriculum-plan-icon">{plan.status === "active" ? <CheckCircle2 /> : <Layers3 />}</span>
                  <span className={`curriculum-status ${plan.status}`}>{status.label}</span>
                </div>
                <h3>{plan.name}</h3>
                <p>{status.note}</p>
                <div className="curriculum-plan-meta"><b>{count.toLocaleString("ar-KW-u-nu-latn")}</b><span>{nounFor(count, AR.course)}</span>{plan.code ? <em>{plan.code}</em> : null}</div>
                {plan.status === "transition" && !plan.virtual ? <SecondaryButton data-guide-ignore="أرشفة صحيفة أكاديمية بعد فحص الجاهزية" className="curriculum-archive-btn" onClick={() => archivePlan(plan)} disabled={busy}><Archive /> أرشفة الصحيفة</SecondaryButton> : null}
                {plan.status === "active" ? <SecondaryButton data-guide-ignore="إظهار نموذج إنشاء الجيل التالي من الصحيفة" className="curriculum-archive-btn" onClick={() => setShowNewPlan(v => !v)} disabled={busy}><Plus /> صحيفة أحدث</SecondaryButton> : null}
              </PlanSurface>;
            })}
            {(!active || showNewPlan) ? <Surface className="curriculum-new-plan">
              <div className="curriculum-new-plan-title"><Plus /><div><strong>{active ? "إنشاء صحيفة أحدث" : "إنشاء الصحيفة الجديدة"}</strong><span>{active ? "تتحول الحالية إلى انتقالية وتبدأ الأحدث فارغة" : "تبدأ فارغة ومهيأة للمقررات الجديدة"}</span></div></div>
              <input value={planName} onChange={e => setPlanName(e.target.value)} placeholder="مثال: صحيفة 2026" aria-label="اسم الصحيفة الجديدة" />
              <input value={planCode} onChange={e => setPlanCode(e.target.value)} placeholder="رمز اختياري: 2026" aria-label="رمز الصحيفة" />
              <PrimaryButton data-guide-ignore="إنشاء صحيفة أكاديمية جديدة وتفعيلها" onClick={createPlan} disabled={busy || !planName.trim()}><Plus /> إنشاء وتفعيل</PrimaryButton>
            </Surface> : null}
          </div>

          {active ? <div className="curriculum-work-grid">
            <Surface className="curriculum-course-panel">
              <header><div><span className="surface-kicker">الصحيفة الحالية</span><h3>مقررات {active.name}</h3></div><span className="curriculum-count">{activeCourses.length.toLocaleString("ar-KW-u-nu-latn")}</span></header>
              <div className="curriculum-add-row">
                <select value={addCourseId} onChange={e => setAddCourseId(Number(e.target.value))} aria-label="إضافة مقرر موجود إلى الصحيفة الحالية">
                  <option value={0}>اختر مقرراً موجوداً لم يتغير…</option>
                  {addable.map(course => <option key={course.AdCourseId} value={course.AdCourseId}>{course.CourseCode} — {course.CourseName}</option>)}
                </select>
                <SecondaryButton data-guide-ignore="إضافة مقرر موجود بلا تغيير إلى الصحيفة الحالية" onClick={addCourse} disabled={!addCourseId || busy}><Plus /> إضافة</SecondaryButton>
              </div>
              <p className="curriculum-help">المقرر الجديد الذي تنشئه من شاشة المقررات يُضاف تلقائياً إلى هذه الصحيفة. استخدم القائمة فقط للمقرر القديم الذي بقي نفسه في الصحيفتين.</p>
              <div className="curriculum-mini-list">
                {activeCourses.length ? activeCourses.map(course => <article key={course.AdCourseId}>
                  <span className="course-code">{course.CourseCode}</span><div><strong>{course.CourseName}</strong><small>{countOf(course.CourseCredit, AR.unit)} · {countOf(course.CourseHours, AR.hour)}</small></div>
                  <button type="button" data-guide-ignore="إخراج مقرر من الصحيفة الحالية مع حماية الاستخدام الجاري" onClick={() => removeFromActive(course.AdCourseId)} aria-label={`إخراج ${course.CourseName} من الصحيفة`} title="إخراج من الصحيفة"><Trash2 /></button>
                </article>) : <EmptyState title="الصحيفة الجديدة فارغة" detail="أنشئ المقررات الجديدة من شاشة المقررات؛ ستدخل هنا تلقائياً." />}
              </div>
            </Surface>

            {primaryTransition ? <Surface className="curriculum-map-panel">
              <header><div><span className="surface-kicker">خريطة الانتقال</span><h3>{primaryTransition.name} ← {active.name}</h3></div><ArrowLeftRight /></header>
              <p className="curriculum-help">لا تربط كل شيء. اربط فقط المقرر القديم بما حدث له في الصحيفة الجديدة؛ أما المقرر الجديد بالكامل فلا يحتاج علاقة.</p>
              <div className="curriculum-map-form">
                <select value={fromCourseId} onChange={e => setFromCourseId(Number(e.target.value))} aria-label="المقرر القديم"><option value={0}>المقرر القديم…</option>{oldCourses.map(course => <option key={course.AdCourseId} value={course.AdCourseId}>{course.CourseCode} — {course.CourseName}</option>)}</select>
                <select value={kind} onChange={e => setKind(e.target.value)} aria-label="نوع التغيير">{Object.entries(KIND).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
                <select value={toCourseId} onChange={e => setToCourseId(Number(e.target.value))} disabled={kind === "removed"} aria-label="المقرر الجديد"><option value={0}>{kind === "removed" ? "لا يوجد بديل" : "المقرر الجديد…"}</option>{activeCourses.map(course => <option key={course.AdCourseId} value={course.AdCourseId}>{course.CourseCode} — {course.CourseName}</option>)}</select>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="ملاحظة اختيارية" aria-label="ملاحظة العلاقة" />
                <PrimaryButton data-guide-ignore="حفظ علاقة أكاديمية بين مقرر قديم وصيغته الجديدة" onClick={saveTransition} disabled={busy || !fromCourseId || (kind !== "removed" && !toCourseId)}><Link2 /> حفظ الربط</PrimaryButton>
              </div>
              <div className="curriculum-transition-list">
                {currentTransitions.length ? currentTransitions.map(row => {
                  const from = byId.get(Number(row.fromCourseId)), to = row.toCourseId ? byId.get(Number(row.toCourseId)) : null;
                  return <article key={row.id}>
                    <div className="curriculum-transition-route"><span>{from?.CourseCode || "—"}</span><ArrowLeftRight /><span>{to?.CourseCode || "ملغى"}</span></div>
                    <div><strong>{from?.CourseName || "مقرر قديم"}</strong><small>{KIND[row.kind] || row.kind}{to ? ` · ${to.CourseName}` : ""}{row.note ? ` · ${row.note}` : ""}</small></div>
                    <button type="button" data-guide-ignore="حذف علاقة الانتقال التفسيرية فقط" onClick={() => deleteTransition(row.id)} aria-label="حذف الربط"><Trash2 /></button>
                  </article>;
                }) : <div className="curriculum-map-empty"><Link2 /><span>لم تُسجّل علاقات انتقال بعد.</span></div>}
              </div>
            </Surface> : null}
          </div> : null}

          {archivedPlans.length ? <Surface className="curriculum-archive-strip">
            <ShieldCheck /><div><strong>الأرشيف الأكاديمي</strong><span>{archivedPlans.map(plan => plan.name).join(" · ")} — محفوظ للتقارير والتاريخ ولا يدخل في أي تشغيل جديد.</span></div>
          </Surface> : null}
        </> : null}
      </div>
    </CatalogFormDrawer>
  );
}
