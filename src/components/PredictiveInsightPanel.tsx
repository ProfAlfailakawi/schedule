/**
 * ── لوحة التنبّؤ: ماذا سيحتاج الفصلُ القادم؟ ────────────────────────────────
 *
 * رسمٌ فقط. الحسابُ كلُّه في `utils/predictiveIntelligence.ts` (والخادمُ يحضّر المدخلات بحدود النطاق).
 * كلُّ رقمٍ هنا يحمل **ثقتَه** (ثلاثة أعمدةٍ ونصّ) و**عددَ الفصول** التي بُني عليها؛ وما ثقتُه ضعيفةٌ يظهر
 * بخطٍّ متقطّعٍ وإجراؤه معطَّلٌ بسببه — فلا يُقدَّم تخمينٌ كأنه حقيقة. الإجراءُ الفعليّ لفتح الشعب هو
 * مسارُ الرادار نفسُه (RadarSchedule ← ApplyProposal): معاينةٌ ثم اعتمادٌ بتأكيد.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CalendarClock, CalendarPlus, ChevronDown, GraduationCap, History, Info, Layers, Link2, Lock, Sparkles, TrendingDown, TrendingUp, Users,
} from "lucide-react";
import { EmptyState, MicroLoader, SecondaryButton } from "./ui";
import RadarSchedule, { request } from "./RadarSchedule";
import { AR, countOf } from "../utils/arabicCount";
import { CONFIDENCE_LABEL, type Confidence, type DemandPrediction, type PredictiveAction } from "../utils/predictiveIntelligence";
import type { PredictiveClientReading } from "../server/predictiveInsight";

const nf = (n: number) => n.toLocaleString("ar-KW-u-nu-latn");

/** ثلاثةُ أعمدة: عالية ٣، متوسطة ٢، منخفضة ١، لا يكفي ٠ (متقطّعة). */
export function ConfidenceMeter({ confidence, compact = false }: { confidence: Confidence; compact?: boolean }) {
  const filled = confidence.level === "high" ? 3 : confidence.level === "medium" ? 2 : confidence.level === "low" ? 1 : 0;
  const label = CONFIDENCE_LABEL[confidence.level];
  const title = `الثقة ${label}${confidence.level === "insufficient" ? "" : ` (${nf(confidence.score)}٪)`} · ${confidence.termsUsed ? countOf(confidence.termsUsed, AR.term) + " سابقة" : "بلا فصولٍ سابقة"}${confidence.backtestError != null ? ` · خطأ الاختبار الرجعي ${nf(Math.round(confidence.backtestError * 100))}٪` : ""}${confidence.caveat ? ` · ${confidence.caveat}` : ""}`;
  return (
    <span className="pi-conf" data-level={confidence.level} title={title} role="img" aria-label={title}>
      <span className="pi-conf-bars" aria-hidden="true"><i data-on={filled >= 1} /><i data-on={filled >= 2} /><i data-on={filled >= 3} /></span>
      {compact ? null : <b>{label}</b>}
      <small>{confidence.termsUsed ? `${nf(confidence.termsUsed)} ف` : "—"}</small>
    </span>
  );
}

/** أعمدةٌ صغيرة: شعبُ كل فصلٍ سابق، ثم المتوقَّع (متقطّع بمداه)، وخطُّ المخطَّط الآن. */
function SeriesBars({ row }: { row: DemandPrediction }) {
  const max = Math.max(1, row.high, row.planned, ...row.series);
  const bars = row.series.length + 1;
  const w = 8, gap = 4, h = 34;
  const y = (v: number) => h - Math.round((v / max) * (h - 2));
  return (
    <svg className="pi-series" viewBox={`0 0 ${bars * (w + gap)} ${h + 2}`} role="img" aria-label={`شعب الفصول السابقة ${row.series.join("، ")}؛ المتوقع ${row.expected}؛ المخطط ${row.planned}`}>
      {row.series.map((value, index) => <rect key={index} x={index * (w + gap)} y={y(value)} width={w} height={h - y(value) + 1} rx="2" className="pi-bar" />)}
      <rect x={row.series.length * (w + gap)} y={y(row.expected)} width={w} height={h - y(row.expected) + 1} rx="2" className="pi-bar pi-bar-expected" data-low={row.confidence.level === "low" || row.confidence.level === "insufficient" || undefined} />
      <line x1="0" x2={bars * (w + gap) - gap} y1={y(row.planned)} y2={y(row.planned)} className="pi-planned" />
    </svg>
  );
}

