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

/** Dropped when a write lands, so a stale analysis never outlives its schedule. */
export function forgetLiving(key?: string): void {
  if (key) store.delete(key); else store.clear();
}
