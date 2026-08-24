import type { AdCourse, AdInstructor, FSchedule } from "../types";
import { AR, countOf } from "../utils/arabicCount";
import { learnRhythm, offRhythm } from "./departmentRhythm";
import { roomIdentityKey, roomDisplay } from "./locationRegistry";

/**
 * ── ما الذي ينتقل من الفصل الماضي، وما الذي يحتاج قراراً ────────────────────
 *
 * Building next term usually begins by copying last term, and the copy is the
 * easy part — the program already does it, into a draft, touching nothing real.
 * What was missing is the sentence a coordinator actually needs before they
 * press anything:
 *
 *     «٣١٢ موعداً يمكن نقلها بثقة · ١٧ مقرراً جديداً · ٤ أساتذة غير متاحين ·
 *      ٨ مقررات تغيّرت بياناتها · ٣ قاعات لم تعد مستخدمة ·
 *      ٢١ قراراً تاريخياً يستحق المراجعة»
 *
 * That is a reading, not a plan. It says what the copy can carry without anyone
 * thinking about it, and — far more usefully — it separates out the rows that
 * carry a decision inside them, so a person spends their attention on twenty-one
 * lectures instead of three hundred.
 *
 * Everything is counted from data the system already holds. Nothing here writes,
 * schedules, or proposes a placement: the draft is built by the existing
 * rollover endpoint, and only after someone has read this.
 */

export type RolloverFlag =
  | "course-gone"        // the course is no longer in the department's catalogue
  | "course-changed"     // it exists, but its hours or credit are not what they were
  | "instructor-away"    // retired, on sabbatical, or no longer on record
  | "room-retired";      // the hall appears nowhere else in the system any more

export interface RolloverConcern {
  row: FSchedule;
  flags: RolloverFlag[];
  /** Plain words a coordinator can act on. */
  why: string;
}

export interface RolloverReading {
  /** Rows that can be carried over with nothing to decide. */
  confident: number;
  /** Courses in the catalogue that had no lecture last term. */
  newCourses: AdCourse[];
  /** Instructors on last term's rows who are no longer available. */
  unavailableInstructors: AdInstructor[];
  /** Courses whose declared hours or credit changed since last term. */
  changedCourses: AdCourse[];
  /** Halls used last term that appear nowhere in the system now. */
  retiredRooms: string[];
  /** Every row that carries a decision, with the reason. */
  concerns: RolloverConcern[];
  /** The size of what is being read, so no number is quoted without its base. */
  sourceRows: number;
  /**
   * How much of the copy already looks like this department wrote it.
   *
   * The reading above answers «هل ينتقل؟» — is the course still in the
   * catalogue, is the teacher still here, does the hall still exist. It is a
   * check against the *record*. What it never asked is whether the result
   * would look like this department's own work: a lecture can survive every
   * one of those tests and still land at 08:55 in a department that has begun
   * at 08:50 for six years.
   *
   * That habit is already learned elsewhere — `learnRhythm` reads the start
   * ladders, lecture lengths and turnarounds out of the department's own
   * history, and `offRhythm` says in one sentence when a row breaks them. All
   * this does is run them over what is about to be copied, before it is
   * copied, so the coordinator sees which appointments would arrive wrong by
   * their own standard rather than discovering it a week into the term.
   *
   * Null when the history is too thin to have a habit at all. A department in
   * its first year has no style yet, and inventing one from eight lectures
   * would be worse than saying nothing.
   */
  style: RolloverStyle | null;
}

export interface RolloverStyle {
  /** Rows that carry cleanly AND sit inside the department's habit. */
  inStyle: number;
  /** Rows that carry cleanly but would arrive against it. */
  offStyle: number;
  /** inStyle as a share of the two, 0–100. */
  share: number;
  /** Named examples, so the share can be checked rather than believed. */
  notes: Array<{ row: FSchedule; text: string }>;
  /** The base the habit was read from. */
  learnedFrom: { rows: number; terms: number };
}

const roomKey = (row: FSchedule) => roomIdentityKey(row);

const REASONS: Record<RolloverFlag, string> = {
  "course-gone": "المقرر لم يعد ضمن مقررات القسم",
  "course-changed": "بيانات المقرر تغيّرت عن الفصل الماضي",
  "instructor-away": "الأستاذ غير متاح هذا الفصل",
  "room-retired": "القاعة لم تعد مستخدمة في النظام",
};

/**
 * @param sourceRows  last term's schedule for this department
 * @param catalogue   the department's courses as they stand TODAY
 * @param instructors every instructor on record, with their current status
 * @param liveRooms   halls in use anywhere in the system now
 * @param history     every row this department has ever had, across terms —
 *                    the base its style is read from. More is strictly better:
 *                    a habit is what survives across terms, and one term of it
 *                    is a coincidence. Omitted, the style reading is null.
 */
