import type { FSchedule } from "../types";
import { AR, countOf } from "./arabicCount";
import {
  SCHEDULE_DAYS,
  findConflicts,
  minutesToTime,
  timeToMinutes,
  type DayKey,
} from "./scheduleIntelligence";
import type { RhythmReading } from "./departmentRhythm";
import { cohortPairs, sharedBetween, type DemandReading } from "./studentDemand";

/**
 * ── الاقتراح أنفع من الإنذار ────────────────────────────────────────────────
 *
 * The survey gave this program the one constraint ten years of history could
 * never hold: which courses share students. It has been used the way every
 * other constraint is used — to raise a finding. «هذان المقرران يتقاطعان لسبعة
 * طلاب» is true, and it is also the end of the sentence. The person reading it
 * still has to open the board, guess a free hour, drag, and hope nothing else
 * broke.
 *
 * The program can do that search itself, and do it better: it already knows
 * every instructor's week, every hall's week, the department's own start ladder
 * and its ten-minute turnaround. So this does not report the clash. It moves
 * the lecture — in memory, against the real week — and reports only the moves
 * that leave the schedule strictly better than it found it.
 *
 * **The bar is absolute.** A proposal is kept only when it removes the student
 * clash and introduces NOTHING: no instructor collision, no double-booked hall,
 * no lost turnaround, no new student clash with a third course. A suggestion
 * that trades one problem for another is worse than silence, because somebody
 * will act on it.
 *
 * **It proposes only what the department already does.** Candidate times come
 * from the start ladder this section has actually used, so a proposal never
 * invents an hour nobody teaches at. If the ladder is unknown the search is
 * skipped rather than guessed.
 *
 * **It never moves anything.** Everything here is a sentence and a button
 * somebody presses. The engine's job ends at "this would work".
 */

export interface DemandRepair {
  /** The lecture proposed for moving. */
  rowId: number;
  courseId: number;
  courseName: string;
  sectionCode: string;
  /** The hall it currently sits in, so a reader can picture the move. */
  room: string;
  /** The course it currently collides with, and how many students feel it. */
  againstCourseId: number;
  againstCourseName: string;
  shared: number;
  from: { day: DayKey; dayLabel: string; start: string; end: string };
  to: { day: DayKey; dayLabel: string; start: string; end: string };
  /** Student clashes this removes across the whole week, not just this pair. */
  removes: number;
  /** Always zero — a proposal that adds anything is never returned. */
  adds: number;
  /** How far the lecture travels, for ranking and for the sentence. */
  distanceMinutes: number;
  sameDay: boolean;
  sentence: string;
}

export interface RepairReading {
  repairs: DemandRepair[];
  /** Colliding pairs the search could not fix without breaking something. */
  unsolved: Array<{ a: string; b: string; shared: number }>;
  /** Pairs examined — the base for both numbers above. */
  examined: number;
  headline: string;
}

const DAY_LABEL = new Map(SCHEDULE_DAYS.map(day => [day.key, day.label] as const));
const DAY_KEYS = SCHEDULE_DAYS.map(day => day.key as DayKey);

const dayOf = (row: FSchedule): DayKey | null =>
  DAY_KEYS.find(key => Boolean((row as any)[key])) || null;

/** The same row placed somewhere else. Nothing is mutated; this is a copy. */
const moved = (row: FSchedule, day: DayKey, start: number, length: number): FSchedule => {
  const next: any = { ...row };
  for (const key of DAY_KEYS) next[key] = false;
  next[day] = true;
  next.fstarttime = minutesToTime(start);
  next.fendtime = minutesToTime(start + length);
  return next as FSchedule;
};

/** Student clashes only — the thing being repaired. */
const cohortCount = (
  rows: FSchedule[],
  all: FSchedule[],
  pairs: Set<string>,
  doorwayMinutes: number,
) =>
  findConflicts(rows, all, { cohortPairs: pairs, doorwayMinutes })
    .filter(item => item.reasons?.includes("cohort") || item.type === "cohort").length;

/** Everything else — the thing a proposal is forbidden to create. */
const otherCount = (
  rows: FSchedule[],
  all: FSchedule[],
  pairs: Set<string>,
  doorwayMinutes: number,
) =>
  findConflicts(rows, all, { cohortPairs: pairs, doorwayMinutes })
    .filter(item => !(item.reasons?.length === 1 && item.reasons[0] === "cohort") && item.type !== "cohort").length;

/**
 * @param rows      every row in the term — the week the move lands in
 * @param demand    what the students said
 * @param rhythm    the department's own start ladder; no ladder, no proposals
 * @param doorway   minutes a hall needs between lectures, from the same reading
 * @param limit     how many proposals to return, best first
 */
