/**
 * ── لقطاتُ طلب الأستاذ من صفوف الجدول ───────────────────────────────────────
 * تُقرأ في مسارات الخادم وفي بذر البيئة التجريبية بالقاعدة نفسها.
 */
import type { InstructorRequestItem, InstructorRequestSnapshot } from "../types";
import type { RequestDayKey } from "./instructorRequestVerdict";

export const dayKeysOf = (row: any): RequestDayKey[] =>
  (["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as RequestDayKey[]).filter(key => Boolean(row?.[key]));

export const DAY_LETTERS: Record<RequestDayKey, string> = {
  fsunday: "الأحد", fmonday: "الاثنين", ftuesday: "الثلاثاء", fwednesday: "الأربعاء", fthursday: "الخميس",
};

/** لقطةُ صفٍّ كما تُقرأ. */
export function requestSnapshot(row: any, courseName: string, withRoom: boolean): InstructorRequestSnapshot {
  return {
    courseId: Number(row.AdCourseId || 0),
    courseName,
    sectionCode: String(row.SCode || ""),
    days: dayKeysOf(row).map(key => DAY_LETTERS[key]).join(" · "),
    time: `${row.fstarttime || ""} – ${row.fendtime || ""}`,
    ...(withRoom ? { room: [row.AdRoomCode, row.AdRoomHall].filter(Boolean).join("/") } : {}),
  };
}

/**
 * ── جدولُ الأستاذ كلُّه، بكل كلياته ─────────────────────────────────────────
 *
 * كان الطلبُ يُبنى من صفوف الأستاذ في الكلية والقسم اللذين أصدرا الرابط وحدهما.
 * فأستاذٌ يدرّس محاضرتين — إحداهما في كليةٍ أخرى — كانت «بطاقتي» تعرض له
 * الاثنتين والطلبُ واحدةً، فيسأل: أين محاضرتي الثانية؟ فصار الطلبُ يقرأ ما
 * تقرؤه البطاقة: كلَّ صفوفه في الفصل. وكلُّ بندٍ يحمل كليتَه وقسمَه، فيصل
 * منسّقَ تلك الكلية وحده (انظر `requestItemScope`).
 */
export function requestSnapshotAt(row: any, courseName: string, collegeNameById: Map<number, string>): InstructorRequestSnapshot {
  const collegeId = Number(row.AdCollegeId || 0);
  const sectionId = Number(row.AdSectionId || 0);
  return {
    ...requestSnapshot(row, courseName, true),
    ...(collegeId ? { collegeId, collegeName: collegeNameById.get(collegeId) || undefined } : {}),
    ...(sectionId ? { sectionId } : {}),
  };
}

export function requestItemFromRow(row: any, courseName: string, collegeNameById: Map<number, string>): InstructorRequestItem {
  return {
    rowId: Number(row.id),
    action: "keep",
    before: requestSnapshotAt(row, courseName, collegeNameById),
    slots: dayKeysOf(row).map(day => ({ day, start: String(row.fstarttime || ""), end: String(row.fendtime || "") })),
  };
}

