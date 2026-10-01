/** تنسيقاتُ العرض المشتركة بين مكوّنات مساحة المقترح: عددٌ ومعدود، وقتٌ، ومدّة. */
import { AR, countOf } from "../../utils/arabicCount";
import { formatScheduleTimeRange } from "../../utils/scheduleTime";
import { PROPOSAL_DAY_NAMES, PROPOSAL_DAY_SHORT, daysLabel } from "../../utils/studyProposal";
import type { StudyProposalDayKey } from "../../types";

/** «مادة» في المقترح — الاسمُ بأشكاله الأربعة كما تتطلب قواعد العدد. */
export const OP_NOUN = { one: "مادة", two: "مادتان", few: "مواد", many: "مادة" };

export const num = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn");

export const timeRange = (start: string, end: string) => formatScheduleTimeRange(start, end);

export const dayShortList = (days: readonly StudyProposalDayKey[]) =>
  days.map(day => PROPOSAL_DAY_SHORT[day]).join(" · ");

export { PROPOSAL_DAY_NAMES, daysLabel };

/** ٩٠ دقيقة → «ساعة ونصف»، ١٢٩٠ → «21 ساعة و30 دقيقة». */
export function minutesLabel(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (!total) return "لا شيء";
  const h = Math.floor(total / 60), m = total % 60;
  if (!h) return countOf(m, AR.minute);
  if (!m) return countOf(h, AR.hour);
  return `${countOf(h, AR.hour)} و${countOf(m, AR.minute)}`;
}

/** صيغةٌ قصيرة للخانات الضيّقة: «21س 30د». */
export function minutesCompact(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (!total) return "0";
  const h = Math.floor(total / 60), m = total % 60;
  return [h ? `${num(h)} س` : "", m ? `${num(m)} د` : ""].filter(Boolean).join(" ");
}

/** ساعاتٌ بكسرٍ عشريٍّ واحدٍ لا أكثر: 35.25 → «35.3». */
export function hoursShort(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return num(hours);
}

export function relativeSaved(at: number | null, now: number): string {
  if (!at) return "";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 8) return "الآن";
  if (seconds < 60) return `قبل ${countOf(seconds, AR.second)}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `قبل ${countOf(minutes, AR.minute)}`;
  return `قبل ${countOf(Math.round(minutes / 60), AR.hour)}`;
}

export const arabicDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ar-KW-u-nu-latn", { weekday: "long", month: "long", day: "numeric" });
};
export const arabicDateTime = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ar-KW-u-nu-latn", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
};
