/**
 * ── كلُّ بندٍ ناقص في شريط الاعتماد يُصلَح في مكانه ───────────────────────
 * منطقٌ (readinessFix) + بنيةُ المصدر (ApprovalBar/Schedules/CSS).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCourseUpdateBody, buildRoomLinkBody, courseFixFieldsOf, isPermissionDenial, readinessFixMode, validateCourseFix,
} from "../src/utils/readinessFix";
import { computeScheduleDataReadiness } from "../src/utils/scheduleDataReadiness";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0, failed = 0;
const check = (ok: boolean, name: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); } };

/* 1) كلُّ نوعٍ ينتج وضعاً صحيحاً، من مخرجات computeScheduleDataReadiness نفسها. */
const course = { AdCourseId: 5, AdCollegeId: 1, AdSectionId: 2, CourseCode: "", CourseName: "مقرر", CourseCredit: 0, CourseHours: 0, MaxStudent: 0 };
const gaps = computeScheduleDataReadiness({
  courses: [course], instructorIds: new Set([7]),
  rooms: [{ id: "f13", buildingCode: "012", canonicalCode: "F13", capacity: null }],
  rows: [
    { id: 1, AdCourseId: 5, AdInstructorId: 7, SCode: "1", fsunday: true, fstarttime: "08:00", fendtime: "09:15", roomId: "f13" },
    { id: 2, AdCourseId: 5, AdInstructorId: 0, SCode: "", fstarttime: "", fendtime: "", roomId: "" },
  ],
});
const modeOf = (kind: string) => gaps.items.filter(i => i.kind === kind).map(readinessFixMode);
check(modeOf("course").every(m => m === "course-fields") && modeOf("course").length === 1, "المقرر الناقص: خاناتٌ في مكانها");
check(modeOf("room").length === 0, "سعة القاعة لم تعد بنداً ناقصاً (مخفيةٌ من البرنامج)");
check(modeOf("location").every(m => m === "room-link"), "موعدٌ بلا قاعة: اختيارُ مبنى وقاعة في مكانه");
check(modeOf("schedule").every(m => m === "open-row"), "نواقص الموعد (شعبة/أستاذ/أيام/وقت): «افتح الموعد»");
check(readinessFixMode({ kind: "course", id: "0", fields: ["ربط المقرر برمز صحيح في المكتبة"] }) === "jump", "مقرر غير مربوط يبقى قفزاً");
check(readinessFixMode({ kind: "room", id: "x", fields: ["تأكيد ربط القاعة في سجل المواقع"] }) === "jump", "قاعة غير مسجّلة تبقى قفزاً");

/* 2) حقول المقرر الأربعة (+الاسم) تُقرأ من تسميات الخادم. */
const courseItem = gaps.items.find(i => i.kind === "course")!;
const keys = courseFixFieldsOf(courseItem).map(f => f.key).sort();
check(JSON.stringify(keys) === JSON.stringify(["CourseCredit", "CourseHours", "MaxStudent"]), "الوحدات والساعات والسعة خاناتٌ؛ الرمز والاسم لا يُعدَّلان من الشريط (هويةُ المقرر المجدول ثابتة)");

/* 3) التحقّق. */
const [credit, hours, cap] = ["CourseCredit", "CourseHours", "MaxStudent"].map(k => courseFixFieldsOf(courseItem).find(f => f.key === k)!);
check(validateCourseFix(credit, "3") === null && validateCourseFix(credit, "0") !== null && validateCourseFix(credit, "2.5") !== null, "الوحدات: عددٌ صحيح موجب");
check(validateCourseFix(hours, "1.5") === null && validateCourseFix(hours, "") !== null, "الساعات: عشريٌّ موجب");
check(validateCourseFix(cap, "2001") !== null && validateCourseFix(cap, "40") === null, "السعة: حدٌّ أعلى 2000");

/* 4) جسم PUT: الصفّ كاملاً ولا يتغيّر إلا ما عُدّل. */
const body = buildCourseUpdateBody({ ...course, CourseCode: "CS1", CourseCredit: 3, CourseHours: 3, MaxStudent: 0, extra: "x" }, { MaxStudent: "35" });
check(body.MaxStudent === 35 && body.CourseCode === "CS1" && body.CourseCredit === 3 && body.CourseHours === 3 && body.AdCollegeId === 1 && body.AdSectionId === 2 && !("extra" in body), "الجسم كاملٌ والحقل المعدَّل وحده تغيّر");

/* 5) الصلاحية قفلٌ لا خطأ. */
check(isPermissionDenial(403) && isPermissionDenial(409, "تعديل بيانات القسم متاح أثناء مراجعة مسوّدة الصحيفة فقط") && !isPermissionDenial(400, "تم تسجيل رمز المقرر") && !isPermissionDenial(409, "هذا المقرر له سجل تدريسي"), "403 وقفل اللجنة قفلٌ؛ بقية الأخطاء أخطاء");

/* 6) جسم ربط القاعة. */
const link = buildRoomLinkBody({ id: 9, SCode: "1", AdInstructorId: 7 }, { buildingId: "b1", buildingCode: "012", roomId: "f13", hall: "F13", locationStatus: "VERIFIED" });
check(link.id === 9 && link.SCode === "1" && link.buildingId === "b1" && link.roomId === "f13" && link.AdRoomCode === "012" && link.AdRoomHall === "F13", "ربط القاعة يحمل الصفّ كاملاً + المبنى والقاعة");

/* 7) المصدر. */
const bar = readFileSync(join(ROOT, "src/components/ApprovalBar.tsx"), "utf8");
const sched = readFileSync(join(ROOT, "src/components/Schedules.tsx"), "utf8");
const css = readFileSync(join(ROOT, "src/styles/11-approval.css"), "utf8");
check(/\/api\/courses\/\$\{encodeURIComponent\(courseId\)\}`, \{\s*method: "PUT"/.test(bar) && bar.includes("buildCourseUpdateBody(course, patch)"), "الحفظ بواجهة تعديل المقرر نفسها وبجسمٍ كامل");
check(bar.includes("request(`/api/courses?sectionId=${sectionId}`)"), "الصفّ يُقرأ طازجاً قبل الحفظ");
check(bar.includes("data-course-input") && bar.includes('event.key === "Enter"'), "خاناتُ المقرر تحفظ بـ Enter");
check(bar.includes("apb-dr-lock") && bar.includes("disabled={courseLocked}") && bar.includes("setCoursesLocked(message)"), "رفضُ الصلاحية: خانةٌ معطّلة وقفل بتلميح لا خطأ");
check(bar.includes("<BuildingPicker") && bar.includes("<RoomPicker") && bar.includes("/api/schedules/${encodeURIComponent(rowId)}"), "ربط القاعة يعيد استعمال BuildingPicker وRoomPicker وواجهة الموعد");
check(bar.includes("افتح الموعد") && bar.includes("onOpenRow"), "نواقص الموعد: زرّ «افتح الموعد» يفتح المحرّر");
check(/await load\(\); onChanged\?\.\(\);/.test(bar.slice(bar.indexOf("saveCourseFix"), bar.indexOf("useEffect(() => { void load(); }, [load]);"))), "بعد الحفظ: إعادة قراءة العدّ وإشارة التحديث بلا إعادة تحميل");
check(sched.includes("canEditCourses={permissions.includes(6)}") && sched.includes("onOpenRow="), "الورشة تمرّر الصلاحية وفتح الموعد");
check(css.includes(".apb-dr-lock") && css.includes("@media (max-width:560px){.apb-dr-list li"), "تنسيقُ القفل والجوال");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