export function readTermRollover(
  sourceRows: FSchedule[],
  catalogue: AdCourse[],
  instructors: AdInstructor[],
  liveRooms: string[],
  history: FSchedule[] = [],
): RolloverReading {
  const courseById = new Map(catalogue.map(course => [course.AdCourseId, course]));
  const instructorById = new Map(instructors.map(person => [person.AdInstructorId, person]));
  const roomsInUse = new Set(liveRooms.filter(Boolean));

  const unavailable = new Map<number, AdInstructor>();
  const changed = new Map<number, AdCourse>();
  const retired = new Set<string>();
  const concerns: RolloverConcern[] = [];

  for (const row of sourceRows) {
    const flags: RolloverFlag[] = [];
    const course = courseById.get(row.AdCourseId);

    if (!course) flags.push("course-gone");
    else if (
      // The row carries the name the course had when it was scheduled. A name
      // that has since been rewritten is a real change a coordinator should see
      // before three hundred rows are copied over it.
      row.AdCourseName && String(row.AdCourseName).trim() &&
      String(row.AdCourseName).trim() !== String(course.CourseName || "").trim()
    ) {
      flags.push("course-changed");
      changed.set(course.AdCourseId, course);
    }

    const person = row.AdInstructorId ? instructorById.get(row.AdInstructorId) : undefined;
    if (row.AdInstructorId && (!person || person.AdInstructorStatus)) {
      flags.push("instructor-away");
      if (person) unavailable.set(person.AdInstructorId, person);
    }

    const place = roomKey(row);
    if (place && !roomsInUse.has(place)) {
      flags.push("room-retired");
      retired.add(roomDisplay(row) || place);
    }

    if (flags.length)
      concerns.push({ row, flags, why: flags.map(flag => REASONS[flag]).join(" · ") });
  }

  /* A course the catalogue holds that had no lecture at all last term is new
     work — it will not appear in any copy, and that is the point of saying so. */
  const taughtLastTerm = new Set(sourceRows.map(row => row.AdCourseId));
  const newCourses = catalogue.filter(course => !taughtLastTerm.has(course.AdCourseId));

  /* Style is read only over the rows that would actually be copied — a row
     already flagged for a decision will be looked at by a person anyway, and
     telling them it is also five minutes off its usual start is noise stacked
     on a question they have not answered yet. */
  const flagged = new Set(concerns.map(concern => concern.row.id));
  const carrying = sourceRows.filter(row => !flagged.has(row.id));
  const rhythm = history.length ? learnRhythm(history) : null;
  let style: RolloverStyle | null = null;
  if (rhythm && rhythm.patterns.length) {
    const notes: Array<{ row: FSchedule; text: string }> = [];
    let inStyle = 0;
    for (const row of carrying) {
      const said = offRhythm(row as unknown as Parameters<typeof offRhythm>[0], rhythm);
      if (said) notes.push({ row, text: said });
      else inStyle += 1;
    }
    const total = inStyle + notes.length;
    style = total
      ? {
          inStyle,
          offStyle: notes.length,
          share: Math.round((inStyle / total) * 100),
          notes,
          learnedFrom: rhythm.learnedFrom,
        }
      : null;
  }

  return {
    confident: sourceRows.length - concerns.length,
    style,
    newCourses,
    unavailableInstructors: [...unavailable.values()],
    changedCourses: [...changed.values()],
    retiredRooms: [...retired].sort(),
    concerns,
    sourceRows: sourceRows.length,
  };
}

/** The one-line reading, built from the numbers rather than written by hand. */
export function describeRollover(reading: RolloverReading): string {
  const ar = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");
  if (!reading.sourceRows) return "لا جدول في الفصل السابق لهذا القسم.";
  const parts = [`${countOf(reading.confident, AR.appointment)} يمكن نقلها بثقة`];
  if (reading.newCourses.length) parts.push(`${countOf(reading.newCourses.length, AR.course)} جديد`);
  if (reading.unavailableInstructors.length) parts.push(`${countOf(reading.unavailableInstructors.length, AR.instructor)} غير متاح`);
  if (reading.changedCourses.length) parts.push(`${countOf(reading.changedCourses.length, AR.course)} تغيّرت بياناته`);
  if (reading.retiredRooms.length) parts.push(`${countOf(reading.retiredRooms.length, AR.room)} لم تعد مستخدمة`);
  if (reading.concerns.length) parts.push(`${countOf(reading.concerns.length, AR.decision)} يستحق المراجعة`);
  /* Leads the tail rather than the head: the counts answer «ماذا ينتقل؟», and
     this answers «وهل سيبدو كجدولي؟» — the second question, in second place. */
  if (reading.style) parts.push(`${ar(reading.style.share)}٪ بأسلوب قسمك`);
  return parts.join(" · ");
}
