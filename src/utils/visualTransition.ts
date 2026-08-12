export type VisualTransitionCallback = () => void | Promise<void>;

export function runVisualTransition(callback: VisualTransitionCallback) {
  if (typeof document === "undefined") return callback();
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const start = (document as Document & {
    startViewTransition?: (update: () => void | Promise<void>) => { finished: Promise<void> };
  }).startViewTransition;
  if (!start || reduced) return callback();
  try {
    return start.call(document, callback);
  } catch {
    return callback();
  }
}
