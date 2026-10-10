/*
 * One-shot intro for a stepper: when it first scrolls into view its already-true
 * stations light one after another. Presentation only — the real step states
 * stay the truth; this hook only decides HOW MANY of the lit stations are shown
 * so far (`lit`), and never more than `target`.
 *
 *   lit === null  -> settled: render the real states (also the SSR / no-JS /
 *                    reduced-motion / already-played output).
 *   lit === n     -> intro running: station i shows its real state only if i < n.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface JourneyRevealOptions {
  /** Number of stations that are really lit (index of the last done/current + 1). */
  target: number;
  /** Number of stations in total; sets the pacing. */
  count: number;
  /** Milliseconds per station. Default: clamp(4000 / count, 350, 750). */
  stepMs?: number;
  /** Visible fraction of the stepper that starts the intro. */
  threshold?: number;
  /** Opt-in switch: false = never animate, always settled. */
  enabled?: boolean;
  /** Wait (stay at 0) while true, e.g. until data has loaded. */
  hold?: boolean;
  /** Entity id: the same entity never replays after a remount. */
  playKey?: string | number | null;
}

/** How long the last station keeps its single halo before the stepper settles. */
export const JOURNEY_SETTLE_MS = 1600;

const played = new Set<string>();
const STORAGE_PREFIX = 'journey-played:';

export const journeyStepMs = (count: number) => Math.min(750, Math.max(350, 4000 / Math.max(1, count)));

export function journeyTarget(states: ReadonlyArray<string>): number {
  let last = -1;
  states.forEach((state, i) => { if (state === 'done' || state === 'current') last = i; });
  return last + 1;
}

/** The state a station DISPLAYS while the intro is at `lit` (null = settled). */
export function journeyShown<S extends string>(state: S, index: number, lit: number | null): S | 'pending' {
  return lit === null || index < lit ? state : 'pending';
}

export function journeyAlreadyPlayed(playKey?: string | number | null): boolean {
  if (playKey == null) return false;
  const key = String(playKey);
  if (played.has(key)) return true;
  try { return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(STORAGE_PREFIX + key) === '1'; } catch { return false; }
}

function markPlayed(playKey?: string | number | null) {
  if (playKey == null) return;
  const key = String(playKey);
  played.add(key);
  try { sessionStorage.setItem(STORAGE_PREFIX + key, '1'); } catch { /* storage may be blocked */ }
}

/** Test hook: forget what has played. */
export function resetJourneyPlayed() { played.clear(); }

/**
 * A fixed ratio can be unattainable: an element taller than the viewport (a
 * stacked phone layout, a short window) never shows `threshold` of itself, so
 * the observer would never fire. Cap it at what the viewport can actually show.
 */
export function journeyThreshold(threshold: number, elementHeight: number, viewportHeight: number): number {
  if (!(elementHeight > 0) || !(viewportHeight > 0)) return threshold;
  return Math.max(0.05, Math.min(threshold, (0.9 * viewportHeight) / elementHeight));
}

/** The observer entry only starts the intro when enough of the stepper is really visible (isIntersecting is true at 1px). */
export function journeyReached(entry: { isIntersecting: boolean; intersectionRatio: number }, effectiveThreshold: number): boolean {
  return entry.isIntersecting && entry.intersectionRatio >= effectiveThreshold - 0.01;
}

/**
 * What the intro does next. Pure, so the convergence rule is testable: whatever
 * happens to the real target, an armed intro always ends at lit = null.
 */
export function journeyNext(lit: number | null, target: number, seen: boolean, hold: boolean): 'idle' | 'wait' | 'tick' | 'settle' {
  if (lit === null) return 'idle';
  if (!seen || hold) return 'wait';
  return lit >= target ? 'settle' : 'tick';
}

const reducedMotion = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// useLayoutEffect warns when a component is rendered on the server.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function useJourneyReveal<T extends HTMLElement = HTMLOListElement>({
  target,
  count,
  stepMs,
  threshold = 0.5,
  enabled = true,
  hold = false,
  playKey,
}: JourneyRevealOptions) {
  const ref = useRef<T | null>(null);
  const [lit, setLit] = useState<number | null>(null);
  const [seen, setSeen] = useState(false);
  const armed = useRef(false);
  const step = stepMs ?? journeyStepMs(count);
  const hasTarget = target > 0;

  // Arm once per mount: hide the lit stations before first paint so the final state never flashes.
  // It also re-runs when the target first becomes > 0 (data that loads after mount), so a
  // hold/loading stepper starts its intro when the journey arrives instead of appearing settled.
  useIsoLayoutEffect(() => {
    if (armed.current || !enabled || !hasTarget) return;
    if (typeof IntersectionObserver === 'undefined' || reducedMotion() || journeyAlreadyPlayed(playKey) || !ref.current) return;
    armed.current = true;
    setLit(0);
    const node = ref.current;
    const need = journeyThreshold(threshold, node.getBoundingClientRect().height, window.innerHeight);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => journeyReached(entry, need))) { observer.disconnect(); setSeen(true); }
      },
      { threshold: [need, Math.min(1, need + 0.25)] },
    );
    observer.observe(node);
    // Nothing may stay hidden: if the observer never reaches it, show the real state.
    const failsafe = window.setTimeout(() => { observer.disconnect(); setSeen(true); }, 6000);
    return () => { observer.disconnect(); window.clearTimeout(failsafe); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hasTarget]);

  // Run: tick lit up to the real target, hold the last halo, then settle. Depends on `target`, so a
  // target that grows (or shrinks) mid-intro re-plans instead of leaving a station pending.
  useEffect(() => {
    const next = journeyNext(lit, target, seen, hold);
    if (next === 'tick') {
      const timer = window.setTimeout(() => setLit((n) => (n === null ? null : Math.min(n + 1, target))), lit === 0 ? 120 : step);
      return () => window.clearTimeout(timer);
    }
    if (next === 'settle') {
      const timer = window.setTimeout(() => { markPlayed(playKey); setLit(null); }, JOURNEY_SETTLE_MS);
      return () => window.clearTimeout(timer);
    }
  }, [lit, target, seen, hold, step, playKey]);

  // The data went away (or the host disabled the intro) mid-flight: show the truth.
  useEffect(() => {
    if (lit !== null && (!enabled || target <= 0)) setLit(null);
  }, [enabled, target, lit]);

  return { ref, lit: enabled ? lit : null };
}
