import type { AdCourse, AdInstructor, FSchedule } from "../types";

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
}

const roomKey = (row: FSchedule) =>
  [String(row.AdRoomCode || "").trim(), String(row.AdRoomHall || "").trim()].filter(Boolean).join("/");

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
 */
export function readTermRollover(
  sourceRows: FSchedule[],
  catalogue: AdCourse[],
  instructors: AdInstructor[],
  liveRooms: string[],
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
      retired.add(place);
    }

    if (flags.length)
      concerns.push({ row, flags, why: flags.map(flag => REASONS[flag]).join(" · ") });
  }

  /* A course the catalogue holds that had no lecture at all last term is new
     work — it will not appear in any copy, and that is the point of saying so. */
  const taughtLastTerm = new Set(sourceRows.map(row => row.AdCourseId));
  const newCourses = catalogue.filter(course => !taughtLastTerm.has(course.AdCourseId));

  return {
    confident: sourceRows.length - concerns.length,
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
  const parts = [`${ar(reading.confident)} موعداً يمكن نقلها بثقة`];
  if (reading.newCourses.length) parts.push(`${ar(reading.newCourses.length)} مقرراً جديداً`);
  if (reading.unavailableInstructors.length) parts.push(`${ar(reading.unavailableInstructors.length)} أستاذاً غير متاح`);
  if (reading.changedCourses.length) parts.push(`${ar(reading.changedCourses.length)} مقرراً تغيّرت بياناته`);
  if (reading.retiredRooms.length) parts.push(`${ar(reading.retiredRooms.length)} قاعة لم تعد مستخدمة`);
  if (reading.concerns.length) parts.push(`${ar(reading.concerns.length)} قراراً يستحق المراجعة`);
  return parts.join(" · ");
}
