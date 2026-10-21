import TermSelect from "./TermSelect";
/**
 * ── رادارُ التسجيل ──────────────────────────────────────────────────────────
 *
 * ما سيحدث يومَ التسجيل لو سجّل الطلبةُ بحسب ما كتبوه: أيُّ مقرراتٍ ستزدحم، وأيُّها
 * مطلوبٌ ولا يُطرح، وكم طالباً في كل نافذة. أعدادٌ لا أسماء، وكلُّ رقمٍ يحمل أساسَه.
 *
 * وهي **تقديرٌ** من ملفّات الطلبة وجداولِ الأقسام (مسوّدةً أو معتمدة)، لا بياناتُ
 * التسجيل الرسمي ولا حجزُ مقعد. التشغيلُ لإدارة النظام؛ والقسمُ يرى مقرراتِه فحسب.
 */
import { useScopedTerms } from "./useScopedTerms";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarPlus, Check, CircleAlert, CircleHelp, Download, GraduationCap, History, Info, Layers, Sparkles, Ticket, TrendingUp, Users } from "lucide-react";
import { EmptyState, Field, MicroLoader, Notice, PageTitle, SecondaryButton } from "./ui";
import TermFrozenRibbon, { TermFrozenContext } from "./TermFrozenRibbon";
import { termIsFrozen } from "../utils/termSequence";
import { AR, countOf } from "../utils/arabicCount";
import MasariQrButton from "./MasariQrButton";
import { compareArabic } from "../utils/arabicText";
import ApplyProposal, { postScheduleProposal, postWhatIf } from "./ApplyProposal";
import SemesterReadiness, { type Insight, type QualityCell } from "./SemesterReadiness";
import { writeSharedScope } from "../utils/sharedScope";
import CourseImpact from "./CourseImpact";
import { OutcomeCourse, OutcomeLegend } from "./OutcomeStory";
import { formatScheduleTimeRange } from "../utils/scheduleTime";
import { orderRadarCourses } from "../utils/registrationSim";
import RadarSchedule, { request } from "./RadarSchedule";
import PredictiveInsightPanel from "./PredictiveInsightPanel";

interface Unmet { "not-offered": number; conflict: number; full: number; prereq: number; units: number }
interface CourseRow { courseId: number; code: string; name: string; sections: number; capacity: number; taken: number; wanted: number; seated: number; unmet: Unmet }
interface OutcomeRow { courseId: number; code: string; name: string; registered: number; stuck: number; full: number; prereq: number; conflict: number; other: number }
interface Outcome { term: { id: number; name: string } | null; answered: number | null; answers: number; scoped: boolean; courses: OutcomeRow[] }
interface Summary {
  term: { id: number; name: string } | null;
  canRun: boolean;
  /** فصلٌ سابق: يُعرض للاطّلاع فقط (الخادم يقرّر، ويردّ 409 على أي كتابة). */
  frozen?: boolean;
  auto?: { enabled: boolean; everyHours: number };
  phase?: { mode: string; label: string; line: string; namesVisible: boolean };
  run: { ranAt: string; ranBy: string; students: number; population: number; withoutRules: number; defaulted: number; rounds: number; windows: number[]; scoped: boolean; stale?: boolean;
    capacity?: { canReach15: number; canReach12To14: number; below12: number; graduatingBelow12: number; unknown: number } | null;
    projected?: { students: number; capacity: { canReach15: number; canReach12To14: number; below12: number; graduatingBelow12: number; unknown: number } } | null;
    dataQuality?: { total: number; ready: number; excluded: number; issues: Record<string, number> } | null;
  } | null;
  courses: CourseRow[];
  projectedCourses?: CourseRow[];
}

