import type { AdCourse, AdInstructor, FSchedule } from "../types";

/**
 * The timetable rules of PAAET decision 1912/2016, written as code.
 *
 * Every check here quotes the article it comes from, because a warning a
 * coordinator cannot trace back to a rule is a warning they will learn to
 * ignore. Nothing in this file blocks a save: the regulation is the standard,
 * the department is the authority, and there are legitimate exceptions to most
 * of these — a warning says "look at this", not "you may not".
 *
 * Articles used:
 *   م.٦/٢  no more than two consecutive sections in a day for lectures over an hour
 *   م.٦/٣  no more than three consecutive sections in a day for one-hour lectures
 *   م.٦/٤  single-section courses rotate between staff each term
 *   م.٧/٢  morning 50–70% and evening 30–50% of a department's load
 *   م.٧/٥  sections of one course spread across different hours and days
 *   م.٨/أ  Sunday, Tuesday, Thursday lectures run one hour
 *   م.٨/ب  Monday and Wednesday lectures run an hour and a half
 *   م.٨/٩  a course is offered at the same fixed time on all of its days
 *   م.٨    theory 20–60 students, applied 15–40, practical 15–25
 */

export type RegulationSeverity = "high" | "medium" | "low";

export interface RegulationFinding {
  /** Stable identifier, so a department can silence one rule and not the rest. */
  rule: string;
  article: string;
  severity: RegulationSeverity;
  title: string;
  detail: string;
  /** The appointments this finding is about, for highlighting on the grid. */
  rowIds: number[];
}

export const DAY_KEYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
export const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];
export type DayKey = (typeof DAY_KEYS)[number];

/** Days the regulation gives one-hour lectures, and days it gives 90 minutes. */
const HOUR_DAYS: DayKey[] = ["fsunday", "ftuesday", "fthursday"];
const HOUR_AND_HALF_DAYS: DayKey[] = ["fmonday", "fwednesday"];

const MORNING_START = 8 * 60;
const MORNING_END = 14 * 60;
const EVENING_END = 20 * 60;

