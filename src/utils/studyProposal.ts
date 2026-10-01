/**
 * ── المقترح الدراسي: القواعد المشتركة ───────────────────────────────────────
 *
 * كلُّ ما هنا دوالُّ نقيّة لا تعرف الخادم ولا المتصفح، ويقرؤها الاثنان بالنص
 * نفسه: بناءُ «الجدول الناتج» من العمليات، وحسابُ أثره، وكشفُ ما تغيّر تحت
 * المقترح، ومنطقُ النسخ والردود. أما الحكمُ على التعارض فليس هنا: يقوم به
 * فاحصُ الجدول نفسه (`scheduleConflicts` في الخادم) على الجدول الناتج من
 * هذه الدوال، فلا يوجد حكمان مختلفان على الموعد الواحد.
 *
 * مبدآن لا يُكسران:
 *   ١) الموعدُ القديم والجديد لا يُحسبان معاً — الجدولُ الناتج يستبدل ولا يضيف.
 *   ٢) المقترحُ لا يلمس الجدول الفعلي: التطبيقُ هنا على نسخةٍ في الذاكرة.
 */
import type {
  AdCourse, FSchedule, StudyProposal, StudyProposalDayKey, StudyProposalDecision, StudyProposalMetrics,
  StudyProposalOp, StudyProposalOpKind, StudyProposalResponseMode, StudyProposalRowSnapshot,
  StudyProposalRowSpec, StudyProposalStatus,
} from "../types";
import { instructorGapStats, timeToMinutes } from "./scheduleIntelligence";
import { weeklyLoadOf } from "./instructorRequestVerdict";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_START } from "./scheduleTime";

export const PROPOSAL_DAY_KEYS: StudyProposalDayKey[] = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"];
export const PROPOSAL_DAY_NAMES: Record<StudyProposalDayKey, string> = {
  fsunday: "الأحد", fmonday: "الاثنين", ftuesday: "الثلاثاء", fwednesday: "الأربعاء", fthursday: "الخميس",
};
export const PROPOSAL_DAY_SHORT: Record<StudyProposalDayKey, string> = {
  fsunday: "أحد", fmonday: "اثنين", ftuesday: "ثلاثاء", fwednesday: "أربعاء", fthursday: "خميس",
};

/** حدٌّ يمنع مقترحاً بلا نهاية: عددُ المواد في المسودة الواحدة. */
export const PROPOSAL_MAX_OPS = 12;
export const PROPOSAL_MESSAGE_LIMIT = 1200;
export const PROPOSAL_NOTE_LIMIT = 600;
/** مدة صلاحية الرد الافتراضية والحدّان (بالأيام). */
export const PROPOSAL_DEFAULT_DAYS = 7;
export const PROPOSAL_MIN_DAYS = 1;
export const PROPOSAL_MAX_DAYS = 30;

export const PROPOSAL_DEFAULT_MESSAGE =
  "راجعنا رغباتك، ونقترح الترتيب التالي. تقدر تطّلع على أثره في جدولك وتخبرنا إذا يناسبك.";

export const OP_KIND_LABEL: Record<StudyProposalOpKind, string> = {
  assign: "إسناد شعبة",
  create: "شعبة جديدة",
  edit: "تعديل موعد",
  replace: "استبدال",
};

export const STATUS_LABEL: Record<StudyProposalStatus, string> = {
  draft: "مسودة",
  sent: "بانتظار رد الأستاذ",
  approved: "وافق الأستاذ",
  partial: "موافقة جزئية",
  changes: "طلب تعديلاً",
  withdrawn: "مسحوب",
  expired: "انتهت صلاحيته",
  committed: "مثبّت في الجدول",
};

/* ── الأيام والوقت ────────────────────────────────────────────────────────── */

export function daysOf(row: Partial<Record<StudyProposalDayKey, unknown>> | { days?: StudyProposalDayKey[] }): StudyProposalDayKey[] {
  if (Array.isArray((row as any).days)) {
    const set = new Set<StudyProposalDayKey>((row as any).days);
    return PROPOSAL_DAY_KEYS.filter(key => set.has(key));
  }
  return PROPOSAL_DAY_KEYS.filter(key => Boolean((row as any)[key]));
}

export function dayFlags(days: readonly StudyProposalDayKey[]) {
  const set = new Set(days);
  return {
    fsunday: set.has("fsunday"), fmonday: set.has("fmonday"), ftuesday: set.has("ftuesday"),
    fwednesday: set.has("fwednesday"), fthursday: set.has("fthursday"),
  };
}

