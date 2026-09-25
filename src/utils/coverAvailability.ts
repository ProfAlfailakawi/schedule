/**
 * ── هل هذا الأستاذ حرٌّ ليغطّي هذه الساعة في هذا اليوم؟ ─────────────────────
 *
 * «بديل اليوم» كان يرتّب المرشّحين بجدولهم الأسبوعي وحده، والتسجيلُ لا يفحص
 * شيئاً — فيُكلَّف أستاذٌ بتغطيتين في الساعة نفسها من اليوم نفسه، أو بتغطيةٍ
 * فوق محاضرته هو. القاعدة هنا وحدها، والترتيبُ والتسجيلُ يسألانها معاً:
 *
 *   ١) محاضرتُه الأسبوعية في ذلك اليوم تتقاطع مع الساعة ← مشغول، إلا إن كانت
 *      ملغاةً ذلك التاريخ أو يغطّيها عنه غيرُه (فهو حرٌّ فعلاً).
 *   ٢) تغطيةٌ أخرى مسجّلةٌ له في التاريخ نفسه تتقاطع مع الساعة ← مشغول.
 */
import { timeToMinutes } from "./scheduleIntelligence";

export interface CoverRow {
  id: number | string;
  AdInstructorId: number;
  fstarttime: string;
  fendtime: string;
  [day: string]: unknown;
}

export interface CoverException {
  scheduleId: number;
  date: string;
  kind: "cancel" | "cover";
  coverInstructorId?: number;
}

export type CoverConflict =
  | { kind: "weekly"; scheduleId: number }
  | { kind: "cover"; scheduleId: number };

export function coverConflict(input: {
  instructorId: number;
  date: string;
  dayKey: string;
  start: string;
  end: string;
  /** صفوف الفصل كلّه (كل الكليات): الأستاذ لا يتجزّأ على الأقسام. */
  termRows: ReadonlyArray<CoverRow>;
  /** استثناءات الفصل كلّه. */
  exceptions: ReadonlyArray<CoverException>;
  /** الموعد المطلوب تغطيته — لا يُعدّ تعارضاً مع نفسه. */
  coveringScheduleId?: number;
}): CoverConflict | null {
  const from = timeToMinutes(input.start), to = timeToMinutes(input.end);
  const overlaps = (row: CoverRow) => timeToMinutes(row.fstarttime) < to && timeToMinutes(row.fendtime) > from;
  const rowById = new Map(input.termRows.map(row => [Number(row.id), row]));
  const sameDate = input.exceptions.filter(entry => entry.date === input.date);
  const away = new Set(sameDate.map(entry => Number(entry.scheduleId)));

  for (const row of input.termRows) {
    if (Number(row.AdInstructorId) !== Number(input.instructorId)) continue;
    if (Number(row.id) === Number(input.coveringScheduleId)) continue;
    if (!row[input.dayKey] || !overlaps(row)) continue;
    /* محاضرتُه ملغاةٌ ذلك اليوم أو يغطّيها غيرُه: الساعةُ له فارغة. */
    if (away.has(Number(row.id))) continue;
    return { kind: "weekly", scheduleId: Number(row.id) };
  }
  for (const entry of sameDate) {
    if (entry.kind !== "cover" || Number(entry.coverInstructorId) !== Number(input.instructorId)) continue;
    if (Number(entry.scheduleId) === Number(input.coveringScheduleId)) continue;
    const covered = rowById.get(Number(entry.scheduleId));
    if (covered && overlaps(covered)) return { kind: "cover", scheduleId: Number(entry.scheduleId) };
  }
  return null;
}
