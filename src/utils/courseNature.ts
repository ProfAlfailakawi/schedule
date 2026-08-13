import type { FSchedule } from "../types";
import { DAY_KEYS, DAY_NAMES, type DayKey } from "./scheduleRegulations";

/**
 * What a course actually is, learned from how it has been taught.
 *
 * The regulation describes the shapes a course *may* take. Ten years of this
 * department's own timetables describe the shape it *does* take — including the
 * single-day three, four and five hour blocks that the articles never spell out
 * because they belong to laboratories, workshops and field training rather than
 * to lectures.
 *
 * So the product learns first and quotes the regulation second. A course that
 * has run as one four-hour Wednesday block for nine years is not an error to be
 * corrected; it is the course. What deserves a warning is a term where that
 * course suddenly becomes something it has never been.
 *
 * Everything here is descriptive. Nothing it produces blocks a save.
 */

export interface Habit<T> { value: T; count: number; share: number }

export interface CourseNature {
  courseId: number;
  /** How many terms this was observed in. Below two, treat as a hint only. */
  terms: number;
  observations: number;
  /** The habitual number of meetings per week. */
  meetingsPerWeek: number;
  /** The habitual length of one meeting, in minutes. */
  meetingMinutes: number;
  /** Total taught minutes per week, as actually practised. */
  weeklyMinutes: number;
  /** The day combinations this course has used, most frequent first. */
  dayPatterns: Array<{ days: DayKey[]; label: string; count: number; share: number }>;
  /** Start times it has habitually used. */
  starts: Array<Habit<string>>;
  /** Who has taught it. */
  instructors: Array<Habit<number>>;
  /** Where it has been taught. */
  buildings: Array<Habit<string>>;
  rooms: Array<Habit<string>>;
  /** How many sections it usually runs. */
  sectionsPerTerm: number;
  /** Morning or evening, as practised. */
  period: "morning" | "evening" | "mixed";
  /** Terms it has appeared in, newest first — reveals a course that is seasonal. */
  seenInTerms: number[];
  /** True when the course is habitually taught as a single long block. */
  singleBlock: boolean;
  confidence: "high" | "medium" | "low";
  summary: string;
  /** A ready-made starting point for a new section of this course. */
  suggestion: {
    days: DayKey[];
    start: string;
    end: string;
    building: string;
    hall: string;
    instructorId: number;
  } | null;
}