export function daysLabel(days: readonly StudyProposalDayKey[]): string {
  const names = PROPOSAL_DAY_KEYS.filter(key => days.includes(key)).map(key => PROPOSAL_DAY_NAMES[key]);
  if (names.length <= 1) return names[0] || "";
  return names.slice(0, -1).join("، ") + " و" + names[names.length - 1];
}

const clock = (value: string) => String(value || "").trim();

/** صيغة الأيام القديمة المخزنة في fdetail: «1,3,5». */
export function legacyDetailOf(days: readonly StudyProposalDayKey[]): string {
  return PROPOSAL_DAY_KEYS.map((key, index) => (days.includes(key) ? String(index + 1) : "")).filter(Boolean).join(",");
}

/** اقتراح رقم الشعبة التالي بالقاعدة نفسها: أكبر مستخدم بين 501 و999 زائد واحد، وإلا 501. */
export function nextSectionCodeFrom(used: Iterable<number | string>): string {
  const numbers = [...used].map(value => Number(value)).filter(value => Number.isInteger(value) && value >= 501 && value <= 999);
  return String(numbers.length ? Math.max(...numbers) + 1 : 501);
}

/** نهاية صلاحية الرد: بعد `days` يوماً من الآن، ضمن الحدّين. */
export function expiryAfterDays(days: unknown, now: number = Date.now()): { expiresAt: string; days: number } {
  const n = Math.min(PROPOSAL_MAX_DAYS, Math.max(PROPOSAL_MIN_DAYS, Math.round(Number(days) || PROPOSAL_DEFAULT_DAYS)));
  return { expiresAt: new Date(now + n * 86400000).toISOString(), days: n };
}

export function durationOf(spec: { fstarttime: string; fendtime: string }): number {
  return Math.max(0, timeToMinutes(spec.fendtime) - timeToMinutes(spec.fstarttime));
}

/* ── اللقطات والمواصفات ──────────────────────────────────────────────────── */

export interface ProposalCatalog {
  courseById: Map<number, Pick<AdCourse, "AdCourseId" | "CourseCode" | "CourseName" | "CourseHours" | "CourseCredit" | "AdCollegeId" | "AdSectionId"> & Partial<AdCourse>>;
  instructorNameById?: Map<number, string>;
}

export function snapshotOf(row: FSchedule, catalog: ProposalCatalog): StudyProposalRowSnapshot {
  const course = catalog.courseById.get(Number(row.AdCourseId));
  return {
    id: Number(row.id),
    rev: Number(row.rev || 0),
    AdCollegeId: Number(row.AdCollegeId),
    AdSectionId: Number(row.AdSectionId),
    AdCourseId: Number(row.AdCourseId),
    courseName: String(course?.CourseName || row.CourseNameSnapshot || row.AdCourseName || ""),
    courseCode: String(course?.CourseCode || row.CourseCodeSnapshot || ""),
    SCode: String(row.SCode ?? ""),
    AdInstructorId: Number(row.AdInstructorId || 0),
    instructorName: catalog.instructorNameById?.get(Number(row.AdInstructorId)),
    days: daysOf(row as any),
    fstarttime: clock(row.fstarttime),
    fendtime: clock(row.fendtime),
    AdRoomCode: String(row.AdRoomCode || ""),
    AdRoomHall: String(row.AdRoomHall || ""),
    buildingId: row.buildingId,
    roomId: row.roomId,
    locationStatus: row.locationStatus,
  };
}

export function specOfSnapshot(snapshot: StudyProposalRowSnapshot): StudyProposalRowSpec {
  return {
    AdCollegeId: snapshot.AdCollegeId,
    AdSectionId: snapshot.AdSectionId,
    AdCourseId: snapshot.AdCourseId,
    courseName: snapshot.courseName,
    courseCode: snapshot.courseCode,
    SCode: snapshot.SCode,
    days: [...snapshot.days],
    fstarttime: snapshot.fstarttime,
    fendtime: snapshot.fendtime,
    AdRoomCode: snapshot.AdRoomCode,
    AdRoomHall: snapshot.AdRoomHall,
    buildingId: snapshot.buildingId,
    roomId: snapshot.roomId,
    locationStatus: snapshot.locationStatus,
  };
}

