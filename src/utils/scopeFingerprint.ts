/**
 * ── ما كان عليه الجدول حين أُخذت النسخة ────────────────────────────────────
 *
 * Publishing a draft, restoring a version and undoing a decision all REPLACE a
 * department's scope. Each was written as if nobody else could have touched
 * the scope in between — a draft saved on Sunday and published on Tuesday
 * silently erased Monday's edits, and «تراجع» on a decision undid every change
 * made after it too, without naming one.
 *
 * So each of those objects remembers the scope it was built against (its
 * base), as one signature per appointment. When it is applied, the live scope
 * is compared with that base; if they differ, the server refuses once and
 * lists what would be overwritten, and the person decides with the list in
 * front of them (`x-schedule-confirm: …, overwrite-newer`).
 *
 * The same reading measures how much a replacement actually changes, so the
 * deadline rule for wholesale changes judges the effect of a publish or a
 * restore, not the button that started it.
 */
import { roomKeyOf } from "./locationRegistry";

const DAY_KEYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;

/** Everything a person would call «the appointment changed». */
export function rowSignature(row: any): string {
  return JSON.stringify([
    Number(row?.AdCourseId || 0),
    String(row?.SCode ?? "").trim(),
    Number(row?.AdInstructorId || 0),
    DAY_KEYS.map(key => (row?.[key] ? 1 : 0)).join(""),
    String(row?.fstarttime || ""),
    String(row?.fendtime || ""),
    roomKeyOf(row?.roomId, row?.AdRoomCode, row?.AdRoomHall),
  ]);
}

export type ScopeSignatures = Record<string, string>;

export function scopeSignatures(rows: any[]): ScopeSignatures {
  const out: ScopeSignatures = {};
  for (const row of rows || []) out[String(row?.id)] = rowSignature(row);
  return out;
}

/** FNV-1a over the sorted signatures: equal scopes, equal strings. */
export function fingerprintOfSignatures(signatures: ScopeSignatures): string {
  const text = Object.keys(signatures).sort().map(id => `${id}=${signatures[id]}`).join("\n");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${Object.keys(signatures).length}:${hash.toString(16)}`;
}

export function scopeFingerprint(rows: any[]): string {
  return fingerprintOfSignatures(scopeSignatures(rows));
}

export interface ScopeBase {
  baseFingerprint?: string;
  baseSignatures?: ScopeSignatures;
}

export function scopeBase(rows: any[]): Required<ScopeBase> {
  const baseSignatures = scopeSignatures(rows);
  return { baseSignatures, baseFingerprint: fingerprintOfSignatures(baseSignatures) };
}

/**
 * What changed in the live scope since its base, one short line each.
 * Only course names and section codes of the SAME scope are named.
 */
export function describeScopeChanges(
  base: ScopeSignatures,
  liveRows: any[],
  courseName: (courseId: number) => string = () => "",
): string[] {
  const live = scopeSignatures(liveRows);
  const byId = new Map((liveRows || []).map(row => [String(row?.id), row] as const));
  const label = (courseId: number, section: string, fallback?: string) =>
    `${courseName(courseId) || fallback || "مقرر"} · شعبة ${section || "—"}`;
  const fromSignature = (signature: string) => {
    try { const [courseId, section] = JSON.parse(signature); return label(Number(courseId), String(section)); }
    catch { return "موعد"; }
  };
  const lines: string[] = [];
  for (const id of Object.keys(live)) {
    const row = byId.get(id);
    if (!(id in base)) lines.push(`أُضيف بعدها: ${label(Number(row?.AdCourseId), String(row?.SCode ?? ""), row?.AdCourseName)}`);
    else if (base[id] !== live[id]) lines.push(`عُدّل بعدها: ${label(Number(row?.AdCourseId), String(row?.SCode ?? ""), row?.AdCourseName)}`);
  }
  for (const id of Object.keys(base)) if (!(id in live)) lines.push(`حُذف بعدها: ${fromSignature(base[id])}`);
  return lines;
}

/**
 * How many appointments of the live scope a replacement would remove or alter
 * (an appointment kept exactly as it is — same course, section, teacher, days,
 * time and hall — is not a change, whatever id it is written back under).
 */
export function replacementLoss(liveRows: any[], nextRows: any[]): { deleting: number; total: number } {
  const pool = new Map<string, number>();
  for (const row of nextRows || []) {
    const key = rowSignature(row);
    pool.set(key, (pool.get(key) || 0) + 1);
  }
  let deleting = 0;
  for (const row of liveRows || []) {
    const key = rowSignature(row);
    const left = pool.get(key) || 0;
    if (left > 0) pool.set(key, left - 1);
    else deleting += 1;
  }
  return { deleting, total: (liveRows || []).length };
}
