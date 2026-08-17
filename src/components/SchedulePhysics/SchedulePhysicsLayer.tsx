import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, AlertTriangle, CheckCircle2, Gauge, GripVertical, Orbit, Radio, ShieldCheck, Waypoints } from "lucide-react";
import type { AdCourse, AdInstructor, FSchedule } from "../../types";
import type { SchedulePhysicsDragState } from "./types";
import { formatScheduleTimeRange } from "../../utils/scheduleTime";

interface Props {
  state: SchedulePhysicsDragState;
  overlayRef: React.RefObject<HTMLDivElement | null>;
  course?: AdCourse;
  instructor?: AdInstructor;
  isPowerAdmin?: boolean;
  variant?: "week" | "rooms" | "list";
}

const signed = (value: unknown, suffix = "") => {
  const n = Number(value || 0);
  return `${n > 0 ? "+" : ""}${n}${suffix}`;
};

export default function SchedulePhysicsLayer({ state, overlayRef, course, instructor, isPowerAdmin = false, variant = "week" }: Props) {
  /**
   * The reading panel measures itself.
   *
   * Its position used to be clamped against a hard-coded 340px, but the full
   * reading — reasons, metrics, fingerprint, stress, horizon, counterfactual —
   * runs far taller than that, so its lower half fell off the bottom of the
   * screen exactly when it had the most to say. Now the real height decides
   * where it may sit, and the stylesheet caps it to the viewport so a very
   * long verdict scrolls inside itself instead of escaping.
   */
  const hudRef = useRef<HTMLElement | null>(null);
  const [hudBox, setHudBox] = useState({ width: 340, height: 320 });
  useLayoutEffect(() => {
    const element = hudRef.current;
    if (!element) return;
    const { offsetWidth: width, offsetHeight: height } = element;
    setHudBox(current =>
      Math.abs(current.width - width) > 8 || Math.abs(current.height - height) > 8
        ? { width, height }
        : current);
  });

  const row = state.row as FSchedule | null;
  if (!row || state.phase === "idle" || state.phase === "armed" || typeof document === "undefined") return null;
  const decision = state.decision;
  const target = state.target;
  const ripple = decision?.ripple;
  const compact = !isPowerAdmin;
  const GAP = 14, EDGE = 14;
  const hudStyle: React.CSSProperties | undefined = target?.rect ? (() => {
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportWidth = viewport?.width || window.innerWidth;
    const viewportHeight = viewport?.height || window.innerHeight;
    const viewportRight = viewportLeft + viewportWidth;
    const viewportBottom = viewportTop + viewportHeight;
    const visibleHudHeight = Math.min(hudBox.height, Math.max(180, viewportHeight - EDGE * 2));
    // Prefer the side with room; fall back to whichever keeps it fully visible.
    const roomAfter = viewportRight - (target.rect.left + target.rect.width + GAP);
    const left = roomAfter >= hudBox.width + EDGE
      ? target.rect.left + target.rect.width + GAP
      : Math.max(viewportLeft + EDGE, target.rect.left - hudBox.width - GAP);
    return {
      left: Math.min(Math.max(viewportLeft + EDGE, left), Math.max(viewportLeft + EDGE, viewportRight - hudBox.width - EDGE)),
      top: Math.min(
        Math.max(viewportTop + EDGE, viewportBottom - visibleHudHeight - EDGE),
        Math.max(viewportTop + EDGE, target.rect.top - 12),
      ),
    };
  })() : undefined;

  return createPortal(<>
    <div ref={overlayRef} className={`schedule-physics-float physics-view-${variant} quality-${decision?.quality || "unknown"}`} aria-hidden="true">
      <div className="physics-float-handle"><GripVertical/></div>
      <div className="physics-float-copy">
        <strong>{course?.CourseCode || row.AdCourseName || "المقرر"}</strong>
        <span>{row.AdCourseName || course?.CourseName}</span>
        <small>{instructor?.AdInstructorName || ""}</small>
      </div>
      <div className="physics-float-meta"><b dir="ltr">{formatScheduleTimeRange(row.fstarttime, row.fendtime)}</b><small>{row.AdRoomCode}/{row.AdRoomHall}</small></div>
    </div>

    {target ? <aside ref={hudRef} className={`schedule-physics-hud quality-${decision?.quality || "unknown"} ${compact ? "compact" : "detailed"}`} style={hudStyle} aria-live="polite">
      <header>
        <span className="physics-hud-radar"><Radio/><i/><i/></span>
        <div><small>{target.label} · <b dir="ltr">{target.start}</b></small><strong>{decision?.title || "أقرأ أثر القرار…"}</strong></div>
      </header>

      <p>{decision?.summary || "أحسب الأثر قبل الإفلات."}</p>
      {decision?.loading ? <div className="physics-reading"><i/><span>القراءة الفورية جاهزة · أتأكد من الأثر الكامل…</span></div> : null}

      {decision?.reasons?.length ? <div className="physics-hud-reasons">{decision.reasons.slice(0, compact ? 2 : 3).map((reason, index) => <span key={index}>{decision.quality === "suboptimal" || decision.quality === "impossible" ? <AlertTriangle/> : <CheckCircle2/>}{reason}</span>)}</div> : null}

      {ripple?.delta ? <div className="physics-hud-metrics">
        <span><Activity/><b>{signed(ripple.delta.conflicts)}</b><small>مانع</small></span>
        <span><Gauge/><b>{signed(ripple.delta.professorGap, "د")}</b><small>فراغ</small></span>
        <span><ShieldCheck/><b>{signed(ripple.delta.quality)}</b><small>جودة</small></span>
      </div> : null}

      {!decision?.loading && decision?.fingerprint?.length ? <div className="physics-fingerprint-strip">{decision.fingerprint.slice(0, compact ? 3 : 5).map((item, index) => <span className={`tone-${item.tone || "neutral"}`} key={index}><small>{item.label}</small><b>{item.value}</b></span>)}</div> : null}

      {!decision?.loading && decision?.stress ? <div className={`physics-stress-chip level-${decision.stress.level}`}><Orbit/><div><strong>{decision.stress.label}</strong><small>{compact ? decision.stress.summary.split(".")[0] : decision.stress.summary}</small></div></div> : null}

      {!decision?.loading && decision?.horizon ? <div className={`physics-horizon-chip tone-${decision.horizon.tone}`}><Waypoints/><div><strong>{decision.horizon.label}</strong><small>{compact ? decision.horizon.summary.split(".")[0] : decision.horizon.summary}</small></div></div> : null}

      {!decision?.loading && !compact && decision?.counterfactual?.bullets?.length ? <div className="physics-counterfactual"><strong>{decision.counterfactual.title}</strong>{decision.counterfactual.bullets.slice(0, 2).map((bullet, index) => <span key={index}>{bullet}</span>)}</div> : null}

      {!decision?.loading && decision?.quality === "unknown" ? <small className="physics-no-data">لا توجد بيانات كافية — يمكنك إكمال المسار الحالي دون اعتماد على الفيزياء.</small> : null}
    </aside> : null}
  </>, document.body);
}
