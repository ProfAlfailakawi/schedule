/**
 * ── لوحة الجمهور ─────────────────────────────────────────────────────────────────
 *
 * ما تعرضه على الشركات حين تجلس معها: حجم الجمهور وولاؤه وأوقات ذروته، بأرقام حيّة
 * تتحدث كل دقيقة، وبلا اسمٍ واحد (الكليات «كلية ١، ٢…» بحسب الحجم). وضع العرض
 * يملأ الشاشة. كل رقمٍ تقديري يشرح طريقته في «كيف نحسب؟».
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Expand, Megaphone, Minimize } from "lucide-react";
import { EmptyState, MicroLoader, Notice, PageTitle, SecondaryButton, PrimaryButton } from "./ui";
import { AR, countOf } from "../utils/arabicCount";
import { CONTINUITY_MIN_STUDENTS, headlineTotals, type AudienceStats } from "../utils/audienceStats";
import { AUDIENCE_BASELINE } from "../utils/audienceBaseline";

type Payload = AudienceStats & { termChoices: Array<{ id: number; name: string }> };

const nf = new Intl.NumberFormat("ar-KW-u-nu-latn");
const fmt = (n: number) => nf.format(Math.round(n));
const pct = (n: number) => `${new Intl.NumberFormat("ar-KW-u-nu-latn", { maximumFractionDigits: 1 }).format(n)}%`;
const prefersReduced = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** رقمٌ يصعد من الصفر إلى قيمته، ويقفز إليها فوراً لمن يفضّل قلّة الحركة. */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(prefersReduced() ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (prefersReduced()) { setShown(value); return; }
    const start = performance.now(), base = from.current, span = 900;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / span);
      setShown(base + (value - base) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick); else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{fmt(shown)}</>;
}

function Bars({ points, label }: { points: Array<{ key: string; value: number; tip: string }>; label: string }) {
  const W = 760, H = 210, pb = 26, pt = 14;
  const max = Math.max(1, ...points.map(p => p.value));
  const step = W / Math.max(1, points.length);
  const bw = Math.max(3, Math.min(30, step * 0.66));
  return (
    <>
    <svg className="pt-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <line x1="0" x2={W} y1={H - pb} y2={H - pb} stroke="var(--line)" />
      <line x1="0" x2={W} y1={(H - pb + pt) / 2} y2={(H - pb + pt) / 2} stroke="var(--line)" strokeDasharray="3 6" />
      {points.map((p, i) => {
        const h = Math.max(p.value > 0 ? 2 : 0, (p.value / max) * (H - pb - pt));
        const x = W - step * (i + 1) + (step - bw) / 2;
        return <rect key={p.key} x={x} y={H - pb - h} width={bw} height={h} rx={4} fill="var(--accent)" opacity={0.9}><title>{p.tip}</title></rect>;
      })}
    </svg>
    {points.length > 1 && points.length <= 8
      ? <div className="pt-axis-few" aria-hidden="true">{points.map(p => <span key={p.key}><b>{fmt(p.value)}</b>{p.key}</span>)}</div>
      : null}
    {points.length > 8 || points.length < 2 ? <div className="pt-axis"><bdi dir="ltr">{points[0]?.key}</bdi><span>الذروة {fmt(max)}</span><bdi dir="ltr">{points[points.length - 1]?.key}</bdi></div> : null}
    </>
  );
}

function HBars({ rows }: { rows: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...rows.map(r => r.count));
  if (!rows.length) return <div className="pt-empty">لا بيانات بعد.</div>;
  return <div className="pt-hbar">{rows.slice(0, 8).map(r => <div key={r.label}><span>{r.label}</span><em><i style={{ inlineSize: `${(r.count / max) * 100}%` }} /></em><b>{fmt(r.count)}</b></div>)}</div>;
}

const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const SOURCE_LABEL: Record<string, string> = { me: "«مساري»", schedule: "جداول القسم والطلبة", status: "حالة الطلب", survey: "الاستبيان", staff: "بطاقة الأستاذ", app: "نظام SCHEDULE" };

