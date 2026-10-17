import React from "react";
import { CalendarClock, Check, CircleHelp, GraduationCap, Lightbulb, UsersRound } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { pictogram, REASON_INFO, REASON_ORDER, topReason, type OutcomeCounts, type OutcomeReason } from "../utils/outcomeStory";

/**
 * ── ماذا حدث بعد التسجيل؟ — بالنقاط ───────────────────────────────────────────────
 * كل نقطةٍ طالبٌ أجاب «هل سجلت؟». خضراء: سجّل. ملوّنة: تعثّر، ولونُها سببُه. تحت كل مقرر: من تعثّر ولماذا
 * وما يفعله القسم، بجملةٍ واحدة لكل سبب. أعدادٌ لا أسماء.
 */
const ICON: Record<OutcomeReason, React.ReactNode> = {
  full: <UsersRound aria-hidden="true" />, prereq: <GraduationCap aria-hidden="true" />, conflict: <CalendarClock aria-hidden="true" />, other: <CircleHelp aria-hidden="true" />,
};

export interface StoryRow extends OutcomeCounts { courseId: number; name: string; code: string }

export function OutcomeLegend({ rows }: { rows: readonly OutcomeCounts[] }) {
  const sums = REASON_ORDER.map(reason => [reason, rows.reduce((s, r) => s + r[reason], 0)] as const).filter(([, n]) => n > 0);
  const total = sums.reduce((s, [, n]) => s + n, 0);
  const top = topReason(rows);
  if (!total) return null;
  return (
    <div className="os-legend">
      <div className="os-legend-head"><b>لماذا تعثّروا؟</b>{top ? <small>الأكثر: {REASON_INFO[top.reason].title}</small> : null}</div>
      <div className="os-stack" role="img" aria-label="توزيع أسباب التعثّر">
        {sums.map(([reason, n]) => <i key={reason} className={`d-${reason}`} style={{ inlineSize: `${(n / total) * 100}%` }} title={`${REASON_INFO[reason].title} · ${n}`} />)}
      </div>
      <ul>
        {sums.map(([reason, n]) => <li key={reason} className={`d-${reason}`}>{ICON[reason]}<span><b>{REASON_INFO[reason].title}</b><small>{countOf(n, AR.student)} · {REASON_INFO[reason].plain}</small></span></li>)}
      </ul>
      <small className="os-key"><i className="dot d-ok" /> سجّل <i className="dot d-full" /> تعثّر (اللون = السبب) · كل نقطةٍ طالبٌ أجاب</small>
    </div>
  );
}

export function OutcomeCourse({ row }: { key?: React.Key; row: StoryRow }) {
  const total = row.registered + row.stuck;
  const { dots, perDot } = pictogram(row);
  const reasons = REASON_ORDER.filter(reason => row[reason] > 0);
  return (
    <article className="os-card">
      <header>
        <div className="os-name"><b>{row.name}</b><span>{row.code}</span></div>
        <div className="os-count" aria-label={`تعثّر ${row.stuck} من ${total}`}><b>{row.stuck.toLocaleString("ar-KW-u-nu-latn")}</b><small>من {total.toLocaleString("ar-KW-u-nu-latn")} لم يسجّلوه</small></div>
      </header>
      {perDot === 1 ? (
        <div className="os-dots" role="img" aria-label={`${row.registered} سجّلوا و${row.stuck} تعثّروا`}>
          {dots.map((kind, i) => <i key={i} className={`dot d-${kind}`}>{kind === "ok" ? <Check aria-hidden="true" /> : null}</i>)}
        </div>
      ) : (
        <div className="os-bar" role="img" aria-label={`${row.registered} سجّلوا و${row.stuck} تعثّروا`}>
          <div className="os-stack">
            {(["ok", ...reasons] as const).map(kind => {
              const n = kind === "ok" ? row.registered : row[kind];
              return <i key={kind} className={`d-${kind}`} style={{ inlineSize: `${(n / total) * 100}%` }} title={`${n}`} />;
            })}
          </div>
          <div className="os-pcts">
            <span className="d-ok"><b>{row.registered.toLocaleString("ar-KW-u-nu-latn")}</b><i className="dot d-ok"><Check aria-hidden="true" /></i><small>سجّلوا · {Math.round((row.registered / total) * 100)}%</small></span>
            {reasons.map(reason => <span key={reason} className={`d-${reason}`}><b>{row[reason].toLocaleString("ar-KW-u-nu-latn")}</b><i className={`dot d-${reason}`} /><small>{REASON_INFO[reason].title} · {Math.round((row[reason] / total) * 100)}%</small></span>)}
          </div>
        </div>
      )}
      <ul className="os-reasons">
        {reasons.map(reason => (
          <li key={reason} className={`d-${reason}`}>
            <span className="os-ic">{ICON[reason]}</span>
            <div><b>{countOf(row[reason], AR.student)} — {REASON_INFO[reason].title}</b><small>{REASON_INFO[reason].plain}</small></div>
            <em><Lightbulb aria-hidden="true" /> {REASON_INFO[reason].action}</em>
          </li>
        ))}
      </ul>
    </article>
  );
}
