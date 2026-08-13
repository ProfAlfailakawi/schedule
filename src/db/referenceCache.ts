/**
 * A short memory for the things that almost never change.
 *
 * Colleges, sections, terms, instructors and courses are read on every screen
 * and edited a few times a semester. Each read was a full collection scan
 * against Firestore, so opening the schedule cost several seconds of network
 * before a single row was drawn — the catalogue reads dominated, not the
 * schedule itself.
 *
 * This keeps the answer in the process for a short while. Two rules keep it
 * honest:
 *
 *   1. Any write to a catalogue drops it immediately, so the person who made
 *      the change never sees their own edit missing.
 *   2. Entries expire on their own, so a second server instance that did not
 *      see the write catches up within the window rather than never.
 *
 * Nothing user-specific and nothing scoped by permission is cached here — only
 * whole reference collections, which are identical for every caller. Scoped
 * reads stay uncached so no one can be served another department's rows.
 */

type Entry = { value: unknown; expiresAt: number; loading?: Promise<unknown> };

const TTL_MS = 90_000;
const store = new Map<string, Entry>();

/** Disabled during tests so each case sees exactly the state it wrote. */
let enabled = true;
export function setReferenceCacheEnabled(value: boolean) {
  enabled = value;
  if (!value) { store.clear(); scheduleStore.clear(); }
}

export function invalidateReference(...keys: string[]) {
  if (!keys.length) { store.clear(); return; }
  for (const key of keys) {
    store.delete(key);
    // A catalogue and its per-section slices are one thing; clearing the
    // catalogue must clear the slices, or one screen keeps the stale answer.
    for (const existing of [...store.keys()]) {
      if (existing.startsWith(`${key}:`)) store.delete(existing);
    }
  }
}

/**
 * Returns the cached value, or loads it once. Concurrent callers during a miss
 * share the same in-flight read instead of each starting their own — otherwise
 * a cold dashboard would fire the same five collection scans in parallel.
 */
export async function cachedReference<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!enabled) return load();
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) {
    if (hit.loading) return hit.loading as Promise<T>;
    return hit.value as T;
  }
  const loading = load().then(
    value => {
      store.set(key, { value, expiresAt: Date.now() + TTL_MS });
      return value;
    },
    error => {
      // A failed read must not be remembered as an answer.
      store.delete(key);
      throw error;
    }
  );
  store.set(key, { value: hit?.value, expiresAt: now + TTL_MS, loading });
  return loading;
}


/**
 * Schedule rows, held for seconds rather than minutes.
 *
 * The same term is read by the dashboard, the week grid, the query centre and
 * the room-load report within the same click. Those are identical reads and are
 * not scoped to the caller — permission filtering happens afterwards, on the
 * rows — so one read can serve all of them. The window is deliberately tiny and
 * every write clears it, because the schedule is the one thing in this product
 * that genuinely changes minute to minute.
 */
const SCHEDULE_TTL_MS = 12_000;
const scheduleStore = new Map<string, { value: unknown; expiresAt: number; loading?: Promise<unknown> }>();

export function invalidateSchedules() { scheduleStore.clear(); }

export async function cachedSchedules<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!enabled) return load();
  const now = Date.now();
  const hit = scheduleStore.get(key);
  if (hit && hit.expiresAt > now) {
    if (hit.loading) return hit.loading as Promise<T>;
    return hit.value as T;
  }
  const loading = load().then(
    value => { scheduleStore.set(key, { value, expiresAt: Date.now() + SCHEDULE_TTL_MS }); return value; },
    error => { scheduleStore.delete(key); throw error; }
  );
  scheduleStore.set(key, { value: hit?.value, expiresAt: now + SCHEDULE_TTL_MS, loading });
  return loading;
}

export const REFERENCE_KEYS = {
  colleges: "colleges",
  sections: "sections",
  terms: "terms",
  instructors: "instructors",
  courses: "courses",
  formNames: "formNames",
  scheduleCount: "scheduleCount"
} as const;
