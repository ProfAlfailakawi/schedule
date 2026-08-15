import type { FSchedule } from "../types";
import {
  SCHEDULE_DAYS,
  activeDays,
  fastConflictScan,
  minutesToTime,
  timeToMinutes,
  type DayKey,
} from "./scheduleIntelligence";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_START, SCHEDULE_SLOT_MINUTES } from "./scheduleTime";

/**
 * ── إصلاح بأقل أثر ─────────────────────────────────────────────────────────
 *
 * A timetable's conflicts are rarely solved where they appear. The obvious
 * move — find this lecture another hour — fails precisely in the weeks that
 * matter, because every free hour it could take belongs to something else. The
 * fix that exists is a chain: A takes B's hour, B takes C's, C changes hall.
 *
 * A coordinator can find such a chain by hand. It costs them twenty minutes of
 * holding four lectures in their head, and they cannot check their answer. This
 * searches the same space and hands back the whole chain **before** anything is
 * written, with the honest cost attached: how many moves, how many teachers it
 * disturbs, and whether it leaves any new clash behind.
 *
 * Three rules it will not break:
 *   1. It never proposes a chain that leaves MORE conflicts than it found.
 *   2. It only moves what it must — the shortest chain wins, always.
 *   3. It proposes; it does not write. The caller commits the whole chain
 *      through the one atomic door, or none of it.
 */

export interface RepairMove {
  id: number;
  /** The row as it stands now — kept so the caller can send its revision. */
  before: FSchedule;
  /** Only the placement changes; identity, course and section never do. */
  day: DayKey;
  start: string;
  end: string;
  roomCode: string;
  roomHall: string;
  /** Plain-words reason this particular card had to move. */
  because: string;
}

export interface RepairChain {
  moves: RepairMove[];
  /** Conflict pair counts before and after the whole chain is applied. */
  before: number;
  after: number;
  /** Distinct instructors whose week changes if this is accepted. */
  instructorsAffected: number;
  /** Distinct rooms the chain touches. */
  roomsAffected: number;
}

const MAX_DEPTH = 5;
/** Only whole slots: a repair must land where a person would have dropped it. */
const step = SCHEDULE_SLOT_MINUTES;

const duration = (row: FSchedule) =>
  Math.max(step, timeToMinutes(row.fendtime) - timeToMinutes(row.fstarttime));

const placed = (row: FSchedule, day: DayKey, start: string): FSchedule => {
  const next: any = { ...row };
  SCHEDULE_DAYS.forEach(d => { next[d.key] = d.key === day; });
  next.fstarttime = start;
  next.fendtime = minutesToTime(timeToMinutes(start) + duration(row));
  return next as FSchedule;
};

const withRoom = (row: FSchedule, code: string, hall: string): FSchedule =>
  ({ ...row, AdRoomCode: code, AdRoomHall: hall });

/** Every whole-slot start a lecture of this length could legally begin at. */
function slotsFor(row: FSchedule): string[] {
  const span = duration(row);
  const out: string[] = [];
  for (let at = SCHEDULE_DAY_START; at + span <= SCHEDULE_DAY_END; at += step)
    out.push(minutesToTime(at));
  return out;
}

/** The rooms this department actually uses, learned from the board itself. */
function estateOf(rows: FSchedule[]): Array<{ code: string; hall: string }> {
  const seen = new Map<string, { code: string; hall: string }>();
  rows.forEach(row => {
    const code = String(row.AdRoomCode || "").trim();
    const hall = String(row.AdRoomHall || "").trim();
    if (!code || !hall) return;
    seen.set(`${code}|${hall}`, { code, hall });
  });
  return [...seen.values()];
}

const conflictCount = (rows: FSchedule[]) => fastConflictScan(rows).pairs;

/** Which rows a candidate placement would collide with, by id. */
function collidesWith(candidate: FSchedule, rows: FSchedule[]): FSchedule[] {
  const days = activeDays(candidate);
  const from = timeToMinutes(candidate.fstarttime);
  const to = timeToMinutes(candidate.fendtime);
  const room = `${candidate.AdRoomCode}|${candidate.AdRoomHall}`;
  return rows.filter(other => {
    if (other.id === candidate.id) return false;
    if (Number(other.AdTermId) !== Number(candidate.AdTermId)) return false;
    if (!days.some(day => Boolean((other as any)[day]))) return false;
    if (!(timeToMinutes(other.fstarttime) < to && timeToMinutes(other.fendtime) > from)) return false;
    const sameInstructor = Boolean(candidate.AdInstructorId) && other.AdInstructorId === candidate.AdInstructorId;
    const sameRoom = room !== "|" && `${other.AdRoomCode}|${other.AdRoomHall}` === room;
    return sameInstructor || sameRoom;
  });
}