export function readDemandRepairs(
  rows: FSchedule[],
  demand: DemandReading,
  rhythm: RhythmReading | null,
  doorway: number,
  limit = 6,
): RepairReading {
  const pairs = cohortPairs(demand);
  if (!pairs.size || rows.length < 2)
    return { repairs: [], unsolved: [], examined: 0, headline: "" };

  /* Where the clashes actually are. A pair in the survey that never overlaps on
     the board is not a problem and must not be "fixed". */
  const clashes = findConflicts(rows, rows, { cohortPairs: pairs, doorwayMinutes: doorway })
    .filter(item => item.reasons?.includes("cohort") || item.type === "cohort");
  if (!clashes.length)
    return { repairs: [], unsolved: [], examined: 0, headline: "" };

  const byId = new Map(rows.map(row => [row.id, row]));
  const repairs: DemandRepair[] = [];
  const unsolved: RepairReading["unsolved"] = [];
  const seenPair = new Set<string>();

  for (const clash of clashes) {
    const left = byId.get(clash.rowId), right = byId.get(clash.otherId);
    if (!left || !right) continue;
    const pairKey = [left.id, right.id].sort((a, b) => a - b).join(":");
    if (seenPair.has(pairKey)) continue;
    seenPair.add(pairKey);

    const shared = sharedBetween(demand, left.AdCourseId, right.AdCourseId);
    let best: DemandRepair | null = null;

    /* Either lecture may be the one that moves. Trying both doubles the search
       and roughly doubles the chance of finding a move that costs nothing. */
    for (const subject of [left, right]) {
      const home = dayOf(subject);
      if (!home) continue;
      const start = timeToMinutes(subject.fstarttime);
      const length = timeToMinutes(subject.fendtime) - start;
      if (length <= 0) continue;

      /* The ladder for the days this lecture could live on. A section that has
         always begun at 08:00 and 09:25 is offered 08:00 and 09:25 — never an
         hour it has never taught at. */
      const ladders = new Map<DayKey, string[]>();
      for (const day of DAY_KEYS) {
        const list = rhythm?.forDay(day)?.ladder || [];
        if (list.length) ladders.set(day, list);
      }
      if (!ladders.size) continue;

      const others = rows.filter(row => row.id !== subject.id);
      const before = {
        cohort: cohortCount([subject], rows, pairs, doorway),
        other: otherCount([subject], rows, pairs, doorway),
      };

      for (const [day, ladder] of ladders) {
        for (const slot of ladder) {
          const at = timeToMinutes(slot);
          if (day === home && at === start) continue;
          const candidate = moved(subject, day, at, length);
          const week = [...others, candidate];
          // Forbidden outright: anything that was not there before.
          if (otherCount([candidate], week, pairs, doorway) > before.other) continue;
          const after = cohortCount([candidate], week, pairs, doorway);
          if (after >= before.cohort) continue;

          const distance = day === home
            ? Math.abs(at - start)
            : 24 * 60 + Math.abs(at - start);
          const proposal: DemandRepair = {
            rowId: subject.id,
            courseId: subject.AdCourseId,
            courseName: String(subject.AdCourseName || ""),
            sectionCode: String(subject.SCode || ""),
            room: `${subject.AdRoomCode || ""}${subject.AdRoomHall ? "/" + subject.AdRoomHall : ""}`,
            againstCourseId: subject.id === left.id ? right.AdCourseId : left.AdCourseId,
            againstCourseName: String(subject.id === left.id ? right.AdCourseName : left.AdCourseName || ""),
            shared,
            from: { day: home, dayLabel: DAY_LABEL.get(home) || "", start: subject.fstarttime, end: subject.fendtime },
            to: { day, dayLabel: DAY_LABEL.get(day) || "", start: minutesToTime(at), end: minutesToTime(at + length) },
            removes: before.cohort - after,
            adds: 0,
            distanceMinutes: distance,
            sameDay: day === home,
            sentence: "",
          };
          proposal.sentence = describeRepair(proposal);
          /* Best = removes most, then moves least, then stays on its own day.
             A lecture that stays put is the one a department will accept. */
          const better = !best
            || proposal.removes > best.removes
            || (proposal.removes === best.removes && proposal.distanceMinutes < best.distanceMinutes)
            || (proposal.removes === best.removes && proposal.distanceMinutes === best.distanceMinutes
                && proposal.sameDay && !best.sameDay);
          if (better) best = proposal;
        }
      }
    }

    if (best) repairs.push(best);
    else unsolved.push({
      a: String(left.AdCourseName || ""), b: String(right.AdCourseName || ""), shared,
    });
  }

  repairs.sort((a, b) => b.shared - a.shared || b.removes - a.removes || a.distanceMinutes - b.distanceMinutes);
  const kept = repairs.slice(0, limit);
  return {
    repairs: kept,
    unsolved,
    examined: seenPair.size,
    headline: describeRepairs(kept.length, unsolved.length, seenPair.size),
  };
}

/** One sentence per proposal, assembled from its own numbers. */
export function describeRepair(repair: DemandRepair): string {
  const where = repair.sameDay
    ? `${repair.from.dayLabel} ${repair.from.start} ← ${repair.to.start}`
    : `${repair.from.dayLabel} ${repair.from.start} ← ${repair.to.dayLabel} ${repair.to.start}`;
  return `«${repair.courseName}» شعبة ${repair.sectionCode}: ${where} — ` +
    `يزول تقاطعه مع «${repair.againstCourseName}» عند ${countOf(repair.shared, AR.student)}، ولا ينشأ تعارض جديد.`;
}

/** The one line above the list, never written by hand. */
export function describeRepairs(fixable: number, stuck: number, examined: number): string {
  if (!examined) return "";
  if (!fixable && stuck)
    return `${countOf(stuck, AR.clash)} بين مقررات يشترك فيها طلاب — ولا نقلة تُزيلها دون أن تُنشئ تعارضاً آخر.`;
  if (!fixable) return "";
  const head = `${countOf(fixable, AR.move)} تُزيل تقاطعاً على الطلاب دون أي أثر جانبي`;
  return stuck ? `${head} · ${countOf(stuck, AR.clash)} بلا حلٍّ نظيف بعد.` : `${head}.`;
}
