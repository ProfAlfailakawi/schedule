/**
 * ── كلُّ بندٍ ناقص يحمل إصلاحَه ─────────────────────────────────────────────
 * منطقٌ صرف لقائمة «بيانات ناقصة» في شريط الاعتماد: أيُّ نوعٍ يُصلَح في مكانه،
 * وكيف يُبنى جسمُ تعديل المقرر (PUT يطلب الجسم كاملاً)، وماذا يُرفض قبل الإرسال.
 */
export type CourseFixKey = "CourseCredit" | "CourseHours" | "MaxStudent";
export interface CourseFixField { key: CourseFixKey; label: string; type: "int" | "decimal" | "text"; max: number }

/** تسمية الحقل الناقص كما يكتبها `scheduleDataReadiness` ← حقل المقرر. */
export const COURSE_FIX_FIELDS: Record<string, CourseFixField> = {
  "الوحدات": { key: "CourseCredit", label: "الوحدات", type: "int", max: 20 },
  "الساعات": { key: "CourseHours", label: "الساعات", type: "decimal", max: 40 },
  "سعة الشعبة": { key: "MaxStudent", label: "السعة", type: "int", max: 2000 },
};

export type ReadinessFixMode = "course-fields" | "room-capacity" | "room-link" | "open-row" | "jump";
export interface ReadinessItemLike { kind: string; id: string; fields: string[] }

export function readinessFixMode(item: ReadinessItemLike): ReadinessFixMode {
  if (item.kind === "course") return item.fields.some(f => COURSE_FIX_FIELDS[f]) ? "course-fields" : "jump";
  if (item.kind === "location") return "room-link";
  if (item.kind === "schedule") return "open-row";
  return "jump";
}

export const courseFixFieldsOf = (item: ReadinessItemLike): CourseFixField[] =>
  item.fields.map(f => COURSE_FIX_FIELDS[f]).filter(Boolean);

/** يُرجع نصّ الخطأ، أو null إن صحّت القيمة. */
export function validateCourseFix(field: CourseFixField, raw: string): string | null {
  const text = String(raw ?? "").trim();
  if (field.type === "text") return text && text.length <= field.max ? null : `${field.label} مطلوب`;
  const n = Number(text);
  if (!text || !Number.isFinite(n) || n <= 0) return `${field.label}: أدخل رقماً أكبر من صفر`;
  if (field.type === "int" && !Number.isInteger(n)) return `${field.label}: عدد صحيح`;
  if (n > field.max) return `${field.label}: الحدّ ${field.max}`;
  return null;
}

/** جسم PUT /api/courses/:id: الصفّ القائم كاملاً، ولا يتغيّر إلا ما عُدّل. */
export function buildCourseUpdateBody(course: any, patch: Partial<Record<CourseFixKey, string>>) {
  const body = {
    AdCollegeId: Number(course.AdCollegeId),
    AdSectionId: Number(course.AdSectionId),
    CourseCode: String(course.CourseCode ?? ""),
    CourseName: String(course.CourseName ?? ""),
    CourseCredit: Number(course.CourseCredit) || 0,
    CourseHours: Number(course.CourseHours) || 0,
    MaxStudent: Number(course.MaxStudent) || 0,
  };
  for (const [key, value] of Object.entries(patch) as [CourseFixKey, string][]) {
    const def = Object.values(COURSE_FIX_FIELDS).find(f => f.key === key);
    if (!def) continue;
    (body as any)[key] = def.type === "text" ? String(value).trim() : Number(value);
  }
  return body;
}

/** رفضُ الصلاحية يظهر قفلاً لا خطأً: 403، أو قفل لجنة الجدول خارج مراجعة الصحيفة. */
export const isPermissionDenial = (status: number, message = "") =>
  status === 403 || (status === 409 && /مراجعة مسوّدة|صلاحية/.test(message));

/** جسم PUT /api/schedules/:id لربط موعد بقاعة: الصفّ كاملاً + المبنى والقاعة. */
export function buildRoomLinkBody(row: any, pick: { buildingId: string; buildingCode: string; roomId?: string; hall: string; locationStatus?: string }) {
  return { ...row, buildingId: pick.buildingId, AdRoomCode: pick.buildingCode, roomId: pick.roomId, AdRoomHall: pick.hall, locationStatus: pick.locationStatus };
}
