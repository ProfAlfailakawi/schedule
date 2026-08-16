import { formatScheduleTimeRange } from "./scheduleTime";
import type { FSchedule } from "../types";
import { AR, countOf } from "../utils/arabicCount";
import { SCHEDULE_DAYS, timeToMinutes, type DayKey } from "./scheduleIntelligence";
import { patternForDay } from "./weekVisual";

/**
 * ── أسلوب القسم ─────────────────────────────────────────────────────────────
 *
 * A department has habits it has never written down, and the strongest of them
 * is its rhythm. Ten minutes between one lecture and the next. Sunday, Tuesday
 * and Thursday run one length; Monday and Wednesday run another. Nobody has
 * ever typed any of that into anything — it lives in ten years of schedules,
 * repeated a few thousand times.
 *
 * So this does not ask. Asking would put an empty field on a settings screen
 * and request a number the software is already holding several thousand
 * examples of. It reads the habit back out of the rows, and the conflict sweep
 * obeys it from then on without anybody declaring a thing.
 *
 * **Two rhythms, not one.** A week here is two interleaved schedules — the
 * Sunday-Tuesday-Thursday pattern and the Monday-Wednesday pattern — and they
 * keep different lengths. Averaging them produces a number belonging to
 * neither, and a rule built on that number is wrong on both. Every reading
 * below is per pattern.
 *
 * **It refuses when it is unsure.** A pattern with no consistent habit yields
 * nothing at all. A confident wrong number is worse than silence: it becomes a
 * rule that quietly starts producing findings nobody asked for.
 *
 * **It never blocks.** Everything learned here surfaces as a remark. A person
 * who means to break their own habit is not stopped — they are told, once.
 */

export interface PatternRhythm {
  /** The days this rhythm governs. */
  days: DayKey[];
  /** Minutes between consecutive lectures. Zero when no habit is clear. */
  breakMinutes: number;
  breakAgreement: number;
  /** The lecture length this pattern keeps, in minutes. Zero when unclear. */
  durationMinutes: number;
  /** The full range actually used, so a reading can say "من ١:٠٠ إلى ١:٢٠". */
  durationRange: [number, number];
  durationAgreement: number;
  /** Start times this pattern habitually uses, commonest first. */
  ladder: string[];
  /** Consecutive pairs and lectures the reading rests on. */
  pairs: number;
  lectures: number;
}

export interface RhythmReading {
  patterns: PatternRhythm[];
  /** The rhythm governing a given day, or null when that day has no habit. */
  forDay(day: DayKey): PatternRhythm | null;
  /** How much history this was read from — the base of every number above. */
  learnedFrom: { rows: number; terms: number };
}

/** Anything longer than this is a free period, not a turnaround. */
const BREAK_CEILING = 45;
/** Below this many examples a reading is an anecdote, not a habit. */
const MIN_PAIRS = 6;
const MIN_LECTURES = 8;
/** Below this agreement the pattern has no single habit to state. */
const MIN_AGREEMENT = 55;

const mode = (values: number[]) => {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  let best = 0, bestCount = 0;
  counts.forEach((count, value) => {
    if (count > bestCount || (count === bestCount && value < best)) { best = value; bestCount = count; }
  });
  return { value: best, count: bestCount };
};

const patternKey = (days: DayKey[]) => days.join(",");

/**
 * The department's own style, read from its history.
 *
 * @param rows  every schedule row available — ten years of them if they exist.
 *              More history is strictly better here: a habit is what survives
 *              across terms, and one term of it is a coincidence.
 */
