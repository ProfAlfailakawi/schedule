import type { AdCourse, AdInstructor, FSchedule } from "../types";
import { AR, countOf } from "./arabicCount";
import {
  SCHEDULE_DAYS,
  findConflicts,
  minutesToTime,
  timeToMinutes,
  type DayKey,
} from "./scheduleIntelligence";
import type { RhythmReading } from "./departmentRhythm";
import { cohortPairs, type DemandReading } from "./studentDemand";
import type { Prediction } from "./courseSuccession";

/**
 * ── الشعبة الجديدة، وأين توضع ───────────────────────────────────────────────
 *
 * The survey goes out before the term and registration runs in the first week,
 * by which time the timetable is already written. So the question the answers
 * actually have to settle is not «انقل محاضرة» — the department is past that.
 * It is:
 *
 *     **كم شعبة نفتح، وأين نضعها؟**
 *
 * The first half is arithmetic the program could always have done and never
 * did: every course already carries `MaxStudent`, and the survey says how many
 * people want it. Thirty-four students, a ceiling of twenty-five, one section
 * open — nine people have no seat and a second section has to exist.
 *
 * The second half is the part nobody wants to do by hand, and it is the same
 * search the repair engine already runs, pointed the other way: instead of
 * moving a lecture that exists, it PLACES one that does not. The department's
 * own start ladder decides the candidate hours; ten years of history decide how
 * long a lecture runs and what the gap between two of them is; every hall's
 * week, every teacher's week, and the courses those same students need decide
 * what is actually free.
 *
 * **The bar is the same absolute one.** A placement is returned only if it
 * collides with nothing: no hall double-booked, no teacher in two rooms, no
 * turnaround shorter than the department's own, and — the whole point — no
 * overlap with a course this cohort also needs. Opening a second section at an
 * hour that clashes with what those same students are taking solves nothing.
 *
 * **Sections opened together are placed against each other.** The second new
 * section is searched for in a week that already contains the first, so two
 * proposals never land in the same hall at the same hour.
 *
 * **It says when it cannot answer.** A course with no `MaxStudent` is reported
 * as a course with no ceiling, not silently skipped and not given a guessed
 * one. And nothing here is ever written — every placement is a sentence until
 * a person opens it and saves it.
 */

export interface Placement {
  /** 1 for the first new section, 2 for the second … */
  index: number;
  day: DayKey;
  dayLabel: string;
  start: string;
  end: string;
  roomCode: string;
  roomHall: string;
  /** Zero when nobody who teaches this course is free at that hour. */
  instructorId: number;
  instructorName: string;
  /**
   * The number this new section would carry.
   *
   * Not decoration: the save path rejects a non-numeric section code outright
   * («رقم الشعبة يجب أن يكون بالأرقام الإنجليزية»), so a placeholder like
   * «جديدة-٢» makes the proposal unopenable. It continues the course's own
   * numbering instead.
   */
  sectionCode: string;
  note: string;
}

export interface SectionProposal {
  courseId: number;
  courseName: string;
  courseCode: string;
  /** Students who asked for it — real answers, or the forecast when there are none. */
  demand: number;
  /** True when `demand` came from the forecast rather than from answers. */
  predicted: boolean;
  /** MaxStudent. Zero means the course has no ceiling recorded. */
  capacity: number;
  openSections: number;
  seats: number;
  /** Students with no seat. */
  shortfall: number;
  /** New sections the arithmetic asks for. */
  needed: number;
  placements: Placement[];
  sentence: string;
}

export interface OpeningReading {
  proposals: SectionProposal[];
  /** Courses in demand whose ceiling is not recorded, so nothing can be said. */
  noCeiling: Array<{ courseId: number; name: string; demand: number }>;
  headline: string;
}

const DAY_LABEL = new Map(SCHEDULE_DAYS.map(day => [day.key, day.label] as const));
const DAY_KEYS = SCHEDULE_DAYS.map(day => day.key as DayKey);

const dayOf = (row: FSchedule): DayKey | null =>
  DAY_KEYS.find(key => Boolean((row as any)[key])) || null;

const mode = (values: number[]) => {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  let best = 0, bestCount = 0;
  counts.forEach((count, value) => { if (count > bestCount) { best = value; bestCount = count; } });
  return best;
};