/** مواصفاتٌ متطابقةٌ في كل ما يهمّ الأستاذ والجدول (للتمييز بين إسنادٍ «كما هو» و«بتعديل»). */
export function sameSpec(a: StudyProposalRowSpec, b: StudyProposalRowSpec): boolean {
  return a.AdCourseId === b.AdCourseId && String(a.SCode) === String(b.SCode)
    && daysOf(a).join() === daysOf(b).join()
    && clock(a.fstarttime) === clock(b.fstarttime) && clock(a.fendtime) === clock(b.fendtime)
    && String(a.AdRoomCode || "") === String(b.AdRoomCode || "") && String(a.AdRoomHall || "") === String(b.AdRoomHall || "")
    && String(a.roomId || "") === String(b.roomId || "") && String(a.buildingId || "") === String(b.buildingId || "");
}

/** هل «الإسناد» يعدّل موعد الشعبة أم يأخذها كما هي؟ */
export function assignmentIsAdjusted(op: StudyProposalOp): boolean {
  return Boolean(op.source) && !sameSpec(specOfSnapshot(op.source!), op.target);
}

/* ── تطبيق العمليات على نسخةٍ في الذاكرة ─────────────────────────────────── */

export interface ApplyContext {
  instructorId: number;
  termId: number;
  /** سجلّ «هيئة تدريسية» الذي يُسند إليه الموعد الخارج بـ«فك الإسناد». */
  placeholderId?: number | null;
  /** عمليات بعينها فقط (التثبيت الجزئي للمواد المستقلة). */
  onlyOpIds?: ReadonlySet<string>;
}

export interface AppliedProposal {
  /** جدول الفصل كاملاً بعد التطبيق. */
  rows: FSchedule[];
  /** الموعد الداخل لكل عملية (بمعرّف سالب إن كان جديداً). */
  incoming: Map<string, FSchedule>;
  /** المواعيد التي خرجت من جدول الأستاذ: ما أُزيل وما فُكّ إسناده. */
  outgoing: Array<{ opId: string; rowId: number; action: "unassign" | "delete"; before: FSchedule }>;
  /** مواعيدُ قائمةٌ تغيّرت (للتحقق والتثبيت). */
  touchedIds: number[];
  errors: Array<{ opId: string; code: "missing-source" | "missing-out" | "no-placeholder"; message: string }>;
}

/** معرّفات المواعيد الجديدة سالبة وفريدة داخل المقترح: -1000-k. */
export const tempRowId = (index: number) => -1000 - index;

function rowFromSpec(spec: StudyProposalRowSpec, base: Partial<FSchedule>, ctx: ApplyContext): FSchedule {
  return {
    ...(base as FSchedule),
    AdCollegeId: spec.AdCollegeId,
    AdSectionId: spec.AdSectionId,
    AdTermId: ctx.termId,
    AdCourseId: spec.AdCourseId,
    AdCourseName: spec.courseName,
    CourseCodeSnapshot: spec.courseCode,
    CourseNameSnapshot: spec.courseName,
    SCode: String(spec.SCode),
    AdInstructorId: ctx.instructorId,
    ...dayFlags(spec.days),
    fdetail: legacyDetailOf(spec.days),
    fstarttime: clock(spec.fstarttime),
    fendtime: clock(spec.fendtime),
    AdRoomCode: spec.AdRoomCode || "",
    AdRoomHall: spec.AdRoomHall || "",
    buildingId: spec.buildingId,
    roomId: spec.roomId,
    locationStatus: spec.locationStatus,
  } as FSchedule;
}