export default function AudienceDashboard({ onNavigate }: { onNavigate?: (view: string) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [stage, setStage] = useState(false);
  const [stamp, setStamp] = useState<Date | null>(null);
  const root = useRef<HTMLDivElement>(null);

  /* لا اختيار فصل ولا زر تحديث: اللوحة للعرض العام وتتجدد وحدها كل دقيقة، والفصل هو الجاري. */
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/audience-stats", { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "تعذّر تحميل الأرقام.");
      setData(body); setError(""); setStamp(new Date());
    } catch (e: any) { setError(String(e?.message || e)); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const id = window.setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    return () => window.clearInterval(id);
  }, [load]);
  useEffect(() => {
    const onChange = () => setStage(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleStage = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen?.();
    } catch { setStage(s => !s); }
  };

  const visits = data?.visits;
  const maxHeat = useMemo(() => Math.max(1, ...(visits?.heat.flat() || [0])), [visits]);
  if (!data) return <div className="pt-page">{error ? <Notice type="error">{error}</Notice> : <MicroLoader label="يجهّز الأرقام…" />}</div>;

  const s = data;
  const head = headlineTotals(s);
  const sinceDate = new Date(`${AUDIENCE_BASELINE.asOf}T00:00:00Z`).toLocaleDateString("ar-KW-u-nu-latn", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  const hasVisits = (visits?.days || 0) > 0;
  const typeTotal = s.survey.current.byType.newCourse + s.survey.current.byType.conflict + s.survey.current.byType.graduate;
  const typeBars = [
    { k: "مقرر جديد", v: s.survey.current.byType.newCourse, c: "var(--accent)" },
    { k: "تعارض", v: s.survey.current.byType.conflict, c: "var(--brass,#c9822b)" },
    { k: "تخرّج", v: s.survey.current.byType.graduate, c: "var(--info,#3b82c4)" },
  ];

  return (
    <div className={`pt-page${stage ? " pt-stage" : ""}`} ref={root}>
      <PageTitle
        eyebrow="للإدارة الرئيسية"
        subtitle="أرقام الجمهور مجمّعة ومجهولة؛ مناسبة للعرض على الشركات."
        action={
          <div className="pt-tools">
            <PrimaryButton data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" onClick={() => void toggleStage()}>{document.fullscreenElement || stage ? <Minimize aria-hidden="true" size={16} /> : <Expand aria-hidden="true" size={16} />} وضع العرض</PrimaryButton>
          </div>
        }
      >لوحة الجمهور</PageTitle>

      {error ? <Notice type="error">{error}</Notice> : null}

      <section className="pt-hero" aria-label="الجمهور في لمحة">
        <span className="pt-eyebrow">SCHEDULE · نظام القرار الأكاديمي</span>
        <h2>جمهورٌ حقيقي يفتح البرنامج بنفسه، فصلاً بعد فصل</h2>
        <p>طلبةٌ يملؤون رغباتهم ويتابعون طلباتهم، وأساتذةٌ يفتحون بطاقاتهم ويرسلون جداولهم. أرقامٌ مجمّعة ومجهولة من واقع الاستخدام.</p>
        <div className="pt-live" style={{ marginTop: 14 }}><i aria-hidden="true" /> تحديثٌ تلقائي كل دقيقة{stamp ? ` · آخر تحديث ${stamp.toLocaleTimeString("ar-KW-u-nu-latn", { hour: "2-digit", minute: "2-digit" })}` : ""}</div>
      </section>

      <section className="pt-card pt-estimates" aria-label="الجمهور منذ البداية">
        <h3>الجمهور منذ {AUDIENCE_BASELINE.since}</h3>
        <p className="pt-sub">بحسب إدارة النظام حتى {sinceDate}، ويُضاف إليها ما يُقاس بعدها.</p>
        <div className="pt-kpis">
          <div className="pt-kpi"><b><em className="pt-more">حوالي</em> <CountUp value={head.students} /></b><span>إجمالي الطلبة المستفيدين</span></div>
          <div className="pt-kpi"><b><em className="pt-more">حوالي</em> <CountUp value={head.visits} /></b><span>إجمالي دخول الطلبة</span></div>
          <div className="pt-kpi"><b><em className="pt-more">حوالي</em> <CountUp value={AUDIENCE_BASELINE.instructors} /></b><span>أعضاء هيئة التدريس</span></div>
          <div className="pt-kpi"><b><em className="pt-more">حوالي</em> <CountUp value={head.instructorOpens} /></b><span>إجمالي دخول أعضاء هيئة التدريس</span></div>
        </div>
      </section>

      <div className="pt-kpis">
        <div className="pt-kpi"><b><CountUp value={s.instructors.opened} /></b><span>فتحوا بطاقاتهم هذا الفصل</span><small>أعضاء هيئة التدريس في {s.term?.name || "الفصل الجاري"}</small></div>
        <div className="pt-kpi"><b><em className="pt-more">أكثر من</em> {pct(head.instructorOpenRate)}</b><span>نسبة فتح بطاقات الأساتذة</span><small>التزامٌ عالٍ يعني جمهوراً منتبهاً</small></div>
        <div className="pt-kpi"><b>{hasVisits ? <CountUp value={visits!.last30} /> : "—"}</b><span>زيارة آخر 30 يوماً</span><small>{hasVisits ? `مقيسة منذ ${visits!.since}` : "القياس يبدأ بأول زيارة بعد التفعيل"}</small></div>
      </div>

      <div className="pt-grid2">
        <section className="pt-card">
          <h3>الزيارات اليومية</h3>
          <p className="pt-sub">متصفحٌ واحد = زيارةٌ واحدة في اليوم لكل نوع صفحة (تقدير مجهول).</p>
          {hasVisits ? <>
            <Bars label="الزيارات اليومية آخر 30 يوماً" points={visits!.series.map(p => ({ key: p.day.slice(5), value: p.count, tip: `${p.day} · ${fmt(p.count)}` }))} />
            <div className="pt-legend">
              <span style={{ ["--c" as any]: "var(--accent)" }}>اليوم {fmt(visits!.today)}</span>
              <span style={{ ["--c" as any]: "var(--brass,#c9822b)" }}>7 أيام {fmt(visits!.last7)}</span>
              <span style={{ ["--c" as any]: "var(--info,#3b82c4)" }}>جوال {pct(visits!.mobileRate)}</span>
              <span style={{ ["--c" as any]: "var(--success,#1f9d6b)" }}>عائدون {pct(visits!.returningRate)}</span>
              {visits!.installs ? <span style={{ ["--c" as any]: "var(--ink)" }}>تثبيت التطبيق {fmt(visits!.installs)}</span> : null}
            </div>
          </> : <div className="pt-empty">القياس فعّال ويتراكم تلقائياً. أول رقمٍ يظهر بعد أول زيارةٍ للطلبة أو الأساتذة.</div>}
        </section>

        <section className="pt-card">
          <h3>من أين يأتي الزوار؟</h3>
          <p className="pt-sub">توزيع الزيارات حسب نوع الصفحة.</p>
          {hasVisits && visits!.bySource.length ? <HBars rows={visits!.bySource.map(x => ({ label: SOURCE_LABEL[x.source] || x.source, count: x.count }))} /> : <div className="pt-empty">لا بيانات بعد.</div>}
        </section>
      </div>

      <section className="pt-card">
        <h3>أوقات الذروة</h3>
        <p className="pt-sub">{hasVisits && visits!.peakDay ? `أنشط الأيام: ${visits!.peakDay}. ` : ""}كل خانة ساعة بتوقيت الكويت؛ الأغمق أكثر زيارة. الإعلان في الذروة يصل لأكبر عدد.</p>
        {hasVisits ? (
          <div className="pt-heat" role="img" aria-label="خريطة حرارية لأوقات الزيارة">
            <span />{Array.from({ length: 24 }, (_, h) => <span key={h} className="h">{h % 3 === 0 ? h : ""}</span>)}
            {DAYS.map((d, di) => <React.Fragment key={d}><span className="d">{d}</span>{visits!.heat[di].map((v, h) => <i key={h} style={{ ["--o" as any]: v ? Math.max(0.12, v / maxHeat) : 0.05 }} title={`${d} ${h}:00 · ${fmt(v)}`} />)}</React.Fragment>)}
          </div>
        ) : <div className="pt-empty">تظهر الخريطة بعد أيامٍ من القياس.</div>}
      </section>

      <div className="pt-grid2">
        <section className="pt-card">
          <h3>نموّ الاستبيان عبر الفصول</h3>
          <p className="pt-sub">طلبةٌ فريدون أجابوا في كل فصل.</p>
          {s.survey.terms.length ? <Bars label="الطلبة لكل فصل" points={[...s.survey.terms].reverse().map(t => ({ key: t.termName, value: t.students, tip: `${t.termName} · ${fmt(t.students)}` }))} /> : <div className="pt-empty">لا إجابات بعد.</div>}
          <p className="pt-note">إجمالي كل الفصول: طلبةٌ فريدون {fmt(s.survey.allTimeStudents)}، و{countOf(s.survey.allTimeAnswers, AR.answer)}.</p>
        </section>

        <section className="pt-card">
          <h3>ماذا يطلب الطلبة؟</h3>
          <p className="pt-sub">{s.term?.name || "الفصل الجاري"} · {countOf(s.survey.current.answers, AR.request)} من {countOf(s.survey.current.students, AR.student)}.</p>
          {typeTotal ? <>
            <div className="pt-split" role="img" aria-label="توزيع أنواع الطلبات">{typeBars.map(b => <i key={b.k} style={{ inlineSize: `${(b.v / typeTotal) * 100}%`, background: b.c }} />)}</div>
            <div className="pt-legend">{typeBars.map(b => <span key={b.k} style={{ ["--c" as any]: b.c }}>{b.k} {fmt(b.v)}</span>)}</div>
          </> : <div className="pt-empty">لا طلبات في هذا الفصل بعد.</div>}
          {s.survey.current.byDay.length ? <div style={{ marginTop: 14 }}><Bars label="الطلبات اليومية" points={[...s.survey.current.byDay].slice(-30).reverse().map(d => ({ key: d.day.slice(5), value: d.count, tip: `${d.day} · ${fmt(d.count)}` }))} /></div> : null}
        </section>
      </div>

      <section className="pt-card">
        <h3>استمرارية الطلبة عبر الفصول</h3>
        <p className="pt-sub">من أجاب في فصلٍ ثم أجاب في الفصل التالي. الطالب قد يرجع باستمرار دراسته لا بولائه وحده.</p>
        {s.continuity.length ? <>
          <div className="pt-kpis">
            <div className="pt-kpi"><b>{pct(s.continuity[0].rate)}</b><span>استمرّوا من {s.continuity[0].fromTerm} إلى {s.continuity[0].toTerm}</span><small>{countOf(s.continuity[0].stayed, AR.student)} من {countOf(s.continuity[0].before, AR.student)}</small></div>
          </div>
          {s.continuity.length > 1 ? <div style={{ marginTop: 14 }}><Bars label="نسبة الاستمرارية بين الفصول" points={s.continuity.slice(0, 8).map(p => ({ key: p.toTerm, value: p.rate, tip: `${p.fromTerm} ← ${p.toTerm} · ${pct(p.rate)} (${fmt(p.stayed)} من ${fmt(p.before)})` }))} /></div> : null}
          <p className="pt-note">من بصمات الاستبيان وحدها، فلا تشمل من لم يُجب. إن كان الفصل الأخير لم يكتمل فقد ترتفع نسبته.</p>
        </> : <div className="pt-empty">تظهر حين يتوفر فصلان متتاليان وعيّنة كافية من الإجابات.</div>}
      </section>

      <section className="pt-card">
        <h3>المقررات الأكثر طلباً</h3>
        <p className="pt-sub">طلبةٌ فريدون يريدون المقرر في رغباتهم أو طلباتهم هذا الفصل. للجهات التعليمية والتدريبية أن ترى ما يبحث عنه الطلبة.</p>
        {s.demand.top.length ? <HBars rows={s.demand.top.map(d => ({ label: d.name, count: d.students }))} /> : <div className="pt-empty">لا مقرر بلغ حدّ الخصوصية بعد (يلزم {countOf(s.demand.minStudents, AR.student)} مختلفين على الأقل لكل مقرر).</div>}
        <p className="pt-note">حدّ الخصوصية: لا يظهر مقررٌ يطلبه أقل من {countOf(s.demand.minStudents, AR.student)} مختلفين{s.demand.hidden ? `؛ أُخفي ${countOf(s.demand.hidden, AR.course)} لهذا السبب` : ""}. أعدادٌ مجمّعة بلا أسماء.</p>
      </section>

      <div className="pt-grid2">
        <section className="pt-card">
          <h3>تفاعل الأساتذة هذا الفصل</h3>
          <p className="pt-sub">من وصلته بطاقته، ومن فتحها، ومن أرسل منها.</p>
          {s.instructors.invited ? (
            <div className="pt-funnel">
              <div style={{ ["--w" as any]: "100%" }}><span>وصلتهم البطاقة</span><b>{fmt(s.instructors.invited)}</b></div>
              <div style={{ ["--w" as any]: `${s.instructors.openRate}%` }}><span>فتحوها</span><b>{fmt(s.instructors.opened)} · {pct(s.instructors.openRate)}</b></div>
              <div style={{ ["--w" as any]: `${s.instructors.submitRate}%` }}><span>أرسلوا طلباً</span><b>{fmt(s.instructors.submitted)} · {pct(s.instructors.submitRate)}</b></div>
            </div>
          ) : <div className="pt-empty">لا بطاقات مُرسلة في هذا الفصل.</div>}
        </section>

        <section className="pt-card">
          <h3>التوزيع على الكليات</h3>
          <p className="pt-sub">أرقام فقط، بلا أسماء. مرتّبة بالحجم.</p>
          <HBars rows={s.survey.current.byCollege.length ? s.survey.current.byCollege : s.students.byCollege} />
          <p className="pt-note">ملفات «مساري»: {fmt(s.students.profiles)} · نشط خلال 7 أيام {fmt(s.students.active7)} · خلال 30 يوماً {fmt(s.students.active30)}.</p>
        </section>
      </div>

      <section className="pt-card">
        <h3>الإعلانات</h3>
        <p className="pt-sub">ملخص الحملات الجارية.</p>
        {s.ads.endingSoon ? <div className="pt-alert" role="status"><Megaphone aria-hidden="true" size={18} /> {countOf(s.ads.endingSoon, AR.campaign)} تنتهي خلال 7 أيام؛ تواصل مع أصحابها للتجديد.</div> : null}
        <div className="pt-kpis" style={{ marginTop: 12 }}>
          <div className="pt-kpi"><b>{fmt(s.ads.live)}</b><span>الحملات العاملة الآن</span></div>
          <div className="pt-kpi"><b>{fmt(s.ads.impressions)}</b><span>ظهور مرئي</span></div>
          <div className="pt-kpi"><b>{fmt(s.ads.clicks)}</b><span>النقرات الصحيحة</span></div>
          <div className="pt-kpi"><b>{pct(s.ads.ctr)}</b><span>نسبة النقر</span></div>
        </div>
        {s.adsBySlot.length ? <>
          <h4 style={{ margin: "16px 0 8px" }}>أداء كل موقع إعلاني</h4>
          <div className="pt-slots" role="table" aria-label="أداء الإعلانات حسب الموقع">
            <div role="row" className="pt-slots-head"><span>الموقع</span><span>ظهور</span><span>نقرات</span><span>نسبة النقر</span></div>
            {s.adsBySlot.map(r => <div key={r.slot} role="row"><span>{r.label}</span><span>{fmt(r.impressions)}</span><span>{fmt(r.clicks)}</span><b>{pct(r.ctr)}</b></div>)}
          </div>
          <p className="pt-note">نسبة النقر لكل موقع من حملاته كلها. تُقارَن المواقع بحذر ما لم يبلغ ظهور كلٍّ منها بضعة آلاف.</p>
        </> : null}
        {onNavigate ? <div style={{ marginTop: 12 }}><SecondaryButton data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" onClick={() => onNavigate("ads")}><Megaphone aria-hidden="true" size={16} /> إدارة الإعلانات</SecondaryButton></div> : null}
      </section>

      <details className="pt-how">
        <summary>كيف نحسب هذه الأرقام؟</summary>
        <ul>
          <li><b>الطلبة المؤكَّدون:</b> الأكبر من عدد الطلبة الفريدين في الاستبيان وعدد ملفات «مساري». نعرف الطالب ببصمةٍ مشفّرة لا باسمه، فلا يُعدّ مرتين.</li>
          <li><b>الزيارات:</b> إشارةٌ مجهولة واحدة لكل متصفحٍ في اليوم لكل نوع صفحة. تقدير؛ فمن يمسح بيانات متصفحه قد يُعدّ مرتين، ومن يمنع التخزين يُعدّ كل مرة.</li>
          <li><b>العائدون والجوال:</b> من الإشارة نفسها؛ لا تُحفظ أي هوية أو عنوان.</li>
          <li><b>الاستمرارية:</b> نسبة طلبة فصلٍ ما (ببصمات الاستبيان) الذين أجابوا أيضاً في الفصل التالي له مباشرةً، وبعيّنةٍ لا تقل عن {countOf(CONTINUITY_MIN_STUDENTS, AR.student)}؛ دونها لا تظهر نسبة.</li>
          <li><b>أداء المواقع:</b> ظهورٌ ونقراتٌ صحيحة لكل موقع إعلاني، من حملاته كلها.</li>
          <li><b>الكليات:</b> مرتّبة بالحجم ومسمّاة بأرقام؛ لا تُكشف أسماؤها.</li>
          <li><b>الجمهور منذ {AUDIENCE_BASELINE.since}:</b> أرقامٌ بحسب إدارة النظام حتى {AUDIENCE_BASELINE.asOf}، ويُضاف إلى الطلبة المستفيدين وإلى مرّات الدخول ما يُقاس بعده؛ أما أعضاء هيئة التدريس فرقمٌ ثابت لا يتغير بالقياس. ونسبة فتح البطاقات حدٌّ أدنى 90% يظهر المقيس إن زاد عليه.</li>
          <li>القياس يبدأ من يوم تفعيله ولا يرجع إلى الماضي؛ أما الاستبيان وبطاقات الأساتذة فمن سجلات التشغيل كاملة.</li>
        </ul>
      </details>

      <section className="pt-kit print-only" aria-hidden="true">
        <header>
          <span className="pt-kit-brand">SCHEDULE · نظام القرار الأكاديمي</span>
          <h2>ملف الجمهور</h2>
          <small>{stamp ? stamp.toLocaleDateString("ar-KW-u-nu-latn", { year: "numeric", month: "long", day: "numeric" }) : ""}</small>
        </header>
        <div className="pt-kit-kpis">
          <div><b><em>حوالي</em> {fmt(head.students)}</b><span>الطلبة الذين استخدموا النظام منذ {AUDIENCE_BASELINE.since}</span></div>
          <div><b><em>حوالي</em> {fmt(head.visits)}</b><span>زيارة منذ {AUDIENCE_BASELINE.since}</span></div>
          <div><b><em>حوالي</em> {fmt(head.instructorOpens)}</b><span>فتحٌ لبطاقات أعضاء هيئة التدريس</span></div>
          <div><b><em>أكثر من</em> {pct(head.instructorOpenRate)}</b><span>نسبة فتح بطاقات الأساتذة</span></div>
        </div>
        {s.continuity.length ? <p className="pt-kit-line">استمرارية الطلبة من {s.continuity[0].fromTerm} إلى {s.continuity[0].toTerm}: <b>{pct(s.continuity[0].rate)}</b></p> : null}
        {hasVisits && visits!.peakDay ? <p className="pt-kit-line">أنشط أيام الأسبوع: <b>{visits!.peakDay}</b></p> : null}
        {s.demand.top.length ? <div className="pt-kit-block"><h3>ما يطلبه الطلبة هذا الفصل</h3><ol>{s.demand.top.slice(0, 5).map(d => <li key={d.name}>{d.name}</li>)}</ol></div> : null}
        {s.adsBySlot.length ? <div className="pt-kit-block"><h3>مواقع الإعلان</h3><ul>{s.adsBySlot.slice(0, 4).map(r => <li key={r.slot}>{r.label} · نسبة النقر <b>{pct(r.ctr)}</b></li>)}</ul></div> : null}
        <footer>أرقامٌ مجمّعة ومجهولة، بلا اسمٍ ولا هوية. الإجماليات منذ {AUDIENCE_BASELINE.since} بحسب إدارة النظام حتى {AUDIENCE_BASELINE.asOf}، ثم يُضاف إليها ما يُقاس بعدها.</footer>
      </section>
    </div>
  );
}