export function learnRhythm(rows: FSchedule[]): RhythmReading {
  const usable = rows.filter(row => row.fstarttime && row.fendtime);
  const groups = new Map<string, { days: DayKey[]; rows: FSchedule[] }>();

  for (const day of SCHEDULE_DAYS) {
    const days = patternForDay(day.key as DayKey) as DayKey[];
    const key = patternKey(days);
    if (!groups.has(key)) groups.set(key, { days, rows: [] });
  }

  /* A lecture belongs to the pattern of the days it meets on. One that meets
     across both patterns is evidence about neither, and is left out rather
     than counted twice. */
  for (const row of usable) {
    const meets = SCHEDULE_DAYS.map(day => day.key as DayKey).filter(key => Boolean((row as any)[key]));
    if (!meets.length) continue;
    const keys = new Set(meets.map(day => patternKey(patternForDay(day) as DayKey[])));
    if (keys.size !== 1) continue;
    groups.get([...keys][0])?.rows.push(row);
  }

  const patterns: PatternRhythm[] = [];
  for (const { days, rows: mine } of groups.values()) {
    /* Breaks: the gap between one lecture ending and the next beginning on the
       same day — WITHIN ONE TERM.
     *
     * Reading across the whole history at once destroys the very signal it is
     * there to find: ten years of Mondays stack on top of each other, sorting
     * puts ten identical 08:00 lectures in a row, and almost every consecutive
     * pair becomes a lecture against its own twin. Measured, that turned a
     * hundred clean examples of a ten-minute break into two. A day belongs to
     * a term, and consecutive means consecutive in it. */
    const gaps: number[] = [];
    const terms = new Set(mine.map(row => row.AdTermId));
    for (const term of terms) {
      const inTerm = mine.filter(row => row.AdTermId === term);
      for (const day of days) {
        const onDay = inTerm
          .filter(row => Boolean((row as any)[day]))
          .sort((a, b) => timeToMinutes(a.fstarttime) - timeToMinutes(b.fstarttime));
        for (let index = 0; index + 1 < onDay.length; index += 1) {
          const gap = timeToMinutes(onDay[index + 1].fstarttime) - timeToMinutes(onDay[index].fendtime);
          if (gap > 0 && gap <= BREAK_CEILING) gaps.push(gap);
        }
      }
    }
    const breakMode = mode(gaps);
    const breakAgreement = gaps.length ? Math.round((breakMode.count / gaps.length) * 100) : 0;
    const breakClear = gaps.length >= MIN_PAIRS && breakAgreement >= MIN_AGREEMENT;

    /* Lengths. The mode is the habit; the range is what the department will
       actually recognise as its own — «من ساعة إلى ساعة وثلث». */
    const lengths = mine
      .map(row => timeToMinutes(row.fendtime) - timeToMinutes(row.fstarttime))
      .filter(minutes => minutes > 0 && minutes <= 300);
    const lengthMode = mode(lengths);
    const durationAgreement = lengths.length ? Math.round((lengthMode.count / lengths.length) * 100) : 0;
    const lengthClear = lengths.length >= MIN_LECTURES && durationAgreement >= 35;
    // A single outlier must not stretch the stated range, so the ends are
    // trimmed to what the middle ninety per cent actually uses.
    const sorted = [...lengths].sort((a, b) => a - b);
    const at = (share: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] || 0;

    const starts = mine.map(row => row.fstarttime).filter(Boolean);
    const startCounts = new Map<string, number>();
    for (const start of starts) startCounts.set(start, (startCounts.get(start) || 0) + 1);

    patterns.push({
      days,
      breakMinutes: breakClear ? breakMode.value : 0,
      breakAgreement,
      durationMinutes: lengthClear ? lengthMode.value : 0,
      durationRange: lengthClear ? [at(0.05), at(0.95)] : [0, 0],
      durationAgreement,
      ladder: [...startCounts.entries()]
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 12).map(([time]) => time).sort(),
      pairs: gaps.length,
      lectures: mine.length,
    });
  }

  const byDay = new Map<DayKey, PatternRhythm | null>();
  for (const day of SCHEDULE_DAYS) {
    const key = patternKey(patternForDay(day.key as DayKey) as DayKey[]);
    byDay.set(day.key as DayKey,
      patterns.find(pattern => patternKey(pattern.days) === key) || null);
  }

  return {
    patterns,
    forDay: (day: DayKey) => byDay.get(day) || null,
    learnedFrom: { rows: usable.length, terms: new Set(usable.map(row => row.AdTermId)).size },
  };
}

/**
 * Does this placement break the department's own habit?
 *
 * Returns a sentence when it does, and nothing when it does not. Deliberately
 * one sentence and not a list: a person who has just typed a time wants to
 * know the one thing that looks wrong about it.
 */
export function offRhythm(
  row: Pick<FSchedule, "fstarttime" | "fendtime"> & Record<string, unknown>,
  reading: RhythmReading,
): string {
  const day = SCHEDULE_DAYS.map(item => item.key as DayKey).find(key => Boolean(row[key]));
  if (!day) return "";
  const rhythm = reading.forDay(day);
  if (!rhythm) return "";

  const start = timeToMinutes(String(row.fstarttime || ""));
  const end = timeToMinutes(String(row.fendtime || ""));
  const label = SCHEDULE_DAYS.find(item => item.key === day)?.label || "";
  const clock = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  /* The start ladder comes first: a lecture beginning at 08:55 where the
     department has always begun at 08:50 is the exact mistake this exists to
     catch, and it is invisible to every other check in the program. */
  if (rhythm.ladder.length && row.fstarttime && !rhythm.ladder.includes(String(row.fstarttime))) {
    const nearest = rhythm.ladder
      .map(time => ({ time, away: Math.abs(timeToMinutes(time) - start) }))
      .sort((a, b) => a.away - b.away)[0];
    // Only when it is CLOSE to a habitual start. A deliberately different hour
    // is a decision; five minutes off is a slip.
    if (nearest && nearest.away > 0 && nearest.away <= 20)
      return `${label} في قسمك يبدأ عادةً ${nearest.time}، وهذا الموعد يبدأ ${row.fstarttime}.`;
  }

  const length = end - start;
  const [low, high] = rhythm.durationRange;
  if (rhythm.durationMinutes && length > 0 && (length < low || length > high)) {
    const span = low === high ? `${low} دقيقة` : formatScheduleTimeRange(clock(low), clock(high));
    return `مدة محاضرات ${label} في قسمك ${span}، ومدة هذا الموعد ${countOf(length, AR.minute)}.`;
  }
  return "";
}

/** The one line describing what was learned, for a reader who asks. */
export function describeRhythm(reading: RhythmReading): string {
  const ar = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");
  const said = reading.patterns
    .filter(pattern => pattern.breakMinutes || pattern.durationMinutes)
    .map(pattern => {
      const days = pattern.days
        .map(day => SCHEDULE_DAYS.find(item => item.key === day)?.label || "")
        .filter(Boolean).join("/");
      const parts: string[] = [];
      if (pattern.durationMinutes) parts.push(countOf(pattern.durationMinutes, AR.minute));
      if (pattern.breakMinutes) parts.push(`وبينها ${countOf(pattern.breakMinutes, AR.minute)}`);
      return `${days}: ${parts.join(" ")}`;
    });
  if (!said.length) return "";
  /* Arabic counts three ways and getting it wrong reads as machine output.
     Two is a dual, three to ten take a plural, eleven and up take a singular
     accusative — «١٠ فصول» and «١١ فصلاً», never «١٠ فصلاً». */
  return `${said.join(" · ")} — مقروءة من ${countOf(reading.learnedFrom.rows, AR.appointment)} ` +
    `في ${countOf(reading.learnedFrom.terms, AR.term)}.`;
}
