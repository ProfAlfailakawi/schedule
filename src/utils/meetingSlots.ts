/**
 * ── متى نلتقي؟ — الحساب والمشاركون ─────────────────────────────────────────
 *
 * القاعدة هنا وحدها؛ الخادم يحسب بها، والواجهة تختار بها من يُعرض، والاختبار
 * (tests/meeting-slots-audit.ts) يقرؤها مباشرة.
 *
 * 1) المشاركون كلُّ الأساتذة إلا صنفين، بتصنيف التطبيق نفسه لا بتخمين:
 *    • سجلّ «هيئة تدريسية» — ليس شخصاً؛ يُعرف بصدر اسمه عبر
 *      placeholderInstructorIds (لا عمود «نوع» في سجل الأستاذ غيره).
 *    • المنتدبون — قائمة الانتداب الحيّة (visitingInstructorIds من الخادم،
 *      المصدر نفسه الذي يرسم VisitingBadge).
 *    لقب الاسم («أ.»، «د.») لا يُقرأ هنا: ليس تصنيفاً في التطبيق.
 *
 * 2) لا طريق مسدود: إن لم تكن نافذةٌ يتفرغ فيها الجميع، تُرتَّب النوافذ بعدد
 *    المتفرغين ويُسمّى من يتعارض في كلٍّ منها، ولكل يوم أفضل نافذته.
 *
 * 3) الانشغال يُقرأ من جدول الأستاذ كاملاً في الفصل، من كل الكليات والأقسام —
 *    لا من الكلية المعروضة. الخادم يمرّر صفوف الفصل كلها.
 */
import { placeholderInstructorIds } from "./instructorIdentity";
import { SCHEDULE_DAYS, timeToMinutes } from "./scheduleIntelligence";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_START, SCHEDULE_SLOT_MINUTES } from "./scheduleTime";

type Person = { AdInstructorId: number; AdInstructorName: string };

/** من يُعرض في «متى نلتقي؟»: الجميع إلا «هيئة تدريسية» والمنتدبين. */
export function meetingParticipants<T extends Person>(people: T[], visitingIds: Iterable<number> = []): T[] {
  const visiting = new Set([...visitingIds].map(Number));
  const placeholders = placeholderInstructorIds(people);
  return people.filter(person => {
    const id = Number(person.AdInstructorId);
    return Boolean(id) && !visiting.has(id) && !placeholders.has(id);
  });
}

export type MeetingRow = {
  AdInstructorId: number | string;
  fstarttime: string;
  fendtime: string;
  fsunday?: unknown; fmonday?: unknown; ftuesday?: unknown; fwednesday?: unknown; fthursday?: unknown;
  /** Any college — busy time is read term-wide. */
  AdCollegeId?: number;
};

export type MeetingWindow = {
  day: string; label: string; start: string; end: string;
  free: number; total: number; busy: string[];
};

export type MeetingDay = {
  dayKey: string;
  label: string;
  free: { start: string; end: string; minutes: number }[];
  nearMiss: { start: string; end: string; busy: string[] }[];
  /** أفضل نافذة في اليوم حين لا تكون نافذةٌ كاملة — لا يُترك يوم فارغاً. */
  bestPartial: MeetingWindow | null;
};

export type MeetingAnswer = {
  duration: number;
  participants: string[];
  days: MeetingDay[];
  /** نافذة الإجماع، إن وُجدت. */
  best: { day: string; label: string; start: string; end: string } | null;
  /** أفضل النوافذ مرتبةً بعدد المتفرغين — الإجماع أولها إن وُجد. */
  ranked: MeetingWindow[];
};

const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
/* A committee meets where the day has room, not at 19:00: ties go to 10:00. */
const MID_MORNING = 10 * 60;

type Run = { dayKey: string; label: string; first: number; last: number; busy: number[] };

export function computeMeetingSlots({ rows, ids, nameById, duration, rankedLimit = 6 }: {
  rows: MeetingRow[];
  ids: number[];
  nameById: Map<number, string>;
  duration: number;
  rankedLimit?: number;
}): MeetingAnswer {
  const wanted = new Set(ids);
  const mine = new Map<number, MeetingRow[]>(ids.map(id => [id, []]));
  for (const row of rows) {
    const id = Number(row.AdInstructorId);
    if (wanted.has(id)) mine.get(id)!.push(row);
  }
  const name = (id: number) => nameById.get(id) || `#${id}`;
  const total = ids.length;
  const STEP = SCHEDULE_SLOT_MINUTES;

  const runs: Run[] = [];
  for (const { key: dayKey, label } of SCHEDULE_DAYS) {
    let open: Run | null = null;
    for (let start = SCHEDULE_DAY_START; start + duration <= SCHEDULE_DAY_END; start += STEP) {
      const end = start + duration;
      const busy = ids.filter(id => mine.get(id)!.some(row =>
        Boolean((row as any)[dayKey]) && timeToMinutes(row.fstarttime) < end && timeToMinutes(row.fendtime) > start));
      if (open && open.busy.join(",") === busy.join(",")) { open.last = start; continue; }
      open = { dayKey, label, first: start, last: start, busy };
      runs.push(open);
    }
  }

  const windowOf = (run: Run): MeetingWindow => ({
    day: run.dayKey, label: run.label,
    start: clock(run.first), end: clock(run.last + duration),
    free: total - run.busy.length, total,
    busy: run.busy.map(name),
  });
  const better = (a: Run, b: Run) =>
    a.busy.length - b.busy.length
    || (b.last - b.first) - (a.last - a.first)
    || Math.abs(a.first - MID_MORNING) - Math.abs(b.first - MID_MORNING);

  const days: MeetingDay[] = SCHEDULE_DAYS.map(({ key, label }) => {
    const today = runs.filter(run => run.dayKey === key);
    const full = today.filter(run => !run.busy.length);
    const partial = today.filter(run => run.busy.length).sort(better)[0];
    return {
      dayKey: key, label,
      free: full.map(run => ({ start: clock(run.first), end: clock(run.last + duration), minutes: run.last - run.first + duration })),
      nearMiss: today.filter(run => run.busy.length === 1).slice(0, 3)
        .map(run => ({ start: clock(run.first), end: clock(run.last + duration), busy: run.busy.map(name) })),
      bestPartial: full.length || !partial ? null : windowOf(partial),
    };
  });

  /* At most two windows a day, so the ranked list offers a real choice of
     days instead of six shades of one Sunday. */
  const ordered = [...runs].sort(better);
  const perDay = new Map<string, number>();
  const ranked: MeetingWindow[] = [];
  for (const run of ordered) {
    if (ranked.length >= rankedLimit) break;
    const used = perDay.get(run.dayKey) || 0;
    if (used >= 2) continue;
    perDay.set(run.dayKey, used + 1);
    ranked.push(windowOf(run));
  }
  const top = ranked[0];
  const best = top && !top.busy.length ? { day: top.day, label: top.label, start: top.start, end: top.end } : null;

  return { duration, participants: ids.map(name), days, best, ranked };
}
