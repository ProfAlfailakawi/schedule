import React from "react";
import { Activity, AlertTriangle, ArrowLeft, CheckCircle2, Gauge, History, RotateCcw, ShieldCheck, Waypoints, X } from "lucide-react";
import type { AdCourse, AdInstructor, FSchedule } from "../../types";
import { buildMoveCandidate, PHYSICS_DAYS } from "./physics";
import type { SchedulePhysicsDropRequest } from "./types";
import { formatScheduleTimeRange } from "../../utils/scheduleTime";

interface Props {
  request: SchedulePhysicsDropRequest;
  course?: AdCourse;
  instructor?: AdInstructor;
  busy?: boolean;
  isPowerAdmin?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const dayText = (row: FSchedule) => PHYSICS_DAYS.filter(day => Boolean((row as any)[day.key])).map(day => day.label).join("، ");
const signed = (value: unknown, suffix = "") => { const n = Number(value || 0); return `${n > 0 ? "+" : ""}${n}${suffix}`; };
/** A movement is good when it reduces cost or raises quality. */
const tone = (improvement: number) => improvement > 0 ? "impact-good" : improvement < 0 ? "impact-warn" : "";

export default function ScheduleDecisionPreview({ request, course, instructor, busy, isPowerAdmin = false, onConfirm, onCancel }: Props) {
  const { row, target, decision } = request;
  const candidate = buildMoveCandidate(row, target);
  const ripple = decision?.ripple;
  const bad = decision?.quality === "suboptimal" || decision?.quality === "impossible";
  const compact = !isPowerAdmin;

  return <div className="schedule-decision-preview" role="dialog" aria-modal="false" aria-label="معاينة قرار نقل الموعد">
    <div className="decision-preview-head">
      <span className={`decision-state quality-${decision?.quality || "unknown"}`}>{bad ? <AlertTriangle/> : <CheckCircle2/>}</span>
      <div><small>DECISION PREVIEW · لم يُحفظ شيء بعد</small><strong>{course?.CourseCode || row.AdCourseName} · شعبة {row.SCode}</strong><p>{instructor?.AdInstructorName || ""}</p></div>
      <button type="button" onClick={onCancel} aria-label="إلغاء"><X/></button>
    </div>

    <div className="decision-route">
      <section><small>من</small><b>{dayText(row)}</b><strong dir="ltr">{formatScheduleTimeRange(row.fstarttime, row.fendtime)}</strong><span>{row.AdRoomCode}/{row.AdRoomHall}</span></section>
      <i><ArrowLeft/></i>
      <section><small>إلى</small><b>{dayText(candidate)}</b><strong dir="ltr">{formatScheduleTimeRange(candidate.fstarttime, candidate.fendtime)}</strong><span>{candidate.AdRoomCode}/{candidate.AdRoomHall}</span></section>
    </div>

    <div className="decision-impact">
      {ripple?.delta ? <>
        <span className={tone(-Number(ripple.delta.conflicts || 0))}><Activity/><small>موانع</small><b>{signed(ripple.delta.conflicts)}</b></span>
        <span className={tone(-Number(ripple.delta.professorGap || 0))}><Gauge/><small>فراغ</small><b>{signed(ripple.delta.professorGap, "د")}</b></span>
        <span className={tone(Number(ripple.delta.quality || 0))}><ShieldCheck/><small>جودة</small><b>{signed(ripple.delta.quality)}</b></span>
        <span className={tone(-Number(ripple.delta.dayPressure || 0))}><Activity/><small>ضغط</small><b>{signed(ripple.delta.dayPressure, "%")}</b></span>
      </> : <p className="decision-no-data">لا توجد بيانات كافية لقياس الأثر اللحظي. المسار الحالي للحفظ ما زال متاحًا.</p>}
    </div>

    {decision?.fingerprint?.length ? <div className="decision-fingerprint-grid">{decision.fingerprint.slice(0, compact ? 3 : 5).map((item, index) => <article className={`tone-${item.tone || "neutral"}`} key={index}><small>{item.label}</small><strong>{item.value}</strong></article>)}</div> : null}

    <div className="decision-preview-columns">
      {decision?.reasons?.length ? <div className="decision-why"><b>{bad ? "لماذا يحتاج مراجعة؟" : "لماذا يستقر هنا؟"}</b>{decision.reasons.slice(0, compact ? 3 : 4).map((reason, index) => <span key={index}>{bad ? <AlertTriangle/> : <CheckCircle2/>}{reason}</span>)}</div> : null}
      {decision?.counterfactual?.bullets?.length ? <div className="decision-counterfactual"><b>{decision.counterfactual.title}</b>{decision.counterfactual.bullets.slice(0, compact ? 2 : 3).map((bullet, index) => <span key={index}>{bullet}</span>)}</div> : null}
    </div>

    <div className="decision-horizon-row">
      {decision?.horizon ? <div className={`decision-horizon tone-${decision.horizon.tone}`}><Waypoints/><div><strong>{decision.horizon.label}</strong><small>{decision.horizon.summary}</small></div></div> : null}
      {decision?.stress ? <div className={`decision-stress level-${decision.stress.level}`}><Gauge/><div><strong>{decision.stress.label}</strong><small>{decision.stress.summary}</small></div></div> : null}
    </div>

    {!compact && decision?.autopsy ? <div className="decision-autopsy">
      <div className="decision-autopsy-head"><History/><div><strong>{decision.autopsy.headline}</strong><small>ثقة القراءة: {decision.autopsy.confidence}</small></div></div>
      <p>{decision.autopsy.summary}</p>
      <div className="decision-autopsy-list">{decision.autopsy.bullets.map((bullet, index) => <span key={index}>{bullet}</span>)}</div>
    </div> : null}

    <div className="decision-preview-actions">
      <button type="button" className="decision-cancel" onClick={onCancel} disabled={busy}><RotateCcw/>إلغاء وإرجاع</button>
      <button type="button" className="decision-confirm" onClick={onConfirm} disabled={busy || decision?.quality === "impossible"}>{busy ? "جارٍ الحفظ…" : "تأكيد النقل"}</button>
    </div>
  </div>;
}
