import type { AdCourse, FSchedule, StudentNeed } from "../types";
import { AR, countOf } from "./arabicCount";

/**
 * ── ما يقوله الطلاب، وما لا يستطيع أحد غيرهم قوله ───────────────────────────
 *
 * This program catches a double-booked teacher and a double-booked hall. It has
 * never been able to catch the third and commonest one — a student with two
 * lectures at the same hour — because nothing in ten years of data says which
 * courses share students. A timetable knows where every teacher is. It has
 * never known where anybody's week actually collides.
 *
 * The survey closes that, and the demand count is the smaller half of it.
 *
 * **The larger half is the graph.** A student who says «أحتاج ISL 210 و ARB
 * 220» has told the department something no history could: those two must
 * never overlap. Forty students, answering a question about themselves, build
 * a constraint that has been invisible since the system's first day — and it
 * enters the engine through the same door as every other conflict, so the drag
 * verdict, the radar, the repair chain and the approval review all inherit it
 * at once.
 *
 * **What it will not claim.** It speaks for the students who answered and for
 * nobody else. Every number carries its base, nothing here is ever presented
 * as registration data, and a course with three answers is reported as a course
 * with three answers.
 */

export interface CourseDemand {
  courseId: number;
  name: string;
  code: string;
  /** How many respondents said they need it. */
  students: number;
  /** Of the people who answered at all — the base for the number above. */
  share: number;
}

export interface CoEnrolment {
  a: number;
  b: number;
  /** Respondents who need both. */
  shared: number;
  nameA: string;
  nameB: string;
}

export interface DemandReading {
  /** People who answered. Every number is against this. */
  respondents: number;
  courses: CourseDemand[];
  /** Pairs that share enough students to matter, strongest first. */
  pairs: CoEnrolment[];
  /** Courses nobody asked for — quiet, and worth knowing before opening one. */
  unwanted: CourseDemand[];
  headline: string;
}

/**
 * Below this a pair is noise: two people who happen to want the same two
 * courses do not make a cohort, and treating them as one would produce a
 * conflict nobody can act on.
 */
export const PAIR_FLOOR = 3;

export function readStudentDemand(needs: StudentNeed[], courses: AdCourse[]): DemandReading {
  const byId = new Map(courses.map(course => [course.AdCourseId, course]));
  const respondents = needs.length;
  if (!respondents)
    return { respondents: 0, courses: [], pairs: [], unwanted: [], headline: "" };

  const wanted = new Map<number, number>();
  const together = new Map<string, number>();

  for (const need of needs) {
    const unique = [...new Set(need.courseIds)].filter(id => byId.has(id)).sort((a, b) => a - b);
    for (const id of unique) wanted.set(id, (wanted.get(id) || 0) + 1);
    // Every pair this one student needs at once. Order is normalised so a pair
    // is counted once however it was written.
    for (let i = 0; i < unique.length; i += 1)
      for (let j = i + 1; j < unique.length; j += 1) {
        const key = `${unique[i]}|${unique[j]}`;
        together.set(key, (together.get(key) || 0) + 1);
      }
  }

  const shape = (courseId: number, students: number): CourseDemand => {
    const course = byId.get(courseId);
    return {
      courseId, students,
      name: course?.CourseName || "",
      code: course?.CourseCode || "",
      share: Math.round((students / respondents) * 100),
    };
  };

  const demanded = [...wanted.entries()]
    .map(([courseId, students]) => shape(courseId, students))
    .sort((a, b) => b.students - a.students);

  const pairs: CoEnrolment[] = [...together.entries()]
    .filter(([, shared]) => shared >= PAIR_FLOOR)
    .map(([key, shared]) => {
      const [a, b] = key.split("|").map(Number);
      return { a, b, shared, nameA: byId.get(a)?.CourseName || "", nameB: byId.get(b)?.CourseName || "" };
    })
    .sort((x, y) => y.shared - x.shared);

  const asked = new Set(wanted.keys());
  const unwanted = courses
    .filter(course => !asked.has(course.AdCourseId))
    .map(course => shape(course.AdCourseId, 0));

  return {
    respondents, courses: demanded, pairs, unwanted,
    headline: `${countOf(respondents, AR.student)} أجاب · ` +
      `${countOf(demanded.length, AR.course)} مطلوب · ` +
      `${countOf(pairs.length, AR.pair)} لا يجوز أن تتقاطع.`,
  };
}

/**
 * The constraint, in the shape the conflict engine already speaks.
 *
 * Two lectures overlapping is only a student clash when their COURSES share
 * students, so this returns the set of course pairs that must never collide.
 * The engine takes it from here.
 */
export function cohortPairs(reading: DemandReading): Set<string> {
  const set = new Set<string>();
  for (const pair of reading.pairs) set.add(`${Math.min(pair.a, pair.b)}|${Math.max(pair.a, pair.b)}`);
  return set;
}

/** How many students a pair of courses shares, for a message that says why. */
export function sharedBetween(reading: DemandReading, a: number, b: number): number {
  const key = `${Math.min(a, b)}|${Math.max(a, b)}`;
  return reading.pairs.find(pair => `${Math.min(pair.a, pair.b)}|${Math.max(pair.a, pair.b)}` === key)?.shared || 0;
}
