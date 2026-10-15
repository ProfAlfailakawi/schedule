/*
 * A number that counts up once and then rests. Presentation only: the text it
 * ends on is always exactly `format(value)`.
 *
 * The initial state is decided SYNCHRONOUSLY (useState initialiser), so there is
 * no "final value flashes, then restarts from 0":
 *   - starts at 0 only when it WILL animate (value > 0, motion allowed, not played
 *     before, and — when `observe` — an IntersectionObserver exists);
 *   - otherwise (reduced motion, no observer, SSR/tests, already played, hidden
 *     tab, zero) it renders the final value from the first paint.
 * After it has played, later value changes snap: a live refresh never re-rolls digits.
 * Assistive tech reads the final value only while the animation runs.
 */
import React, { useEffect, useRef, useState } from 'react';
import { journeyAlreadyPlayed, journeyKey, journeyReached, markPlayed, reducedMotion } from './useJourneyReveal';

const defaultFormat = (value: number) => value.toLocaleString('ar-KW-u-nu-latn');

export interface CountedProps {
  value: number;
  /** Milliseconds (kept <= 900). */
  duration?: number;
  /** Host-controlled trigger (false holds at 0). Default: play at once. */
  play?: boolean;
  /** Start only when the figure is really on screen (own observer, one-shot). */
  observe?: boolean;
  /** Same figure never replays in this session. */
  playKey?: string | number | null;
  /** The screen's own formatter; the default is the app's Latin-digit Arabic grouping. */
  format?: (value: number) => string;
}

/** Pure: does a count-up have to run at all? Everything else shows the final value. */
export function countShouldAnimate(env: { value: number; reduced: boolean; played: boolean; needsObserver: boolean; hasObserver: boolean; hidden?: boolean }): boolean {
  if (!(env.value > 0) || env.reduced || env.played || env.hidden) return false;
  return !env.needsObserver || env.hasObserver;
}

/** Pure: a zero is "nothing to count yet" — shown as is, but the one-shot stays armed for the first later positive value. */
export function countStaysEligible(env: { value: number; reduced: boolean; played: boolean }): boolean {
  return !(env.value > 0) && !env.reduced && !env.played;
}

const envNow = (value: number, observe: boolean, playKey?: string | number | null) => typeof window !== 'undefined' && countShouldAnimate({
  value,
  reduced: reducedMotion(),
  played: journeyAlreadyPlayed(playKey),
  needsObserver: observe,
  hasObserver: typeof IntersectionObserver !== 'undefined',
  hidden: observe && typeof document !== 'undefined' && document.visibilityState === 'hidden',
});

export function Counted({ value, duration = 900, play = true, observe = false, playKey, format = defaultFormat }: CountedProps) {
  const [shown, setShown] = useState<number>(() => (!play || envNow(value, observe, playKey) ? 0 : value));
  const [seen, setSeen] = useState(!observe);
  const done = useRef(false);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const node = useRef<HTMLSpanElement | null>(null);
  const key = journeyKey(playKey);

  // One-shot observer: the count starts when the figure is actually visible.
  useEffect(() => {
    if (!observe || seen || done.current || !play) return;
    const el = node.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((entry) => journeyReached(entry, 0.4))) { io.disconnect(); window.clearTimeout(failsafe); setSeen(true); }
    }, { threshold: [0.4, 0.7] });
    io.observe(el);
    const failsafe = window.setTimeout(() => { io.disconnect(); setSeen(true); }, 6000);
    return () => { io.disconnect(); window.clearTimeout(failsafe); };
  }, [observe, seen, play]);

  useEffect(() => {
    if (!play) { if (!done.current) setShown(0); return; }
    if (done.current) { setShown(value); return; }
    if (!envNow(value, observe, playKey)) {
      // Zero while data is still loading: show it, but keep the count-up for the first positive value.
      if (countStaysEligible({ value, reduced: reducedMotion(), played: journeyAlreadyPlayed(playKey) })) { setShown(value); return; }
      done.current = true; setShown(value); return;
    }
    if (!seen) return;
    let frame = 0;
    const base = Math.min(shownRef.current, value);
    const from = performance.now();
    const ms = Math.min(900, duration);
    const tick = (now: number) => {
      const p = Math.min(1, (now - from) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(base + (value - base) * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
      else { done.current = true; markPlayed(playKey); }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, play, seen, key]);

  const inner = shown === value
    ? format(shown)
    : <><span aria-hidden="true">{format(shown)}</span><span className="sr-only">{format(value)}</span></>;
  return observe ? <span ref={node} className="dna-counted">{inner}</span> : <>{inner}</>;
}
