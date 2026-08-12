export type VisualTransitionCallback = () => void | Promise<void>;

export function runVisualTransition(callback: VisualTransitionCallback) {
  if (typeof document === "undefined") return callback();
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const start = (document as Document & {
    startViewTransition?: (update: () => void | Promise<void>) => {
      finished?: Promise<void>;
      ready?: Promise<void>;
      updateCallbackDone?: Promise<void>;
    };
  }).startViewTransition;
  if (!start || reduced) return callback();
  try {
    const transition = start.call(document, callback);
    // A transition that is skipped or superseded by a newer one rejects these
    // promises. That is expected for rapid interactions and must never surface
    // as an unhandled rejection in the console.
    transition?.finished?.catch(() => undefined);
    transition?.ready?.catch(() => undefined);
    transition?.updateCallbackDone?.catch(() => undefined);
    return transition;
  } catch {
    return callback();
  }
}