const minutes = (value: string) => {
  const [h, m] = String(value || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const daysOf = (row: FSchedule) => DAY_KEYS.filter(key => Boolean((row as any)[key]));
const arabicNumber = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");
const labelOf = (days: DayKey[]) => days.map(day => DAY_NAMES[DAY_KEYS.indexOf(day)]).join(" · ");
const clockOf = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

/** The most common value in a list, with ties broken toward the larger. */
function commonest(values: number[]): number {
  if (!values.length) return 0;
  const counts = new Map<number, number>();
  values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

/**
 * Build one course's habits out of its history.
 *
 * `rows` should be every appointment ever recorded for the course, across all
 * terms. Sections of the same course in the same term are separate offerings of
 * the same shape, so they are counted individually rather than merged.
 */
function habits<T>(values: T[]): Array<Habit<T>> {
  const counts = new Map<T, number>();
  values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  const total = Math.max(1, values.length);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([value, count]) => ({ value, count, share: Math.round((count / total) * 100) }));
}

export function learnCourseNature(courseId: number, rows: FSchedule[]): CourseNature | null {
  const history = rows.filter(row => Number(row.AdCourseId) === courseId && row.fstarttime && row.fendtime);
  if (!history.length) return null;

  const termIds = [...new Set(history.map(row => Number(row.AdTermId)).filter(Boolean))].sort((a, b) => b - a);
  const terms = termIds.length;
  const meetingLengths = history.map(row => Math.max(0, minutes(row.fendtime) - minutes(row.fstarttime))).filter(Boolean);
  const dayCounts = history.map(row => daysOf(row).length).filter(Boolean);

  const patternCounts = new Map<string, { days: DayKey[]; count: number }>();
  history.forEach(row => {
    const days = daysOf(row);
    if (!days.length) return;
    const key = days.join("+");
    const entry = patternCounts.get(key) || { days, count: 0 };
    entry.count += 1;
    patternCounts.set(key, entry);
  });
  const dayPatterns = [...patternCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map(entry => ({
      days: entry.days,
      label: labelOf(entry.days),
      count: entry.count,
      share: Math.round((entry.count / Math.max(1, history.length)) * 100)
    }));

  const starts = habits(history.map(row => row.fstarttime).filter(Boolean));

  const meetingMinutes = commonest(meetingLengths);
  // The count has to agree with the pattern it is describing. Taking the most
  // common day-count separately produced summaries like "two meetings ·
  // Thursday", which is a sentence that argues with itself.
  const meetingsPerWeek = dayPatterns[0]?.days.length || commonest(dayCounts) || 1;
  const weeklyMinutes = meetingMinutes * meetingsPerWeek;
  const singleBlock = meetingsPerWeek === 1 && meetingMinutes >= 150;

  // Who, where and when — the rest of the course's character.
  const instructors = habits(history.map(row => Number(row.AdInstructorId)).filter(Boolean));
  const buildings = habits(history.map(row => String(row.AdRoomCode || "").trim()).filter(Boolean));
  const rooms = habits(history.map(row => `${row.AdRoomCode || ""}/${row.AdRoomHall || ""}`).filter(value => value !== "/"));
  const sectionsPerTerm = terms
    ? Math.max(1, Math.round(history.length / terms))
    : history.length;

  const morningCount = history.filter(row => minutes(row.fstarttime) < 14 * 60).length;
  const period: CourseNature["period"] =
    morningCount === history.length ? "morning"
    : morningCount === 0 ? "evening"
    : "mixed";

  // Eighteen terms of a course that is scheduled differently every time is not
  // knowledge — it is noise. Confidence needs both history and consistency.
  const dominance = dayPatterns[0]?.share || 0;
  const confidence: CourseNature["confidence"] =
    terms >= 4 && dominance >= 60 ? "high"
    : terms >= 2 && dominance >= 40 ? "medium"
    : "low";
  const hours = Math.round((weeklyMinutes / 60) * 10) / 10;

  const shapeLine = singleBlock
    ? `كتلة واحدة ${arabicNumber(Math.round(meetingMinutes / 60))} ساعات`
    : `${arabicNumber(meetingsPerWeek)} لقاءات × ${arabicNumber(meetingMinutes)}د (${arabicNumber(hours)} ساعة)`;
  const whereLine = buildings[0] ? ` · ${buildings[0].value}` : "";
  const whenLine = starts[0] ? ` · يبدأ ${starts[0].value}` : "";
  const settled = dominance >= 75 ? "" : dominance ? ` (${arabicNumber(dominance)}٪ من المرات)` : "";
  const summary = `${shapeLine}${dayPatterns[0] ? ` · ${dayPatterns[0].label}${settled}` : ""}${whenLine}${whereLine}`;

  // Everything needed to open a new section already filled in the way this
  // course has always been taught.
  const topPattern = dayPatterns[0];
  const topStart = starts[0]?.value || "";
  const topRoom = rooms[0]?.value || "";
  const [suggestedBuilding, suggestedHall] = topRoom.split("/");
  const suggestion = topPattern && topStart
    ? {
        days: topPattern.days,
        start: topStart,
        end: clockOf(minutes(topStart) + meetingMinutes),
        building: suggestedBuilding || "",
        hall: suggestedHall || "",
        instructorId: instructors[0]?.value || 0
      }
    : null;

  return {
    courseId, terms, observations: history.length,
    meetingsPerWeek, meetingMinutes, weeklyMinutes,
    dayPatterns, starts, instructors, buildings, rooms,
    sectionsPerTerm, period, seenInTerms: termIds,
    singleBlock, confidence, summary, suggestion
  };
}

/** Learn every course in one pass over a shared history. */
export function learnAll(rows: FSchedule[]): Map<number, CourseNature> {
  const byCourse = new Map<number, FSchedule[]>();
  rows.forEach(row => {
    const id = Number(row.AdCourseId);
    if (!id) return;
    byCourse.set(id, [...(byCourse.get(id) || []), row]);
  });
  const out = new Map<number, CourseNature>();
  for (const [courseId, list] of byCourse) {
    const nature = learnCourseNature(courseId, list);
    if (nature) out.set(courseId, nature);
  }
  return out;
}

/**
 * Is this appointment out of character for its course?
 *
 * Only says yes when the history is strong enough to have an opinion, and only
 * about a real departure — a different number of meetings, or a length that is
 * not one this course has ever used. Everything else is silence, which is what
 * a department teaching a five-hour Wednesday workshop deserves from a tool
 * that has watched it do so for a decade.
 */
export function departsFromNature(row: FSchedule, nature?: CourseNature | null): string | null {
  if (!nature || nature.confidence === "low") return null;
  const length = Math.max(0, minutes(row.fendtime) - minutes(row.fstarttime));
  const days = daysOf(row).length;
  if (!length || !days) return null;

  const knownLengths = new Set([nature.meetingMinutes]);
  // A course may legitimately have two habitual lengths; accept anything within
  // a changeover allowance of the habit.
  const closeEnough = Math.abs(length - nature.meetingMinutes) <= 15;
  if (!closeEnough && !knownLengths.has(length)) {
    return `المعتاد ${arabicNumber(nature.meetingMinutes)} دقيقة للقاء، وهذا ${arabicNumber(length)}`;
  }
  if (days !== nature.meetingsPerWeek) {
    return `المعتاد ${arabicNumber(nature.meetingsPerWeek)} لقاءات أسبوعياً، وهذا ${arabicNumber(days)}`;
  }
  return null;
}
