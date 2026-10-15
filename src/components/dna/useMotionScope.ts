/*
 * One-shot draw-in for a SCOPE (a list of rows, a strip of bars, a ring): a single
 * IntersectionObserver for the whole scope, never one per row. Presentation only.
 *
 *   phase === null   -> settled: the real, final state. This is also the SSR /
 *                       no-IntersectionObserver / reduced-motion / hidden-tab /
 *                       already-played output, so nothing is ever left hidden.
 *   phase === 'hold' -> armed before first paint: the CSS draws the "from" state.
 *   phase === 'go'   -> the scope entered the viewport: the CSS plays its transition
 *                       or keyframes (always without fill-mode: the settled style IS the
 *                       end state), then the attribute is removed again.
 *
 * Same entity (playKey) never replays after a remount, a filter or a poll. The play-once
 * memory is the journey's own (session storage), so one rule governs every reveal.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { journeyAlreadyPlayed, journeyKey, journeyThreshold, journeyReached, markPlayed, reducedMotion } from './useJourneyReveal';

export type MotionPhase = 'hold' | 'go' | null;

export interface MotionScopeOptions {
  /** Entity id: the same entity never replays. Without one the scope plays once per mount. */
  playKey?: string | number | null;
  /** Opt-in switch: false = never animate, always settled (e.g. no rows yet, or data still loading). */
  enabled?: boolean;
  /** Visible fraction of the scope that starts the draw. */
  threshold?: number;
  /** How long the 'go' phase lasts before the attribute is dropped (must cover the longest CSS delay + duration). */
  goMs?: number;
}

/** How long a draw may wait for the observer before it plays anyway. */
export const MOTION_FAILSAFE_MS = 6000;

/** Whether a scope should arm at all. Pure, so the final-state rules are testable. */
export function motionShouldArm(env: { hasObserver: boolean; reduced: boolean; hidden: boolean; played: boolean }): boolean {
  return env.hasObserver && !env.reduced && !env.hidden && !env.played;
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function useMotionScope<T extends HTMLElement = HTMLElement>({ playKey, enabled = true, threshold = 0.25, goMs = 1400 }: MotionScopeOptions = {}) {
  const ref = useRef<T | null>(null);
  const [phase, setPhase] = useState<MotionPhase>(null);
  const key = journeyKey(playKey);

  useIsoLayoutEffect(() => {
    setPhase(null);
    const node = ref.current;
    if (!enabled || !node) return;
    if (!motionShouldArm({
      hasObserver: typeof IntersectionObserver !== 'undefined',
      reduced: reducedMotion(),
      hidden: typeof document !== 'undefined' && document.visibilityState === 'hidden',
      played: journeyAlreadyPlayed(playKey),
    })) return;
    setPhase('hold');
    let fired = false;
    let settle = 0;
    const go = () => {
      if (fired) return;
      fired = true;
      observer.disconnect();
      markPlayed(playKey);
      setPhase('go');
      settle = window.setTimeout(() => setPhase(null), goMs);
    };
    const need = journeyThreshold(threshold, node.getBoundingClientRect().height, window.innerHeight);
    const observer = new IntersectionObserver(
      (entries) => { if (entries.some((entry) => journeyReached(entry, need))) go(); },
      { threshold: [need, Math.min(1, need + 0.25)] },
    );
    observer.observe(node);
    // Nothing may stay hidden: if the observer never reaches it, play anyway.
    const failsafe = window.setTimeout(go, MOTION_FAILSAFE_MS);
    return () => {
      observer.disconnect();
      window.clearTimeout(failsafe);
      window.clearTimeout(settle);
      // Torn down (StrictMode, or the scope changed) -> show the truth; the next setup re-arms.
      setPhase(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, threshold, goMs]);

  return { ref, phase, motionProps: phase ? ({ 'data-motion': phase } as const) : ({} as const) };
}