export function applyProposalOps(termRows: readonly FSchedule[], ops: readonly StudyProposalOp[], ctx: ApplyContext): AppliedProposal {
  const byId = new Map<number, FSchedule>();
  for (const row of termRows) byId.set(Number(row.id), row);
  const removed = new Set<number>();
  const replaced = new Map<number, FSchedule>();
  const incoming = new Map<string, FSchedule>();
  const outgoing: AppliedProposal["outgoing"] = [];
  const touched = new Set<number>();
  const errors: AppliedProposal["errors"] = [];
  const created: FSchedule[] = [];
  let tempIndex = 0;

  for (const op of ops) {
    if (ctx.onlyOpIds && !ctx.onlyOpIds.has(op.id)) continue;

    if (op.out) {
      const live = byId.get(op.out.snapshot.id);
      if (!live) errors.push({ opId: op.id, code: "missing-out", message: "الموعد الذي سيخرج من جدول الأستاذ لم يعد موجوداً." });
      else if (op.out.action === "delete") {
        removed.add(live.id); touched.add(live.id);
        outgoing.push({ opId: op.id, rowId: live.id, action: "delete", before: live });
      } else if (!ctx.placeholderId) {
        errors.push({ opId: op.id, code: "no-placeholder", message: "لا يوجد سجل «هيئة تدريسية» يُسند إليه الموعد عند فك الإسناد." });
      } else {
        replaced.set(live.id, { ...live, AdInstructorId: ctx.placeholderId });
        touched.add(live.id);
        outgoing.push({ opId: op.id, rowId: live.id, action: "unassign", before: live });
      }
    }

    const needsSource = op.kind === "assign" || op.kind === "edit" || (op.kind === "replace" && op.incoming === "assign");
    if (needsSource) {
      const live = op.source ? byId.get(op.source.id) : undefined;
      if (!live) { errors.push({ opId: op.id, code: "missing-source", message: "الموعد المرجعي لهذه المادة لم يعد موجوداً." }); continue; }
      const next = rowFromSpec(op.target, live, ctx);
      replaced.set(live.id, next);
      touched.add(live.id);
      incoming.set(op.id, next);
    } else {
      const temp = tempRowId(tempIndex++);
      const next = rowFromSpec(op.target, { id: temp, rev: 0, sourceOrder: Math.max(1_000_000, Date.now()) } as Partial<FSchedule>, ctx);
      (next as any).id = temp;
      created.push(next);
      incoming.set(op.id, next);
    }
  }

  const rows: FSchedule[] = [];
  for (const row of termRows) {
    if (removed.has(Number(row.id))) continue;
    rows.push(replaced.get(Number(row.id)) || row);
  }
  rows.push(...created);
  return { rows, incoming, outgoing, touchedIds: [...touched], errors };
}

/* ── ما تغيّر تحت المقترح ────────────────────────────────────────────────── */

export interface DriftIssue {
  opId: string;
  code: "gone" | "revised" | "reassigned" | "out-gone" | "out-revised" | "out-reassigned";
  message: string;
}

/**
 * يقارن لقطات العمليات بالجدول الحيّ. أيُّ فرقٍ يبطل المقترح كما وافق عليه
 * الأستاذ؛ لا يُنفَّذ بديلٌ مختلفٌ بصمت، فتُرجَع الأسباب ويعود القسم للمراجعة.
 */
export function proposalDrift(
  ops: readonly StudyProposalOp[], liveRows: readonly FSchedule[], placeholderIds: ReadonlySet<number>,
  ctx: { instructorId: number; onlyOpIds?: ReadonlySet<string> },
): DriftIssue[] {
  const byId = new Map<number, FSchedule>();
  for (const row of liveRows) byId.set(Number(row.id), row);
  const issues: DriftIssue[] = [];
  const label = (s: StudyProposalRowSnapshot) => `${s.courseName || s.courseCode} (${s.SCode})`;
  for (const op of ops) {
    if (ctx.onlyOpIds && !ctx.onlyOpIds.has(op.id)) continue;
    if (op.source) {
      const live = byId.get(op.source.id);
      if (!live) issues.push({ opId: op.id, code: "gone", message: `الشعبة ${label(op.source)} لم تعد موجودة في الجدول.` });
      else {
        const holder = Number(live.AdInstructorId || 0);
        if (op.kind !== "edit") {
          /* الإسناد يفترض أن الشعبة ما زالت لـ«هيئة تدريسية» (أو للمالك وقت الإعداد). */
          const stillSame = holder === Number(op.source.AdInstructorId)
            || (placeholderIds.has(holder) && placeholderIds.has(Number(op.source.AdInstructorId)));
          if (!stillSame) issues.push({ opId: op.id, code: "reassigned", message: `الشعبة ${label(op.source)} أُسندت إلى شخصٍ آخر بعد إعداد المقترح.` });
        } else if (holder !== ctx.instructorId) {
          issues.push({ opId: op.id, code: "reassigned", message: `الموعد ${label(op.source)} لم يعد في جدول هذا الأستاذ.` });
        }
        if (Number(live.rev || 0) !== Number(op.source.rev || 0))
          issues.push({ opId: op.id, code: "revised", message: `تغيّر الموعد ${label(op.source)} بعد إعداد المقترح.` });
      }
    }
    if (op.out) {
      const live = byId.get(op.out.snapshot.id);
      if (!live) issues.push({ opId: op.id, code: "out-gone", message: `الموعد ${label(op.out.snapshot)} الذي سيخرج من الجدول لم يعد موجوداً.` });
      else {
        if (Number(live.AdInstructorId || 0) !== ctx.instructorId)
          issues.push({ opId: op.id, code: "out-reassigned", message: `الموعد ${label(op.out.snapshot)} لم يعد في جدول هذا الأستاذ.` });
        if (Number(live.rev || 0) !== Number(op.out.snapshot.rev || 0))
          issues.push({ opId: op.id, code: "out-revised", message: `تغيّر الموعد ${label(op.out.snapshot)} بعد إعداد المقترح.` });
      }
    }
  }
  return issues;
}

