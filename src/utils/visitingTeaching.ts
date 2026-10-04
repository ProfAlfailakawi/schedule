import { compareCourseSection } from "./scheduleOrder";

/**
 * ── تدريس المنتدبين عبر كليات القسم: حسابٌ واحد للشاشة وللطباعة وللاختبار ──
 *
 * استعلام المنتدبين يحدّد «القسم العلمي» بالكلية والقسم، ثم يقرأ تدريس منتدبيه
 * في كل كلية فيها قسمٌ مناظر (عائلة القسم في sectionLabel). كان يحسب الشعب
 * والساعات من صفوف الكلية المختارة وحدها، فيظهر من يدرّس شعبتين هنا وشعبة هناك
 * بشعبتين. هنا يُجمع كل شيء مرة واحدة:
 *
 *  • الصف الواحد لا يُعدّ مرتين ولو وصل من مصدرين (معرّف الموعد، وإلا بصمته).
 *  • «الشعبة» = (كلية، قسم، مقرر، رمز الشعبة): موعدا محاضرة ومختبر لشعبة واحدة
 *    شعبةٌ واحدة، وساعاتهما تُجمعان.
 *  • الساعات الأسبوعية = مدة كل موعد × عدد أيامه.
 *  • لكل صفٍّ موقعه (الكلية والقسم) حتى لا تختلط مواقع التدريس.
 */

export interface VisitingTeachingRow {
  id?: number;
  AdCollegeId: number;
  AdSectionId: number;
  AdInstructorId: number;
  AdCourseId: number;
  AdCourseName?: string;
  CourseCodeSnapshot?: string;
  SCode?: string;
  fstarttime: string;
  fendtime: string;
  fsunday?: boolean; fmonday?: boolean; ftuesday?: boolean; fwednesday?: boolean; fthursday?: boolean;
  AdRoomCode?: string;
  AdRoomHall?: string;
}

export interface VisitingPlace { collegeId: number; sectionId: number; sections: number; weeklyMinutes: number }

export interface VisitingTeachingSummary<R extends VisitingTeachingRow = VisitingTeachingRow> {
  instructorId: number;
  rows: R[];
  /** الشعب الفعلية الفريدة (لا عدد المواعيد). */
  sections: number;
  courses: number;
  weeklyMinutes: number;
  places: VisitingPlace[];
}

const DAY_FLAGS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;

const clockMinutes = (value: string) => {
  const [h, m] = String(value || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function rowWeeklyMinutes(row: VisitingTeachingRow): number {
  const span = Math.max(0, clockMinutes(row.fendtime) - clockMinutes(row.fstarttime));
  return span * DAY_FLAGS.filter(flag => Boolean((row as any)[flag])).length;
}

/** بصمة الموعد: معرّفه إن وُجد، وإلا محتواه كله — فالنسخة المكررة من مصدرٍ آخر تسقط. */
export function visitingRowKey(row: VisitingTeachingRow): string {
  if (Number(row.id) > 0) return `id:${Number(row.id)}`;
  return [
    row.AdCollegeId, row.AdSectionId, row.AdInstructorId, row.AdCourseId, String(row.SCode || "").trim(),
    row.fstarttime, row.fendtime, DAY_FLAGS.map(flag => ((row as any)[flag] ? 1 : 0)).join(""),
    String(row.AdRoomCode || ""), String(row.AdRoomHall || ""),
  ].join("|");
}

/** الشعبة: مقررٌ برمز شعبته في موقعه. بلا رمز = كل موعدٍ شعبةٌ مستقلة (لا دمج بالتخمين). */
export function visitingSectionKey(row: VisitingTeachingRow): string {
  const code = String(row.SCode || "").trim();
  return code
    ? `${Number(row.AdCollegeId)}:${Number(row.AdSectionId)}:${Number(row.AdCourseId)}:${code}`
    : `row:${visitingRowKey(row)}`;
}

export function dedupeVisitingRows<R extends VisitingTeachingRow>(rows: readonly R[]): R[] {
  const seen = new Map<string, R>();
  for (const row of rows) { const key = visitingRowKey(row); if (!seen.has(key)) seen.set(key, row); }
  return [...seen.values()];
}

export function summarizeVisitingTeaching<R extends VisitingTeachingRow>(
  rows: readonly R[],
  visitingIds: Iterable<number>,
): VisitingTeachingSummary<R>[] {
  const wanted = new Set([...visitingIds].map(Number));
  const byPerson = new Map<number, R[]>();
  for (const row of dedupeVisitingRows(rows)) {
    const id = Number(row.AdInstructorId);
    if (!wanted.has(id)) continue;
    byPerson.set(id, [...(byPerson.get(id) || []), row]);
  }
  return [...byPerson.entries()].map(([instructorId, mine]) => {
    mine.sort((a, b) => compareCourseSection(
      { courseCode: a.CourseCodeSnapshot, sectionCode: a.SCode, courseName: a.AdCourseName, id: a.id },
      { courseCode: b.CourseCodeSnapshot, sectionCode: b.SCode, courseName: b.AdCourseName, id: b.id },
    ) || clockMinutes(a.fstarttime) - clockMinutes(b.fstarttime));
    const places = new Map<string, { collegeId: number; sectionId: number; sectionKeys: Set<string>; weeklyMinutes: number }>();
    for (const row of mine) {
      const key = `${Number(row.AdCollegeId)}:${Number(row.AdSectionId)}`;
      const place = places.get(key) || { collegeId: Number(row.AdCollegeId), sectionId: Number(row.AdSectionId), sectionKeys: new Set<string>(), weeklyMinutes: 0 };
      place.sectionKeys.add(visitingSectionKey(row));
      place.weeklyMinutes += rowWeeklyMinutes(row);
      places.set(key, place);
    }
    return {
      instructorId,
      rows: mine,
      sections: new Set(mine.map(visitingSectionKey)).size,
      courses: new Set(mine.map(row => Number(row.AdCourseId || 0)).filter(Boolean)).size,
      weeklyMinutes: mine.reduce((sum, row) => sum + rowWeeklyMinutes(row), 0),
      places: [...places.values()].map(({ sectionKeys, ...rest }) => ({ ...rest, sections: sectionKeys.size })),
    };
  });
}

/** ساعات أسبوعية للعرض: نصف الساعة يظهر ولا يُقرَّب إلى ساعة كاملة صامتاً. */
export function weeklyHours(minutes: number): number {
  return Math.round((Number(minutes || 0) / 60) * 2) / 2;
}