/** A row that does not exist yet, shaped like every other row so the sweep reads it. */
const draft = (
  seed: FSchedule,
  day: DayKey,
  start: number,
  length: number,
  room: { code: string; hall: string },
  instructorId: number,
  id: number,
): FSchedule => {
  const next: any = { ...seed, id };
  for (const key of DAY_KEYS) next[key] = false;
  next[day] = true;
  next.fstarttime = minutesToTime(start);
  next.fendtime = minutesToTime(start + length);
  next.AdRoomCode = room.code;
  next.AdRoomHall = room.hall;
  next.AdInstructorId = instructorId;
  // A new section is a new SCode; inside the sweep it only has to be unlike
  // every other, and the number a person would actually save is carried on the
  // placement rather than invented here.
  next.SCode = `new${id}`;
  return next as FSchedule;
};

const clean = (rows: FSchedule[], all: FSchedule[], pairs: Set<string>, doorway: number) =>
  findConflicts(rows, all, { cohortPairs: pairs, doorwayMinutes: doorway }).length === 0;

/**
 * @param week      every row in this term for this section — the week being planned
 * @param universe  every row in the term from every department, for hall clashes
 * @param demand    the survey reading; its cohort pairs are enforced on placements
 * @param forecast  used only for a term with no answers of its own
 */
export function readSectionOpenings(
  week: FSchedule[],
  universe: FSchedule[],
  courses: AdCourse[],
  instructors: AdInstructor[],
  history: FSchedule[],
  demand: DemandReading,
  forecast: Prediction | null,
  rhythm: RhythmReading | null,
  doorway: number,
  limit = 6,
): OpeningReading {
  const wanted = demand.respondents
    ? demand.courses.map(course => ({ id: course.courseId, students: course.students, predicted: false }))
    : (forecast?.courses || []).map(course => ({ id: course.courseId, students: course.expected, predicted: true }));
  if (!wanted.length) return { proposals: [], noCeiling: [], headline: "" };

  const byId = new Map(courses.map(course => [course.AdCourseId, course]));
  const personById = new Map(instructors.map(person => [person.AdInstructorId, person]));
  const pairs = cohortPairs(demand);

  /* Rooms this section actually uses, commonest first. A proposal that puts a
     lecture in a hall the department has never taught in is not a proposal. */
  const roomUse = new Map<string, number>();
  for (const row of history) {
    if (!row.AdRoomCode) continue;
    const key = `${row.AdRoomCode}|${row.AdRoomHall || ""}`;
    roomUse.set(key, (roomUse.get(key) || 0) + 1);
  }
  const rooms = [...roomUse.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => { const [code, hall] = key.split("|"); return { code, hall }; });

  const proposals: SectionProposal[] = [];
  const noCeiling: OpeningReading["noCeiling"] = [];
  /* Every placement accepted is added here before the next one is searched, so
     two new sections are never proposed into the same hall at the same hour. */
  const working = [...universe];
  let draftId = -1;

  for (const item of wanted) {
    const course = byId.get(item.id);
    if (!course) continue;
    const mine = week.filter(row => Number(row.AdCourseId) === item.id);
    const openSections = new Set(mine.map(row => String(row.SCode))).size;
    const capacity = Number(course.MaxStudent) || 0;

    if (!capacity) {
      if (item.students > 0) noCeiling.push({ courseId: item.id, name: course.CourseName, demand: item.students });
      continue;
    }

    const seats = openSections * capacity;
    const shortfall = Math.max(0, item.students - seats);
    if (!shortfall) continue;
    const needed = Math.ceil(shortfall / capacity);

    /* Shape the new section on the existing one: same length, same kind of
       hall, and a teacher who has actually taught this course. With no section
       open at all, the department's learned lecture length is used instead. */
    const seed = mine[0] || week[0];
    if (!seed) continue;
    const lengths = mine
      .map(row => timeToMinutes(row.fendtime) - timeToMinutes(row.fstarttime))
      .filter(minutes => minutes > 0);
    const length = mode(lengths)
      || rhythm?.patterns.find(pattern => pattern.durationMinutes)?.durationMinutes
      || 75;

    const taught = new Map<number, number>();
    for (const row of history)
      if (Number(row.AdCourseId) === item.id && row.AdInstructorId)
        taught.set(row.AdInstructorId, (taught.get(row.AdInstructorId) || 0) + 1);
    const teachers = [...taught.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);

    /* Continue this course's own numbering, across its whole history so a code
       that was retired is not handed out again. */
    const usedCodes = history
      .filter(row => Number(row.AdCourseId) === item.id)
      .map(row => Number(String(row.SCode).replace(/\D/g, "")))
      .filter(value => Number.isFinite(value) && value > 0);
    const nextCode = (usedCodes.length ? Math.max(...usedCodes) : openSections) + 1;

    const placements: Placement[] = [];
    for (let slot = 1; slot <= needed; slot += 1) {
      let placed: Placement | null = null;

      for (const day of DAY_KEYS) {
        const ladder = rhythm?.forDay(day)?.ladder || [];
        if (!ladder.length) continue;
        for (const time of ladder) {
          if (placed) break;
          const at = timeToMinutes(time);
          for (const room of rooms.slice(0, 24)) {
            if (placed) break;
            /* A teacher is tried before "unassigned": a slot somebody can
               actually teach is worth more than a slot nobody can. */
            const candidates = teachers.length ? [...teachers, 0] : [0];
            for (const teacherId of candidates) {
              const candidate = draft(seed, day, at, length, room, teacherId, draftId);
              if (!clean([candidate], [...working, candidate], pairs, doorway)) continue;
              draftId -= 1;
              working.push(candidate);
              const person = personById.get(teacherId);
              placed = {
                index: slot, day, dayLabel: DAY_LABEL.get(day) || "",
                start: minutesToTime(at), end: minutesToTime(at + length),
                roomCode: room.code, roomHall: room.hall,
                instructorId: teacherId,
                instructorName: person?.AdInstructorName || "",
                sectionCode: String(nextCode + slot - 1),
                note: teacherId
                  ? ""
                  : "لم يتفرّغ أيٌّ ممن درّسوا هذا المقرر في هذا الوقت — الوقت والقاعة متاحان، ويحتاج أستاذاً.",
              };
              break;
            }
          }
        }
        if (placed) break;
      }

      if (placed) placements.push(placed);
      else break;
    }

    const proposal: SectionProposal = {
      courseId: item.id,
      courseName: course.CourseName,
      courseCode: course.CourseCode,
      demand: item.students,
      predicted: item.predicted,
      capacity, openSections, seats, shortfall, needed, placements,
      sentence: "",
    };
    proposal.sentence = describeProposal(proposal);
    proposals.push(proposal);
  }

  proposals.sort((a, b) => b.shortfall - a.shortfall);
  const kept = proposals.slice(0, limit);
  return { proposals: kept, noCeiling, headline: describeOpenings(kept, noCeiling.length) };
}

