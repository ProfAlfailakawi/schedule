/**
 * ── قراءة واحدة، قارئان ─────────────────────────────────────────────────────
 *
 * `/api/intelligence/living` is read by two layers of the schedule screen, and
 * both are right to want it. The decision deck asks for it the moment a scope
 * appears, because its buttons cannot exist without it and a department account
 * never loads the deferred bundle at all. The experience layer asks for it on
 * the next idle beat, alongside the genome and the constraints it also needs.
 *
 * Neither knows about the other, so on every change of college, section or term
 * the same analysis was computed twice by a single-threaded server — measured
 * on production at roughly 800ms of work each, landing inside the same burst as
 * the workspace read they were already competing with.
 *
 * This is the smallest thing that removes the second one: the RESULT is cached
 * for a few seconds, keyed by the scope it describes. Deliberately not the
 * promise — the experience layer aborts its reads when the scope changes, and a
 * shared promise would carry that abort into a caller that never asked for it.
 * A miss simply reads as before, so nothing depends on the cache being warm.
 *
 * The window is short on purpose. It exists to collapse one burst into one
 * read, not to hold an analysis across the term the reader is working in.
 */
const store = new Map<string, { at: number; value: unknown }>();
const WINDOW_MS = 8000;

export const livingScopeKey = (collegeId: number, sectionId: number, termId: number) =>
  `${Number(collegeId) || 0}|${Number(sectionId) || 0}|${Number(termId) || 0}`;

export function readLiving<T = unknown>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > WINDOW_MS) { store.delete(key); return null; }
  return hit.value as T;
}

export function writeLiving(key: string, value: unknown): void {
  if (value == null) return;
  store.set(key, { at: Date.now(), value });
  /* One scope at a time is all this is for; anything older is not coming back
     inside the window, and an unbounded map on a screen left open all day is
     a leak nobody would ever look for. */
  if (store.size > 8) {
    const oldest = [...store.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) store.delete(oldest[0]);
  }
}

/**
 * ── ولماذا لم تكفِ النتيجة وحدها ────────────────────────────────────────────
 *
 * Caching the result assumed the second reader arrives after the first has
 * answered. Measured on production, they do not: four reads of the same
 * analysis finished within three hundred milliseconds of each other, which
 * means all four had already started before any of them could write anything
 * to cache. A result cache cannot collapse a burst it is in the middle of.
 *
 * So the request is shared while it is still in the air. The one thing this
 * must not do is carry one reader's abort into another's, and it does not: the
 * shared read is issued WITHOUT any caller's signal. A reader whose scope
 * changed simply discards what comes back — every caller here already checks
 * that before using it — and the read itself completes once, for everyone.
 *
 * The cost is that changing scope no longer cancels an analysis already in
 * flight. That is the right trade: it is one request that would have finished
 * anyway, against three identical ones that never needed to start.
 */
const inflight = new Map<string, Promise<unknown>>();

export function sharedLiving<T>(key: string, load: () => Promise<T>): Promise<T> {
  const held = readLiving<T>(key);
  if (held !== null) return Promise.resolve(held);
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const request = load()
    .then(value => { writeLiving(key, value); return value; })
    .finally(() => { if (inflight.get(key) === request) inflight.delete(key); });
  inflight.set(key, request);
  return request;
}

/** Dropped when a write lands, so a stale analysis never outlives its schedule. */
export function forgetLiving(key?: string): void {
  if (key) { store.delete(key); inflight.delete(key); } else { store.clear(); inflight.clear(); }
}
