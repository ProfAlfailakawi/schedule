import type { AdTerm, FSchedule } from "../types";
import { findConflicts, type ConflictInsight } from "./scheduleIntelligence";

/**
 * ── الجدول يتعفّن بصمت ──────────────────────────────────────────────────────
 *
 * Every conflict this system has ever found was found because somebody was
 * typing. The quick scan runs on edit, the full check runs on save, the verdict
 * runs on drag — three doors, all opened by a keystroke.
 *
 * A settled schedule is by definition the one nobody types into any more. So it
 * stops being checked at the exact moment people start obeying it. Another
 * department can put a lecture in your hall in October and nothing anywhere
 * says a word: their write is validated against their own scope, yours was
 * validated months ago against a university that has since changed.
 *
 * The engine was never weak here. It had simply never been pointed at a term
 * that was finished.
 *
 * **What makes a term settled.** Not a publication record, not an approval
 * button — the department's own practice: *once the next term exists, the one
 * before it is settled.* Creating «ربيع ٢٠٢٧» is the act that closes «خريف
 * ٢٠٢٦». That is already in the data, so this needs no new entity, no new
 * screen, and nothing for anyone to remember to press.
 *
 * **What it will not claim.** It sees only what is written in this database. A
 * hall closed by the facilities office, a college that keeps its timetable
 * elsewhere, a room booked by hand on a paper form — all invisible. Absence of
 * a warning is therefore never a promise of safety, and the wording says so.
 */

export interface DriftFinding {
  /** The row in the reader's own department. */
  row: FSchedule;
  /** The row it now collides with — possibly another department's. */
  otherId: number;
  /** Null when the other row is outside what this reader may see. */
  other: FSchedule | null;
  type: ConflictInsight["type"];
  message: string;
  detail: string;
  /** True when the collision comes from outside the reader's own department. */
  foreign: boolean;
}

export interface DriftReading {
  /** The settled term being watched, or null when none is settled yet. */
  term: AdTerm | null;
  /** How many terms exist after it — the reason it counts as settled. */
  supersededBy: number;
  /** Rows examined. Every number below is against this base. */
  scanned: number;
  findings: DriftFinding[];
  /** Of those, the ones caused by a department other than the reader's. */
  foreign: number;
  /** One sentence, built from the counts, never written by hand. */
  headline: string;
}

const ar = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");

/**
 * The most recent term that is no longer the newest.
 *
 * Terms are ordered by id because that is the only ordering the data carries;
 * a name is free text and a start date is optional. A department with exactly
 * one term has nothing settled, which is correct — nothing has been closed yet.
 */
export function settledTerm(terms: AdTerm[]): { term: AdTerm | null; supersededBy: number } {
  const ordered = [...terms].sort((a, b) => Number(b.AdTermId) - Number(a.AdTermId));
  if (ordered.length < 2) return { term: null, supersededBy: 0 };
  return { term: ordered[1], supersededBy: 1 };
}

/**
 * @param mine      the reader's own rows in the settled term
 * @param universe  every row in that term, from every department
 * @param canSee    whether a foreign row may be named, or only counted
 */
export function readSettledDrift(
  terms: AdTerm[],
  mine: FSchedule[],
  universe: FSchedule[],
  canSee: (row: FSchedule) => boolean,
  options?: { doorwayMinutes?: number },
): DriftReading {
  const { term, supersededBy } = settledTerm(terms);
  if (!term || !mine.length)
    return { term, supersededBy, scanned: 0, findings: [], foreign: 0, headline: "" };

  const byId = new Map(universe.map(row => [row.id, row]));
  const ours = new Set(mine.map(row => row.id));

  const findings: DriftFinding[] = findConflicts(mine, universe, options)
    .map(conflict => {
      /* findConflicts names the pair from the target's side, so `rowId` is
         always one of ours and `otherId` is whatever it met. */
      const row = byId.get(conflict.rowId);
      const other = byId.get(conflict.otherId) || null;
      if (!row) return null;
      const foreign = Boolean(other && !ours.has(other.id));
      return {
        row, otherId: conflict.otherId,
        // A foreign row is named only to someone entitled to see it; otherwise
        // it is counted and described, never identified.
        other: other && (!foreign || canSee(other)) ? other : null,
        type: conflict.type,
        message: conflict.message,
        detail: other && foreign && !canSee(other)
          ? "الموعد المتعارض يخصّ قسماً خارج نطاق عرضك."
          : conflict.detail,
        foreign,
      } as DriftFinding;
    })
    .filter((item): item is DriftFinding => Boolean(item))
    // Someone else's encroachment first: it is the part nobody would ever find
    // by looking at their own board.
    .sort((a, b) => Number(b.foreign) - Number(a.foreign));

  const foreign = findings.filter(item => item.foreign).length;
  return {
    term, supersededBy, scanned: mine.length, findings, foreign,
    headline: describeDrift(findings.length, foreign, term),
  };
}

/** The one line, assembled from the numbers rather than composed. */
export function describeDrift(total: number, foreign: number, term: AdTerm | null): string {
  if (!term || !total) return "";
  const where = term.AdTermName ? `«${term.AdTermName}»` : "الفصل المعتمد";
  if (foreign && foreign === total)
    return `${where}: ${ar(foreign)} موعداً صار متعارضاً بسبب جدولة من خارج القسم.`;
  if (foreign)
    return `${where}: ${ar(total)} تعارضاً ظهر بعد الاعتماد، ${ar(foreign)} منها من خارج القسم.`;
  return `${where}: ${ar(total)} تعارضاً ظهر بعد الاعتماد.`;
}