/** One sentence per course, built from its own numbers. */
export function describeProposal(proposal: SectionProposal): string {
  const found = proposal.placements.length;
  const head = `«${proposal.courseName}»: طلبه ${countOf(proposal.demand, AR.student)}` +
    `${proposal.predicted ? " (توقُّع)" : ""}، والمفتوح ${countOf(proposal.openSections, AR.section)} ` +
    `بسعة ${proposal.capacity} لكل شعبة — ${countOf(proposal.shortfall, AR.student)} بلا مقعد.`;
  if (!found)
    return `${head} تحتاج ${countOf(proposal.needed, AR.section)}، ولم أجد وقتاً يخلو من كل التعارضات.`;
  if (found < proposal.needed)
    return `${head} تحتاج ${countOf(proposal.needed, AR.section)}، ووجدتُ مكاناً نظيفاً لـ${countOf(found, AR.section)} فقط.`;
  // «ولكلٍّ منها» over one section is wrong; one section has a place, not each of them.
  return proposal.needed === 1
    ? `${head} تحتاج شعبة واحدة، ولها مكان نظيف.`
    : `${head} تحتاج ${countOf(proposal.needed, AR.section)}، ولكلٍّ منها مكان نظيف.`;
}

/** The one line above the list. */
export function describeOpenings(proposals: SectionProposal[], noCeiling: number): string {
  if (!proposals.length)
    return noCeiling
      ? `${countOf(noCeiling, AR.course)} مطلوب بلا «الحد الأعلى للطلبة» — سجّله في المقررات ليُحسب عدد الشعب.`
      : "";
  const placed = proposals.reduce((sum, item) => sum + item.placements.length, 0);
  const needed = proposals.reduce((sum, item) => sum + item.needed, 0);
  const head = `${countOf(needed, AR.section)} يقترحها الطلب على ${countOf(proposals.length, AR.course)}` +
    (placed === needed
      ? (needed === 1 ? " — ولها وقتٌ وقاعة بلا تعارض." : " — ولكلٍّ منها وقتٌ وقاعة بلا تعارض.")
      : ` — وُجد مكان نظيف لـ${placed} منها.`);
  return noCeiling
    ? `${head} و${countOf(noCeiling, AR.course)} بلا حدٍّ أعلى مسجَّل.`
    : head;
}