/* ── التحقق من شكل العملية (بلا فحص تعارض) ───────────────────────────────── */

export interface OpIssue { opId: string; field: string; message: string }

export function validateOp(op: StudyProposalOp): OpIssue[] {
  const issues: OpIssue[] = [];
  const add = (field: string, message: string) => issues.push({ opId: op.id, field, message });
  const t = op.target;
  if ((op.kind === "assign" || op.kind === "edit") && !op.source) add("source", "اختر الموعد أو الشعبة المرجعية.");
  if (op.kind === "replace") {
    if (!op.out) add("out", "حدّد الموعد الذي سيخرج من جدول الأستاذ.");
    if (!op.incoming) add("incoming", "حدّد هل الداخل شعبةٌ قائمة أم جديدة.");
    if (op.incoming === "assign" && !op.source) add("source", "اختر الشعبة التي ستدخل جدول الأستاذ.");
  }
  if (!t) { add("target", "بيانات المادة ناقصة."); return issues; }
  if (!t.AdCourseId) add("AdCourseId", "اختر المقرر.");
  if (!/^\d+$/.test(String(t.SCode || ""))) add("SCode", "رقم الشعبة أرقامٌ فقط.");
  if (!t.days?.length) add("days", "اختر يوماً واحداً على الأقل.");
  const s = timeToMinutes(t.fstarttime), e = timeToMinutes(t.fendtime);
  if (!/^\d{1,2}:\d{2}$/.test(clock(t.fstarttime)) || !/^\d{1,2}:\d{2}$/.test(clock(t.fendtime))) add("time", "اكتب وقت البداية والنهاية.");
  else if (e <= s) add("time", "وقت النهاية يجب أن يكون بعد البداية.");
  else if (s < SCHEDULE_DAY_START || e > SCHEDULE_DAY_END) add("time", "الوقت خارج ساعات اليوم الدراسي (08:00 – 20:00).");
  if (!t.buildingId || (!t.roomId && t.locationStatus !== "PENDING_ROOM")) add("location", "اختر المبنى والقاعة، أو «القاعة لم تُحدد».");
  if (op.kind === "replace" && op.out && op.incoming === "assign" && op.source && op.out.snapshot.id === op.source.id)
    add("source", "لا يمكن أن يخرج الموعد ويدخل نفسه.");
  return issues;
}

export function validateOps(ops: readonly StudyProposalOp[]): OpIssue[] {
  const issues: OpIssue[] = [];
  if (!ops.length) return issues;
  if (ops.length > PROPOSAL_MAX_OPS) issues.push({ opId: "", field: "ops", message: `الحدّ الأقصى ${PROPOSAL_MAX_OPS} مادة في المقترح الواحد.` });
  const sources = new Map<number, string>();
  const outs = new Map<number, string>();
  for (const op of ops) {
    issues.push(...validateOp(op));
    if (op.source) {
      if (sources.has(op.source.id)) issues.push({ opId: op.id, field: "source", message: "الموعد المرجعي نفسه مستعمل في مادةٍ أخرى من المقترح." });
      sources.set(op.source.id, op.id);
    }
    if (op.out) {
      if (outs.has(op.out.snapshot.id) || sources.has(op.out.snapshot.id))
        issues.push({ opId: op.id, field: "out", message: "الموعد الخارج مستعمل في مادةٍ أخرى من المقترح." });
      outs.set(op.out.snapshot.id, op.id);
    }
  }
  /* شعبةٌ جديدة برقمٍ مكرّر داخل المقترح نفسه. */
  const newKeys = new Map<string, string>();
  for (const op of ops) {
    if (!(op.kind === "create" || (op.kind === "replace" && op.incoming === "create"))) continue;
    const key = `${op.target.AdCourseId}|${op.target.SCode}`;
    if (newKeys.has(key)) issues.push({ opId: op.id, field: "SCode", message: "رقم الشعبة الجديدة مكرّر داخل المقترح." });
    newKeys.set(key, op.id);
  }
  return issues;
}

/* ── الأثر: النصاب والحضور والفراغات ─────────────────────────────────────── */

