import React from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronLeft,
  GitBranch,
  History,
  UsersRound,
  Zap,
} from "lucide-react";
import { Badge } from "./ui";
import type { AdCourse, FSchedule } from "../types";

export type LivingScene =
  | "pulse"
  | "topology"
  | "why"
  | "health"
  | "brief"
  | "genesis"
  | "memory"
  | "safety"
  | "meeting"
  | "copilot";

/**
 * Choosing which appointment the panel is talking about.
 *
 * The list used to read "112 · شعبة 4 · 11:00", which names nothing: a catalogue
 * number is not a course to anyone who is not holding the catalogue, and two
 * sections of the same course at the same hour on different days came out as two
 * identical lines. Every option now leads with the course, says who teaches it
 * and on which days, and keeps the code as a trailing mark — so the list can be
 * read rather than decoded, and the options are grouped by course so a long
 * department does not scroll as one flat run of numbers.
 */
export function ContextPicker({
  selectedId,
  rows,
  courseById,
  instructorById,
  onChange,
}: {
  selectedId: number;
  rows: FSchedule[];
  courseById: Map<number, AdCourse>;
  instructorById?: Map<number, { AdInstructorName?: string }>;
  onChange: (id: number) => void;
}) {
  const DAY_SHORT: Array<[keyof FSchedule, string]> = [
    ["fsunday", "أحد"], ["fmonday", "اثنين"], ["ftuesday", "ثلاثاء"],
    ["fwednesday", "أربعاء"], ["fthursday", "خميس"],
  ];
  const describe = (row: FSchedule) => {
    const course = courseById.get(row.AdCourseId);
    const name = row.AdCourseName || course?.CourseName || course?.CourseCode || "مقرر";
    const days = DAY_SHORT.filter(([key]) => Boolean(row[key])).map(([, label]) => label).join("·");
    const who = instructorById?.get(row.AdInstructorId)?.AdInstructorName || "";
    const code = course?.CourseCode ? ` [${course.CourseCode}]` : "";
    return `${name} — شعبة ${row.SCode}${who ? ` · ${who}` : ""}${days ? ` · ${days}` : ""} · ${row.fstarttime}${code}`;
  };

  const groups = new Map<string, FSchedule[]>();
  for (const row of rows) {
    const course = courseById.get(row.AdCourseId);
    const key = row.AdCourseName || course?.CourseName || course?.CourseCode || "مقرر";
    groups.set(key, [...(groups.get(key) || []), row]);
  }

  return (
    <div className="living-context-picker">
      <label>
        <span>السياق الحالي</span>
        <select
          value={selectedId || ""}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {[...groups.entries()].map(([name, list]) => (
            <optgroup key={name} label={name}>
              {list.map((row) => (
                <option key={row.id} value={row.id}>{describe(row)}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </div>
  );
}

export function PulseScene({
  living,
  onGo,
}: {
  living: any;
  onGo: (scene: LivingScene) => void;
}) {
  return (
    <div className="pulse-scene">
      <div className="pulse-title">
        <span className="pulse-rings">
          <i />
          <i />
          <i />
          <Activity />
        </span>
        <div>
          <small>نبض الجدول</small>
          <h3>{living.pulse?.message}</h3>
          <p>مرتّب حسب ما يستحق قرارك</p>
        </div>
      </div>
      <div className="pulse-decisions">
        {living.pulse?.items?.map((item: any, i: number) => (
          <article className={item.severity} key={i}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </div>
          <button
            type="button"
            aria-label={`فتح تفاصيل ${item.title}`}
            title={`فتح تفاصيل ${item.title}`}
            onClick={() =>
                onGo(
                  item.type === "room"
                    ? "health"
                    : item.type === "fairness" || item.type === "fragility"
                      ? "health"
                      : "topology",
                )
              }
            >
              <ChevronLeft />
            </button>
          </article>
        ))}
      </div>
      <div className="pulse-health">
        <article>
          <small>الجودة</small>
          <b>{living.health?.quality}</b>
        </article>
        <article>
          <small>المرونة</small>
          <b>{living.health?.resilience}</b>
        </article>
        <article>
          <small>العدالة</small>
          <b>{living.health?.fairness}</b>
        </article>
        <article className="wide">
          <small>قراءة صحة الجدول</small>
          <strong>{living.health?.descriptor}</strong>
        </article>
      </div>
    </div>
  );
}

/**
 * Where the collisions actually come from.
 *
 * The previous version drew a constellation: thirty-four labelled circles on
 * five invisible arcs, with a side list that read "instructor · مركزية 12 ·
 * مشاكل 3". A person looking at a timetable does not think in centrality, and
 * they cannot act on a dot. What they need is the answer to one question —
 * *which instructor, which hall, which hour is causing this* — ranked, named in
 * their own language, and with the number of collisions attached.
 *
 * So the map is a ranking, not a graph. Each row is one culprit: what kind of
 * thing it is, what it is called, how many collisions run through it, and a bar
 * that makes the worst one obvious without reading a single figure.
 */
export function TopologyScene({ topology }: { topology: any }) {
  if (!topology) {
    return (
      <div className="topology-empty">
        <div className="topology-empty-mark"><GitBranch /></div>
        <strong>لا تتوفر خريطة التعارضات لهذا الحساب</strong>
        <p>تحتاج هذه الشاشة إلى صلاحية إدارة كاملة لقراءة علاقات الجدول.</p>
      </div>
    );
  }

  const KIND: Record<string, { label: string; icon: React.ReactNode }> = {
    instructor: { label: "أستاذ", icon: <UsersRound /> },
    course: { label: "مقرر", icon: <History /> },
    section: { label: "شعبة", icon: <GitBranch /> },
    room: { label: "قاعة", icon: <Building2 /> },
    time: { label: "وقت", icon: <Activity /> },
  };

  const hotspots = (topology.hotspots || []).filter((h: any) => Number(h.issues) > 0);
  const worst = Math.max(1, ...hotspots.map((h: any) => Number(h.issues) || 0));
  const conflicts = Number(topology.conflicts || 0);

  return (
    <div className="topology-scene">
      <header className="topology-lead">
        <div>
          <small>خريطة التعارضات</small>
          <h3>{conflicts ? "من أين تأتي التعارضات" : "لا تعارض قائم"}</h3>
          <p>
            {conflicts
              ? "كل سطر سبب واحد: عالِجه من أعلى القائمة، فأعلى سطر يحل أكبر عدد من الاصطدامات."
              : "لا يوجد أستاذ ولا قاعة ولا ساعة يحمل اصطداماً في هذا الفصل."}
          </p>
        </div>
        <Badge tone={conflicts ? "warning" : "success"}>
          {conflicts} تعارض
        </Badge>
      </header>

      {hotspots.length ? (
        <ol className="topology-ranking">
          {hotspots.slice(0, 8).map((spot: any, index: number) => {
            const kind = KIND[spot.type] || { label: spot.type, icon: <Activity /> };
            const issues = Number(spot.issues) || 0;
            return (
              <li key={spot.id} className={index === 0 ? "lead" : ""}>
                <span className="rank-index">{index + 1}</span>
                <span className={`rank-kind kind-${spot.type}`} title={kind.label}>
                  {kind.icon}
                </span>
                <div className="rank-copy">
                  <strong>{spot.label}</strong>
                  <small>{kind.label}</small>
                </div>
                <div className="rank-weight">
                  <i aria-hidden="true"><b style={{ width: `${(issues / worst) * 100}%` }} /></i>
                  <em>{issues} تعارض</em>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="topology-clear">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <strong>لا يوجد مصدر تعارض</strong>
            <p>لا أستاذ مزدوج الحجز، ولا قاعة محجوزة مرتين، ولا ساعة مكتظة بما يمنع الاعتماد.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * What a proposed move would actually cost.
 *
 * The panel was hard to read for a simple reason: it printed four pairs of bare
 * numbers separated by an arrow, with no statement of which side was which and
 * no sign of whether the change was good. "73 ← 71" leaves the reader to work
 * out both the direction and the meaning. Each figure now says what it is, in
 * which direction it moved, and whether that direction is welcome — so the
 * answer is legible without arithmetic, which was the whole point of asking.
 */
export function WhyResult({
  data,
  onRemember,
}: {
  data: any;
  onRemember: () => void;
}) {
  const metrics: Array<{ label: string; before: number; after: number; lowerIsBetter: boolean; unit?: string }> = [
    { label: "جودة الجدول", before: data.before.score, after: data.after.score, lowerIsBetter: false },
    { label: "التعارضات", before: data.before.conflicts, after: data.after.conflicts, lowerIsBetter: true },
    { label: "فراغ الأستاذ", before: data.before.gap, after: data.after.gap, lowerIsBetter: true, unit: "د" },
    { label: "مخالفات القواعد", before: data.before.rules, after: data.after.rules, lowerIsBetter: true },
  ];

  return (
    <div className={`why-result ${data.warnings?.length ? "warn" : "good"}`}>
      <header>
        <span>{data.kind === "why-not" ? "لماذا لا؟" : "لماذا؟"}</span>
        <strong>{data.kind === "why-not" ? data.answer : data.verdict}</strong>
        <small>{data.guardrail}</small>
      </header>

      <div className="why-delta">
        {metrics.map(metric => {
          const change = Number(metric.after) - Number(metric.before);
          const better = metric.lowerIsBetter ? change < 0 : change > 0;
          const state = change === 0 ? "same" : better ? "better" : "worse";
          return (
            <article key={metric.label} className={state}>
              <small>{metric.label}</small>
              <b>
                <span className="was">{metric.before}{metric.unit || ""}</span>
                <ArrowLeft aria-hidden="true" />
                <span className="now">{metric.after}{metric.unit || ""}</span>
              </b>
              <em>
                {change === 0
                  ? "بلا تغيير"
                  : `${better ? "تحسّن" : "تراجع"} ${Math.abs(change)}${metric.unit || ""}`}
              </em>
            </article>
          );
        })}
      </div>

      <div className="why-columns">
        <section>
          <span>ما الذي يكسبه القرار؟</span>
          {data.positives?.length ? data.positives.map((x: string, i: number) => (
            <p key={i}><CheckCircle2 />{x}</p>
          )) : <p className="why-none">لا مكسب واضح يستحق الذكر.</p>}
        </section>
        <section>
          <span>الثمن أو المقايضة</span>
          {[...(data.tradeoffs || []), ...(data.warnings || [])].length
            ? [...(data.tradeoffs || []), ...(data.warnings || [])].map((x: string, i: number) => (
                <p key={i}><AlertTriangle />{x}</p>
              ))
            : <p className="why-none">لا ثمن ظاهر لهذا التغيير.</p>}
        </section>
      </div>

      {data.memory?.warning ? (
        <div className="why-memory">
          <History />
          <div>
            <strong>ذاكرة القرار</strong>
            <p>{data.memory.warning}</p>
          </div>
          <button onClick={onRemember}>افتح الذاكرة</button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Health and fairness, said once.
 *
 * The panel used to stack three identical rings, a list of tiny bars, a list of
 * numbered rooms and a column of percentages glued to their labels, all in the
 * same weight of grey — six competing readings in a column narrower than any of
 * them needed. It was not that any single element was wrong; it was that
 * nothing was allowed to be more important than anything else.
 *
 * So there is one headline reading, and beneath it three plain lists that each
 * answer one question: who carries more than their share, what breaks the most
 * if it fails, and which hall has no substitute. Each item is a name, a bar and
 * a number, in that order, every time.
 */
export function HealthScene({ living }: { living: any }) {
  const fairness = living.fairness;
  const frag = living.fragility;
  const rooms = living.roomIntelligence;
  const health = living.health || {};

  const dials: Array<{ key: string; label: string; value: number }> = [
    { key: "quality", label: "الجودة", value: Number(health.quality ?? 0) },
    { key: "resilience", label: "المرونة", value: Number(health.resilience ?? 0) },
    { key: "fairness", label: "العدالة", value: Number(health.fairness ?? 0) },
  ];
  const tone = (value: number) => (value >= 85 ? "good" : value >= 70 ? "warn" : "bad");

  const loads = (fairness?.profiles || []).slice(0, 6);
  const heaviest = Math.max(1, ...loads.map((p: any) => Number(p.weeklyHours ?? p.days ?? 0)));

  const fragile = [
    ...(frag?.roomRisk || []),
    ...(frag?.professorRisk || []),
    ...(frag?.dayRisk || []),
  ].sort((a: any, b: any) => b.impactPct - a.impactPct).slice(0, 5);

  const KIND: Record<string, string> = { room: "قاعة", day: "يوم", professor: "أستاذ", instructor: "أستاذ" };
  const singles = (rooms?.rooms || []).filter((r: any) => r.singlePoint).slice(0, 5);

  return (
    <div className="health-scene">
      <header className="health-lead">
        <div className="health-dials">
          {dials.map(dial => (
            <figure key={dial.key} className={`health-dial tone-${tone(dial.value)}`}>
              <svg viewBox="0 0 44 44" aria-hidden="true">
                <circle className="dial-track" cx="22" cy="22" r="18" />
                <circle
                  className="dial-value" cx="22" cy="22" r="18"
                  strokeDasharray={`${(dial.value / 100) * 2 * Math.PI * 18} ${2 * Math.PI * 18}`}
                />
              </svg>
              <b>{dial.value}</b>
              <figcaption>{dial.label}</figcaption>
            </figure>
          ))}
        </div>
        <div className="health-verdict">
          <small>قراءة الجدول</small>
          <strong>{health.descriptor || fairness?.label || "قراءة غير متاحة"}</strong>
        </div>
      </header>

      <div className="health-lists">
        <section className="health-list">
          <h4><UsersRound aria-hidden="true" />من يحمل أكثر</h4>
          {loads.length ? (
            <ul>
              {loads.map((profile: any) => {
                const value = Number(profile.weeklyHours ?? profile.days ?? 0);
                return (
                  <li key={profile.id}>
                    <span className="list-name">{profile.name}</span>
                    <i aria-hidden="true"><b style={{ width: `${(value / heaviest) * 100}%` }} /></i>
                    <em>{value} {profile.weeklyHours != null ? "ساعة" : "يوم"}</em>
                  </li>
                );
              })}
            </ul>
          ) : <p className="health-none">لا توجد بيانات حِمل كافية.</p>}
        </section>

        <section className="health-list">
          <h4><GitBranch aria-hidden="true" />ما يكسر الجدول لو تعطّل</h4>
          {fragile.length ? (
            <ul>
              {fragile.map((item: any) => (
                <li key={`${item.type}-${item.key}`} className={item.severity || ""}>
                  <span className="list-name">{item.label}<small>{KIND[item.type] || item.type}</small></span>
                  <i aria-hidden="true"><b style={{ width: `${Math.min(100, item.impactPct)}%` }} /></i>
                  <em>{item.impactPct}%</em>
                </li>
              ))}
            </ul>
          ) : <p className="health-none">لا توجد نقطة انهيار واضحة.</p>}
        </section>

        <section className="health-list">
          <h4><Building2 aria-hidden="true" />قاعات بلا بديل</h4>
          {singles.length ? (
            <ul>
              {singles.map((room: any) => (
                <li key={room.key} className="danger">
                  <span className="list-name">{room.code}/{room.hall}<small>{room.sessions} موعد</small></span>
                  <i aria-hidden="true"><b style={{ width: `${Math.min(100, room.risk)}%` }} /></i>
                  <em>{room.risk}</em>
                </li>
              ))}
            </ul>
          ) : <p className="health-none">كل قاعة مستخدمة لها بديل ممكن.</p>}
        </section>
      </div>
    </div>
  );
}

/**
 * The minute brief, drawn rather than written.
 *
 * The old version was a page of numbered sentences with the figures buried
 * inside them — "34 تعارض حرج — يوجد تداخل…" — which is a paragraph asking to be
 * parsed, not a briefing. A person glancing at this before a meeting wants the
 * shape of the term in one look: how it scores, what is worth their decision in
 * rank order, what moved since last time, and the one thing that would hurt
 * most if it broke. So each of those is now a figure with its number set as a
 * number, and the prose is reduced to what a figure cannot say.
 */
export function BriefScene({ brief }: { brief: any }) {
  if (!brief) {
    return (
      <div className="brief-scene brief-empty">
        <div className="brief-empty-mark"><Zap /></div>
        <strong>لا يوجد ملخص بعد</strong>
        <p>اختر فصلاً وقسماً فيهما مواعيد، وسيُبنى الملخص من الجدول نفسه خلال ثوانٍ.</p>
      </div>
    );
  }

  const scores: Array<{ key: string; label: string; value: number }> = [
    { key: "quality", label: "الجودة", value: Number(brief.quality ?? brief.scores?.quality ?? 0) },
    { key: "resilience", label: "المرونة", value: Number(brief.resilience ?? brief.scores?.resilience ?? 0) },
    { key: "fairness", label: "العدالة", value: Number(brief.fairness ?? brief.scores?.fairness ?? 0) },
  ].filter(item => Number.isFinite(item.value) && item.value > 0);

  const issues = (brief.topIssues || []).slice(0, 3);
  const tone = (value: number) => (value >= 85 ? "good" : value >= 70 ? "warn" : "bad");

  return (
    <div className="brief-scene">
      <header className="brief-hero">
        <div className="brief-hero-copy">
          <small>ملخص الدقيقة</small>
          <h3>{brief.title}</h3>
        </div>
        {scores.length ? (
          <div className="brief-scores">
            {scores.map(item => (
              <figure key={item.key} className={`brief-dial tone-${tone(item.value)}`}>
                <svg viewBox="0 0 44 44" aria-hidden="true">
                  <circle className="dial-track" cx="22" cy="22" r="18" />
                  <circle
                    className="dial-value" cx="22" cy="22" r="18"
                    strokeDasharray={`${(item.value / 100) * 2 * Math.PI * 18} ${2 * Math.PI * 18}`}
                  />
                </svg>
                <b>{item.value}</b>
                <figcaption>{item.label}</figcaption>
              </figure>
            ))}
          </div>
        ) : null}
      </header>

      {issues.length ? (
        <section className="brief-block">
          <h4>ما يحتاج قرارك</h4>
          <ol className="brief-issues">
            {issues.map((issue: any, index: number) => (
              <li key={index} className={issue.severity || "info"}>
                <span className="brief-rank">{index + 1}</span>
                <div>
                  <strong>{issue.title}</strong>
                  <p>{issue.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="brief-columns">
        <section className="brief-block">
          <h4>ما تغيّر</h4>
          <p className="brief-line">{brief.changeSummary || "لا توجد نقطة مقارنة محددة."}</p>
        </section>
        <section className="brief-block">
          <h4>ابدأ من هنا</h4>
          <p className="brief-line">{brief.bestDecision || "لا توجد نقطة بداية مقترحة."}</p>
        </section>
      </div>

      {brief.largestRisk ? (
        <section className="brief-risk">
          <AlertTriangle aria-hidden="true" />
          <div>
            <small>أكبر مخاطرة</small>
            <p>{brief.largestRisk}</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