/* كلُّ عددٍ هنا طلبةٌ، وتُقرأ الجملةُ بعده: «9 طلاب — لن يجدوا مقعداً». */
const WHY: Array<[keyof Unmet, string, string]> = [
  ["full", "لن يجدوا مقعداً: الطلب أكبر من السعة الافتراضية", "bad"], ["not-offered", "يريدونه ولا توجد له شعبة", "warn"], ["conflict", "وقته يتعارض مع مقرر آخر اختاروه", "info"], ["units", "يتجاوزون حدّ الوحدات الذي اختاروه", "soft"], ["prereq", "ينقصهم متطلب سابق وفق ملفاتهم", "soft"],
];
const qualityLabel = (key: string) => ({
  "invalid-identity": "هوية المقرر أو الشعبة غير مكتملة",
  "missing-capacity": "السعة غير محددة",
  "invalid-capacity": "السعة ليست عدداً صحيحاً",
  "missing-meetings": "لا يوجد موعد مكتمل",
  "invalid-meetings": "وقت أو يوم غير صالح",
  "overlapping-meetings": "تعارض بين محاضرات الشعبة نفسها",
  "duplicate-id": "معرّف شعبة مكرر",
} as Record<string, string>)[key] || "بيانات تحتاج مراجعة";
const needsDecision = (c: CourseRow) => c.unmet.full > 0 || c.unmet["not-offered"] > 0;
const weight = (c: CourseRow) => c.unmet.full * 3 + c.unmet["not-offered"] * 2 + c.unmet.conflict;

