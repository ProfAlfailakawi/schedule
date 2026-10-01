/**
 * ── مسودةُ نموذج المادة ← عمليةُ مقترح ─────────────────────────────────────
 *
 * النموذجُ يحمل ما يكتبه المنسّق، وهذه الدوالُّ (النقيّة) تحوّله إلى
 * StudyProposalOp وتعيده، فلا يعرف النموذجُ شيئاً عن شكل العملية المخزّنة.
 */
import type {
  StudyProposalDayKey, StudyProposalOp, StudyProposalRowSnapshot, StudyProposalRowSpec,
} from "../../types";
import { expectedMinutesForDay, type DayKey } from "../../utils/scheduleRegulations";
import { minutesToTime, timeToMinutes } from "../../utils/scheduleIntelligence";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_START } from "../../utils/scheduleTime";
import { daysOf, nextSectionCodeFrom, specOfSnapshot, validateOp, type GridItem } from "../../utils/studyProposal";
import type { ContextCourse, FacultyEntry } from "./proposalApi";

export type WorkMode = "assign" | "create" | "edit" | "replace";

export interface LocationDraft {
  AdRoomCode: string; AdRoomHall: string; buildingId?: string; roomId?: string;
  locationStatus?: "VERIFIED" | "PENDING_ROOM";
}

export interface FormDraft {
  mode: WorkMode;
  /** المادة التي تُعدَّل الآن (وإلا فالنموذج لإضافة مادةٍ جديدة). */
  editingOpId: string | null;
  /** assign / replace(incoming=assign): الشعبة القائمة المختارة. */
  facultyId: number | null;
  /** «إسنادها مع تعديل موعدها» بدل «كما هي». */
  adjust: boolean;
  /** edit: الموعد المعدَّل. replace: الموعد الخارج. */
  rowId: number | null;
  outAction: "unassign" | "delete";
  incoming: "assign" | "create";
  courseId: number | null;
  scode: string;
  days: StudyProposalDayKey[];
  start: string;
  end: string;
  /** المنسّق عدّل النهاية بيده: لا تُحسب تلقائياً بعد الآن. */
  endTouched: boolean;
  /** مدّةُ لقاءٍ ممتدّ (مختبر/ورشة) اعتُمد من سجلّ المقرر: تبقى للنهاية التلقائية في يومٍ واحد. */
  block: number;
  location: LocationDraft;
  note: string;
}

export const blankDraft = (mode: WorkMode = "assign"): FormDraft => ({
  mode, editingOpId: null, facultyId: null, adjust: false, rowId: null, outAction: "unassign", incoming: "assign",
  courseId: null, scode: "", days: [], start: "", end: "", endTouched: false, block: 0,
  location: { AdRoomCode: "", AdRoomHall: "" }, note: "",
});

/** المدة المعتمدة لنمطٍ من الأيام: ٥٠ للأحد/الثلاثاء/الخميس، ٨٠ للاثنين/الأربعاء، ولا شيء للمختلط. */
export function expectedDuration(days: readonly StudyProposalDayKey[]): number {
  if (!days.length) return 0;
  const values = new Set(days.map(day => expectedMinutesForDay(day as DayKey)));
  return values.size === 1 ? [...values][0] : 0;
}

/** نهايةٌ مقترحة من البداية والنمط، أو "" إن تعذّر. */
export function autoEnd(days: readonly StudyProposalDayKey[], start: string, block = 0): string {
  const minutes = block && days.length === 1 ? block : expectedDuration(days);
  if (!minutes || !/^\d{1,2}:\d{2}$/.test(start)) return "";
  const end = timeToMinutes(start) + minutes;
  return end <= SCHEDULE_DAY_END ? minutesToTime(end) : "";
}

export function locationOf(source: { AdRoomCode?: string; AdRoomHall?: string; buildingId?: string; roomId?: string; locationStatus?: string }): LocationDraft {
  return {
    AdRoomCode: String(source.AdRoomCode || ""), AdRoomHall: String(source.AdRoomHall || ""),
    buildingId: source.buildingId, roomId: source.roomId,
    locationStatus: source.locationStatus === "PENDING_ROOM" ? "PENDING_ROOM" : source.roomId ? "VERIFIED" : undefined,
  };
}

