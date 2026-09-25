import { findConflicts, isBlockingConflict, type ConflictInsight } from "./scheduleIntelligence";
import { placeholderInstructorIds } from "./instructorIdentity";
import type { FSchedule } from "../types";

export { isBlockingConflict, placeholderInstructorIds };

/**
 * ── «مانع الاعتماد» — قاعدةٌ واحدة، في موضعٍ واحد ──────────────────────────
 *
 * The question «what stops this department's schedule from being approved?»
 * was answered six different ways: the save gate exempted «هيئة تدريسية» and
 * normalised legacy hall aliases; the committee count did neither and dropped
 * cross-department instructor clashes; the dean's balance counted only
 * severity "high" and so ignored exact duplicates; the review screen counted
 * cross-department instructors but not placeholders… One department of the
 * college showed eight approval blockers that were all placeholder pairs, and
 * the dean saw fourteen for a department the registrar saw two for.
 *
 * Every screen now asks THIS module:
 *
 *   • A blocker is a pair, counted once, that `isBlockingConflict` accepts
 *     (instructor / room double booking, or an exact duplicate; never soft
 *     advice).
 *   • «هيئة تدريسية» is never a person: its pairs are never instructor
 *     clashes (a shared hall or an exact duplicate still is).
 *   • A hall is identified the way the save gate identifies it — the caller
 *     passes the gate's canonicalisation as `normalizeRow`.
 *   • A pair belongs to every department owning either row. A clash with a
 *     lecture of another department is real — the save gate refuses it — so
 *     it counts in both, and is described here only generically
 *     («مع موعدٍ خارج هذا القسم»).
 *
 * `tests/blocker-oracle-audit.ts` holds the behaviour and refuses a second
 * copy of the predicate anywhere else in the product.
 */
export interface ApprovalBlockerOptions {
  /** «هيئة تدريسية» records (see `placeholderInstructorIds`). */
  placeholderInstructorIds?: Iterable<number>;
  /** The save gate's hall canonicalisation; identity when omitted. */
  normalizeRow?: (row: any) => any;
  courseName?: Map<number, string>;
  instructorName?: Map<number, string>;
}

/**
 * The blocking pairs with at least one foot in `scopeRows`, once each, read
 * against the whole term. `termRows` may or may not contain the scope rows:
 * the scope's own version of a row always wins (unsaved candidates, drafts).
 */