/**
 * Placements for one row, best first.
 *
 * "Best" is deliberately the same instinct the drag layer uses: stay on a day
 * the instructor already teaches, sit close to their other lectures, keep the
 * hall you already have. A repair that is technically valid but scatters a
 * teacher across five days is not a repair anyone will accept.
 */
function candidatesFor(row: FSchedule, rows: FSchedule[], estate: Array<{ code: string; hall: string }>) {
  const mine = rows.filter(other => other.id !== row.id && other.AdInstructorId === row.AdInstructorId);
  const rooms = [{ code: String(row.AdRoomCode || ""), hall: String(row.AdRoomHall || "") }, ...estate];
  const out: Array<{ row: FSchedule; score: number; day: DayKey; start: string; room: { code: string; hall: string } }> = [];
  const currentDay = activeDays(row)[0];
  for (const day of SCHEDULE_DAYS) {
    for (const start of slotsFor(row)) {
      for (const room of rooms) {
        if (!room.code || !room.hall) continue;
        if (day.key === currentDay && start === row.fstarttime &&
            room.code === row.AdRoomCode && room.hall === row.AdRoomHall) continue;
        const candidate = withRoom(placed(row, day.key, start), room.code, room.hall);
        let score = 0;
        // Keeping the hall is worth a lot: a room change is a notice to send.
        if (room.code === row.AdRoomCode && room.hall === row.AdRoomHall) score += 30;
        // Staying on a day the instructor already works costs them nothing.
        if (mine.some(other => Boolean((other as any)[day.key]))) score += 24;
        if (day.key === currentDay) score += 18;
        // Near their other lectures rather than stranded across a gap.
        const from = timeToMinutes(candidate.fstarttime), to = timeToMinutes(candidate.fendtime);
        const sameDay = mine.filter(other => Boolean((other as any)[day.key]));
        if (sameDay.length) {
          const nearest = Math.min(...sameDay.map(other => {
            const a = timeToMinutes(other.fstarttime), b = timeToMinutes(other.fendtime);
            return b <= from ? from - b : a >= to ? a - to : 0;
          }));
          score += Math.max(0, 20 - Math.round(nearest / 30) * 4);
        }
        if (from >= 8 * 60 && from < 14 * 60) score += 8;
        out.push({ row: candidate, score, day: day.key, start, room });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

const reasonFor = (moved: FSchedule, displacedBy: FSchedule | null) =>
  displacedBy
    ? `أفسح المكان لـ${displacedBy.AdCourseName || `موعد ${displacedBy.id}`}`
    : "الموضع الأصلي يسبب تعارضاً";

/**
 * Search for the shortest chain that removes a conflict without creating one.
 *
 * Depth-first with a hard ceiling and best-first ordering: at each step the
 * card is offered its most acceptable placements, and if one of them displaces
 * something, that something becomes the next card to place. The first chain
 * that leaves the board no worse than it found it wins, and because the search
 * is ordered by acceptability, the first is also the kindest.
 */
export function findRepairChain(
  target: FSchedule,
  allRows: FSchedule[],
  options?: {
    maxDepth?: number;
    maxBranch?: number;
    /** A hall that is unavailable — used by the disruption planner. */
    forbidRoom?: (code: string, hall: string) => boolean;
    /** What counts as solved. Defaults to "one fewer conflict than we found". */
    solved?: (board: FSchedule[], baseline: number) => boolean;
  },
): RepairChain | null {
  const ceiling = Math.min(MAX_DEPTH, Math.max(1, options?.maxDepth ?? MAX_DEPTH));
  const maxBranch = Math.max(2, options?.maxBranch ?? 6);
  const scope = allRows.filter(row => Number(row.AdTermId) === Number(target.AdTermId));
  const baseline = conflictCount(scope);
  const estate = estateOf(scope).filter(room => !options?.forbidRoom?.(room.code, room.hall));
  const solved = options?.solved || ((board: FSchedule[], base: number) => conflictCount(board) <= base - 1);

  const search = (
    board: FSchedule[],
    card: FSchedule,
    displacedBy: FSchedule | null,
    moves: RepairMove[],
    seen: Set<number>,
    depth: number,
    limit: number,
  ): RepairMove[] | null => {
    const tries = candidatesFor(card, board, estate)
      .filter(option => !options?.forbidRoom?.(option.room.code, option.room.hall))
      .slice(0, maxBranch * 4);
    let taken = 0;
    for (const option of tries) {
      if (taken >= maxBranch) break;
      const hits = collidesWith(option.row, board);
      // A card may only displace something that has not already been moved in
      // this chain — otherwise the search walks in circles.
      if (hits.some(hit => seen.has(hit.id))) continue;
      if (hits.length > 1) continue;              // one domino at a time
      // At the last permitted depth only a placement that displaces nothing can
      // possibly finish the chain, so the rest are not worth opening.
      if (hits.length && depth >= limit) continue;
      taken += 1;

      const nextBoard = board.map(row => (row.id === card.id ? option.row : row));
      const nextMoves: RepairMove[] = [...moves, {
        id: card.id,
        before: card,
        day: option.day,
        start: option.start,
        end: option.row.fendtime,
        roomCode: option.room.code,
        roomHall: option.room.hall,
        because: reasonFor(card, displacedBy),
      }];

      if (!hits.length) {
        if (solved(nextBoard, baseline)) return nextMoves;
        continue;
      }
      const nextSeen = new Set(seen).add(hits[0].id);
      const deeper = search(nextBoard, hits[0], option.row, nextMoves, nextSeen, depth + 1, limit);
      if (deeper) return deeper;
    }
    return null;
  };

  /**
   * Iterative deepening, because the shortest chain is a promise.
   *
   * A plain depth-first search returns the first chain it stumbles into, and
   * since the best-scoring placement is often one that displaces something, it
   * would hand back a two-move answer while a one-move answer sat untried. So
   * the whole space is searched at depth one before depth two is opened at all:
   * the chain that comes back is the shortest that exists, not the first found.
   */
  let moves: RepairMove[] | null = null;
  for (let limit = 1; limit <= ceiling && !moves; limit += 1)
    moves = search(scope, target, null, [], new Set([target.id]), 1, limit);
  if (!moves) return null;

  const after = conflictCount(moves.reduce((board, move) => board.map(row => (
    row.id === move.id
      ? withRoom(placed(row, move.day, move.start), move.roomCode, move.roomHall)
      : row
  )), scope));

  return {
    moves,
    before: baseline,
    after,
    instructorsAffected: new Set(moves.map(move => move.before.AdInstructorId).filter(Boolean)).size,
    roomsAffected: new Set(moves.map(move => `${move.roomCode}|${move.roomHall}`)).size,
  };
}

/**
 * The same engine, asked a different question: a room or a person is gone
 * tomorrow — what is the smallest rescue?
 *
 * Disruption is not a special case of repair; it is repair with the conflict
 * invented. Marking the closed hall as occupied for the whole day makes every
 * lecture in it conflict, and the search that already exists does the rest.
 */
export function planDisruption(
  affected: FSchedule[],
  allRows: FSchedule[],
  options?: { maxDepth?: number; forbidRoom?: (code: string, hall: string) => boolean },
): RepairChain | null {
  if (!affected.length) return null;
  const scope = allRows.filter(row => Number(row.AdTermId) === Number(affected[0].AdTermId));
  // By default the unavailable halls are the ones the affected lectures sit in.
  const closed = new Set(affected.map(row => `${row.AdRoomCode}|${row.AdRoomHall}`));
  const forbidRoom = options?.forbidRoom || ((code: string, hall: string) => closed.has(`${code}|${hall}`));
  const chains: RepairChain[] = [];
  let board = scope;
  for (const row of affected) {
    /*
     * These lectures are not in conflict — nothing is wrong with them. What is
     * wrong is the room, and a room closing is not something the conflict count
     * can see. So the goal is stated directly: this card must end up outside the
     * closed hall, and the board must be no worse for it.
     */
    const chain = findRepairChain(row, board, {
      maxDepth: options?.maxDepth ?? 3,
      forbidRoom,
      solved: (next, base) => {
        const moved = next.find(item => item.id === row.id);
        if (!moved || forbidRoom(String(moved.AdRoomCode || ""), String(moved.AdRoomHall || ""))) return false;
        return conflictCount(next) <= base;
      },
    });
    if (!chain) return null;              // no honest plan is better than a partial one
    chains.push(chain);
    board = chain.moves.reduce((rows, move) => rows.map(item => (
      item.id === move.id
        ? withRoom(placed(item, move.day, move.start), move.roomCode, move.roomHall)
        : item
    )), board);
  }
  const moves = chains.flatMap(chain => chain.moves);
  return {
    moves,
    before: conflictCount(scope),
    after: conflictCount(board),
    instructorsAffected: new Set(moves.map(move => move.before.AdInstructorId).filter(Boolean)).size,
    roomsAffected: new Set(moves.map(move => `${move.roomCode}|${move.roomHall}`)).size,
  };
}