/** يملأ النموذج من شعبةٍ قائمة (إسناد). */
export function draftFromFaculty(base: FormDraft, entry: FacultyEntry): FormDraft {
  const s = entry.snapshot;
  return {
    ...base, facultyId: s.id, courseId: s.AdCourseId, scode: s.SCode, days: [...s.days], start: s.fstarttime, end: s.fendtime,
    endTouched: true, location: locationOf(s), adjust: false,
  };
}

/** يملأ النموذج من موعدٍ للأستاذ (تعديل أو استبدال). */
export function draftFromItem(base: FormDraft, item: GridItem): FormDraft {
  const src = item.src;
  return {
    ...base, rowId: item.rowId, courseId: src?.courseId ?? null, scode: item.SCode, days: [...item.days], start: item.start,
    end: item.end, endTouched: true, location: locationOf({ AdRoomCode: src?.roomCode, AdRoomHall: src?.roomHall, buildingId: src?.buildingId, roomId: src?.roomId, locationStatus: src?.locationStatus }),
  };
}

export interface DraftContext {
  faculty: Map<number, FacultyEntry>;
  instructorItems: Map<number, GridItem>;
  courses: Map<number, ContextCourse>;
}

const snapshotFromItem = (item: GridItem): StudyProposalRowSnapshot => ({
  id: item.rowId, rev: item.src?.rev ?? 0, AdCollegeId: item.src?.collegeId ?? 0, AdSectionId: item.src?.sectionId ?? 0,
  AdCourseId: item.src?.courseId ?? 0, courseName: item.courseName, courseCode: item.courseCode, SCode: item.SCode,
  AdInstructorId: 0, days: [...item.days], fstarttime: item.start, fendtime: item.end,
  AdRoomCode: item.src?.roomCode || "", AdRoomHall: item.src?.roomHall || "", buildingId: item.src?.buildingId, roomId: item.src?.roomId,
  locationStatus: item.src?.locationStatus as any,
});