export function blockingConflicts(scopeRows: any[], termRows: any[], options: ApprovalBlockerOptions = {}): ConflictInsight[] {
  const normalize = options.normalizeRow || ((row: any) => row);
  const scope = (scopeRows || []).map(normalize);
  const scopeIds = new Set(scope.map((row: any) => Number(row.id)));
  const universe = [
    ...(termRows || []).filter((row: any) => !scopeIds.has(Number(row?.id))).map(normalize),
    ...scope,
  ];
  const seen = new Set<string>();
  const out: ConflictInsight[] = [];
  for (const item of findConflicts(scope as FSchedule[], universe as FSchedule[], { placeholderInstructorIds: options.placeholderInstructorIds })) {
    if (!isBlockingConflict(item)) continue;
    const a = Number(item.rowId), b = Number(item.otherId);
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** The number every screen prints next to «مانع اعتماد». */
export function approvalBlockerCount(scopeRows: any[], termRows: any[], options: ApprovalBlockerOptions = {}): number {
  return blockingConflicts(scopeRows, termRows, options).length;
}

/**
 * ── الموانع وما تمسّه من مواعيد — رقمان، لا رقمٌ يُقرأ بمعنيين ─────────────
 *
 * The owner's screen showed «4 تعارضات مادّية» on the bar and «5 يمنع» in the
 * review: both were right, and nothing said the second counted appointments.
 * The headline unit everywhere is the number of blocking CONFLICTS (pairs);
 * where appointments are shown, they are these — the distinct rows of the
 * scope that stand in at least one blocking pair — and are named as such.
 */
export function blockingRowIds(conflicts: Array<{ rowId: unknown; otherId: unknown }>, scopeRows: any[]): number[] {
  const own = new Set((scopeRows || []).map((row: any) => Number(row?.id)));
  const touched = new Set<number>();
  for (const item of conflicts || []) {
    for (const id of [Number(item.rowId), Number(item.otherId)]) if (own.has(id)) touched.add(id);
  }
  return [...touched].sort((a, b) => a - b);
}

export interface ApprovalBlockerSummary {
  /** Blocking pairs — the headline number (`approvalBlockerCount`). */
  conflicts: number;
  /** Distinct own appointments standing in those pairs. */
  rows: number;
  rowIds: number[];
}

/** Both numbers from ONE list, so they can never be read from two rules. */
export function approvalBlockerSummary(scopeRows: any[], termRows: any[], options: ApprovalBlockerOptions = {}): ApprovalBlockerSummary {
  const list = blockingConflicts(scopeRows, termRows, options);
  const rowIds = blockingRowIds(list, scopeRows);
  return { conflicts: list.length, rows: rowIds.length, rowIds };
}

/**
 * ── ما يمنع الاعتماد، بتفاصيله — داخل حدود القسم ─────────────────────────
 *
 * كلُّ مانعٍ يصل بمواعيد هذا القسم المعنيّة به، بمقرّراتها وأساتذتها. وتعارضٌ
 * مع موعدٍ في قسمٍ آخر يُقال عامّاً — «مع موعدٍ خارج هذا القسم» — بلا اسم قسمٍ
 * ولا مقرّرٍ ولا أستاذٍ منه: الخادمُ يرى الموعدَ المقابل ليحمي الجدول، والقارئُ
 * لا. والقائمة هي `blockingConflicts` نفسها، فطولها هو `approvalBlockerCount`.
 */
export interface ReviewBlocker {
  id: string;
  type: string;
  title: string;
  detail: string;
  rowIds: number[];
  subjectLabel?: string;
}

export function approvalBlockers(scopeRows: any[], termRows: any[], options: ApprovalBlockerOptions = {}): ReviewBlocker[] {
  const courseName = options.courseName || new Map<number, string>();
  const instructorName = options.instructorName || new Map<number, string>();
  const ownIds = new Set((scopeRows || []).map((row: any) => Number(row.id)));
  const byId = new Map<number, any>((termRows || []).map((row: any) => [Number(row.id), row] as const));
  for (const row of scopeRows || []) byId.set(Number(row.id), row);
  const typeLabel: Record<string, string> = {
    room: "تعارض قاعة", instructor: "تعارض أستاذ", duplicate: "موعد مكرّر", cohort: "تعارض مقرّرين يشترك طلبتُهما",
  };
  const describe = (row: any) => {
    const who = instructorName.get(Number(row?.AdInstructorId)) || "";
    return `${courseName.get(Number(row?.AdCourseId)) || row?.AdCourseName || "مقرر"} (شعبة ${row?.SCode || "—"}${who ? ` — ${who}` : ""})`;
  };
  return blockingConflicts(scopeRows, termRows, options).map(item => {
    const a = Number(item.rowId), b = Number(item.otherId);
    const key = [Math.min(a, b), Math.max(a, b), item.type].join(":");
    const label = typeLabel[String(item.type)] || "تعارض يمنع الاعتماد";
    const own = [a, b].filter(id => ownIds.has(id));
    if (own.length === 2) {
      return {
        id: key, type: String(item.type), title: label,
        detail: `${describe(byId.get(a))} و${describe(byId.get(b))} في الوقت نفسه.`,
        rowIds: own,
        subjectLabel: `${describe(byId.get(a))} · ${describe(byId.get(b))}`,
      };
    }
    return {
      id: key, type: String(item.type), title: `${label} مع موعدٍ خارج هذا القسم`,
      detail: "الموعد المقابل في جدول قسمٍ آخر؛ غيّر وقتَ هذا الموعد أو مكانه، أو نسّق مع ذلك القسم.",
      rowIds: own,
      subjectLabel: describe(byId.get(own[0])),
    };
  });
}

/** Kept for existing callers: the same list, with names passed positionally. */
export function blockingConflictDetails(
  scopeRows: any[],
  termRows: any[],
  courseName: Map<number, string>,
  instructorName: Map<number, string> = new Map(),
  options: ApprovalBlockerOptions = {},
): ReviewBlocker[] {
  return approvalBlockers(scopeRows, termRows, { ...options, courseName, instructorName });
}
