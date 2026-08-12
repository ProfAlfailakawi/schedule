/**
 * Storage that cannot take the screen down with it.
 *
 * `localStorage` is not always there: an embedded preview frame, a browser with
 * site data blocked, or Safari private mode all make the very first read throw.
 * Those reads sit in component initialisers, so one exception meant a blank
 * page instead of a working schedule. Preferences are a convenience — losing
 * them is acceptable, losing the application is not.
 */

type Store = "local" | "session";

const backing = (kind: Store): Storage | null => {
  try {
    const store = kind === "local" ? window.localStorage : window.sessionStorage;
    // Touching a key is what actually throws in a blocked context.
    const probe = "__schedule_probe__";
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
};

/** Nothing survives a reload here, but nothing breaks either. */
const memory = new Map<string, string>();

let localStore: Storage | null | undefined;
let sessionStore: Storage | null | undefined;

const store = (kind: Store): Storage | null => {
  if (kind === "local") {
    if (localStore === undefined) localStore = backing("local");
    return localStore;
  }
  if (sessionStore === undefined) sessionStore = backing("session");
  return sessionStore;
};

export const safeStorage = {
  get(key: string, kind: Store = "local"): string | null {
    const target = store(kind);
    if (!target) return memory.get(`${kind}:${key}`) ?? null;
    try { return target.getItem(key); } catch { return null; }
  },
  set(key: string, value: string, kind: Store = "local"): void {
    const target = store(kind);
    if (!target) { memory.set(`${kind}:${key}`, value); return; }
    // A full quota must not interrupt whatever the person was doing.
    try { target.setItem(key, value); } catch { memory.set(`${kind}:${key}`, value); }
  },
  remove(key: string, kind: Store = "local"): void {
    const target = store(kind);
    memory.delete(`${kind}:${key}`);
    if (!target) return;
    try { target.removeItem(key); } catch { /* already gone */ }
  },
  /** Reads JSON and falls back to `fallback` on anything unexpected. */
  json<T>(key: string, fallback: T, kind: Store = "local"): T {
    const raw = safeStorage.get(key, kind);
    if (!raw) return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  }
};
