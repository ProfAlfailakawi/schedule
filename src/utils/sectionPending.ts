import type { AdCourse, FSchedule } from "../types";
import { SCHEDULE_DAYS, findConflicts, minutesToTime, timeToMinutes, type DayKey } from "./scheduleIntelligence";
import type { Placement } from "./sectionOpening";
import type { RhythmReading } from "./departmentRhythm";

/**
 * ── شعبةٌ بوقتٍ من تاريخ القسم وقاعةٍ بانتظار التثبيت ────────────────────────────
 *
 * حين لا قاعة موثّقة بسعة ولا أستاذ بنصاب، لا يقف البناء: يأخذ الوقتَ من الفصل المماثل (الأول مع الأول)
 * شعبةً بشعبة، فيقلّد ما اعتاده القسم، ويضع الأستاذ «هيئة تدريسية» والقاعة «بانتظار التثبيت».
 * ما يبقى محسوباً: تعارض الدفعة (مقررات مستوىً واحد لا تتقاطع) والأوقات؛ أما القاعة والأستاذ فيُثبَّتان
 * في شاشة المراجعة. لا يُكتب هنا شيء: نتيجته مقترحاتٌ تُعرض.
 */

const DAY_KEYS = SCHEDULE_DAYS.map(day => day.key as DayKey);
const DAY_LABEL = new Map(SCHEDULE_DAYS.map(day => [day.key, day.label] as const));
const daysOf = (row: FSchedule): DayKey[] => DAY_KEYS.filter(key => Boolean((row as any)[key]));

export const FACULTY_PLACEHOLDER = "هيئة تدريسية";
/** سجلّ «هيئة تدريسية» الذي يملكه القسم: من أسماء أساتذة القسم وحدها، لا من سجلّ قسمٍ آخر. */
export function facultyPlaceholderOf(people: ReadonlyArray<{ AdInstructorId: number; AdInstructorName: string }>, departmentInstructorIds: ReadonlySet<number>) {
  const norm = (text: string) => String(text || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return people.find(person => departmentInstructorIds.has(Number(person.AdInstructorId)) && norm(person.AdInstructorName).startsWith(FACULTY_PLACEHOLDER)) || null;
}

interface Template { days: DayKey[]; start: string; end: string; buildingId: string; building: string }

/** قوالب الشعب من أقرب فصلٍ مماثل: شعبةٌ واحدة لكل قالب، مرتّبةً بأرقام الشعب. `termOrder`: الفصول بأولويتها. */
export function templatesFromHistory(past: readonly FSchedule[], termOrder: readonly number[]): Template[] {
  const out: Template[] = [];
  for (const termId of termOrder) {
    const rows = past.filter(row => Number(row.AdTermId) === termId);
    const bySection = new Map<string, FSchedule>();
    for (const row of [...rows].sort((a, b) => Number(String(a.SCode).replace(/\D/g, "")) - Number(String(b.SCode).replace(/\D/g, "")))) if (!bySection.has(String(row.SCode))) bySection.set(String(row.SCode), row);
    for (const row of bySection.values()) {
      const days = daysOf(row);
      if (!days.length || !row.fstarttime || !row.fendtime) continue;
      out.push({ days, start: row.fstarttime, end: row.fendtime, buildingId: String(row.buildingId || ""), building: String(row.AdRoomCode || "") });
    }
  }
  return out;
}

export interface PendingInput {
  course: Pick<AdCourse, "AdCourseId" | "CourseName">;
  count: number;
  /** أول رقم شعبة يُعطى. */
  firstCode: number;
  templates: readonly Template[];
  seed: FSchedule;
  /** الأسبوع كما هو الآن (كل الأقسام) مع ما وُضع قبلها في هذه الدفعة؛ يُضاف إليه ما يُوضع هنا. */
  working: FSchedule[];
  pairs: Set<string>;
  doorway: number;
  rhythm: RhythmReading | null;
  termId: number;
  instructorId: number;
  instructorName: string;
  fallbackLength: number;
  draftId: () => number;
}

const draftRow = (input: PendingInput, days: DayKey[], start: number, end: number, template?: Template): FSchedule => {
  const next: any = { ...input.seed, id: input.draftId(), AdTermId: input.termId, AdCourseId: input.course.AdCourseId, SCode: `pend${Math.abs(input.draftId())}` };
  for (const key of DAY_KEYS) next[key] = days.includes(key);
  next.fstarttime = minutesToTime(start); next.fendtime = minutesToTime(end);
  next.roomId = undefined; next.AdRoomHall = ""; next.locationStatus = "PENDING_ROOM";
  if (template?.buildingId) { next.buildingId = template.buildingId; next.AdRoomCode = template.building; }
  next.AdInstructorId = 0;
  return next as FSchedule;
};

const free = (row: FSchedule, input: PendingInput) => findConflicts([row], [...input.working, row], { cohortPairs: input.pairs, doorwayMinutes: input.doorway }).length === 0;

export function placePending(input: PendingInput): Array<Placement & { days: DayKey[]; pending: true }> {
  const placed: Array<Placement & { days: DayKey[]; pending: true }> = [];
  const usedTemplates = new Set<number>();
  /* شعبتان لمقررٍ واحد لا تقعان في الوقت نفسه: يتوزّع القسم على الأسبوع لا يتكدّس. */
  const usedSlots = new Set<string>();
  const slotKey = (days: DayKey[], start: string) => `${days.join(",")}@${start}`;
  const push = (index: number, row: FSchedule, days: DayKey[], note: string) => {
    input.working.push(row);
    placed.push({
      index, day: days[0], days, dayLabel: days.map(day => DAY_LABEL.get(day) || "").join(" و "), start: row.fstarttime, end: row.fendtime,
      buildingId: String(row.buildingId || ""), roomId: "", roomCode: String(row.AdRoomCode || ""), roomHall: "",
      instructorId: input.instructorId, instructorName: input.instructorName, sectionCode: String(input.firstCode + index - 1), note, pending: true,
    });
  };
  for (let slot = 1; slot <= input.count; slot += 1) {
    let done = false;
    /* ١) قالبٌ من الفصل المماثل لم يُستعمل بعد ويخلو من التعارض. */
    for (let i = 0; i < input.templates.length && !done; i += 1) {
      if (usedTemplates.has(i)) continue;
      const t = input.templates[i];
      if (usedSlots.has(slotKey(t.days, t.start))) continue;
      const row = draftRow(input, t.days, timeToMinutes(t.start), timeToMinutes(t.end), t);
      if (!free(row, input)) continue;
      usedTemplates.add(i); usedSlots.add(slotKey(t.days, t.start)); push(slot, row, t.days, "كالفصل المماثل"); done = true;
    }
    /* ٢) لا قالبَ خالٍ: عادةُ القسم في ساعات اليوم، مدةً من أقرب قالب أو من تاريخه. */
    if (!done) {
      const length = input.templates[0] ? timeToMinutes(input.templates[0].end) - timeToMinutes(input.templates[0].start) : input.fallbackLength;
      if (length > 0) for (const day of DAY_KEYS) {
        const ladder = input.rhythm?.forDay(day)?.ladder || [];
        for (const time of ladder) {
          if (done) break;
          const at = timeToMinutes(time);
          if (usedSlots.has(slotKey([day], minutesToTime(at)))) continue;
          const row = draftRow(input, [day], at, at + length, input.templates[0]);
          if (free(row, input)) { usedSlots.add(slotKey([day], minutesToTime(at))); push(slot, row, [day], "وقتٌ معتاد للقسم"); done = true; }
        }
        if (done) break;
      }
    }
    if (!done) break;
  }
  return placed;
}