const ICON_OF: Record<string, React.ComponentType<any>> = {
  "open-sections": Layers, "open-prereq": Link2, "review-timeslot": CalendarClock, "offer-in-season": GraduationCap, "review-surplus": TrendingDown,
};

/** نطاقُ القراءة حين تُعرض اللوحة في مركز القراءات: يتبع مفتاحَ «الكلية / القسم» هناك. غائبٌ = كل ما يحقّ للقارئ (الرادار). */
export interface PredictiveScope { mode: "college" | "department"; collegeId: number; sectionId: number }

export default function PredictiveInsightPanel({ canSchedule, onNavigate, onChanged, scope }: { canSchedule: boolean; onNavigate?: (view: string) => void; onChanged: () => void; scope?: PredictiveScope }) {
  const [reading, setReading] = useState<PredictiveClientReading | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none" | "error">("loading");
  const [error, setError] = useState("");
  const [allCourses, setAllCourses] = useState(false);

  useEffect(() => {
    let live = true;
    setState("loading");
    const query = scope?.collegeId ? `?analysisScope=${scope.mode}&collegeId=${scope.collegeId}${scope.mode === "department" ? `&sectionId=${scope.sectionId}` : ""}` : "";
    request(`/api/simulation/predictive${query}`)
      .then(body => { if (!live) return; if (body.ready) { setReading(body.reading); setState("ready"); } else setState("none"); })
      .catch((e: any) => { if (live) { setError(e.message || "تعذّر حساب التنبّؤات."); setState("error"); } });
    return () => { live = false; };
  }, [scope?.mode, scope?.collegeId, scope?.sectionId]);

  const byDemand = useMemo(() => new Map((reading?.demand || []).map(row => [row.courseId, row] as const)), [reading]);
  const byPrereq = useMemo(() => new Map((reading?.prereq || []).map(row => [row.courseId, row] as const)), [reading]);
  if (state === "loading") return <MicroLoader label="يقرأ التاريخ ويحسب…" />;
  if (state === "none") return <EmptyState title="لا فصلَ للتنبّؤ" detail="يظهر حين يكون للفصل القادم تواريخُ طلبة." />;
  if (state === "error" || !reading) return <EmptyState title="تعذّر التنبّؤ" detail={error} />;

  const r = reading;
  const termId = r.target.termId;
  const gap = r.demand.filter(row => row.delta !== 0);
  const shownDemand = allCourses ? r.demand : gap;
  const g = r.graduation;
  const gradTotal = Math.max(1, g.onTime + g.delayed1 + g.delayed2plus + g.unassessed);
  const seg = (n: number) => `${(n / gradTotal) * 100}%`;

  const runner = (action: PredictiveAction) => {
    const demand = action.courseId ? byDemand.get(action.courseId) : undefined;
    const prereq = action.courseId ? byPrereq.get(action.courseId) : undefined;
    const source = demand || prereq;
    if ((action.kind === "open-sections" || action.kind === "open-prereq") && action.oneClick && canSchedule && source?.collegeId && source?.sectionId) {
      return <RadarSchedule course={{ courseId: source.courseId, name: source.name, collegeId: source.collegeId, sectionId: source.sectionId }} termId={termId} onChanged={onChanged} />;
    }
    if (action.disabledReason) return <small className="pi-why-off"><Lock aria-hidden="true" />{action.disabledReason}</small>;
    if (onNavigate && canSchedule) return <SecondaryButton type="button" onClick={() => onNavigate("schedules")} data-guide-ignore="يفتح ورشة الجدول للمراجعة؛ لا يكتب شيئاً"><CalendarPlus aria-hidden="true" /> افتح الورشة</SecondaryButton>;
    return null;
  };

  return (
    <section className="pi-panel" aria-label="تنبّؤ الفصل القادم">
      <header className="pi-head">
        <span className="pi-head-ic" aria-hidden="true"><Sparkles /></span>
        <div><h3>تنبّؤ الفصل القادم</h3><small>{r.target.name}</small></div>
        <div className="pi-history" title={r.historyNames.length ? `الفصول المستعملة: ${r.historyNames.join("، ")}` : "لا فصول سابقة"}>
          <History aria-hidden="true" />
          <span className="pi-dots" aria-hidden="true">{Array.from({ length: Math.min(8, Math.max(r.historyTerms, 1)) }, (_, i) => <i key={i} data-on={i < r.historyTerms} />)}</span>
          <b>{r.historyTerms ? countOf(r.historyTerms, AR.term) : "بلا تاريخ"}</b>
        </div>
      </header>

      {r.caveats.length ? <ul className="pi-caveats">{r.caveats.map(text => <li key={text}><Info aria-hidden="true" />{text}</li>)}</ul> : null}

      {/* ── أهمُّ ما يُفعل: أثرٌ × ثقة ── */}
      <div className="pi-block">
        <h4><Sparkles aria-hidden="true" /> الإجراءات المقترحة</h4>
        {r.top.length ? <div className="pi-acts">{r.top.map(item => {
          const Icon = ICON_OF[item.action.kind] || Layers;
          return (
            <article key={item.id} className="pi-act" data-level={item.confidence.level}>
              <span className="pi-act-ic" aria-hidden="true"><Icon /></span>
              <div className="pi-act-body"><b>{item.label}</b><small>{item.reason}</small></div>
              <ConfidenceMeter confidence={item.confidence} />
              <div className="pi-act-do">{runner(item.action)}</div>
            </article>
          );
        })}</div> : <p className="pi-none">لا إجراءَ مقترحاً الآن: الجدول يطابق التوقّع، أو التاريخُ لا يكفي لاقتراحٍ مسؤول.</p>}
      </div>

      {/* ── الطلب: كم شعبةً لكل مقرر؟ ── */}
      <div className="pi-block">
        <h4><Layers aria-hidden="true" /> الشعب المتوقعة <small>{nf(gap.length)} تحتاج نظراً من {nf(r.demand.length)}</small></h4>
        <p className="pi-legend"><i className="k-bar" />فصول سابقة <i className="k-exp" />المتوقع <i className="k-plan" />المخطّط الآن</p>
        {shownDemand.length ? <ul className="pi-rows">{shownDemand.map(row => (
          <li key={row.courseId} className="pi-row" data-level={row.confidence.level}>
            <div className="pi-row-name"><b>{row.name}</b><small>{row.code}</small></div>
            <SeriesBars row={row} />
            <div className="pi-row-num" title={`المدى ${row.low}–${row.high}`}>
              <span>{nf(row.planned)}</span>{row.trend === "up" ? <TrendingUp aria-hidden="true" /> : row.trend === "down" ? <TrendingDown aria-hidden="true" /> : <span aria-hidden="true">←</span>}<b>{nf(row.expected)}</b>
              {row.delta !== 0 ? <em data-sign={row.delta > 0 ? "plus" : "minus"}>{row.delta > 0 ? "+" : "−"}{nf(Math.abs(row.delta))}</em> : null}
            </div>
            <ConfidenceMeter confidence={row.confidence} compact />
          </li>
        ))}</ul> : <p className="pi-none">كل المقررات مطابقةٌ للتوقّع.</p>}
        {r.demand.length > gap.length ? <button type="button" className="sm-toggle" onClick={() => setAllCourses(v => !v)} data-guide-ignore="عرضٌ فقط">{allCourses ? "ما يحتاج نظراً فقط" : `كل المقررات (${nf(r.demand.length)})`}</button> : null}
      </div>

      {/* ── الاختناقات ── */}
      <div className="pi-block pi-two">
        <div>
          <h4><Lock aria-hidden="true" /> مسبقٌ يحجز دفعة</h4>
          {r.prereq.length ? <ul className="pi-rows">{r.prereq.slice(0, 5).map(row => {
            const seats = row.plannedSeats ?? 0;
            const pct = row.needSeats ? Math.min(100, Math.round((seats / row.needSeats) * 100)) : 0;
            return (
              <li key={row.courseId} className="pi-row pi-row-small" data-level={row.confidence.level}>
                <div className="pi-row-name"><b>{row.name}</b><small>{row.dependents[0] ? `يحجب «${row.dependents[0]}»` : row.code}</small></div>
                <div className="pi-seat" aria-label={`مقاعد ${seats} من ${row.needSeats}`}><span><i style={{ inlineSize: `${pct}%` }} /></span><small>{nf(seats)} / {nf(row.needSeats)}</small></div>
                <b className="pi-blocked"><Users aria-hidden="true" />{nf(row.blockedStudents)}</b>
                <ConfidenceMeter confidence={row.confidence} compact />
              </li>
            );
          })}</ul> : <p className="pi-none">لا مسبقَ يحجز دفعةً الآن.</p>}
        </div>
        <div>
          <h4><AlertTriangle aria-hidden="true" /> ساعاتٌ مزدحمة</h4>
          {r.hotspots.length ? <ul className="pi-rows">{r.hotspots.map(row => (
            <li key={`${row.dayIndex}${row.from}`} className="pi-row pi-row-small" data-level={row.confidence.level}>
              <div className="pi-row-name"><b>{row.day} {row.from}–{row.to}</b><small>{row.calmer ? `الأهدأ ${row.calmer.from}` : row.reason}</small></div>
              <div className="pi-seat" aria-label={`المخطط ${row.planned} والأعلى تاريخياً ${row.historicalPeak}`}>
                <span><i style={{ inlineSize: `${Math.min(100, (row.planned / Math.max(row.planned, row.historicalPeak, 1)) * 100)}%` }} data-hot /></span>
                <small>{nf(row.planned)} / {nf(row.historicalPeak)}</small>
              </div>
              <ConfidenceMeter confidence={row.confidence} compact />
            </li>
          ))}</ul> : <p className="pi-none">لا ساعةً تتجاوز ما اعتاده القسم.</p>}
        </div>
      </div>

      {/* ── تأخّر التخرّج ── */}
      <div className="pi-block">
        <h4><GraduationCap aria-hidden="true" /> تأخّر التخرّج <ConfidenceMeter confidence={g.confidence} /></h4>
        {g.total ? <>
          <div className="pi-stack" role="img" aria-label={`في موعدهم ${g.onTime}، تأخر فصل ${g.delayed1}، فصلان فأكثر ${g.delayed2plus}، غير مقيَّمين ${g.unassessed}`}>
            <i style={{ inlineSize: seg(g.onTime) }} data-k="ok" /><i style={{ inlineSize: seg(g.delayed1) }} data-k="d1" /><i style={{ inlineSize: seg(g.delayed2plus) }} data-k="d2" /><i style={{ inlineSize: seg(g.unassessed) }} data-k="na" />
          </div>
          <p className="pi-stack-key"><span data-k="ok">في موعدهم <b>{nf(g.onTime)}</b></span><span data-k="d1">+١ فصل <b>{nf(g.delayed1)}</b></span><span data-k="d2">+٢ فأكثر <b>{nf(g.delayed2plus)}</b></span><span data-k="na">غير مقيَّمين <b>{nf(g.unassessed)}</b></span></p>
          {g.causes.length ? <ul className="pi-rows">{g.causes.slice(0, 4).map(cause => (
            <li key={cause.courseId} className="pi-row pi-row-small" data-level={cause.confidence.level}>
              <div className="pi-row-name"><b>{cause.name}</b><small>{cause.reason}</small></div>
              <b className="pi-blocked"><Users aria-hidden="true" />{nf(cause.delayedStudents)}</b>
              <ConfidenceMeter confidence={cause.confidence} compact />
            </li>
          ))}</ul> : null}
          <small className="pi-note">{g.note}</small>
        </> : <p className="pi-none">لا ملفّاتِ طلبةٍ قابلةً للتقييم.</p>}
      </div>

      <details className="sm-info pi-how">
        <summary><Info /> كيف تُحسب الثقة؟ <ChevronDown aria-hidden="true" /></summary>
        <p>تجمع أربعة أشياء: عددَ الفصول السابقة (٤ فأكثر = كامل) · ثباتَ الأرقام بينها · اتفاقَ التاريخ مع رغبات الطلبة الحيّة · اكتمالَ المدخلات (جدولٌ ناقص أو ملفّاتٌ غير مقيَّمة تخفّضها). فصلٌ واحد لا يتجاوز «منخفضة» أبداً، وبلا فصولٍ سابقة تُكتب «لا يكفي التاريخ». لا يُفعَّل إجراءٌ بضغطةٍ إلا من «متوسطة» فأعلى. هذا تقديرٌ من التاريخ والرغبات، لا وعدٌ ولا حجزُ مقعد.</p>
      </details>
    </section>
  );
}