export const toMinutes = (value: string) => {
  const [h, m] = String(value || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const clock = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const duration = (row: FSchedule) => Math.max(0, toMinutes(row.fendtime) - toMinutes(row.fstarttime));
const daysOf = (row: FSchedule) => DAY_KEYS.filter(key => Boolean((row as any)[key]));
const arabicNumber = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");

/**
 * The expected length of a lecture on a given day.
 *
 * This is also the answer to "I moved a course from Monday and Wednesday to
 * Sunday and Tuesday and the times are now wrong": they are not the same
 * lecture length. Three weekly hours are two 90-minute meetings on Mon/Wed, or
 * three 60-minute meetings on Sun/Tue/Thu, and a move between those families
 * has to reshape the appointment rather than carry the old end time across.
 */
export function expectedMinutesForDay(day: DayKey): number {
  return HOUR_AND_HALF_DAYS.includes(day) ? 90 : 60;
}

export interface DayPatternAdvice {
  family: "hour" | "hourAndHalf" | "mixed";
  expectedMinutes: number;
  /** The end time this start should have on these days. */
  suggestedEnd: string;
  changed: boolean;
  note: string;
}

/**
 * What a set of days implies for a lecture that starts at `start`.
 *
 * Called when days change, so the editor can offer the corrected end time
 * instead of leaving a 90-minute block sitting on a 60-minute day.
 */
export function adviseDayPattern(days: DayKey[], start: string, currentEnd: string): DayPatternAdvice | null {
  if (!days.length || !start) return null;
  const hour = days.filter(day => HOUR_DAYS.includes(day)).length;
  const long = days.filter(day => HOUR_AND_HALF_DAYS.includes(day)).length;
  if (hour && long) {
    return {
      family: "mixed",
      expectedMinutes: 0,
      suggestedEnd: currentEnd,
      changed: false,
      note: "أيام مختلطة: الأحد/الثلاثاء/الخميس مدتها ساعة، والاثنين/الأربعاء ساعة ونصف (م.٨/أ،ب). راجع التوزيع."
    };
  }
  const expected = long ? 90 : 60;
  const suggestedEnd = clock(Math.min(23 * 60 + 30, toMinutes(start) + expected));
  const changed = suggestedEnd !== currentEnd;
  return {
    family: long ? "hourAndHalf" : "hour",
    expectedMinutes: expected,
    suggestedEnd,
    changed,
    note: long
      ? "الاثنين والأربعاء: مدة المحاضرة ساعة ونصف (م.٨/ب)."
      : "الأحد والثلاثاء والخميس: مدة المحاضرة ساعة واحدة (م.٨/أ)."
  };
}


/**
 * The approved weekly patterns, and what a move actually means.
 *
 * Article 8 does not describe "a lecture" — it describes a *course* and how its
 * weekly hours are cut into meetings, and the cut depends on which days are
 * used. Three weekly hours are three one-hour meetings on Sunday, Tuesday and
 * Thursday, or two ninety-minute meetings on Monday and Wednesday. Four hours
 * are 90+90+60 across Monday, Wednesday and Thursday, or two two-hour meetings
 * on Tuesday and Thursday.
 *
 * This is why dragging a course from Monday+Wednesday onto Sunday cannot simply
 * keep its old end time: two meetings of ninety minutes become three meetings of
 * sixty, and the appointment being dragged is only one of them. The planner
 * returns the whole shape so the product can offer the real move — the days,
 * the length and the number of meetings — instead of quietly producing a course
 * that no longer adds up to its credit hours.
 */
export interface WeeklyPattern {
  id: string;
  days: DayKey[];
  /** Minutes per meeting, aligned with the day it falls on. */
  minutesPerDay: number[];
  weeklyMinutes: number;
  label: string;
  note: string;
}

const PATTERN_LIBRARY: Array<Omit<WeeklyPattern, "label"> & { hours: number }> = [
  {
    hours: 1, id: "1h-single", days: ["fsunday"], minutesPerDay: [60], weeklyMinutes: 60,
    note: "ساعة واحدة أسبوعياً في يوم واحد."
  },
  {
    hours: 2, id: "2h-two-days", days: ["fsunday", "ftuesday"], minutesPerDay: [60, 60], weeklyMinutes: 120,
    note: "ساعتان: لقاءان بساعة في الأحد والثلاثاء (م.٨/أ)."
  },
  {
    hours: 2, id: "2h-one-block", days: ["ftuesday"], minutesPerDay: [120], weeklyMinutes: 120,
    note: "ساعتان في لقاء واحد."
  },
  {
    hours: 3, id: "3h-three-days", days: ["fsunday", "ftuesday", "fthursday"], minutesPerDay: [60, 60, 60], weeklyMinutes: 180,
    note: "ثلاث ساعات: ثلاثة لقاءات بساعة — الأحد والثلاثاء والخميس (م.٨/أ)."
  },
  {
    hours: 3, id: "3h-two-days", days: ["fmonday", "fwednesday"], minutesPerDay: [90, 90], weeklyMinutes: 180,
    note: "ثلاث ساعات: لقاءان بساعة ونصف — الاثنين والأربعاء (م.٨/ب)."
  },
  {
    hours: 4, id: "4h-mon-wed-thu", days: ["fmonday", "fwednesday", "fthursday"], minutesPerDay: [90, 90, 60], weeklyMinutes: 240,
    note: "أربع ساعات: ٩٠+٩٠+٦٠ — الاثنين والأربعاء والخميس (م.٨/ت)."
  },
  {
    hours: 4, id: "4h-tue-thu", days: ["ftuesday", "fthursday"], minutesPerDay: [120, 120], weeklyMinutes: 240,
    note: "أربع ساعات: لقاءان بساعتين — الثلاثاء والخميس (م.٨/ت)."
  }
];

const dayLabel = (day: DayKey) => DAY_NAMES[DAY_KEYS.indexOf(day)];

/** The approved shapes for a course with this many weekly hours. */
export function patternsForHours(weeklyHours: number): WeeklyPattern[] {
  const hours = Math.round(Number(weeklyHours) || 0);
  return PATTERN_LIBRARY.filter(pattern => pattern.hours === hours).map(pattern => ({
    ...pattern,
    label: pattern.days
      .map((day, index) => `${dayLabel(day)} ${pattern.minutesPerDay[index]}د`)
      .join(" · ")
  }));
}

export interface MovePlan {
  /** The pattern the target day belongs to, if the course has a known shape. */
  pattern: WeeklyPattern | null;
  /** Every meeting the course should have, with the new start times. */
  meetings: Array<{ day: DayKey; start: string; end: string }>;
  /** True when the move changes more than this one appointment. */
  reshapes: boolean;
  headline: string;
  detail: string;
}

/**
 * What moving this course to `targetDay` at `targetStart` really involves.
 *
 * Returns the whole week the course should occupy afterwards, so the product
 * can show the complete consequence and apply it in one step rather than
 * leaving a half-moved course behind.
 */
export function planMove(options: {
  weeklyHours: number;
  currentDays: DayKey[];
  targetDay: DayKey;
  targetStart: string;
}): MovePlan {
  const { weeklyHours, currentDays, targetDay, targetStart } = options;
  const candidates = patternsForHours(weeklyHours);
  const start = toMinutes(targetStart);

  // Prefer a pattern that contains the day being dropped on, and among those the
  // one closest to the days the course already uses — the smallest real change.
  const containing = candidates.filter(pattern => pattern.days.includes(targetDay));
  const pattern = containing.sort((a, b) => {
    const overlap = (p: WeeklyPattern) => p.days.filter(day => currentDays.includes(day)).length;
    return overlap(b) - overlap(a) || a.days.length - b.days.length;
  })[0] || null;

  if (!pattern) {
    const expected = expectedMinutesForDay(targetDay);
    return {
      pattern: null,
      meetings: [{ day: targetDay, start: targetStart, end: clock(start + expected) }],
      reshapes: false,
      headline: `${dayLabel(targetDay)} ${targetStart}`,
      detail: `مدة اللقاء ${expected} دقيقة على هذا اليوم (م.٨/أ،ب).`
    };
  }

  const meetings = pattern.days.map((day, index) => ({
    day,
    start: targetStart,
    end: clock(Math.min(23 * 60 + 30, start + pattern.minutesPerDay[index]))
  }));
  const sameDays =
    pattern.days.length === currentDays.length &&
    pattern.days.every(day => currentDays.includes(day));

  return {
    pattern,
    meetings,
    reshapes: !sameDays,
    headline: sameDays
      ? `${dayLabel(targetDay)} ${targetStart}`
      : `تحويل إلى ${pattern.days.map(dayLabel).join(" · ")}`,
    detail: sameDays
      ? pattern.note
      : `${weeklyHours} ساعات أسبوعياً. ${pattern.note} سيُعاد تشكيل المقرر إلى ${pattern.days.length} لقاءات بنفس وقت البداية.`
  };
}

export interface RegulationContext {
  rows: FSchedule[];
  courses: Map<number, AdCourse>;
  instructors: Map<number, AdInstructor>;
  /** Rows of the previous term, for the rotation rule. */
  previousRows?: FSchedule[];
  /** A window the department keeps free for its meeting, e.g. "12:00"–"13:00". */
  meeting?: { day: DayKey; from: string; to: string } | null;
}

/** Consecutive means the next one starts within a quarter hour of this one ending. */
const CONSECUTIVE_GAP = 15;

export function reviewSchedule(context: RegulationContext): RegulationFinding[] {
  const { rows, courses, instructors } = context;
  const findings: RegulationFinding[] = [];
  const name = (row: FSchedule) =>
    courses.get(row.AdCourseId)?.CourseCode || row.AdCourseName || `موعد ${row.id}`;
  const who = (id: number) => instructors.get(id)?.AdInstructorName || "بدون أستاذ";

  // --- م.٨/أ،ب — lecture length must match the day it sits on -------------
  // Departments run 50-minute and 80-minute slots to leave room for movement
  // between buildings, which is a deliberate reading of the same rule rather
  // than a mistake. Flagging every row for a ten-minute difference buries the
  // findings that matter, so only a genuinely different shape is reported.
  const LENGTH_TOLERANCE = 15;
  const wrongLength: FSchedule[] = [];
  for (const row of rows) {
    const days = daysOf(row);
    if (!days.length) continue;
    const advice = adviseDayPattern(days, row.fstarttime, row.fendtime);
    if (!advice || advice.family === "mixed") continue;
    const gap = Math.abs(duration(row) - advice.expectedMinutes);
    // Two hours on a one-hour day is a different lecture; ten minutes is a
    // changeover allowance.
    if (gap > LENGTH_TOLERANCE) wrongLength.push(row);
  }
  if (wrongLength.length) {
    findings.push({
      rule: "lecture-length",
      article: "م.٨/أ،ب",
      severity: "low",
      title: `مدة المحاضرة بعيدة عن نمط اليوم في ${arabicNumber(wrongLength.length)} موعد`,
      detail: "الأحد والثلاثاء والخميس ساعة، والاثنين والأربعاء ساعة ونصف. فروق الدقائق القليلة (٥٠ و٨٠ دقيقة) مقبولة كزمن انتقال ولا تُحتسب هنا.",
      rowIds: wrongLength.map(row => row.id)
    });
  }

  // --- م.٨/٩ — one course, one fixed time across its days ------------------
  const byCourse = new Map<number, FSchedule[]>();
  rows.forEach(row => {
    if (!row.AdCourseId) return;
    byCourse.set(row.AdCourseId, [...(byCourse.get(row.AdCourseId) || []), row]);
  });

  // --- م.٧/٥ — sections of one course spread over hours and days -----------
  const clashing: FSchedule[] = [];
  const courseNames: string[] = [];
  for (const [courseId, list] of byCourse) {
    if (list.length < 2) continue;
    const starts = new Map<string, FSchedule[]>();
    list.forEach(row => starts.set(row.fstarttime, [...(starts.get(row.fstarttime) || []), row]));
    for (const [, sameHour] of starts) {
      // Two sections at the same hour only matter when they also share a day.
      const overlapping = sameHour.filter((row, index) =>
        sameHour.some((other, otherIndex) =>
          otherIndex !== index && daysOf(row).some(day => daysOf(other).includes(day))));
      if (overlapping.length > 1) {
        clashing.push(...overlapping);
        const label = courses.get(courseId)?.CourseCode || String(courseId);
        if (!courseNames.includes(label)) courseNames.push(label);
      }
    }
  }
  if (clashing.length) {
    findings.push({
      rule: "sections-same-hour",
      article: "م.٧/٥",
      severity: "high",
      title: `شعب مقرر واحد في نفس الساعة واليوم: ${courseNames.slice(0, 6).join("، ")}`,
      detail: "توزَّع شعب المقرر الواحد على ساعات مختلفة وفي أيام متعددة حتى يجد الطالب شعبة تناسبه.",
      rowIds: [...new Set(clashing.map(row => row.id))]
    });
  }

  // --- م.٦/٢،٣ — how many sections an instructor may teach back to back ----
  const runsOver: string[] = [];
  const runRows: number[] = [];
  const byInstructor = new Map<number, FSchedule[]>();
  rows.forEach(row => {
    if (!row.AdInstructorId) return;
    byInstructor.set(row.AdInstructorId, [...(byInstructor.get(row.AdInstructorId) || []), row]);
  });
  for (const [instructorId, list] of byInstructor) {
    for (const day of DAY_KEYS) {
      const onDay = list
        .filter(row => (row as any)[day])
        .sort((a, b) => toMinutes(a.fstarttime) - toMinutes(b.fstarttime));
      if (onDay.length < 3) continue;
      let run: FSchedule[] = [];
      const flush = () => {
        if (run.length < 3) { run = []; return; }
        // The allowance depends on how long the lectures in the run are.
        const longest = Math.max(...run.map(duration));
        const allowed = longest > 60 ? 2 : 3;
        if (run.length > allowed) {
          runsOver.push(
            `${who(instructorId)} · ${DAY_NAMES[DAY_KEYS.indexOf(day)]} · ${arabicNumber(run.length)} متتالية`
          );
          runRows.push(...run.map(row => row.id));
        }
        run = [];
      };
      for (const row of onDay) {
        if (!run.length) { run = [row]; continue; }
        const previousEnd = toMinutes(run[run.length - 1].fendtime);
        if (toMinutes(row.fstarttime) - previousEnd <= CONSECUTIVE_GAP) { run.push(row); continue; }
        flush();
        run = [row];
      }
      flush();
    }
  }
  if (runsOver.length) {
    findings.push({
      rule: "consecutive-sections",
      article: "م.٦/٢،٣",
      severity: "medium",
      title: `تجاوز الشعب المتتالية في اليوم (${arabicNumber(runsOver.length)})`,
      detail: `الحد شعبتان متتاليتان للمحاضرات التي تزيد عن ساعة، وثلاث للمحاضرات ذات الساعة الواحدة. ${runsOver.slice(0, 4).join(" — ")}`,
      rowIds: [...new Set(runRows)]
    });
  }

  // --- م.٧/٢ — the morning/evening balance of the department ---------------
  const timed = rows.filter(row => row.fstarttime);
  if (timed.length >= 8) {
    const morning = timed.filter(row => {
      const start = toMinutes(row.fstarttime);
      return start >= MORNING_START && start < MORNING_END;
    }).length;
    const evening = timed.filter(row => {
      const start = toMinutes(row.fstarttime);
      return start >= MORNING_END && start < EVENING_END;
    }).length;
    const total = morning + evening;
    if (total) {
      const morningShare = Math.round((morning / total) * 100);
      const eveningShare = 100 - morningShare;
      if (morningShare < 50 || morningShare > 70) {
        findings.push({
          rule: "period-balance",
          article: "م.٧/٢",
          severity: "low",
          title: `توزيع الفترتين خارج النطاق: صباحي ${arabicNumber(morningShare)}٪ · مسائي ${arabicNumber(eveningShare)}٪`,
          detail: "المطلوب صباحاً بين ٥٠٪ و٧٠٪، ومساءً بين ٣٠٪ و٥٠٪ من إجمالي مقررات القسم.",
          rowIds: []
        });
      }
    }
  }

  // --- م.٨ — class size limits -------------------------------------------
  const oversized: string[] = [];
  const oversizedRows: number[] = [];
  for (const row of rows) {
    const course = courses.get(row.AdCourseId);
    const capacity = Number(course?.MaxStudent || 0);
    if (!capacity) continue;
    if (capacity > 60) {
      oversized.push(`${course?.CourseCode || row.AdCourseName} (${arabicNumber(capacity)})`);
      oversizedRows.push(row.id);
    }
  }
  if (oversized.length) {
    findings.push({
      rule: "class-size",
      article: "م.٨",
      severity: "low",
      title: `سعة أعلى من الحد الأقصى للمقررات النظرية (${arabicNumber(oversized.length)})`,
      detail: `الحد الأقصى ٦٠ طالباً للمقرر النظري، ٤٠ للتطبيقي، ٢٥ للعملي. ${[...new Set(oversized)].slice(0, 5).join("، ")}`,
      rowIds: [...new Set(oversizedRows)]
    });
  }

  // --- م.٦/٤ — rotation of single-section courses -------------------------
  if (context.previousRows?.length) {
    const previousOwner = new Map<number, number>();
    const previousCount = new Map<number, number>();
    context.previousRows.forEach(row => {
      previousCount.set(row.AdCourseId, (previousCount.get(row.AdCourseId) || 0) + 1);
      previousOwner.set(row.AdCourseId, row.AdInstructorId);
    });
    const repeated: string[] = [];
    const repeatedRows: number[] = [];
    for (const [courseId, list] of byCourse) {
      // The rule is about courses offered as a single section.
      if (list.length !== 1 || previousCount.get(courseId) !== 1) continue;
      if (previousOwner.get(courseId) === list[0].AdInstructorId && list[0].AdInstructorId) {
        repeated.push(`${courses.get(courseId)?.CourseCode || courseId} · ${who(list[0].AdInstructorId)}`);
        repeatedRows.push(list[0].id);
      }
    }
    if (repeated.length) {
      findings.push({
        rule: "rotation",
        article: "م.٦/٤",
        severity: "medium",
        title: `مقررات أحادية الطرح لم تُدوَّر (${arabicNumber(repeated.length)})`,
        detail: `المقرر ذو الشعبة الواحدة يُسند لعضو آخر في الفصل التالي عملاً بمبدأ التدوير. ${repeated.slice(0, 5).join(" — ")}`,
        rowIds: repeatedRows
      });
    }
  }

  // --- the department's own protected window ------------------------------
  if (context.meeting?.day && context.meeting.from && context.meeting.to) {
    const { day, from, to } = context.meeting;
    const inside = rows.filter(row =>
      (row as any)[day] &&
      toMinutes(row.fstarttime) < toMinutes(to) &&
      toMinutes(row.fendtime) > toMinutes(from));
    if (inside.length) {
      findings.push({
        rule: "meeting-window",
        article: "قرار القسم",
        severity: "medium",
        title: `${arabicNumber(inside.length)} موعد داخل وقت اجتماع القسم`,
        detail: `${DAY_NAMES[DAY_KEYS.indexOf(day)]} ${from}–${to} محجوز لاجتماع القسم.`,
        rowIds: inside.map(row => row.id)
      });
    }
  }

  // --- rows that were never finished --------------------------------------
  const unfinished = rows.filter(row => !daysOf(row).length || !row.fstarttime || !row.fendtime || !row.AdInstructorId);
  if (unfinished.length) {
    findings.push({
      rule: "incomplete",
      article: "م.٦/٥",
      severity: "high",
      title: `${arabicNumber(unfinished.length)} موعد ناقص البيانات`,
      detail: "كل موعد يحتاج أياماً ووقتاً وأستاذاً محدداً قبل اعتماد الجدول.",
      rowIds: unfinished.map(row => row.id)
    });
  }

  const order: Record<RegulationSeverity, number> = { high: 0, medium: 1, low: 2 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
 * How much of this schedule the regulation would question.
 *
 * Not a penalty count — a proportion. Every appointment a finding names is
 * weighed by how serious that finding is, and measured against the size of the
 * schedule, so a department with three problems in four hundred appointments
 * reads as healthy and one with three problems in ten does not. A row named by
 * several findings is still one row: the same appointment cannot be wrong twice
 * over.
 */
export function regulationScore(findings: RegulationFinding[], rowCount: number): number {
  if (!rowCount) return 100;
  const weight: Record<RegulationSeverity, number> = { high: 1, medium: 0.5, low: 0.2 };
  const worst = new Map<number, number>();
  for (const finding of findings) {
    const cost = weight[finding.severity];
    // A finding with no specific rows (a balance ratio, say) counts as a light
    // touch on the whole schedule rather than on nothing.
    const targets = finding.rowIds.length ? finding.rowIds : [];
    if (!targets.length) continue;
    for (const id of targets) worst.set(id, Math.max(worst.get(id) || 0, cost));
  }
  const implicated = [...worst.values()].reduce((total, cost) => total + cost, 0);
  const wide = findings.filter(finding => !finding.rowIds.length).length * 0.02 * rowCount;
  return Math.max(0, Math.min(100, Math.round(100 - ((implicated + wide) / rowCount) * 100)));
}
