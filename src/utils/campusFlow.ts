import type { AdInstructor, FSchedule } from "../types";
import {
  DEFAULT_TRAVEL_MINUTES,
  SAME_BUILDING_MINUTES,
} from "./campusTravel";
import { SCHEDULE_DAYS, activeDays, timeToMinutes, type DayKey } from "./scheduleIntelligence";

/**
 * ── حركة الحرم ─────────────────────────────────────────────────────────────
 *
 * A timetable decides where several hundred people stand at ten o'clock, and
 * then nobody looks at that. The corridors find out on the first day.
 *
 * Everything here is derived from rows that are already on screen — no new
 * field, no survey, no guess about student numbers. Two readings come out of
 * that honestly:
 *
 *   1. **The crossing** — for each break between two consecutive periods, how
 *      many lectures END in one building and BEGIN in another. That is the
 *      crowd that has to cross the campus in ten minutes, and it is a fact
 *      about the schedule, not an estimate about people.
 *
 *   2. **The impossible walk** — a teacher whose next lecture starts before
 *      they could physically have arrived. This one is not a statistic; it is a
 *      mistake, and it is named with both lectures so it can be fixed.
 *
 * What it deliberately does NOT claim: how many students are in a section, how
 * fast anyone walks, or anything about energy. Those need data this system does
 * not hold, and inventing them would make a confident chart out of nothing.
 */

export interface FlowBand {
  /** The minute the break begins — the end of the earlier period. */
  at: number;
  label: string;
  /** Lectures ending here, and lectures beginning at the other end. */
  leaving: number;
  arriving: number;
  /** Of those, how many change building — the crowd that actually crosses. */
  crossing: number;
  /** The heaviest single corridor in this band, e.g. "12 → 14". */
  busiestPath: string | null;
  busiestPathCount: number;
}

export interface ImpossibleWalk {
  instructor: string;
  fromCourse: string;
  toCourse: string;
  day: DayKey;
  dayLabel: string;
  /** Minutes actually available between the two lectures. */
  gap: number;
  /** Minutes the walk needs. */
  needs: number;
  fromPlace: string;
  toPlace: string;
}

export interface CampusFlowReading {
  bands: FlowBand[];
  peak: FlowBand | null;
  impossible: ImpossibleWalk[];
  /** Buildings actually in use — the denominator for everything above. */
  buildings: string[];
}

const buildingOf = (row: FSchedule) => String(row.AdRoomCode || "").trim();
const placeOf = (row: FSchedule) =>
  [String(row.AdRoomCode || "").trim(), String(row.AdRoomHall || "").trim()].filter(Boolean).join("/");

/** Minutes a move between two rooms needs, using the campus defaults. */
const walkMinutes = (from: FSchedule, to: FSchedule): number => {
  const a = buildingOf(from), b = buildingOf(to);
  if (!a || !b) return 0;
  return a === b ? SAME_BUILDING_MINUTES : DEFAULT_TRAVEL_MINUTES;
};

/**
 * The reading, for one day or for the whole week.
 *
 * A band is keyed by the minute a lecture ends, because that is when people
 * start moving. Two lectures ending at 09:15 and 09:20 are two bands, not one —
 * the corridor does not round to the nearest half hour.
 */
export function readCampusFlow(
  rows: FSchedule[],
  instructors: Map<number, AdInstructor>,
  options?: { day?: DayKey | "week" },
): CampusFlowReading {
  const dayFilter = options?.day && options.day !== "week" ? options.day : null;
  const inScope = rows.filter(row =>
    row.fstarttime && row.fendtime &&
    (!dayFilter || Boolean((row as any)[dayFilter])));

  const buildings = [...new Set(inScope.map(buildingOf).filter(Boolean))].sort();

  /* --- 1. The crossing ---------------------------------------------------- */
  const bands = new Map<number, FlowBand & { paths: Map<string, number> }>();
  const days: DayKey[] = dayFilter ? [dayFilter] : SCHEDULE_DAYS.map(d => d.key);

  for (const day of days) {
    const onDay = inScope.filter(row => Boolean((row as any)[day]));
    for (const ending of onDay) {
      const endsAt = timeToMinutes(ending.fendtime);
      // Whoever begins within the quarter hour after this lecture ends is in the
      // same corridor as the people leaving it.
      const next = onDay.filter(row => {
        const startsAt = timeToMinutes(row.fstarttime);
        return startsAt >= endsAt && startsAt <= endsAt + 15;
      });
      if (!next.length) continue;
      const band = bands.get(endsAt) || {
        at: endsAt,
        label: `${String(Math.floor(endsAt / 60)).padStart(2, "0")}:${String(endsAt % 60).padStart(2, "0")}`,
        leaving: 0, arriving: 0, crossing: 0,
        busiestPath: null, busiestPathCount: 0,
        paths: new Map<string, number>(),
      };
      band.leaving += 1;
      band.arriving += next.length;
      for (const arriving of next) {
        const from = buildingOf(ending), to = buildingOf(arriving);
        if (!from || !to || from === to) continue;
        band.crossing += 1;
        const key = `${from} → ${to}`;
        band.paths.set(key, (band.paths.get(key) || 0) + 1);
      }
      bands.set(endsAt, band);
    }
  }

  const list: FlowBand[] = [...bands.values()]
    .map(band => {
      let busiestPath: string | null = null, busiestPathCount = 0;
      band.paths.forEach((count, path) => {
        if (count > busiestPathCount) { busiestPathCount = count; busiestPath = path; }
      });
      const { paths: _drop, ...rest } = band;
      return { ...rest, busiestPath, busiestPathCount };
    })
    .filter(band => band.crossing > 0)
    .sort((a, b) => a.at - b.at);

  const peak = list.reduce<FlowBand | null>(
    (best, band) => (!best || band.crossing > best.crossing ? band : best), null);

  /* --- 2. The impossible walk --------------------------------------------- */
  const impossible: ImpossibleWalk[] = [];
  const byInstructor = new Map<number, FSchedule[]>();
  inScope.forEach(row => {
    if (!row.AdInstructorId) return;
    const bucket = byInstructor.get(row.AdInstructorId);
    if (bucket) bucket.push(row); else byInstructor.set(row.AdInstructorId, [row]);
  });

  byInstructor.forEach((mine, instructorId) => {
    for (const day of days) {
      const onDay = mine
        .filter(row => Boolean((row as any)[day]))
        .sort((a, b) => timeToMinutes(a.fstarttime) - timeToMinutes(b.fstarttime));
      for (let index = 0; index + 1 < onDay.length; index += 1) {
        const from = onDay[index], to = onDay[index + 1];
        const gap = timeToMinutes(to.fstarttime) - timeToMinutes(from.fendtime);
        if (gap < 0) continue;                       // an overlap is a conflict, not a walk
        const needs = walkMinutes(from, to);
        if (gap >= needs) continue;
        impossible.push({
          instructor: instructors.get(instructorId)?.AdInstructorName || "بدون أستاذ",
          fromCourse: from.AdCourseName || `موعد ${from.id}`,
          toCourse: to.AdCourseName || `موعد ${to.id}`,
          day,
          dayLabel: SCHEDULE_DAYS.find(d => d.key === day)?.label || "",
          gap, needs,
          fromPlace: placeOf(from) || "—",
          toPlace: placeOf(to) || "—",
        });
      }
    }
  });

  impossible.sort((a, b) => (a.gap - a.needs) - (b.gap - b.needs));
  return { bands: list, peak, impossible, buildings };
}