export default function RegistrationRehearsal({ onNavigate, canSchedule = false }: { onNavigate?: (view: string) => void; canSchedule?: boolean } = {}) {
  const [data, setData] = useState<Summary | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const [q, setQ] = useState("");
  const [scenario, setScenario] = useState<"actual" | "projected">("actual");
  const [view, setView] = useState<"capacity" | "decide" | "outcome" | "predict" | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [insightFailed, setInsightFailed] = useState(false);
  const autoRunInFlight = useRef(false);
  /* الفصلُ المعروض: 0 = فصلُ الباب (الأصل). الخادمُ يتحقق منه ولا يقبل غير فصل الباب أو فصلٍ سابقٍ مجمَّد. */
  const [termPick, setTermPick] = useState(0);
  const [terms, setTerms] = useState<Array<{ AdTermId: number; AdTermName: string }> | null>(null);
  const [doorId, setDoorId] = useState(0);
  useEffect(() => {
    let live = true;
    fetch("/api/terms", { cache: "no-store" }).then(r => r.ok ? r.json() : []).then(list => { if (live) setTerms(Array.isArray(list) ? list : (list.terms || [])); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  const termQuery = termPick ? `?termId=${termPick}` : "";

  const load = useCallback(async () => {
    try { const next = await request(`/api/simulation/summary${termQuery}`); setData(next); if (!termPick && next?.term?.id) setDoorId(Number(next.term.id)); setError(""); } catch (e: any) { setError(e.message); }
    try { setOutcome(await request(`/api/simulation/outcome${termQuery}`)); } catch { /* الجزءُ الثاني اختياري: لا يُسقط الشاشة */ }
  }, [termQuery, termPick]);
  /* تبديلُ الفصل يبدأ صفحةً نظيفة: لا يبقى رقمُ فصلٍ تحت اسم آخر. */
  const pickTerm = (id: number) => {
    if (id === termPick || (!id && !termPick)) return;
    setData(null); setOutcome(null); setInsight(null); setInsightFailed(false); setView(null); setScenario("actual"); setAll(false); setQ(""); setError("");
    setTermPick(id && id !== doorId ? id : 0);
  };
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  /* لماذا لم يبلغوا 12؟ وأيّ شعبةٍ بيانُها ناقص؟ — بعد الملخّص، وتُعاد بعد كل احتساب جديد. */
  const ranAt = data?.run?.ranAt;
  useEffect(() => {
    if (!ranAt) return;
    let live = true;
    fetch(`/api/simulation/insight${termQuery}`, { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("insight");
      const body = await response.json();
      if (live) { setInsight(body.ready ? body : null); setInsightFailed(false); }
    }).catch(() => { if (live) setInsightFailed(true); });
    return () => { live = false; };
  }, [ranAt, termQuery]);

  /* Source writes mark the saved run stale. The admin view repairs it on its
     own; polling also catches changes made in another session or process. */
  useEffect(() => {
    if (data?.frozen || !data?.canRun || data.auto?.enabled === false || !data.term || (data.run && !data.run.stale) || autoRunInFlight.current) return;
    autoRunInFlight.current = true; setBusy(true);
    void request("/api/simulation/run", { method: "POST" })
      .then(() => load())
      .catch((e: any) => { if (!/يُحدَّث الآن/.test(e.message || "")) setError(e.message || "تعذّر تحديث الرادار تلقائياً."); })
      .finally(() => { autoRunInFlight.current = false; setBusy(false); });
  }, [data, load]);

  /** تقريرُ العمادة: ورقةٌ للتحديث وأخرى لما قاله الطلبة بعد التسجيل. أعدادٌ لا أسماء. */
  const exportXlsx = async () => {
    if (!data?.run) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const head = ["رمز المقرر", "المقرر", "عدد الشعب", "السعة", "المقاعد المحجوزة افتراضياً", "المطلوب", "وجد مقعداً", "امتلأت الشعب", "مطلوب ولا يُطرح", "تعارض أوقات", "فوق الوحدات", "ينقصهم مسبق"];
    const body = (data.courses || []).map(c => [c.code, c.name, c.sections, c.capacity, c.taken, c.wanted, c.seated, c.unmet.full, c.unmet["not-offered"], c.unmet.conflict, c.unmet.units, c.unmet.prereq]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...body]), "رادار التسجيل");
    if (outcome && outcome.answers > 0) {
      const oh = ["رمز المقرر", "المقرر", "سجّلوا", "تعثّروا", "امتلأت", "مسبق", "تعارض", "آخر"];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([oh, ...outcome.courses.map(c => [c.code, c.name, c.registered, c.stuck, c.full, c.prereq, c.conflict, c.other])]), "بعد التسجيل");
    }
    const about = [["الفصل", data.term?.name || ""], ["أُجريت", data.run.ranAt], ["الملفات المكتملة", data.run.students], ["بلا رغبات", data.run.defaulted], ["صحائف بلا قواعد معتمدة", data.run.withoutRules], ["ملاحظة", "تقدير من ملفات الطلبة وجداول الأقسام، لا بيانات التسجيل الرسمي."]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(about), "الأساس");
    XLSX.writeFile(wb, "تقرير_رادار_التسجيل.xlsx");
  };

  const rows = useMemo(() => orderRadarCourses(scenario === "projected" ? data?.projectedCourses || [] : data?.courses || [], scenario, weight), [data, scenario]);
  const decide = rows.filter(needsDecision);
  const calm = rows.filter(c => !needsDecision(c));
  const shown = (all ? rows : decide).filter(c => !q.trim() || `${c.code} ${c.name}`.includes(q.trim()));

  // Keep scoped-term hooks active during loading as well as after the summary arrives.
  const scopedTerms = useScopedTerms<{ AdTermId: number; AdTermName: string }>(terms, 0, 0, termPick, pickTerm);
  if (!data && !error && !termPick) return <MicroLoader />;
  const r = data?.run;
  const wantedTotal = rows.reduce((s, c) => s + c.wanted, 0), seatedTotal = rows.reduce((s, c) => s + c.seated, 0);
  const coverage = wantedTotal ? Math.round((seatedTotal / wantedTotal) * 100) : 0;
  const bands = scenario === "projected" ? r?.projected?.capacity : r?.capacity;
  const selectedPopulation = scenario === "projected" ? r?.projected?.students || 0 : r?.students || 0;
  const quality = r?.dataQuality;
  const qualityPct = quality?.total ? Math.round(quality.ready / quality.total * 100) : 0;
  const maxWindow = Math.max(1, ...(r?.windows || [1]));
  /* يفتح الرادار على ما يحتاج فعلاً: بعد بدء التسجيل أجوبةُ الطلبة، وقبله ما يحتاج قراراً. */
  const frozen = Boolean(data?.frozen);
  /* لا يُعرض في المحدِّد إلا ما يقبله الخادم: فصلُ الباب والفصولُ السابقة المجمَّدة. */
  /* فصولٌ فيها بيانات لنطاق القارئ، والحالي دائماً (useScopedTerms)؛ الباقي كما كان: فصلُ الباب والفصول المجمّدة. */
  /* فصلُ الباب يبقى دائماً (قد يكون قادماً بلا صفوفٍ بعد)، والمجمَّدةُ تُرشَّح بما فيه بيانات. */
  const termOptions = (terms || []).filter(t => Number(t.AdTermId) === (doorId || data?.term?.id)
    || (termIsFrozen(Number(t.AdTermId), terms as any) && scopedTerms.some(row => Number(row.AdTermId) === Number(t.AdTermId))));
  const shownView = view || (data?.phase?.namesVisible && outcome && outcome.answers > 0 ? "outcome" : decide.length ? "decide" : "capacity");

  return (
    <TermFrozenContext.Provider value={frozen}>
    <div className="sm-page" dir="rtl">
      <PageTitle eyebrow="رادار التسجيل" subtitle="لو سجّل الطلبةُ بحسب ما كتبوه: أين الزحام، وما المطلوب ولا يُطرح؟"
        action={(
          <div className="sm-actions">
            {data?.run ? <SecondaryButton onClick={exportXlsx} data-guide-ignore="تصديرُ تقرير الرادار داخل شاشةٍ مسجّلة في المرشد باسم page.simulation"><Download size={16} /> تقرير Excel</SecondaryButton> : null}
            <MasariQrButton data-guide-ignore="زرُّ رمز «مساري» داخل شاشةٍ مسجّلة في المرشد باسم page.simulation" />
          </div>
        )}>رادار يوم التسجيل</PageTitle>
      {termOptions.length > 0 ? (
        <div className="sm-termbar no-print">
          <Field label={<><History aria-hidden="true" /> الفصل</>}>
            <TermSelect value={termPick || doorId || data?.term?.id || ""} onValueChange={id => pickTerm(id)} aria-label="الفصل المعروض في الرادار">
              {termOptions.map(t => <option key={t.AdTermId} value={t.AdTermId}>{t.AdTermName}</option>)}
            </TermSelect>
          </Field>
        </div>
      ) : null}
      {frozen && data?.term ? <TermFrozenRibbon termId={data.term.id} terms={terms} onGoCurrent={() => pickTerm(0)} /> : null}
      {error ? <Notice type="error" onDismiss={() => setError("")}>{error}</Notice> : null}
      {data?.phase && !frozen ? (
        <div className={`sm-phase ${data.phase.namesVisible ? "after" : "before"}`}>
          <span className="sm-ic">{data.phase.namesVisible ? <Users /> : <Ticket />}</span>
          <div><b>{data.phase.label}</b><small>{data.phase.line}</small>
            <small>{data.phase.namesVisible ? "الأسماء في «كشف التسجيل»" : "أرقامٌ فقط — بلا أسماء"}</small></div>
          {onNavigate && data.phase.namesVisible ? <div className="sm-links"><button type="button" onClick={() => onNavigate("studentRegistration")} data-guide-ignore="انتقالٌ إلى كشف التسجيل من شاشةٍ مسجّلة في المرشد باسم page.simulation">كشف التسجيل</button></div> : null}
        </div>
      ) : null}
      {!data && !error ? <MicroLoader /> : !data?.term ? <EmptyState title="لا فصلَ للرادار" detail="تظهر حين يكون للفصل القادم تواريخُ طلبة." /> : !r ? (
        <EmptyState title="جارٍ إعداد الرادار تلقائياً" detail={data.canRun ? "سيظهر التحليل هنا بعد اكتمال الاحتساب؛ لا حاجة إلى تشغيله يدوياً." : "تُحدّثه إدارةُ النظام آلياً، ثم يظهر التحليل هنا."} />
      ) : (
        <>
          <SemesterReadiness bands={bands} wanted={wantedTotal} seated={seatedTotal} fullCourses={rows.filter(c => c.unmet.full > 0).length} notOffered={rows.filter(c => c.unmet["not-offered"] > 0).length}
            onStart={decide.length ? () => { setView("decide"); window.scrollTo({ top: 0, behavior: "smooth" }); } : undefined} insight={scenario === "actual" ? insight : null} failed={scenario !== "actual" || insightFailed} />
          <div className="sm-views" role="tablist" aria-label="أقسام الرادار">
            <button type="button" role="tab" aria-selected={shownView === "decide"} onClick={() => setView("decide")} data-guide-ignore="تبديل قسم الرادار — عرضٌ فقط"><span className={`sm-ic${decide.length ? " hot" : ""}`}><CircleAlert /></span><b>{decide.length.toLocaleString("ar-KW-u-nu-latn")}</b><small>تحتاج قراراً</small></button>
            <button type="button" role="tab" aria-selected={shownView === "capacity"} onClick={() => setView("capacity")} data-guide-ignore="تبديل قسم الرادار — عرضٌ فقط"><span className="sm-ic"><GraduationCap /></span><b>{(bands?.below12 || 0).toLocaleString("ar-KW-u-nu-latn")}</b><small>أقل من 12 وحدة</small></button>
            {frozen ? null : <button type="button" role="tab" aria-selected={shownView === "predict"} onClick={() => setView("predict")} data-guide-ignore="تبديل قسم الرادار — عرضٌ فقط"><span className="sm-ic"><Sparkles /></span><b>تنبّؤ</b><small>الفصل القادم</small></button>}
            {outcome && outcome.answers > 0 ? <button type="button" role="tab" aria-selected={shownView === "outcome"} onClick={() => setView("outcome")} data-guide-ignore="تبديل قسم الرادار — عرضٌ فقط"><span className="sm-ic"><Ticket /></span><b>{(outcome.answered ?? outcome.answers).toLocaleString("ar-KW-u-nu-latn")}</b><small>أجابوا بعد التسجيل</small></button> : null}
          </div>
          {shownView !== "outcome" && shownView !== "predict" ? <div className="sm-scenario-tabs" role="tablist" aria-label="مصدر تحليل التسجيل">
            <button type="button" role="tab" aria-selected={scenario === "actual"} onClick={() => setScenario("actual")} data-guide-ignore="اختيار مصدر الرغبات داخل شاشة مرشد التسجيل">الرغبات الفعلية <small>{r.students.toLocaleString("ar-KW-u-nu-latn")}</small></button>
            <button type="button" role="tab" aria-selected={scenario === "projected"} onClick={() => setScenario("projected")} disabled={!r.projected} data-guide-ignore="اختيار التوقعات داخل شاشة مرشد التسجيل">التوقعات <small>{(r.projected?.students || 0).toLocaleString("ar-KW-u-nu-latn")}</small></button>
          </div> : null}
          {r.stale ? <div className="sm-stale" role="status"><AlertTriangle size={16} /> تغيّرت البيانات؛ {busy ? "يجري تحديث الرادار تلقائياً الآن." : "سيُعاد احتساب الرادار تلقائياً."}</div> : null}
          {shownView === "capacity" ? <>
          <section className="sm-capacity-summary" aria-label="قدرة الطلبة على تكوين جدول">
            <header><div><small>{scenario === "actual" ? "قدرة المشاركين" : "سيناريو غير المشاركين"}</small><strong>{countOf(selectedPopulation, AR.student)}</strong></div><span>خطة فعلية في المسودة · السعة افتراضية</span></header>
            <div className="sm-capacity-bands">
              <article><span className="sm-band-icon"><GraduationCap /></span><b>{(bands?.canReach15 || 0).toLocaleString("ar-KW-u-nu-latn")}</b><span>15 وحدة</span></article>
              <article><span className="sm-band-icon"><Layers /></span><b>{(bands?.canReach12To14 || 0).toLocaleString("ar-KW-u-nu-latn")}</b><span>12–14 وحدة</span></article>
              <article className="is-alert"><span className="sm-band-icon"><CircleAlert /></span><b>{(bands?.below12 || 0).toLocaleString("ar-KW-u-nu-latn")}</b><span>أقل من 12</span></article>
              <article><span className="sm-band-icon"><CircleHelp /></span><b>{(bands?.unknown || 0).toLocaleString("ar-KW-u-nu-latn")}</b><span>بيانات ناقصة</span></article>
            </div>
            {selectedPopulation > 0 ? <div className="sm-capacity-bar" role="img" aria-label="توزيع المشاركين حسب قدرتهم على تكوين جدول"><i className="reach15" style={{ inlineSize: `${(bands?.canReach15 || 0) / selectedPopulation * 100}%` }} /><i className="reach12" style={{ inlineSize: `${(bands?.canReach12To14 || 0) / selectedPopulation * 100}%` }} /><i className="below12" style={{ inlineSize: `${(bands?.below12 || 0) / selectedPopulation * 100}%` }} /><i className="unknown" style={{ inlineSize: `${(bands?.unknown || 0) / selectedPopulation * 100}%` }} /></div> : null}
            {bands?.graduatingBelow12 ? <p className="sm-graduation-note">{bands.graduatingBelow12.toLocaleString("ar-KW-u-nu-latn")} يحتاجون أقل من 12 وحدة لإكمال المتبقي وفق الصحيفة.</p> : null}
            <details className="sm-info"><summary><Info /> تقدير لا تسجيل</summary><p>هذا تقدير قدرة، لا أهلية رسمية ولا تسجيل أو حجز. المقررات المجتازة واردة من ملفات الطلبة وليست صحيفة رسمية.</p></details>
          </section>
          {quality ? <details className="sm-quality">
            <summary><span><i style={{ inlineSize: `${qualityPct}%` }} /></span><b>{qualityPct}٪ من الشعب جاهزة للتحليل</b><small>{quality.excluded ? `${countOf(quality.excluded, AR.section)} تحتاج استكمال بياناتها` : "لا توجد شعب مستبعدة"}</small></summary>
            {quality.excluded ? <ul>
              {Object.entries(quality.issues).filter(([key, count]) => key !== "duplicateRows" && Number(count) > 0).map(([key, count]) => <li key={key}>{qualityLabel(key)} · {Number(count).toLocaleString("ar-KW-u-nu-latn")}</li>)}
              {quality.issues.duplicateRows ? <li>صفوف مكررة جرى تجاهلها · {quality.issues.duplicateRows}</li> : null}
              <li>الشعب المستبعدة لا تدخل في المقاعد المؤكدة. أعد الاحتساب بعد تصحيح المصدر.</li>
            </ul> : null}
            {insight?.quality?.length ? <QualityCells cells={insight.quality} truncated={Boolean(insight.qualityTruncated)} termId={data?.term?.id || 0}
              onOpen={canSchedule && onNavigate ? () => onNavigate("schedules") : undefined} qualityLabel={qualityLabel} /> : null}
          </details> : null}

          <details className="sm-provenance"><summary>مصدر الأرقام <small>آخر احتساب {new Date(r.ranAt).toLocaleString("ar-KW-u-nu-latn", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small></summary>
            <p>الرغبات الفعلية: {countOf(r.students, AR.profile)} من {countOf(r.population, AR.profile)} ملفاً مكتملاً. {data.auto?.enabled ? `تحديث تلقائي عند تغيّر البيانات، ومراجعة دورية كل ${countOf(data.auto.everyHours, AR.hour)}.` : "التحديث التلقائي متوقف."} {r.withoutRules ? `${countOf(r.withoutRules, AR.profile)} بلا قواعد صحيفة معتمدة.` : ""} {r.defaulted ? `${countOf(r.defaulted, AR.profile)} غير مشارك؛ يظهر كتوقع مستقل.` : ""} {r.scoped ? "مقررات قسمك." : ""} محاكاة تقديرية، لا تسجيل رسمي ولا مقاعد محجوزة.</p>
          </details>

          </> : null}

          {shownView === "predict" ? <PredictiveInsightPanel canSchedule={canSchedule} onNavigate={onNavigate} onChanged={() => void load()} /> : null}

          {shownView === "outcome" && outcome ? <OutcomeBlock outcome={outcome} predictedStudents={r.students} /> : null}

          {shownView === "decide" ? <section className="sm-list">
            <header>
              <h3>{all ? "كل المقررات" : "تحتاج قراراً"}</h3>
              <input aria-label="بحث" placeholder="ابحث بالرمز أو الاسم" value={q} onChange={e => setQ(e.target.value)} />
              <button type="button" className="sm-toggle" onClick={() => setAll(!all)} data-guide-ignore="تبديلُ عرض المقررات داخل شاشةٍ مسجّلة في المرشد باسم page.simulation">{all ? "الزحام فقط" : `كل المقررات (${rows.length})`}</button>
            </header>
            <details className="sm-how"><summary>كيف أقرأ الأرقام؟</summary><p>«طُلب» هو عدد الطلبة الذين اختاروا المقرر. «وجد مقعداً» نتيجة توزيع افتراضي على الشعب والسعات المتاحة؛ لا يحجز مقعداً. «تعارض» يعني أن وقت شعبة هذا المقرر يتزامن مع مقرر آخر اختاره الطالب. «المتطلب السابق» مقرر يجب اجتيازه بحسب قواعد الصحيفة المعتمدة.</p></details>
            {!shown.length ? <p className="sm-none">{!all && calm.length ? <><span className="sm-ic"><Check /></span><b>لا زحام ظاهر</b><small>كل المقررات وجدت مقاعد كافية في التقدير.</small></> : all ? "لا نتائج." : "لا مقررات."}</p> : shown.map(c => {
              const unmet = WHY.map(([key, label, tone]) => ({ key, label, tone, n: c.unmet[key] })).filter(x => x.n > 0);
              const fill = c.capacity ? Math.min(100, Math.round((c.taken / c.capacity) * 100)) : 0;
              return (
                <article key={c.courseId} className={`sm-row${needsDecision(c) ? " hot" : ""}`}>
                  <div className="sm-name"><b>{c.name}</b><span>{c.code}</span></div>
                  <div className="sm-gauge" aria-label={`امتلأ ${fill}٪ من المقاعد`}>
                    <div className="sm-track"><i className={fill >= 95 ? "full" : fill >= 80 ? "high" : ""} style={{ inlineSize: `${fill}%` }} /></div>
                    <small>{c.sections ? `${countOf(c.sections, AR.section)} · ${c.taken} من ${countOf(c.capacity, AR.seat)}` : "لا تُطرح هذا الفصل"} · طُلب {c.wanted}</small>
                  </div>
                  <div className="sm-why">{unmet.map(x => <span key={x.key} className={`sm-chip ${x.tone}`}><b>{countOf(x.n, AR.student)}</b> — {x.label}</span>)}</div>
                  <CourseImpact courseId={c.courseId} />
                  {canSchedule && !frozen && data.term && needsDecision(c) ? <RadarSchedule course={c as CourseRow & { collegeId?: number; sectionId?: number }} termId={data.term.id} onChanged={() => void load()} /> : null}
                </article>
              );
            })}
          </section> : null}
        </>
      )}
    </div>
    </TermFrozenContext.Provider>
  );
}

/** ما قاله الطلبةُ بعد التسجيل: كم سجّلوا، وأين تعثّروا ولماذا. أعدادٌ لا أسماء. */
function OutcomeBlock({ outcome, predictedStudents }: { outcome: Outcome; predictedStudents: number }) {
  const registered = outcome.courses.reduce((s, c) => s + c.registered, 0), stuck = outcome.courses.reduce((s, c) => s + c.stuck, 0);
  const total = registered + stuck;
  const okPct = total ? Math.round((registered / total) * 100) : 0;
  /* كلُّ مقررٍ فيه متعثّرون، مرتّباً أبجدياً (اسمُه ثم رمزُه) كبقية قوائم المقررات: القارئ يبحث عن مقررٍ بعينه لا عن «الأسوأ». */
  const worst = outcome.courses.filter(c => c.stuck > 0).sort((a, b) => compareArabic(a.name, b.name) || a.code.localeCompare(b.code, "en", { numeric: true }));
  const share = outcome.answered !== null && predictedStudents ? Math.round((outcome.answered / predictedStudents) * 100) : 0;
  return (
    <section className="sm-list sm-out">
      <header><h3>بعد التسجيل: ماذا حدث؟</h3></header>
      <div className="sm-kpis">
        {outcome.answered !== null
          ? <article className="sm-kpi"><span className="sm-ic"><Users /></span><b>{outcome.answered.toLocaleString("ar-KW-u-nu-latn")}</b><small>أجابوا «هل سجلت؟»</small><em>{share}٪ ممن شملهم الرادار</em></article>
          : <article className="sm-kpi"><span className="sm-ic"><Users /></span><b>{outcome.answers.toLocaleString("ar-KW-u-nu-latn")}</b><small>من أجوبة الطلبة في مقررات قسمك</small><em>جوابٌ لكل مقرر — لا عددُ الطلبة</em></article>}
        <article className="sm-kpi"><span className="sm-ic"><Layers /></span><b>{okPct}٪</b><small>من المقرراتِ المُجاب عنها سُجّلت</small>
          <div className="sm-meter"><i style={{ inlineSize: `${okPct}%` }} /></div><em>{countOf(registered, AR.course)} سُجّلت · {countOf(stuck, AR.course)} تعثّرت</em></article>
      </div>
      <OutcomeLegend rows={outcome.courses} />
      {worst.map(c => <OutcomeCourse key={c.courseId} row={c} />)}
      <details className="sm-info"><summary><Info /> مصدر الأجوبة</summary><p>أجوبةُ الطلبة أنفسهم في «مساري» بعد التسجيل، وهي عيّنةٌ ممن اختار أن يجيب — لا كلُّ الطلبة. «لم يسجّل» تعني أنه لم يتمكن من تسجيل المقرر، والأسباب إجاباتُهم.{outcome.scoped ? " المعروض مقرراتُ قسمك فقط." : ""}</p></details>
    </section>
  );
}

/** الشعب المستبعدة، واحدةً واحدة: ما نقصها، وزرٌّ يفتح خانتَها في الجدول (لمن يملك الجدول). */
function QualityCells({ cells, truncated, termId, onOpen, qualityLabel }: { cells: QualityCell[]; truncated: boolean; termId: number; onOpen?: () => void; qualityLabel: (key: string) => string }) {
  const [all, setAll] = useState(false);
  const shown = all ? cells : cells.slice(0, 6);
  return (
    <div className="qc-list" aria-label="الشعب التي تحتاج استكمال بياناتها">
      {shown.map(cell => (
        <div key={`${cell.offeringId}:${cell.issue}`} className="qc-row">
          <span className="qc-ic" aria-hidden="true"><AlertTriangle /></span>
          <div><b>{cell.courseName || `مقرر ${cell.courseId}`}</b><small>{cell.courseCode} · شعبة {cell.code} · {qualityLabel(cell.issue)}</small></div>
          {onOpen && cell.rowId ? (
            <SecondaryButton type="button" onClick={() => {
              writeSharedScope({ collegeId: cell.collegeId, sectionId: cell.sectionId, termId });
              try { sessionStorage.setItem("schedule-open-context-id", String(cell.rowId)); } catch { /* التخزين غير متاح: يُفتح الجدول بلا تحديد */ }
              onOpen();
            }} data-guide-ignore="يفتح الجدول على هذه الشعبة لاستكمال بياناتها؛ لا يكتب شيئاً"><CalendarPlus aria-hidden="true" /> افتح الخانة</SecondaryButton>
          ) : null}
        </div>
      ))}
      {cells.length > 6 ? <button type="button" className="sm-toggle" onClick={() => setAll(!all)} data-guide-ignore="عرضُ بقية الشعب المستبعدة؛ لا يكتب شيئاً">{all ? "أقل" : `كل الشعب (${cells.length}${truncated ? "+" : ""})`}</button> : null}
    </div>
  );
}
