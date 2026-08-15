import type { AdCourse, AdInstructor, FSchedule } from "../types";
import { SCHEDULE_DAYS, timeToMinutes, type DayKey } from "./scheduleIntelligence";
import { AR, countOf } from "./arabicCount";

/**
 * ── ذاكرة القسم ─────────────────────────────────────────────────────────────
 *
 * Ten years of schedules is the largest thing this system holds and the one
 * nobody has ever read. Every term it answers the same question — where does
 * this lecture go — and every term it forgets that it has answered it nine
 * times before.
 *
 * This reads that history back. Not as a dashboard: a dashboard is a room
 * people visit once and never again, and building one would put a wall of
 * numbers in front of work that does not need them. Instead the memory is a
 * thing you can ASK, and every answer is delivered at the exact moment its
 * subject is in front of someone:
 *
 *   · a slot answers while a card is hovering over it
 *   · a room answers when that room is open
 *   · an instructor answers in the picker, beside their name
 *   · a course answers in its own panel
 *
 * Nothing is drawn until somebody looks at the thing it is about. That is the
 * whole design, and it is why this adds no permanent pixel to any screen.
 *
 * **The expected and the unexpected.** Some of what follows is what anyone
 * would ask for — the empty hour, the unused hall. The valuable half is the
 * other one: the slot that was used for six terms and then abandoned, the hall
 * that belongs to this department on paper and to another one in practice, the
 * instructor who has never once taught a first period without anybody ever
 * writing that down as a rule. Nobody asks those questions, because nobody
 * knows they are there to ask.
 *
 * **What it refuses to do.** It never states a habit from thin history, never
 * turns an observation into a rule, and never says anything that is merely
 * true. «هذه القاعة تُستخدم أحياناً» is true and worthless; the bar is that a
 * coordinator of ten years' standing should be able to be surprised.
 */

/** Below this, history is anecdote. Three terms is a year and a half. */
const MIN_TERMS = 3;
/** A pattern must hold this often to be called a habit. */
const STRONG = 70;
/** …or fail this often to be called an absence. */
const RARE = 12;

export interface Evidence {
  /** The sentence, ready to show. Empty means history has nothing to say. */
  text: string;
  /** How strongly, 0–100, so a caller can choose how loudly to render it. */
  strength: number;
  /** Terms the claim rests on — every number is quoted against its base. */
  terms: number;
  /** Whether this is a thing nobody would have thought to ask. */
  surprising?: boolean;
}

export interface DepartmentMemory {
  terms: number;
  rows: number;
  /** What history says about placing something here. */
  atSlot(day: DayKey, start: string): Evidence | null;
  /** What history says about this hall. */
  aboutRoom(code: string, hall: string): Evidence | null;
  /** What history says about this person's week. */
  aboutInstructor(instructorId: number): Evidence | null;
  /** What history says about where this course has lived. */
  aboutCourse(courseId: number): Evidence | null;
  /** The things nobody would have thought to ask. */
  surprises(): Evidence[];
}

const roomKey = (row: FSchedule) =>
  `${String(row.AdRoomCode || "").trim()}|${String(row.AdRoomHall || "").trim()}`;
const hourOf = (time: string) => Math.floor(timeToMinutes(String(time || "")) / 60);
const clock = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
const dayLabel = (day: DayKey) => SCHEDULE_DAYS.find(item => item.key === day)?.label || "";
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/** Which terms a set of rows touches, newest last. */
const termsOf = (rows: FSchedule[]) =>
  [...new Set(rows.map(row => Number(row.AdTermId)))].sort((a, b) => a - b);

/**
 * @param history  every row this department has ever scheduled, across every
 *                 term. More is strictly better: a habit is what survives.
 */
