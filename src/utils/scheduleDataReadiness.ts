/**
 * ── بياناتٌ ناقصة في الجدول — إشعارٌ لا مانع ──────────────────────────────
 *
 * قاعدة المالك (2026-09-27): «التوقيع لا يمنعه إلا تعارض ماديّ». فهذه القائمة
 * تُعرض وتُستكمل، ولا يتوقف عليها توقيعٌ ولا إرسال. والصفوف تُقرأ بعد التطبيع
 * نفسه الذي تُعدّ به الموانع (`normalizeRow`)، فقاعةٌ مكتوبةٌ نصّاً تطابق
 * سجلّ المواقع ليست ناقصة.
 */
import { SCHEDULE_DAYS, timeToMinutes } from "./scheduleIntelligence";

export interface DataGapItem { kind: string; id: string; label: string; fields: string[] }
export interface DataReadinessInput {
  rows: any[];
  courses: any[];
  instructorIds: Set<number>;
  rooms: any[];
  normalizeRow?: (row: any) => any;
}

export function computeScheduleDataReadiness({ rows, courses, instructorIds, rooms: registryRooms, normalizeRow }: DataReadinessInput) {
  const scheduleRows = normalizeRow ? rows.map(row => normalizeRow(row)) : rows;
  const courseById = new Map(courses.map(course => [Number(course.AdCourseId), course]));
  const roomById = new Map(registryRooms.map(room => [String(room.id), room]));
  const missing = new Map<string, DataGapItem>();
  for (const row of scheduleRows) {
    const courseId = Number(row.AdCourseId || 0), course = courseById.get(courseId);
    const label = `${course?.CourseCode || "موعد"} · ${course?.CourseName || row.AdCourseName || "مقرر"} · شعبة ${row.SCode || "—"}`;
    if (!courseId || !course) {
      missing.set(`course:${row.id}`, { kind: "course", id: String(courseId || row.id), label, fields: ["ربط المقرر برمز صحيح في المكتبة"] });
    }
    if (course) {
      const fields = [
        !(Number(course.CourseCredit) > 0) && "الوحدات",
        !(Number(course.CourseHours) > 0) && "الساعات",
        !(Number(course.MaxStudent) > 0) && "سعة الشعبة",
        !String(course.CourseCode || "").trim() && "رمز المقرر",
        !String(course.CourseName || "").trim() && "اسم المقرر",
      ].filter(Boolean) as string[];
      if (fields.length) missing.set(`course:${courseId}`, { kind: "course", id: String(courseId), label: `${course.CourseCode || "مقرر"} · ${course.CourseName || courseId}`, fields });
    }
    const rowFields: string[] = [];
    if (!String(row.SCode || "").trim()) rowFields.push("رمز الشعبة");
    if (!Number(row.AdInstructorId) || !instructorIds.has(Number(row.AdInstructorId))) rowFields.push("عضو هيئة التدريس");
    if (!SCHEDULE_DAYS.some(day => Boolean(row[day.key]))) rowFields.push("أيام المحاضرة");
    const start = timeToMinutes(String(row.fstarttime || "")), end = timeToMinutes(String(row.fendtime || ""));
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) rowFields.push("وقت بداية ونهاية صحيح");
    if (rowFields.length) missing.set(`schedule:${row.id}`, { kind: "schedule", id: String(row.id), label, fields: rowFields });
    const roomId = String(row.roomId || "");
    if (!roomId) {
      missing.set(`location:${row.id}`, { kind: "location", id: String(row.id), label, fields: ["ربط الموعد بقاعة معتمدة"] });
    } else {
      const room = roomById.get(roomId);
      if (!room) missing.set(`room:${roomId}`, { kind: "room", id: roomId, label: `قاعة ${row.AdRoomHall || roomId}`, fields: ["تأكيد ربط القاعة في سجل المواقع"] });
    }
  }
  const rooms = [...new Set(scheduleRows.map(row => String(row.roomId || "")).filter(Boolean))]
    .map(id => roomById.get(id)).filter(Boolean)
    .map(room => ({ id: String(room.id), label: `مبنى ${room.buildingCode} · قاعة ${room.canonicalCode}`, capacity: Number(room.capacity) || null }));
  const items = [...missing.values()];
  return { ready: items.length === 0, count: items.length, items, rooms };
}