let counter = 0;
export const newOpId = () => `op-${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** يبني العملية من النموذج. يعيد null مع قائمة النواقص إن لم تكتمل. */
export function draftToOp(draft: FormDraft, ctx: DraftContext): { op: StudyProposalOp | null; issues: string[] } {
  const issues: string[] = [];
  const id = draft.editingOpId || newOpId();
  const course = draft.courseId ? ctx.courses.get(draft.courseId) : undefined;
  const faculty = draft.facultyId != null ? ctx.faculty.get(draft.facultyId) : undefined;
  const row = draft.rowId != null ? ctx.instructorItems.get(draft.rowId) : undefined;

  const usesFaculty = draft.mode === "assign" || (draft.mode === "replace" && draft.incoming === "assign");
  const createsNew = draft.mode === "create" || (draft.mode === "replace" && draft.incoming === "create");
  if (usesFaculty && !faculty) issues.push("اختر الشعبة من القائمة.");
  if (draft.mode === "edit" && !row) issues.push("اختر موعد الأستاذ الذي سيتغيّر.");
  if (draft.mode === "replace" && !row) issues.push("اختر الموعد الذي سيخرج من جدول الأستاذ.");
  if (createsNew && !course) issues.push("اختر المقرر.");

  const courseRef = usesFaculty ? faculty?.snapshot : draft.mode === "edit" ? (row ? snapshotFromItem(row) : undefined) : undefined;
  const target: StudyProposalRowSpec = {
    AdCollegeId: courseRef?.AdCollegeId ?? course?.collegeId ?? 0,
    AdSectionId: courseRef?.AdSectionId ?? course?.sectionId ?? 0,
    AdCourseId: courseRef?.AdCourseId ?? course?.id ?? 0,
    courseName: courseRef?.courseName ?? course?.name ?? "",
    courseCode: courseRef?.courseCode ?? course?.code ?? "",
    SCode: courseRef ? String(courseRef.SCode) : draft.scode.trim(),
    days: [...draft.days], fstarttime: draft.start, fendtime: draft.end,
    AdRoomCode: draft.location.AdRoomCode, AdRoomHall: draft.location.AdRoomHall,
    buildingId: draft.location.buildingId, roomId: draft.location.roomId, locationStatus: draft.location.locationStatus,
  };
  const kind: StudyProposalOp["kind"] = draft.mode;
  const op: StudyProposalOp = {
    id, kind, target, note: draft.note.trim() || undefined,
    ...(usesFaculty && faculty ? { source: faculty.snapshot } : {}),
    ...(draft.mode === "edit" && row ? { source: snapshotFromItem(row) } : {}),
    ...(draft.mode === "replace" ? { incoming: draft.incoming, ...(row ? { out: { snapshot: snapshotFromItem(row), action: draft.outAction } } : {}) } : {}),
  };
  /* «كما هي»: الهدفُ نسخةٌ من الشعبة القائمة نفسها، فلا يُقصد من ورائه تعديلٌ بالخطأ. */
  if (usesFaculty && faculty && !draft.adjust) Object.assign(op.target, specOfSnapshot(faculty.snapshot));
  for (const issue of validateOp(op)) {
    const text = issue.message;
    if (!issues.includes(text)) issues.push(text);
  }
  return { op: issues.length ? null : op, issues };
}

/** يعيد مسودة النموذج من عمليةٍ مخزّنة (لتعديلها). */
export function opToDraft(op: StudyProposalOp): FormDraft {
  const t = op.target;
  const base: FormDraft = {
    ...blankDraft(op.kind), editingOpId: op.id, courseId: t.AdCourseId, scode: String(t.SCode), days: daysOf(t),
    start: t.fstarttime, end: t.fendtime, endTouched: true, location: locationOf(t), note: op.note || "",
  };
  if (op.kind === "assign" || (op.kind === "replace" && op.incoming === "assign")) {
    base.facultyId = op.source?.id ?? null;
    base.adjust = Boolean(op.source) && JSON.stringify([daysOf(specOfSnapshot(op.source!)), op.source!.fstarttime, op.source!.fendtime, op.source!.roomId, op.source!.AdRoomHall])
      !== JSON.stringify([daysOf(t), t.fstarttime, t.fendtime, t.roomId, t.AdRoomHall]);
  }
  if (op.kind === "edit") base.rowId = op.source?.id ?? null;
  if (op.kind === "replace") {
    base.rowId = op.out?.snapshot.id ?? null;
    base.outAction = op.out?.action ?? "unassign";
    base.incoming = op.incoming ?? "assign";
  }
  return base;
}

/** رقم الشعبة التالي لمقرر: يراعي ما استُعمل في الفصل وما أُضيف في المسودة نفسها. */
export function suggestSectionCode(courseId: number | null, used: Record<string, number[]>, ops: readonly StudyProposalOp[], ignoreOpId?: string | null): string {
  if (!courseId) return "";
  const fromTerm = used[String(courseId)] || [];
  const fromOps = ops
    .filter(op => op.id !== ignoreOpId && op.target.AdCourseId === courseId && (op.kind === "create" || (op.kind === "replace" && op.incoming === "create")))
    .map(op => Number(op.target.SCode));
  return nextSectionCodeFrom([...fromTerm, ...fromOps]);
}

/** هل يتداخل زمن الشعبة مع موعدٍ قائمٍ للأستاذ؟ فحصٌ سريعٌ للعرض فقط؛ الحكمُ للخادم. */
export function quickOverlap(item: { days: readonly StudyProposalDayKey[]; start: string; end: string }, rows: readonly GridItem[], ignoreKeys: ReadonlySet<string> = new Set()): GridItem | null {
  const s = timeToMinutes(item.start), e = timeToMinutes(item.end);
  for (const row of rows) {
    if (ignoreKeys.has(row.key) || !row.days.some(day => item.days.includes(day))) continue;
    if (s < timeToMinutes(row.end) && timeToMinutes(row.start) < e) return row;
  }
  return null;
}

export const DAY_WINDOW = { start: SCHEDULE_DAY_START, end: SCHEDULE_DAY_END };