export function readDepartmentMemory(
  history: FSchedule[],
  courses: AdCourse[] = [],
  instructors: AdInstructor[] = [],
): DepartmentMemory {
  const rows = history.filter(row => row.fstarttime && row.fendtime);
  const allTerms = termsOf(rows);
  const termCount = allTerms.length;
  const enough = termCount >= MIN_TERMS;

  const courseById = new Map(courses.map(course => [course.AdCourseId, course]));
  const personById = new Map(instructors.map(person => [person.AdInstructorId, person]));

  /* ── indexes, built once ──────────────────────────────────────────────── */

  /** day|hour → the set of terms that ever used it. */
  const slotTerms = new Map<string, Set<number>>();
  /** room → terms that used it, and the departments that used it. */
  const roomTerms = new Map<string, Set<number>>();
  const roomRows = new Map<string, FSchedule[]>();
  /** instructor → their rows. */
  const personRows = new Map<number, FSchedule[]>();
  /** course → their rows. */
  const courseRows = new Map<number, FSchedule[]>();

  for (const row of rows) {
    const hour = hourOf(row.fstarttime);
    for (const day of SCHEDULE_DAYS) {
      if (!(row as any)[day.key]) continue;
      const key = `${day.key}|${hour}`;
      if (!slotTerms.has(key)) slotTerms.set(key, new Set());
      slotTerms.get(key)!.add(Number(row.AdTermId));
    }
    const place = roomKey(row);
    if (place !== "|") {
      if (!roomTerms.has(place)) roomTerms.set(place, new Set());
      roomTerms.get(place)!.add(Number(row.AdTermId));
      (roomRows.get(place) || roomRows.set(place, []).get(place)!).push(row);
    }
    if (row.AdInstructorId) {
      const bucket = personRows.get(row.AdInstructorId);
      if (bucket) bucket.push(row); else personRows.set(row.AdInstructorId, [row]);
    }
    if (row.AdCourseId) {
      const bucket = courseRows.get(row.AdCourseId);
      if (bucket) bucket.push(row); else courseRows.set(row.AdCourseId, [row]);
    }
  }

  /* ── the questions ────────────────────────────────────────────────────── */

  const atSlot = (day: DayKey, start: string): Evidence | null => {
    if (!enough) return null;
    const hour = hourOf(start);
    const used = slotTerms.get(`${day}|${hour}`) || new Set<number>();
    const share = pct(used.size, termCount);

    // The empty hour. The thing a coordinator would ask for, and still useful:
    // an hour nobody in this department has ever taught in is almost always a
    // habit — a prayer, a meeting, a bus — and dropping a lecture into it is
    // worth a word before it happens, never a refusal.
    if (used.size === 0)
      return { text: `قسمك لم يدرّس ${dayLabel(day)} في ${clock(hour)} في أيٍّ من ${countOf(termCount, AR.term)}.`,
               strength: 100, terms: termCount };
    if (share <= RARE)
      return { text: `${dayLabel(day)} ${clock(hour)} نادر في قسمك — ${countOf(used.size, AR.term)} من ${countOf(termCount, AR.term)}.`,
               strength: 100 - share, terms: termCount };

    /* The abandoned hour — the unexpected one. Used steadily, then stopped.
       Nobody decided it; it drifted, and it is usually the cheapest capacity
       the department has. */
    const recent = allTerms.slice(-Math.max(2, Math.floor(termCount / 3)));
    const usedRecently = recent.some(term => used.has(term));
    if (!usedRecently && used.size >= 3)
      return { text: `${dayLabel(day)} ${clock(hour)} كان مستخدماً في ${countOf(used.size, AR.term)} ثم توقّف — لم يُستعمل منذ ${countOf(recent.length, AR.term)}.`,
               strength: 92, terms: termCount, surprising: true };

    /* And nothing at all for an ordinary hour.
     *
     * «هذا من أوقاتك المعتادة» is true, and telling a coordinator of ten
     * years that the hour they have always used is an hour they have always
     * used is exactly the noise this module exists not to make. History earns
     * a sentence by being a warning or a surprise; being merely correct is not
     * enough. */
    return null;
  };

  const aboutRoom = (code: string, hall: string): Evidence | null => {
    if (!enough) return null;
    const place = `${String(code || "").trim()}|${String(hall || "").trim()}`;
    const mine = roomRows.get(place) || [];
    const used = roomTerms.get(place) || new Set<number>();
    const share = pct(used.size, termCount);
    const label = `${code}/${hall}`;

    if (!mine.length) return null;

    /* A hall the department stopped using. Halls are the scarcest thing in a
       university and the easiest to lose track of — nobody sends a message
       when one quietly falls out of use. */
    const recent = allTerms.slice(-Math.max(2, Math.floor(termCount / 3)));
    if (!recent.some(term => used.has(term)) && used.size >= 2)
      return { text: `القاعة ${label} كانت من قاعات قسمك في ${countOf(used.size, AR.term)}، ولم تُستعمل منذ ${countOf(recent.length, AR.term)}.`,
               strength: 90, terms: termCount, surprising: true };

    if (share <= RARE)
      return { text: `القاعة ${label} نادرة الاستخدام في قسمك — ${countOf(used.size, AR.term)} من ${countOf(termCount, AR.term)}.`,
               strength: 100 - share, terms: termCount };

    /* The hours a room is never used. A hall that is busy all morning and
       empty every afternoon is capacity nobody has counted. */
    const hours = new Set(mine.map(row => hourOf(row.fstarttime)));
    const span = [...hours].sort((a, b) => a - b);
    // One hour is the strongest version of this, not an excluded edge: a hall
    // held for ten years and opened at nine o'clock only is capacity nobody
    // has ever counted.
    if (share >= STRONG && span.length >= 1 && span.length <= 4)
      return { text: `القاعة ${label} من قاعات قسمك الثابتة، ولا تُستعمل إلا في ${span.map(clock).join(" · ")}.`,
               strength: share, terms: termCount, surprising: true };
    // Same bar for halls: «هذه قاعتك المعتادة» is not news to anybody who has
    // been booking it for a decade.
    return null;
  };

  const aboutInstructor = (instructorId: number): Evidence | null => {
    if (!enough) return null;
    const mine = personRows.get(instructorId) || [];
    const theirTerms = termsOf(mine);
    if (theirTerms.length < MIN_TERMS || mine.length < 6) return null;
    const name = personById.get(instructorId)?.AdInstructorName || "هذا الأستاذ";

    /* A preference nobody ever declared. Ten years without a single first
       period is a rule in everything but name, and the person enforcing it has
       been doing so by memory and by asking. */
    const earliest = Math.min(...mine.map(row => timeToMinutes(row.fstarttime)));
    if (earliest >= 10 * 60)
      return { text: `${name} لم يبدأ قبل ${clock(Math.floor(earliest / 60))} في ${countOf(theirTerms.length, AR.term)} ولا مرّة.`,
               strength: 95, terms: theirTerms.length, surprising: true };

    const latest = Math.max(...mine.map(row => timeToMinutes(row.fendtime)));
    if (latest <= 13 * 60)
      return { text: `${name} لم يدرّس بعد ${clock(Math.ceil(latest / 60))} في ${countOf(theirTerms.length, AR.term)}.`,
               strength: 92, terms: theirTerms.length, surprising: true };

    /* A day they have never taught on. */
    for (const day of SCHEDULE_DAYS) {
      const onDay = mine.filter(row => Boolean((row as any)[day.key]));
      if (onDay.length === 0)
        return { text: `${name} لم يُجدوَل يوم ${day.label} في ${countOf(theirTerms.length, AR.term)}.`,
                 strength: 88, terms: theirTerms.length, surprising: true };
    }
    return null;
  };

  const aboutCourse = (courseId: number): Evidence | null => {
    if (!enough) return null;
    const mine = courseRows.get(courseId) || [];
    const theirTerms = termsOf(mine);
    if (theirTerms.length < MIN_TERMS) return null;
    const name = courseById.get(courseId)?.CourseName || mine[0]?.AdCourseName || "هذا المقرر";

    /* Where it has lived. A course that has sat in the same slot for years is
       a fact worth knowing BEFORE moving it — students, colleagues and rooms
       have all arranged themselves around it. */
    const placements = new Map<string, number>();
    for (const row of mine) {
      const day = SCHEDULE_DAYS.find(item => Boolean((row as any)[item.key]));
      if (day) placements.set(`${day.key}|${row.fstarttime}`, (placements.get(`${day.key}|${row.fstarttime}`) || 0) + 1);
    }
    const ranked = [...placements.entries()].sort((a, b) => b[1] - a[1]);
    const [top, topCount] = ranked[0] || ["", 0];
    const share = pct(topCount, mine.length);
    if (share >= STRONG && ranked.length > 0) {
      const [day, start] = top.split("|");
      return { text: `${name} في ${dayLabel(day as DayKey)} ${start} في ${countOf(topCount, AR.term)} من ${countOf(theirTerms.length, AR.term)}.`,
               strength: share, terms: theirTerms.length };
    }
    /* …and its opposite, which is the more interesting one: a course that has
       never settled. That is usually a symptom — a shared instructor, a
       contested hall — and it is invisible unless someone counts. */
    if (ranked.length >= Math.max(3, Math.ceil(theirTerms.length * 0.8)))
      return { text: `${name} لم يستقرّ في موضع — ${countOf(ranked.length, AR.point)} مختلفة في ${countOf(theirTerms.length, AR.term)}.`,
               strength: 85, terms: theirTerms.length, surprising: true };
    return null;
  };

  const surprises = (): Evidence[] => {
    if (!enough) return [];
    const found: Evidence[] = [];
    for (const day of SCHEDULE_DAYS)
      for (let hour = 8; hour <= 18; hour += 1) {
        const said = atSlot(day.key as DayKey, clock(hour));
        if (said?.surprising) found.push(said);
      }
    for (const place of roomTerms.keys()) {
      const [code, hall] = place.split("|");
      const said = aboutRoom(code, hall);
      if (said?.surprising) found.push(said);
    }
    for (const instructorId of personRows.keys()) {
      const said = aboutInstructor(instructorId);
      if (said?.surprising) found.push(said);
    }
    for (const courseId of courseRows.keys()) {
      const said = aboutCourse(courseId);
      if (said?.surprising) found.push(said);
    }
    return found.sort((a, b) => b.strength - a.strength).slice(0, 12);
  };

  return { terms: termCount, rows: rows.length, atSlot, aboutRoom, aboutInstructor, aboutCourse, surprises };
}
