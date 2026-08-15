/**
 * ── البداية الدافئة ─────────────────────────────────────────────────────────
 *
 * Measured on a cold load: every chunk, the session check and the document are
 * finished at 62ms — and the board does not ask for its own data until 776ms.
 * Seven hundred milliseconds in which the network is idle and the reader is
 * looking at nothing. On a warm remount the same board asks in 25ms, so the
 * component is not slow; the gap belongs to everything that has to happen once,
 * on the first load, before a component can exist at all.
 *
 * Rather than chase that, this removes the dependency: a request does not need
 * a component. The instant the app knows which screen it is opening — before
 * React has rendered a single element — the screen's first question goes out.
 * By the time the board mounts, its answer is already arriving or arrived.
 *
 * Deliberately tiny and deliberately outside React: one promise per URL, handed
 * over exactly once, and forgotten. It caches nothing beyond that hand-off, so
 * it can never serve stale data to a second reader.
 */
const inFlight = new Map<string, Promise<unknown>>();

/** Fires a GET now, or returns the one already in the air for this URL. */
export function warmStart(url: string): Promise<unknown> {
  const existing = inFlight.get(url);
  if (existing) return existing;
  const promise = fetch(url, { credentials: "include" })
    .then(response => (response.ok ? response.json() : Promise.reject(response)))
    .catch(error => {
      // A failed warm start is not an error anybody should see: the component
      // will ask again for itself, through the path that knows how to report.
      inFlight.delete(url);
      throw error;
    });
  inFlight.set(url, promise);
  return promise;
}

/**
 * Takes the pending answer for this URL, if one exists, and removes it.
 *
 * Consumed once by design. A second reader of the same screen must go to the
 * network, because by then the first reader may have changed something.
 */
export function claimWarmStart<T>(url: string): Promise<T> | null {
  const promise = inFlight.get(url) as Promise<T> | undefined;
  if (!promise) return null;
  inFlight.delete(url);
  return promise;
}
