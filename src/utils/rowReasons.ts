import type { FSchedule, HallBarterRequest, InstructorRequest, MasterRoom, StudyProposal } from "../types";
import { activeDays, timeToMinutes } from "./scheduleIntelligence";
import { AR, countOf } from "./arabicCount";
import { buildingIdentityKey } from "./locationRegistry";

/**
 * ── لماذا هذه القاعة؟ ولماذا هذا الأستاذ؟ ──────────────────────────────────────
 * دالةٌ صرفة تقرأ ما في يد النظام أصلاً (سجل القاعات، المقايضات المعتمدة، نصاب الأستاذ،
 * تاريخ المقرر، طلبات الأستاذ ومقترحاته) وتُخرج رقائقَ موجزة. لا تخترع شيئاً:
 * كلُّ رقاقة تُحذف إن غابت بياناتها، وإن لم يبقَ شيء فالمصفوفة فارغة.
 */
export interface RowReason {
  kind: "hall" | "borrow" | "seats" | "walk" | "load" | "pattern" | "request";
  tone: "good" | "warn" | "info";
  label: string;
  tip: string;
}

export interface RowReasonInput {
  row: FSchedule;
  /** القاعة من سجل المواقع إن عُرفت. */
  room?: MasterRoom | null;
  /** طلبات المقايضة لهذا الفصل (يُؤخذ المعتمد منها فقط). */
  barter?: HallBarterRequest[];
  /** سعة الشعبة (MaxStudent للمقرر) إن عُرفت. */
  maxStudent?: number;
  /** مواعيد الأستاذ نفسه في هذا الفصل. */
  instructorRows?: FSchedule[];
  /** النصاب المسجّل، وما يحمله الأستاذ من ساعات معتمدة في الفصل. */
  quota?: number | null;
  loadUnits?: number | null;
  /** مواعيد هذا المقرر في الفصول الأخرى. */
  history?: FSchedule[];
  requests?: InstructorRequest[];
  proposals?: StudyProposal[];
}

const num = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const patternOf = (row: Partial<FSchedule>) => `${activeDays(row).join("+")}@${String(row.fstarttime || "")}`;
/** أقصى فجوة بين محاضرتين نعدّهما متجاورتين. */
const ADJACENT_GAP = 90;

function roomReasons(input: RowReasonInput): RowReason[] {
  const { row, room } = input;
  const out: RowReason[] = [];
  const days = activeDays(row);
  const rowStart = timeToMinutes(row.fstarttime), rowEnd = timeToMinutes(row.fendtime);
  const borrowed = (input.barter || []).find(request =>
    request.status === "approved"
    && Number(request.requesterSectionId) === num(row.AdSectionId)
    && Number(request.AdTermId) === num(row.AdTermId)
    && days.includes(request.day)
    && timeToMinutes(request.startTime) <= rowStart && rowEnd <= timeToMinutes(request.endTime)
    && ((request.roomId && row.roomId && request.roomId === row.roomId)
      || (!request.roomId && String(request.roomCode) === String(row.AdRoomCode) && String(request.roomHall) === String(row.AdRoomHall))));
  if (borrowed) {
    out.push({ kind: "borrow", tone: "info", label: "قاعة مستعارة", tip: "قاعة معتمدة بالمقايضة لهذا الفصل في هذه الفترة" });
  } else if (room && room.active !== false && Array.isArray(room.sectionIds) && room.sectionIds.includes(num(row.AdSectionId))) {
    out.push({ kind: "hall", tone: "good", label: "قاعة القسم", tip: "القاعة مسجّلة ضمن قاعات هذا القسم في سجل المواقع" });
  }
  const seats = num(room?.capacity), need = num(input.maxStudent);
  if (room && seats > 0 && need > 0) {
    out.push(seats >= need
      ? { kind: "seats", tone: "good", label: `تتسع ${seats}`, tip: `سعة القاعة ${seats} مقابل سعة الشعبة ${need}` }
      : { kind: "seats", tone: "warn", label: `ضيقة ${seats}/${need}`, tip: `سعة القاعة ${seats} أقل من سعة الشعبة ${need}` });
  }
  /* القرب: أقرب محاضرة للأستاذ في اليوم نفسه تجاور هذه، إن عُرف مبنى كلٍّ منهما. */
  const here = buildingIdentityKey(row);
  if (here && row.AdInstructorId) {
    const neighbours: Array<{ gap: number; row: FSchedule }> = [];
    for (const other of input.instructorRows || []) {
      if (other.id === row.id || num(other.AdInstructorId) !== num(row.AdInstructorId)) continue;
      if (!days.some(day => Boolean((other as any)[day]))) continue;
      const before = rowStart - timeToMinutes(other.fendtime), after = timeToMinutes(other.fstarttime) - rowEnd;
      const gap = before >= 0 ? before : after >= 0 ? after : -1;
      if (gap >= 0 && gap <= ADJACENT_GAP && buildingIdentityKey(other)) neighbours.push({ gap, row: other });
    }
    neighbours.sort((a, b) => a.gap - b.gap);
    const near = neighbours[0];
    if (near) {
      const same = buildingIdentityKey(near.row) === here;
      out.push(same
        ? { kind: "walk", tone: "good", label: "بجوار محاضرته", tip: "محاضرة الأستاذ المجاورة في المبنى نفسه، فلا انتقال بين مبنيين" }
        : { kind: "walk", tone: "info", label: "انتقال مبنى", tip: `محاضرة الأستاذ المجاورة في مبنى آخر (فجوة ${countOf(near.gap, AR.minute)})` });
    }
  }
  return out;
}

