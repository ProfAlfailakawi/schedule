/**
 * ── «المقروء» واحدٌ على كل أجهزة المستخدم ─────────────────────────────────
 *
 * The bell's read marks lived in one browser's localStorage, so a notice read
 * on the phone still said «جديد» on the computer. They now live on the server
 * too, per user: at most SEEN_LIMIT ids, the newest kept. Notification ids are
 * stable (key(scope, …), request:…), so one id is one notice on every device.
 *
 * A read mark is a preference, not schedule data: it never changes what the
 * bell lists, only whether «جديد» shows. That is why read-only roles may write
 * it (SESSION_WRITE_PATHS in src/server/roleGuard.ts).
 */
export const SEEN_LIMIT = 1000;
export const SEEN_ID_MAX_LENGTH = 200;

/** Untrusted input → the ids worth storing: non-empty strings of reasonable
 *  length, deduplicated, at most SEEN_LIMIT (the last ones given). */
export function cleanSeenIds(input: unknown): string[] {
  const ids = (Array.isArray(input) ? input : [])
    .filter((id): id is string => typeof id === "string")
    .map(id => id.trim())
    .filter(id => id.length > 0 && id.length <= SEEN_ID_MAX_LENGTH);
  return [...new Set(ids)].slice(-SEEN_LIMIT);
}

/** The stored list after marking `added` read: marked ids move to the end
 *  (newest), so a notice still on the list stays while old ones fall away
 *  past the limit. */
export function mergeSeenIds(stored: readonly string[], added: readonly string[]): string[] {
  const marked = new Set(added);
  return [...stored.filter(id => !marked.has(id)), ...added.filter((id, index) => added.indexOf(id) === index)].slice(-SEEN_LIMIT);
}

/** The key a read mark is kept under: the notice id within its term. Current-
 *  term ids carry no term, so a mark from last term would silently hide this
 *  term's notice with the same id; planning-term ids carry `term-N:`, which
 *  falls away when that term becomes current. Keyed by term, both are one. */
export function seenKey(item: { id: string; termId?: number }): string {
  const id = String(item.id || "").replace(/^term-\d+:/, "");
  return item.termId ? `${item.termId}:${id}` : id;
}

/** True when marking `added` would change nothing stored — no write needed. */
export function seenUnchanged(stored: readonly string[], merged: readonly string[]): boolean {
  return stored.length === merged.length && stored.every((id, index) => id === merged[index]);
}
