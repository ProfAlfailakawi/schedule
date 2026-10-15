/**
 * ── بروفةُ التسجيل ──────────────────────────────────────────────────────────
 *
 * ما سيحدث يومَ التسجيل لو سجّل الطلبةُ بحسب ما كتبوه: أيُّ مقرراتٍ ستزدحم، وأيُّها
 * مطلوبٌ ولا يُطرح، وكم طالباً في كل نافذة. أعدادٌ لا أسماء، وكلُّ رقمٍ يحمل أساسَه.
 *
 * وهي **تقديرٌ** من ملفّات الطلبة وجداولِ الأقسام (مسوّدةً أو معتمدة)، لا بياناتُ
 * التسجيل الرسمي ولا حجزُ مقعد. التشغيلُ لإدارة النظام؛ والقسمُ يرى مقرراتِه فحسب.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Layers, Play, RefreshCw, Ticket, Users } from "lucide-react";
import { EmptyState, MicroLoader, Notice, PageTitle, PrimaryButton } from "./ui";
import { AR, countOf } from "../utils/arabicCount";

interface Unmet { "not-offered": number; conflict: number; full: number; prereq: number; units: number }
interface CourseRow { courseId: number; code: string; name: string; sections: number; capacity: number; taken: number; wanted: number; seated: number; unmet: Unmet }
interface OutcomeRow { courseId: number; code: string; name: string; registered: number; stuck: number; full: number; prereq: number; conflict: number; other: number }
interface Outcome { term: { id: number; name: string } | null; answered: number; scoped: boolean; courses: OutcomeRow[] }
interface Summary {
  term: { id: number; name: string } | null;
  canRun: boolean;
  run: { ranAt: string; ranBy: string; students: number; withoutRules: number; defaulted: number; rounds: number; windows: number[]; scoped: boolean } | null;
  courses: CourseRow[];
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
const needsDecision = (c: CourseRow) => c.unmet.full > 0 || c.unmet["not-offered"] > 0;
const weight = (c: CourseRow) => c.unmet.full * 3 + c.unmet["not-offered"] * 2 + c.unmet.conflict;

export default function RegistrationRehearsal() {
  const [data, setData] = useState<Summary | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try { setData(await request("/api/simulation/summary")); setError(""); } catch (e: any) { setError(e.message); }
    try { setOutcome(await request("/api/simulation/outcome")); } catch { /* الجزءُ الثاني اختياري: لا يُسقط الشاشة */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async () => {
    setBusy(true); setError("");
    try { await request("/api/simulation/run", { method: "POST" }); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const rows = useMemo(() => [...(data?.courses || [])].sort((a, b) => weight(b) - weight(a) || b.wanted - a.wanted || a.code.localeCompare(b.code, "en")), [data]);
  const decide = rows.filter(needsDecision);
  const calm = rows.filter(c => !needsDecision(c));
  const shown = (all ? rows : decide).filter(c => !q.trim() || `${c.code} ${c.name}`.includes(q.trim()));

  if (!data && !error) return <MicroLoader />;
  const r = data?.run;
  const wantedTotal = rows.reduce((s, c) => s + c.wanted, 0), seatedTotal = rows.reduce((s, c) => s + c.seated, 0);
  const coverage = wantedTotal ? Math.round((seatedTotal / wantedTotal) * 100) : 0;
  const wishesPct = r && r.students ? Math.round(((r.students - r.defaulted) / r.students) * 100) : 0;
  const maxWindow = Math.max(1, ...(r?.windows || [1]));

  return (
    <div className="sm-page" dir="rtl">
      <PageTitle eyebrow="بروفة التسجيل" subtitle="لو سجّل الطلبةُ بحسب ما كتبوه: أين الزحام، وما المطلوب ولا يُطرح؟"
        action={data?.canRun ? (
          <PrimaryButton disabled={busy} onClick={run} data-guide-ignore="تشغيلُ البروفة داخل شاشةٍ مسجّلة في المرشد باسم page.simulation">
            {busy ? <RefreshCw size={16} className="sm-spin" /> : <Play size={16} />} {r ? "أعد البروفة" : "شغّل البروفة"}
          </PrimaryButton>
        ) : undefined}>بروفة يوم التسجيل</PageTitle>
      {error ? <Notice type="error" onDismiss={() => setError("")}>{error}</Notice> : null}
      {!data?.term ? <EmptyState title="لا فصلَ للبروفة" detail="تظهر حين يكون للفصل القادم تواريخُ طلبة." /> : !r ? (
        <EmptyState title="لم تُجرَ بروفةٌ بعد" detail={data.canRun ? "اضغط «شغّل البروفة» لتُبنى خططُ الطلبة من ملفّاتهم." : "تُجريها إدارةُ النظام حين تكتمل رغباتُ الطلبة."} />
      ) : (
        <>
          <div className="sm-kpis">
            <article className="sm-kpi"><span className="sm-ic"><Users /></span><b>{r.students.toLocaleString("ar-KW-u-nu-latn")}</b><small>من ملفّات الطلبة المكتملة</small>
              <div className="sm-meter" title={`${wishesPct}٪ كتبوا رغباتهم`}><i style={{ inlineSize: `${wishesPct}%` }} /></div><em>{wishesPct}٪ كتبوا رغباتهم</em></article>
            <article className="sm-kpi"><span className="sm-ic"><Layers /></span><b>{coverage}٪</b><small>من المطلوب وجد مقعداً</small>
              <div className="sm-meter"><i style={{ inlineSize: `${coverage}%` }} /></div><em>{countOf(seatedTotal, AR.seat)} من {countOf(wantedTotal, AR.seat)}</em></article>
            <article className={`sm-kpi${decide.length ? " hot" : ""}`}><span className="sm-ic"><AlertTriangle /></span><b>{decide.length}</b><small>{decide.length === 1 ? "مقررٌ يحتاج قراراً" : "مقرراتٍ تحتاج قراراً"}</small>
              <em>{decide.length ? "زحامٌ أو مطلوبٌ لا يُطرح" : "لا زحام ظاهراً"}</em></article>
            <article className="sm-kpi"><span className="sm-ic"><Ticket /></span><b>{r.rounds}</b><small>{r.rounds === 1 ? "نافذة" : "نوافذ"} مقترحة</small>
              <div className="sm-bars" aria-label="الطلبة في كل نافذة">{r.windows.map((n, i) => <span key={i} title={`النافذة ${i + 1}: ${n}`}><i style={{ blockSize: `${Math.max(8, (n / maxWindow) * 100)}%` }} /><u>{n}</u></span>)}</div></article>
          </div>

          <p className="sm-base">
            أساس الأرقام: {countOf(r.students, AR.profile)} من ملفّات الطلبة، أُجريت {new Date(r.ranAt).toLocaleDateString("ar-KW-u-nu-latn", { day: "numeric", month: "long" })}
            {r.withoutRules ? ` · ${countOf(r.withoutRules, AR.profile)} على صحيفةٍ بلا قواعد معتمدة (بُنيت بلا مسبقات)` : ""}
            {r.defaulted ? ` · ${countOf(r.defaulted, AR.profile)} بلا رغبات (افتُرضت ١٥ وحدة)` : ""}
            {r.scoped ? " · المعروض مقرراتُ قسمك فقط" : ""}. تقديرٌ لا بياناتُ التسجيل الرسمي.
          </p>

          {outcome && outcome.answered > 0 ? <OutcomeBlock outcome={outcome} predictedStudents={r.students} /> : null}

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
  const share = predictedStudents ? Math.round((outcome.answered / predictedStudents) * 100) : 0;
  return (
    <section className="sm-list sm-out">
      <header><h3>بعد التسجيل: ماذا قال الطلبة؟</h3></header>
      <div className="sm-kpis">
        <article className="sm-kpi"><span className="sm-ic"><Users /></span><b>{outcome.answered.toLocaleString("ar-KW-u-nu-latn")}</b><small>أجابوا «هل سجلت؟»</small><em>{share}٪ ممن شملتهم البروفة</em></article>
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