export function proposalMetrics(instructorRows: readonly FSchedule[], courseById: ProposalCatalog["courseById"]): StudyProposalMetrics {
  const rows = instructorRows.filter(row => Number(row.AdInstructorId) > 0);
  const unique = new Set(rows.map(row => `${row.AdCourseId}|${row.SCode ?? ""}`));
  const stats = rows.length ? instructorGapStats(rows.map(row => ({ ...row, AdInstructorId: 1 }))).get(1) : undefined;
  let presence = 0;
  for (const key of PROPOSAL_DAY_KEYS) {
    const blocks = rows.filter(row => Boolean((row as any)[key]));
    if (!blocks.length) continue;
    const start = Math.min(...blocks.map(row => timeToMinutes(row.fstarttime)));
    const end = Math.max(...blocks.map(row => timeToMinutes(row.fendtime)));
    presence += Math.max(0, end - start);
  }
  /* لا نصاب بلا ساعاتٍ للمقرر: نقول «غير متوفر» ولا نعرض صفراً مضلّلاً. */
  const missingHours = [...new Set(rows.map(row => Number(row.AdCourseId)))].some(id => {
    const course = courseById.get(id);
    return !course || !Number(course.CourseHours || course.CourseCredit || 0);
  });
  return {
    sections: unique.size,
    loadUnits: missingHours ? null : weeklyLoadOf(rows as FSchedule[], courseById as any),
    teachingMinutes: stats?.weeklyMinutes || 0,
    presenceMinutes: presence,
    attendanceDays: stats?.days.size || 0,
    dayKeys: PROPOSAL_DAY_KEYS.filter(key => stats?.days.has(key as any)),
    gapMinutes: stats?.gapMinutes || 0,
    maxGap: stats?.maxGap || 0,
    unknown: missingHours ? ["load"] : [],
  };
}

/* ── النسخ والردود ───────────────────────────────────────────────────────── */

/** ما يُعدّ «تغييراً في التفاصيل التي وافق عليها الأستاذ». الرسالةُ والصلاحية لا تُعدّان. */
export function materialFingerprint(ops: readonly StudyProposalOp[], mode: StudyProposalResponseMode): string {
  const norm = ops.map(op => ({
    id: op.id, kind: op.kind,
    source: op.source ? [op.source.id, op.source.rev] : null,
    out: op.out ? [op.out.snapshot.id, op.out.snapshot.rev, op.out.action] : null,
    incoming: op.incoming || null,
    target: {
      c: op.target.AdCourseId, s: String(op.target.SCode), d: daysOf(op.target).join(","),
      a: clock(op.target.fstarttime), b: clock(op.target.fendtime),
      r: [op.target.buildingId || "", op.target.roomId || "", op.target.locationStatus || "", op.target.AdRoomCode || "", op.target.AdRoomHall || ""],
    },
  }));
  return JSON.stringify({ mode, ops: norm });
}

export interface DecisionState {
  version: number;
  approved: string[];
  changes: string[];
  pending: string[];
  outcome: "none" | "approved" | "partial" | "changes" | "waiting";
  respondedAt?: string;
}

/** حالةُ الردّ على النسخة المرسَلة الحالية وحدها. موافقةُ نسخةٍ قديمة لا تُحتسب. */
export function decisionStateOf(proposal: Pick<StudyProposal, "sentVersion" | "versions" | "responses" | "responseMode" | "ops">): DecisionState {
  const version = proposal.sentVersion;
  if (!version) return { version: 0, approved: [], changes: [], pending: [], outcome: "none" };
  const sent = proposal.versions.find(v => v.version === version);
  const opIds = (sent?.ops || proposal.ops).map(op => op.id);
  const mode = sent?.responseMode || proposal.responseMode;
  const latest = new Map<string, StudyProposalDecision["decision"]>();
  let respondedAt: string | undefined;
  for (const response of proposal.responses.filter(r => r.version === version && r.by === "instructor")
    .sort((a, b) => a.at.localeCompare(b.at))) {
    respondedAt = response.at;
    for (const d of response.decisions) latest.set(d.opId, d.decision);
  }
  /* الترتيب المترابط: أي رد يسري على المجموعة كلها. */
  if (mode === "linked") {
    const last = [...latest.values()].pop();
    if (!last) return { version, approved: [], changes: [], pending: opIds, outcome: "waiting" };
    return last === "approve"
      ? { version, approved: opIds, changes: [], pending: [], outcome: "approved", respondedAt }
      : { version, approved: [], changes: opIds, pending: [], outcome: "changes", respondedAt };
  }
  const approved = opIds.filter(id => latest.get(id) === "approve");
  const changes = opIds.filter(id => latest.get(id) === "changes");
  const pending = opIds.filter(id => !latest.has(id));
  const outcome: DecisionState["outcome"] =
    !approved.length && !changes.length ? "waiting"
      : changes.length === 0 && pending.length === 0 ? "approved"
        : approved.length && (changes.length || pending.length) ? "partial"
          : changes.length ? "changes" : "waiting";
  return { version, approved, changes, pending, outcome, respondedAt };
}

