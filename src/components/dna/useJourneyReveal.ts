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
  const targetRef = useRef(target);
  targetRef.current = target;
  const step = stepMs ?? journeyStepMs(count);

  // Arm once: hide the lit stations before first paint so the final state never flashes.
  useIsoLayoutEffect(() => {
    if (armed.current || !enabled) return;
    if (typeof IntersectionObserver === 'undefined' || reducedMotion() || journeyAlreadyPlayed(playKey)) return;
    if (targetRef.current <= 0 || !ref.current) return;
    armed.current = true;
    setLit(0);
    const node = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); setSeen(true); }
      },
      { threshold },
    );
    observer.observe(node);
    // Nothing may stay hidden: if the observer never fires, show the real state.
    const failsafe = window.setTimeout(() => { observer.disconnect(); setSeen(true); }, 6000);
    return () => { observer.disconnect(); window.clearTimeout(failsafe); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Run: tick lit up to the real target, hold the last halo, then settle.
  useEffect(() => {
    if (lit === null || !seen || hold) return;
    if (lit >= targetRef.current) {
      const timer = window.setTimeout(() => { markPlayed(playKey); setLit(null); }, JOURNEY_SETTLE_MS);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setLit((n) => (n === null ? null : Math.min(n + 1, targetRef.current))), lit === 0 ? 120 : step);
    return () => window.clearTimeout(timer);
  }, [lit, seen, hold, step, playKey]);

  // The data went away (or the host disabled the intro) mid-flight: show the truth.
  useEffect(() => {
    if (lit !== null && (!enabled || target <= 0)) setLit(null);
  }, [enabled, target, lit]);

  return { ref, lit: enabled ? lit : null };
}
