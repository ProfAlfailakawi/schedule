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
  | "emergency"
  | "health"
  | "brief"
  | "genesis"
  | "memory"
  | "safety"
  | "meeting"
  | "copilot";

export function ContextPicker({
  selectedId,
  rows,
  courseById,
  onChange,
}: {
  selectedId: number;
  rows: FSchedule[];
  courseById: Map<number, AdCourse>;
  onChange: (id: number) => void;
}) {
  return (
    <div className="living-context-picker">
      <label>
        <span>السياق الحالي</span>
        <select
          value={selectedId || ""}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {rows.map((row) => (
            <option key={row.id} value={row.id}>
              {courseById.get(row.AdCourseId)?.CourseCode || row.AdCourseName} ·
              شعبة {row.SCode} · {row.fstarttime}
            </option>
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

export function TopologyScene({ topology }: { topology: any }) {
  if (!topology)
    return (
      <div className="living-empty">لا تتوفر خريطة الأعصاب لهذا الحساب.</div>
    );
  const nodes = (topology.nodes || []).slice(0, 34);
  const positions = new Map<string, { x: number; y: number }>();
  const typeAngles: any = {
    instructor: 0.05,
    course: 0.23,
    section: 0.43,
    room: 0.67,
    time: 0.84,
  };
  const typeRadius: any = {
    instructor: 390,
    course: 290,
    section: 170,
    room: 300,
    time: 400,
  };
  const counts: any = {};
  nodes.forEach((n: any) => {
    counts[n.type] = (counts[n.type] || 0) + 1;
  });
  const seen: any = {};
  nodes.forEach((n: any) => {
    const idx = seen[n.type] || 0;
    seen[n.type] = idx + 1;
    const count = Math.max(1, counts[n.type]);
    const base = typeAngles[n.type] ?? 0;
    const angle = (base + (idx / count) * 0.15) * Math.PI * 2;
    const radius = typeRadius[n.type] || 260;
    positions.set(n.id, {
      x: 500 + Math.cos(angle) * radius,
      y: 290 + Math.sin(angle) * Math.min(radius * 0.58, 230),
    });
  });
  return (
    <div className="topology-scene">
      <div className="topology-copy">
        <div>
          <small>خريطة التعارضات</small>
          <h3>المشكلة ليست دائمًا “الثلاثاء”</h3>
          <p>ابدأ بالعقدة الأكبر أثراً</p>
        </div>
        <Badge tone={topology.conflicts ? "warning" : "success"}>
          {topology.conflicts} علاقة تعارض
        </Badge>
      </div>
      <div className="topology-stage">
        <svg viewBox="0 0 1000 580" role="img" aria-label="خريطة علاقات الجدول">
          {(topology.edges || []).slice(0, 120).map((e: any) => {
            const a = positions.get(e.source),
              b = positions.get(e.target);
            if (!a || !b) return null;
            return (
              <line
                key={e.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={e.weight > 4 ? "hot" : ""}
              />
            );
          })}
          {nodes.map((n: any) => {
            const p = positions.get(n.id)!;
            const r = Math.max(
              11,
              Math.min(30, 10 + Math.sqrt(n.centrality || 1) * 2.7),
            );
            return (
              <g
                key={n.id}
                className={`topology-node ${n.type} ${n.issues ? "issue" : ""}`}
              >
                <circle cx={p.x} cy={p.y} r={r} />
                <text x={p.x} y={p.y + r + 17} textAnchor="middle">
                  {String(n.label).slice(0, 18)}
                </text>
                {n.issues ? (
                  <text
                    x={p.x}
                    y={p.y + 4}
                    textAnchor="middle"
                    className="node-count"
                  >
                    {n.issues}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        <div className="topology-legend">
          <span>
            <i className="instructor" />
            أستاذ
          </span>
          <span>
            <i className="course" />
            مقرر
          </span>
          <span>
            <i className="section" />
            شعبة
          </span>
          <span>
            <i className="room" />
            قاعة
          </span>
          <span>
            <i className="time" />
            وقت
          </span>
        </div>
      </div>
      <div className="topology-hotspots">
        <span>أكثر العقد تأثيرًا</span>
        {topology.hotspots?.slice(0, 6).map((h: any, i: number) => (
          <article key={h.id}>
            <b>{i + 1}</b>
            <div>
              <strong>{h.label}</strong>
              <small>
                {h.type} · مركزية {h.centrality} · مشاكل {h.issues}
              </small>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function WhyResult({
  data,
  onRemember,
}: {
  data: any;
  onRemember: () => void;
}) {
  return (
    <div className={`why-result ${data.warnings?.length ? "warn" : "good"}`}>
      <header>
        <span>{data.kind === "why-not" ? "لماذا لا؟" : "لماذا؟"}</span>
        <strong>{data.kind === "why-not" ? data.answer : data.verdict}</strong>
        <small>{data.guardrail}</small>
      </header>
      <div className="why-delta">
        <article>
          <small>الجودة</small>
          <b>
            {data.before.score} <ArrowLeft /> {data.after.score}
          </b>
        </article>
        <article>
          <small>التعارضات</small>
          <b>
            {data.before.conflicts} <ArrowLeft /> {data.after.conflicts}
          </b>
        </article>
        <article>
          <small>فراغ الأستاذ</small>
          <b>
            {data.before.gap} <ArrowLeft /> {data.after.gap}
          </b>
        </article>
        <article>
          <small>القواعد</small>
          <b>
            {data.before.rules} <ArrowLeft /> {data.after.rules}
          </b>
        </article>
      </div>
      <div className="why-columns">
        <section>
          <span>ما الذي يكسبه القرار؟</span>
          {data.positives?.map((x: string, i: number) => (
            <p key={i}>
              <CheckCircle2 />
              {x}
            </p>
          ))}
        </section>
        <section>
          <span>الثمن أو المقايضة</span>
          {[...(data.tradeoffs || []), ...(data.warnings || [])].map(
            (x: string, i: number) => (
              <p key={i}>
                <AlertTriangle />
                {x}
              </p>
            ),
          )}
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

export function HealthScene({ living }: { living: any }) {
  const fairness = living.fairness,
    frag = living.fragility,
    rooms = living.roomIntelligence;
  return (
    <div className="health-scene">
      <div className="health-orbits">
        <article>
          <div style={{ "--v": living.health?.quality } as React.CSSProperties}>
            <b>{living.health?.quality}</b>
          </div>
          <span>الجودة</span>
        </article>
        <article>
          <div
            style={{ "--v": living.health?.resilience } as React.CSSProperties}
          >
            <b>{living.health?.resilience}</b>
          </div>
          <span>المرونة</span>
        </article>
        <article>
          <div
            style={{ "--v": living.health?.fairness } as React.CSSProperties}
          >
            <b>{living.health?.fairness}</b>
          </div>
          <span>العدالة</span>
        </article>
        <section>
          <small>صحة الجدول</small>
          <h3>{living.health?.descriptor}</h3>
          <p>
            الجدول لا يُقاس فقط بأنه صحيح؛ بل هل هو عادل وهل يتحمل فقدان قاعة أو
            أستاذ أو يوم؟
          </p>
        </section>
      </div>
      <div className="health-grid">
        <section>
          <header>
            <UsersRound />
            <div>
              <small>توازن الجدول</small>
              <strong>{fairness?.label}</strong>
            </div>
          </header>
          <div className="fairness-list">
            {fairness?.profiles?.slice(0, 7).map((p: any) => (
              <article key={p.id}>
                <span>{p.name}</span>
                <i>
                  <b
                    style={{
                      width: `${Math.min(100, Math.max(8, 50 + p.deltaFromAverage))}%`,
                    }}
                  />
                </i>
                <small>
                  {p.days} أيام · {p.gapMinutes}د فراغ · {p.late} متأخر
                </small>
              </article>
            ))}
          </div>
        </section>
        <section>
          <header>
            <GitBranch />
            <div>
              <small>نقاط الهشاشة</small>
              <strong>{frag?.label}</strong>
            </div>
          </header>
          <div className="fragility-list">
            {[
              ...(frag?.roomRisk || []),
              ...(frag?.professorRisk || []),
              ...(frag?.dayRisk || []),
            ]
              .sort((a: any, b: any) => b.impactPct - a.impactPct)
              .slice(0, 8)
              .map((r: any, i: number) => (
                <article key={`${r.type}-${r.key}`} className={r.severity}>
                  <b>{i + 1}</b>
                  <div>
                    <strong>{r.label}</strong>
                    <small>
                      {r.type === "room"
                        ? "قاعة"
                        : r.type === "day"
                          ? "يوم"
                          : "أستاذ"}{" "}
                      · يتأثر {r.impactPct}%
                    </small>
                  </div>
                </article>
              ))}
          </div>
        </section>
        <section>
          <header>
            <Building2 />
            <div>
              <small>كفاءة القاعات</small>
              <strong>
                {rooms?.singlePoints?.length || 0} نقاط اعتماد حساسة
              </strong>
            </div>
          </header>
          <div className="room-risk-list">
            {rooms?.rooms?.slice(0, 7).map((r: any) => (
              <article key={r.key}>
                <div>
                  <strong>
                    {r.code}/{r.hall}
                  </strong>
                  <small>
                    {r.sessions} مواعيد · استرداد {r.recoverabilityPct}%
                  </small>
                </div>
                <Badge
                  tone={
                    r.singlePoint
                      ? "danger"
                      : r.risk > 25
                        ? "warning"
                        : "success"
                  }
                >
                  مخاطرة {r.risk}
                </Badge>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function BriefScene({ brief }: { brief: any }) {
  if (!brief)
    return <div className="living-empty">لا يتوفر ملخص الدقيقة.</div>;
  return (
    <div className="brief-scene">
      <div className="brief-clock">
        <Zap />
        <strong>60</strong>
        <small>ثانية</small>
      </div>
      <div className="brief-paper">
        <small>ملخص الدقيقة</small>
        <h3>{brief.title}</h3>
        <p className="brief-summary">{brief.summary}</p>
        <section>
          <b>أهم ما يحتاج قرارك</b>
          {brief.topIssues?.map((x: any, i: number) => (
            <p key={i}>
              {i + 1}. {x.title} — {x.detail}
            </p>
          ))}
        </section>
        <section>
          <b>ما تغيّر</b>
          <p>{brief.changeSummary}</p>
        </section>
        <section>
          <b>أفضل نقطة تبدأ منها</b>
          <p>{brief.bestDecision}</p>
        </section>
        <section className="risk">
          <b>أكبر مخاطرة</b>
          <p>{brief.largestRisk}</p>
        </section>
      </div>
    </div>
  );
}