/** هل يقبل المقترحُ ردَّ الأستاذ الآن؟ سببُ الرفض نصٌّ يقرؤه الأستاذ. */
export function responseGate(
  proposal: Pick<StudyProposal, "status" | "sentVersion" | "version" | "expiresAt" | "commit">,
  now: number = Date.now(), termClosed = false,
): { open: boolean; reason?: string } {
  if (proposal.status === "committed" || proposal.commit) return { open: false, reason: "ثبّت القسم هذا المقترح في جدولك." };
  if (proposal.status === "withdrawn") return { open: false, reason: "سحب القسم هذا المقترح." };
  if (proposal.status === "expired") return { open: false, reason: "انتهت صلاحية الرد على هذا المقترح." };
  if (proposal.status === "draft" && proposal.sentVersion === 0) return { open: false, reason: "لم يُرسَل هذا المقترح بعد." };
  if (proposal.version !== proposal.sentVersion) return { open: false, reason: "يعدّل القسم هذا المقترح الآن. ستصلك نسخةٌ جديدة للرد عليها." };
  if (proposal.expiresAt && Date.parse(proposal.expiresAt) < now) return { open: false, reason: "انتهت صلاحية الرد على هذا المقترح." };
  if (termClosed) return { open: false, reason: "انتهى هذا الفصل ولا تُقبل فيه ردود جديدة." };
  return { open: true };
}

/** الحالةُ المشتقّة للعرض: تجمع حالة الوثيقة مع الردود والصلاحية. */
export function effectiveStatus(
  proposal: StudyProposal, now: number = Date.now(),
): StudyProposalStatus {
  if (proposal.status === "committed" || proposal.status === "withdrawn") return proposal.status;
  if (proposal.sentVersion > 0 && proposal.version === proposal.sentVersion) {
    const state = decisionStateOf(proposal);
    if (state.outcome === "approved") return "approved";
    if (state.outcome === "partial") return "partial";
    if (state.outcome === "changes") return "changes";
    if (proposal.expiresAt && Date.parse(proposal.expiresAt) < now) return "expired";
    return "sent";
  }
  return proposal.status === "expired" ? "expired" : "draft";
}

/** مسطّحٌ عمداً: المشروع لا يشغّل strict، فلا يضيّق TypeScript الاتحاداتِ المميَّزة. */
export interface CommitReadiness {
  ok: boolean;
  opIds: string[];
  partial: boolean;
  code?: "not-approved" | "committed" | "stale-version" | "linked-incomplete" | "empty";
  message?: string;
}

/** ما يجوز تثبيتُه الآن. الترتيب المترابط لا يُثبَّت إلا كاملاً. */
export function commitReadiness(proposal: StudyProposal): CommitReadiness {
  if (proposal.commit || proposal.status === "committed") return { ok: false, opIds: [], partial: false, code: "committed", message: "هذا المقترح مثبّت من قبل." };
  if (!proposal.sentVersion || proposal.version !== proposal.sentVersion)
    return { ok: false, opIds: [], partial: false, code: "stale-version", message: "للمقترح نسخةٌ أحدث لم تُرسَل أو لم يردّ الأستاذ عليها." };
  const state = decisionStateOf(proposal);
  if (!state.approved.length) return { ok: false, opIds: [], partial: false, code: "not-approved", message: "لا توجد موافقةٌ من الأستاذ على النسخة الحالية." };
  /* الطريقةُ المعتبرة هي طريقةُ النسخة المرسلة التي ردّ عليها الأستاذ، لا طريقةُ مسودةٍ لاحقة. */
  const sentMode = proposal.versions.find(v => v.version === proposal.sentVersion)?.responseMode ?? proposal.responseMode;
  if (sentMode === "linked" && state.approved.length !== proposal.ops.length)
    return { ok: false, opIds: [], partial: false, code: "linked-incomplete", message: "الترتيب المترابط لا يُثبَّت إلا بموافقة الأستاذ على المجموعة كاملة." };
  return { ok: true, opIds: state.approved, partial: state.approved.length < proposal.ops.length };
}

