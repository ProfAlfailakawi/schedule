import { useEffect, useMemo, useRef, useState } from "react";
import { safeStorage } from "../utils/safeStorage";
import useReducedMotion from "./SchedulePhysics/useReducedMotion";

/**
 * The entrance overture: a ~1.5s full-screen curtain shown once per browser
 * session, before anything else. Thin timetable lines — day rows and time
 * columns — sketch themselves across a soft veil, hold for one quiet beat,
 * then the whole sheet dissolves toward the real interface underneath.
 *
 * Deliberately an overture, not a show: transform + opacity only, no glow,
 * pointer-events disabled (a click or key anywhere simply skips ahead), and
 * it never mounts at all under prefers-reduced-motion or on a repeat visit
 * within the same session.
 */

const SEEN_KEY = "schedule-entrance-overture";

/** Synchronous check so the veil never flashes for someone who opted out of motion. */
const prefersReducedMotion = () => {
  try { return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false; }
  catch { return false; }
};

const shouldPlay = () => {
  if (typeof window === "undefined") return false;
  if (prefersReducedMotion()) return false;
  if (safeStorage.get(SEEN_KEY, "session")) return false;
  return true;
};

/* The timetable sketch: five day rows, six time columns, as fractions of the
   viewport. Sparse on purpose — a suggestion of the grid, not the grid. */
const ROWS = [0.22, 0.36, 0.5, 0.64, 0.78];
const COLS = [0.16, 0.3, 0.44, 0.58, 0.72, 0.86];

const TOTAL_MS = 1500;
const SKIP_FADE_MS = 180;

export default function EntranceOverture() {
  const [playing, setPlaying] = useState(shouldPlay);
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(false);
  const reducedMotion = useReducedMotion();

  // Mark the session immediately: an interrupted overture must not replay
  // on the next in-app reload.
  useEffect(() => {
    if (playing) safeStorage.set(SEEN_KEY, "1", "session");
  }, [playing]);

  useEffect(() => {
    if (!playing) return;
    let skipTimer = 0;
    const end = window.setTimeout(() => { doneRef.current = true; setPlaying(false); }, TOTAL_MS);
    const skip = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      setLeaving(true);
      skipTimer = window.setTimeout(() => setPlaying(false), SKIP_FADE_MS);
    };
    window.addEventListener("pointerdown", skip, true);
    window.addEventListener("keydown", skip, true);
    return () => {
      window.clearTimeout(end);
      window.clearTimeout(skipTimer);
      window.removeEventListener("pointerdown", skip, true);
      window.removeEventListener("keydown", skip, true);
    };
  }, [playing]);

  // Someone flipping reduced-motion on mid-overture ends it at once.
  useEffect(() => {
    if (reducedMotion && playing) { doneRef.current = true; setPlaying(false); }
  }, [reducedMotion, playing]);

  const css = useMemo(() => `
    .entrance-overture{position:fixed;inset:0;z-index:4000;pointer-events:none;
      background:color-mix(in srgb,var(--surface,#f7f8fa) 94%,var(--accent,#16745f) 6%);
      animation:entrance-overture-veil ${TOTAL_MS}ms ease forwards;will-change:opacity}
    .entrance-overture.leaving{animation:entrance-overture-out ${SKIP_FADE_MS}ms ease forwards}
    .entrance-overture-line{position:absolute;background:color-mix(in srgb,var(--accent,#16745f) 38%,transparent);
      opacity:0;will-change:transform,opacity}
    .entrance-overture-line.h{left:6%;right:6%;height:1px;transform:scaleX(0);transform-origin:right center;
      animation:entrance-overture-h 620ms cubic-bezier(.22,.61,.21,1) forwards}
    .entrance-overture-line.v{top:10%;bottom:10%;width:1px;transform:scaleY(0);transform-origin:center top;
      animation:entrance-overture-v 620ms cubic-bezier(.22,.61,.21,1) forwards}
    @keyframes entrance-overture-h{to{transform:scaleX(1);opacity:.55}}
    @keyframes entrance-overture-v{to{transform:scaleY(1);opacity:.4}}
    /* One quiet beat at ~60-72%, then the whole sheet dissolves. */
    @keyframes entrance-overture-veil{0%,60%{opacity:1}72%{opacity:.97}100%{opacity:0}}
    @keyframes entrance-overture-out{to{opacity:0}}
    @media (prefers-reduced-motion:reduce){.entrance-overture{display:none}}
  `, []);

  if (!playing) return null;

  return (
    <div className={`entrance-overture no-print${leaving ? " leaving" : ""}`} aria-hidden="true">
      <style>{css}</style>
      {ROWS.map((top, i) => (
        <span key={`h${i}`} className="entrance-overture-line h"
          style={{ top: `${top * 100}%`, animationDelay: `${i * 70}ms` }} />
      ))}
      {COLS.map((left, i) => (
        <span key={`v${i}`} className="entrance-overture-line v"
          style={{ left: `${left * 100}%`, animationDelay: `${180 + i * 60}ms` }} />
      ))}
    </div>
  );
}
