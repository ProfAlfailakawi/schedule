/**
 * ── رادارُ التسجيل ──────────────────────────────────────────────────────────
 *
 * ما سيحدث يومَ التسجيل لو سجّل الطلبةُ بحسب ما كتبوه: أيُّ مقرراتٍ ستزدحم، وأيُّها
 * مطلوبٌ ولا يُطرح، وكم طالباً في كل نافذة. أعدادٌ لا أسماء، وكلُّ رقمٍ يحمل أساسَه.
 *
 * وهي **تقديرٌ** من ملفّات الطلبة وجداولِ الأقسام (مسوّدةً أو معتمدة)، لا بياناتُ
 * التسجيل الرسمي ولا حجزُ مقعد. التشغيلُ لإدارة النظام؛ والقسمُ يرى مقرراتِه فحسب.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, Layers, Play, RefreshCw, Ticket, Users } from "lucide-react";
import { EmptyState, MicroLoader, Notice, PageTitle, PrimaryButton, SecondaryButton } from "./ui";
import { AR, countOf } from "../utils/arabicCount";
import MasariQrButton from "./MasariQrButton";

interface Unmet { "not-offered": number; conflict: number; full: number; prereq: number; units: number }
interface CourseRow { courseId: number; code: string; name: string; sections: number; capacity: number; taken: number; wanted: number; seated: number; unmet: Unmet }
interface OutcomeRow { courseId: number; code: string; name: string; registered: number; stuck: number; full: number; prereq: number; conflict: number; other: number }
interface Outcome { term: { id: number; name: string } | null; answered: number | null; answers: number; scoped: boolean; courses: OutcomeRow[] }
interface Summary {
  term: { id: number; name: string } | null;
  canRun: boolean;
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

const request = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error("وصل ردٌّ غير متوقّع من الخادم."); }
  if (!response.ok) throw new Error(data.error || "تعذّر تنفيذ العملية");
  return data;
};

const WHY: Array<[keyof Unmet, string, string]> = [
  ["full", "مقاعد لا تكفي", "bad"], ["not-offered", "مطلوبٌ ولا يُطرح", "warn"], ["conflict", "تعارض أوقات", "info"], ["units", "فوق الوحدات", "soft"], ["prereq", "ينقصهم مسبق", "soft"],
];
const qualityLabel = (key: string) => ({
  "invalid-identity": "هوية المقرر أو الشعبة غير مكتملة",
  "missing-capacity": "السعة غير محددة",
  "invalid-capacity": "السعة ليست عدداً صحيحاً",
  "missing-meetings": "لا يوجد موعد مكتمل",
  "invalid-meetings": "وقت أو يوم غير صالح",
  "duplicate-id": "معرّف شعبة مكرر",
} as Record<string, string>)[key] || "بيانات تحتاج مراجعة";
const needsDecision = (c: CourseRow) => c.unmet.full > 0 || c.unmet["not-offered"] > 0;
const weight = (c: CourseRow) => c.unmet.full * 3 + c.unmet["not-offered"] * 2 + c.unmet.conflict;

export default function RegistrationRehearsal({ onNavigate }: { onNavigate?: (view: string) => void } = {}) {
  const [data, setData] = useState<Summary | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const [q, setQ] = useState("");
  const [scenario, setScenario] = useState<"actual" | "projected">("actual");

  const load = useCallback(async () => {
    try { setData(await request("/api/simulation/summary")); setError(""); } catch (e: any) { setError(e.message); }
    try { setOutcome(await request("/api/simulation/outcome")); } catch { /* الجزءُ الثاني اختياري: لا يُسقط الشاشة */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async () => {
    setBusy(true); setError("");
    try { await request("/api/simulation/run", { method: "POST" }); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

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

  const rows = useMemo(() => [...(scenario === "projected" ? data?.projectedCourses || [] : data?.courses || [])].sort((a, b) => weight(b) - weight(a) || b.wanted - a.wanted || a.code.localeCompare(b.code, "en")), [data, scenario]);
  const decide = rows.filter(needsDecision);
  const calm = rows.filter(c => !needsDecision(c));
  const shown = (all ? rows : decide).filter(c => !q.trim() || `${c.code} ${c.name}`.includes(q.trim()));

  if (!data && !error) return <MicroLoader />;
  const r = data?.run;
  const wantedTotal = rows.reduce((s, c) => s + c.wanted, 0), seatedTotal = rows.reduce((s, c) => s + c.seated, 0);
  const coverage = wantedTotal ? Math.round((seatedTotal / wantedTotal) * 100) : 0;
  const bands = scenario === "projected" ? r?.projected?.capacity : r?.capacity;
  const selectedPopulation = scenario === "projected" ? r?.projected?.students || 0 : r?.students || 0;
  const quality = r?.dataQuality;
  const qualityPct = quality?.total ? Math.round(quality.ready / quality.total * 100) : 0;
  const maxWindow = Math.max(1, ...(r?.windows || [1]));

  return (
    <div className="sm-page" dir="rtl">
      <PageTitle eyebrow="رادار التسجيل" subtitle="لو سجّل الطلبةُ بحسب ما كتبوه: أين الزحام، وما المطلوب ولا يُطرح؟"
        action={(
          <div className="sm-actions">
            {data?.run ? <SecondaryButton onClick={exportXlsx} data-guide-ignore="تصديرُ تقرير الرادار داخل شاشةٍ مسجّلة في المرشد باسم page.simulation"><Download size={16} /> تقرير Excel</SecondaryButton> : null}
            <MasariQrButton data-guide-ignore="زرُّ رمز «مساري» داخل شاشةٍ مسجّلة في المرشد باسم page.simulation" />
            {data?.canRun ? (
              <PrimaryButton disabled={busy} onClick={run} data-guide-ignore="تحديثُ الرادار داخل شاشةٍ مسجّلة في المرشد باسم page.simulation">
                {busy ? <RefreshCw size={16} className="sm-spin" /> : <Play size={16} />} {r ? "حدّث الرادار" : "شغّل الرادار"}
              </PrimaryButton>
            ) : null}
          </div>
        )}>رادار يوم التسجيل</PageTitle>
      {error ? <Notice type="error" onDismiss={() => setError("")}>{error}</Notice> : null}
      {data?.phase ? (
        <div className={`sm-phase ${data.phase.namesVisible ? "after" : "before"}`}>
          <span className="sm-ic">{data.phase.namesVisible ? <Users /> : <Ticket />}</span>
          <div><b>{data.phase.label}</b><small>{data.phase.line}</small>
            <small>{data.phase.namesVisible ? "بدأ التسجيل: تصل أسماءُ المتعثّرين الأقسامَ المالكة للمقررات في «كشف التسجيل»." : "قبل التسجيل: أرقامٌ فقط — لا أسماءَ حتى تبدأ الجولة الأولى."}</small></div>
          {onNavigate ? (
            <div className="sm-links">
              {data.phase.namesVisible ? <button type="button" onClick={() => onNavigate("studentRegistration")} data-guide-ignore="انتقالٌ إلى كشف التسجيل من شاشةٍ مسجّلة في المرشد باسم page.simulation">كشف التسجيل (الأسماء)</button> : null}
              <button type="button" onClick={() => onNavigate("intelligence")} data-guide-ignore="انتقالٌ إلى مركز الذكاء من شاشةٍ مسجّلة في المرشد باسم page.simulation">مركز الذكاء</button>
            </div>
          ) : null}
        </div>
      ) : null}
      {!data?.term ? <EmptyState title="لا فصلَ للرادار" detail="تظهر حين يكون للفصل القادم تواريخُ طلبة." /> : !r ? (
        <EmptyState title="لم يُبنَ الرادار بعد" detail={data.canRun ? "اضغط «شغّل الرادار» لتُبنى خططُ الطلبة من ملفّاتهم." : "تُجريها إدارةُ النظام حين تكتمل رغباتُ الطلبة."} />
      ) : (
        <>
          <div className="sm-scenario-tabs" role="tablist" aria-label="مصدر تحليل التسجيل">
            <button type="button" role="tab" aria-selected={scenario === "actual"} onClick={() => setScenario("actual")} data-guide-ignore="اختيار مصدر الرغبات داخل شاشة مرشد التسجيل">الرغبات الفعلية <small>{r.students.toLocaleString("ar-KW-u-nu-latn")}</small></button>
            <button type="button" role="tab" aria-selected={scenario === "projected"} onClick={() => setScenario("projected")} disabled={!r.projected} data-guide-ignore="اختيار التوقعات داخل شاشة مرشد التسجيل">التوقعات <small>{(r.projected?.students || 0).toLocaleString("ar-KW-u-nu-latn")}</small></button>
          </div>
          {r.stale ? <div className="sm-stale" role="status"><AlertTriangle size={16} /> تغيّرت بيانات المصدر بعد آخر احتساب. الأرقام قديمة؛ حدّث الرادار قبل اتخاذ القرار.</div> : null}
          <section className="sm-capacity-summary" aria-label="قدرة الطلبة على تكوين جدول">
            <header><div><small>{scenario === "actual" ? "قدرة المشاركين" : "سيناريو غير المشاركين"}</small><strong>{countOf(selectedPopulation, AR.student)}</strong></div><span>خطة فعلية في المسودة · السعة افتراضية</span></header>
            <div className="sm-capacity-bands">
              <article><b>{(bands?.canReach15 || 0).toLocaleString("ar-KW-u-nu-latn")}</b><span>يصلون إلى 15 وحدة</span></article>
              <article><b>{(bands?.canReach12To14 || 0).toLocaleString("ar-KW-u-nu-latn")}</b><span>12–14 وحدة</span></article>
              <article className="is-alert"><b>{(bands?.below12 || 0).toLocaleString("ar-KW-u-nu-latn")}</b><span>أقل من 12</span></article>
              <article><b>{(bands?.unknown || 0).toLocaleString("ar-KW-u-nu-latn")}</b><span>بيانات غير كافية</span></article>
            </div>
            {bands?.graduatingBelow12 ? <p className="sm-graduation-note">{bands.graduatingBelow12.toLocaleString("ar-KW-u-nu-latn")} يحتاجون أقل من 12 وحدة لإكمال المتبقي وفق الصحيفة.</p> : null}
            <p className="sm-base">هذا تقدير قدرة، لا أهلية رسمية ولا تسجيل أو حجز. المقررات المجتازة واردة من ملفات الطلبة وليست صحيفة رسمية.</p>
          </section>
          {quality ? <details className="sm-quality">
            <summary><span><i style={{ inlineSize: `${qualityPct}%` }} /></span><b>{qualityPct}٪ من الشعب جاهزة للتحليل</b><small>{quality.excluded ? `${countOf(quality.excluded, AR.section)} تحتاج استكمال بياناتها` : "لا توجد شعب مستبعدة"}</small></summary>
            {quality.excluded ? <ul>
              {Object.entries(quality.issues).filter(([key, count]) => key !== "duplicateRows" && Number(count) > 0).map(([key, count]) => <li key={key}>{qualityLabel(key)} · {Number(count).toLocaleString("ar-KW-u-nu-latn")}</li>)}
              {quality.issues.duplicateRows ? <li>صفوف مكررة جرى تجاهلها · {quality.issues.duplicateRows}</li> : null}
              <li>الشعب المستبعدة لا تدخل في المقاعد المؤكدة. أعد الاحتساب بعد تصحيح المصدر.</li>
            </ul> : null}
          </details> : null}

          <p className="sm-auto">{data.auto?.enabled ? `يتحدّث الرادار تلقائياً كل ${countOf(data.auto.everyHours, AR.hour)} ما دامت الرغبات مفتوحةً أو بعدها، ومرةً أخيرةً بعد إغلاق الرغبات.` : "التحديث التلقائي متوقّف: يُحدَّث الرادار يدوياً."}{data.canRun ? " «حدّث الرادار» يحدّثه الآن." : ""}</p>
          <p className="sm-base">
            أساس الرغبات الفعلية: {countOf(r.students, AR.profile)} من {countOf(r.population, AR.profile)} ملفاً مكتملاً، أُجريت {new Date(r.ranAt).toLocaleDateString("ar-KW-u-nu-latn", { day: "numeric", month: "long" })}
            {r.withoutRules ? ` · ${countOf(r.withoutRules, AR.profile)} على صحيفةٍ بلا قواعد معتمدة (بُنيت بلا مسبقات)` : ""}
            {r.defaulted ? ` · ${countOf(r.defaulted, AR.profile)} غير مشارك في هذا الفصل، وتحليله منفصل كتوقع` : ""}
            {r.scoped ? " · المعروض مقرراتُ قسمك فقط" : ""}. تقديرٌ لا بياناتُ التسجيل الرسمي.
          </p>

          {outcome && outcome.answers > 0 ? <OutcomeBlock outcome={outcome} predictedStudents={r.students} /> : null}

          <section className="sm-list">
            <header>
              <h3>{all ? "كل المقررات" : "تحتاج قراراً"}</h3>
              <input aria-label="بحث" placeholder="ابحث بالرمز أو الاسم" value={q} onChange={e => setQ(e.target.value)} />
              <button type="button" className="sm-toggle" onClick={() => setAll(!all)} data-guide-ignore="تبديلُ عرض المقررات داخل شاشةٍ مسجّلة في المرشد باسم page.simulation">{all ? "الزحام فقط" : `كل المقررات (${rows.length})`}</button>
            </header>
            {!shown.length ? <p className="sm-none">{all ? "لا نتائج." : calm.length ? "لا مقررَ يحتاج قراراً — كلُّ ما طُلب وجد مقعداً." : "لا مقررات."}</p> : shown.map(c => {
              const unmet = WHY.map(([key, label, tone]) => ({ key, label, tone, n: c.unmet[key] })).filter(x => x.n > 0);
              const fill = c.capacity ? Math.min(100, Math.round((c.taken / c.capacity) * 100)) : 0;
              return (
                <article key={c.courseId} className={`sm-row${needsDecision(c) ? " hot" : ""}`}>
                  <div className="sm-name"><b>{c.name}</b><span>{c.code}</span></div>
                  <div className="sm-gauge" aria-label={`امتلأ ${fill}٪ من المقاعد`}>
                    <div className="sm-track"><i className={fill >= 95 ? "full" : fill >= 80 ? "high" : ""} style={{ inlineSize: `${fill}%` }} /></div>
                    <small>{c.sections ? `${countOf(c.sections, AR.section)} · ${c.taken} من ${countOf(c.capacity, AR.seat)}` : "لا تُطرح هذا الفصل"} · طُلب {c.wanted}</small>
                  </div>
                  <div className="sm-why">{unmet.map(x => <span key={x.key} className={`sm-chip ${x.tone}`}>{x.label} {x.n}</span>)}</div>
                </article>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}

/** ما قاله الطلبةُ بعد التسجيل: كم سجّلوا، وأين تعثّروا ولماذا. أعدادٌ لا أسماء. */
function OutcomeBlock({ outcome, predictedStudents }: { outcome: Outcome; predictedStudents: number }) {
  const registered = outcome.courses.reduce((s, c) => s + c.registered, 0), stuck = outcome.courses.reduce((s, c) => s + c.stuck, 0);
  const total = registered + stuck;
  const okPct = total ? Math.round((registered / total) * 100) : 0;
  const reasons: Array<[string, string, number]> = [
    ["امتلأت الشعب", "bad", outcome.courses.reduce((s, c) => s + c.full, 0)], ["المسبق لا يسمح", "soft", outcome.courses.reduce((s, c) => s + c.prereq, 0)],
    ["تعارض", "info", outcome.courses.reduce((s, c) => s + c.conflict, 0)], ["سبب آخر", "soft", outcome.courses.reduce((s, c) => s + c.other, 0)],
  ];
  const worst = outcome.courses.filter(c => c.stuck > 0).slice(0, 8);
  const share = outcome.answered !== null && predictedStudents ? Math.round((outcome.answered / predictedStudents) * 100) : 0;
  return (
    <section className="sm-list sm-out">
      <header><h3>بعد التسجيل: ماذا قال الطلبة؟</h3></header>
      <div className="sm-kpis">
        {outcome.answered !== null
          ? <article className="sm-kpi"><span className="sm-ic"><Users /></span><b>{outcome.answered.toLocaleString("ar-KW-u-nu-latn")}</b><small>أجابوا «هل سجلت؟»</small><em>{share}٪ ممن شملهم الرادار</em></article>
          : <article className="sm-kpi"><span className="sm-ic"><Users /></span><b>{outcome.answers.toLocaleString("ar-KW-u-nu-latn")}</b><small>من أجوبة الطلبة في مقررات قسمك</small><em>جوابٌ لكل مقرر — لا عددُ الطلبة</em></article>}
        <article className="sm-kpi"><span className="sm-ic"><Layers /></span><b>{okPct}٪</b><small>من المقرراتِ المُجاب عنها سُجّلت</small>
          <div className="sm-meter"><i style={{ inlineSize: `${okPct}%` }} /></div><em>{countOf(registered, AR.course)} سُجّلت · {countOf(stuck, AR.course)} تعثّرت</em></article>
      </div>
      <div className="sm-why">{reasons.filter(x => x[2] > 0).map(([label, tone, n]) => <span key={label} className={`sm-chip ${tone}`}>{label} {n}</span>)}</div>
      {worst.map(c => {
        const sum = c.registered + c.stuck;
        return (
          <article key={c.courseId} className="sm-row hot">
            <div className="sm-name"><b>{c.name}</b><span>{c.code}</span></div>
            <div className="sm-gauge"><div className="sm-track"><i className="full" style={{ inlineSize: `${sum ? Math.round((c.stuck / sum) * 100) : 0}%` }} /></div><small>تعثّر {c.stuck} من {sum} أجابوا</small></div>
            <div className="sm-why">{c.full ? <span className="sm-chip bad">امتلأت {c.full}</span> : null}{c.prereq ? <span className="sm-chip soft">مسبق {c.prereq}</span> : null}{c.conflict ? <span className="sm-chip info">تعارض {c.conflict}</span> : null}</div>
          </article>
        );
      })}
      <p className="sm-base">مصدرها: أجوبةُ الطلبة أنفسهم في «مساري»، وهي عيّنةٌ ممن اختار أن يجيب — لا كلُّ الطلبة.{outcome.scoped ? " المعروض مقرراتُ قسمك فقط." : ""}</p>
    </section>
  );
}