/** ملخّصٌ قصير لكل مادة يُكتب في الحوار والسجل. */
export function opSummary(op: StudyProposalOp): string {
  const t = op.target;
  const what = `${t.courseName || t.courseCode || "مقرر"}${t.SCode ? ` · شعبة ${t.SCode}` : ""}`;
  return `${OP_KIND_LABEL[op.kind]}: ${what} · ${daysLabel(daysOf(t))} · ${clock(t.fstarttime)}–${clock(t.fendtime)}`;
}

/** عنوانٌ افتراضي للمقترح من موادّه. */
export function defaultTitle(instructorName: string, termName: string): string {
  return `مقترح دراسي${instructorName ? ` — ${instructorName}` : ""}${termName ? ` · ${termName}` : ""}`;
}

/* ── التقييم: الشكل المشترك بين الخادم والواجهة ──────────────────────────── */

export type FindingKind = "blocker" | "review" | "info";

export interface ProposalFinding {
  id: string;
  kind: FindingKind;
  /** رمزٌ ثابتٌ للتصنيف. */
  code: string;
  title: string;
  detail: string;
  /** لماذا ظهرت هذه النتيجة. */
  reason?: string;
  /** ما يمكن فعله لمعالجتها. */
  fix?: string;
  opId?: string;
  /** مفاتيح العناصر المعنية في الجدول (GridItem.key). */
  gridKeys?: string[];
  day?: StudyProposalDayKey;
  start?: string;
  end?: string;
}

export type GridState = "current" | "proposed" | "modified" | "out" | "outside" | "draft";

export interface GridItem {
  key: string;
  state: GridState;
  /** مفتاح الموعد الأصلي الذي حلّ هذا محلّه أو خرج بدله. */
  replaces?: string;
  opId?: string;
  rowId: number;
  courseName: string;
  courseCode: string;
  SCode: string;
  days: StudyProposalDayKey[];
  start: string;
  end: string;
  /** وصفٌ مختصر للمكان ("مبنى 09 · G28" أو "القاعة لم تُحدد"). */
  place: string;
  placeKnown: boolean;
  /** موعدٌ من خارج نطاق صلاحية المستخدم: يظهر إشغالاً فقط. */
  outside?: boolean;
  /** لقطةٌ كاملة لعرض التفاصيل عند الضغط. */
  collegeName?: string;
  sectionName?: string;
  outAction?: "unassign" | "delete";
  /** ما يحتاجه المحرّر ليبني عمليةً من هذا الموعد (للمواعيد المرئية فقط). */
  src?: {
    courseId: number; collegeId: number; sectionId: number; rev: number;
    buildingId?: string; roomId?: string; locationStatus?: string; roomCode: string; roomHall: string;
  };
}

export interface ProposalEvaluation {
  /** complete: اكتمل الفحص كاملاً. */
  status: "complete" | "partial";
  /** أسباب عدم الاكتمال إن وجدت. */
  incompleteReasons: string[];
  computedAt: string;
  before: { items: GridItem[]; metrics: StudyProposalMetrics };
  /** ghosts: ما خرج أو تغيّر موضعُه — يُرسم باهتاً عند طلب «إظهار التغييرات». */
  after: { items: GridItem[]; ghosts: GridItem[]; metrics: StudyProposalMetrics };
  loadCap: number | null;
  findings: ProposalFinding[];
  counts: { blockers: number; reviews: number; infos: number };
  perOp: Record<string, { state: "ok" | "blocked" | "review" | "unchecked"; findingIds: string[] }>;
  drift: DriftIssue[];
  opIssues: OpIssue[];
  /** هل يجوز إرسال المقترح كعرضٍ جاهزٍ للموافقة. */
  readiness: { canSend: boolean; reasons: string[] };
}

export const FINDING_KIND_LABEL: Record<FindingKind, string> = {
  blocker: "مانع",
  review: "للمراجعة",
  info: "معلومة",
};

/** تسميةُ المكان المختصرة. */
export function placeLabel(row: { AdRoomCode?: string; AdRoomHall?: string; locationStatus?: string; roomId?: string }): { text: string; known: boolean } {
  const building = String(row.AdRoomCode || "").trim();
  const hall = String(row.AdRoomHall || "").trim();
  if (row.locationStatus === "PENDING_ROOM" || (!hall && !row.roomId)) {
    return { text: building ? `${building} · القاعة لم تُحدد` : "القاعة لم تُحدد", known: false };
  }
  return { text: [building, hall].filter(Boolean).join(" · "), known: true };
}