function instructorReasons(input: RowReasonInput): RowReason[] {
  const { row } = input;
  const out: RowReason[] = [];
  if (!row.AdInstructorId) return out;
  const quota = num(input.quota);
  if (quota > 0 && input.loadUnits != null) {
    const load = num(input.loadUnits);
    out.push(load > quota
      ? { kind: "load", tone: "warn", label: `حمل ${load}/${quota}`, tip: `يحمل ${countOf(load, AR.hour)} معتمدة وهو فوق نصابه ${quota}` }
      : { kind: "load", tone: "good", label: `حمل ${load}/${quota}`, tip: `يحمل ${countOf(load, AR.hour)} معتمدة ضمن نصابه ${quota}` });
  }
  /* النمط: الأستاذ نفسه درّس المقرر نفسه في فصولٍ أخرى؛ هل كرّر هذا الموعد؟ */
  const mine = (input.history || []).filter(item => num(item.AdCourseId) === num(row.AdCourseId)
    && num(item.AdInstructorId) === num(row.AdInstructorId) && num(item.AdTermId) !== num(row.AdTermId));
  if (mine.length) {
    const terms = new Set(mine.map(item => num(item.AdTermId)));
    const key = patternOf(row);
    const kept = new Set(mine.filter(item => patternOf(item) === key).map(item => num(item.AdTermId)));
    out.push(kept.size
      ? { kind: "pattern", tone: "good", label: kept.size === 1 ? "كرّره مرة" : `كرّره ${countOf(kept.size, AR.term)}`, tip: `نمطه في الفصول السابقة: ${kept.size}/${terms.size} بالموعد نفسه` }
      : { kind: "pattern", tone: "info", label: "نمط جديد", tip: `لم يدرّس المقرر في هذا اليوم والوقت من قبل` });
  }
  /* طلبٌ أو مقترحٌ مفتوح يمسّ هذا الصف. */
  const REQ: Record<string, string> = { keep: "إبقاء", change: "تعديل", delete: "حذف" };
  for (const request of input.requests || []) {
    if (num(request.AdInstructorId) !== num(row.AdInstructorId) || request.status === "settled") continue;
    const item = (request.items || []).find(entry => entry.rowId != null && num(entry.rowId) === num(row.id) && (!entry.decision || entry.decision.state === "pending"));
    if (item && REQ[item.action]) {
      out.push({ kind: "request", tone: "info", label: `رغبته: ${REQ[item.action]}`, tip: `طلب الأستاذ المفتوح يطلب ${REQ[item.action]} هذا الموعد` });
      return out;
    }
  }
  const OPEN = new Set(["sent", "partial", "changes", "approved"]);
  const proposal = (input.proposals || []).find(entry => num(entry.AdInstructorId) === num(row.AdInstructorId) && OPEN.has(entry.status)
    && (entry.ops || []).some(op => [op.source?.id, op.out?.snapshot?.id].some(id => id != null && num(id) === num(row.id))));
  if (proposal) out.push({ kind: "request", tone: "info", label: "مقترح مفتوح", tip: "مقترح دراسي مفتوح مع الأستاذ يمسّ هذا الموعد" });
  return out;
}

/** الرقائق كلها: القاعة أولاً ثم الأستاذ. فارغةٌ إن لم يوجد شيء يُقال. */
export function buildRowReasons(input: RowReasonInput): RowReason[] {
  return [...roomReasons(input), ...instructorReasons(input)];
}

/** الساعات المعتمدة التي يحملها الأستاذ: شعبة واحدة (مقرر+رمز) تُحسب مرة. */
export function instructorLoadUnits(rows: FSchedule[], instructorId: number, creditOf: (courseId: number) => number): number {
  const seen = new Set<string>();
  let total = 0;
  for (const row of rows) {
    if (num(row.AdInstructorId) !== num(instructorId)) continue;
    const key = `${row.AdCourseId}|${row.SCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += creditOf(num(row.AdCourseId));
  }
  return total;
}
