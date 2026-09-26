/**
 * Regression audit for academic curriculum transitions.
 *
 * The critical contract is deliberately checked at the integration seams:
 * current catalogues stay operational before setup, the first explicit plan
 * freezes that catalogue as transition history, archived-only courses cannot
 * leak back into operational surfaces, and timetable rows keep their historic
 * course identity.
 */
import fs from "fs";
import path from "path";

let passed=0,failed=0;
function check(value:boolean,label:string){
  if(value){passed++;console.log(`\x1b[32m✓ ${label}\x1b[0m`);}else{failed++;console.log(`\x1b[31m✗ ${label}\x1b[0m`);}
}
const read=(file:string)=>fs.readFileSync(path.join(process.cwd(),file),"utf8");
const server=read("server.ts"),repo=read("src/db/repository.ts"),types=read("src/types.ts"),courses=read("src/components/Courses.tsx"),plans=read("src/components/CurriculumPlans.tsx"),schedules=read("src/components/Schedules.tsx"),reports=read("src/components/Reports.tsx");

check(types.includes('export type CurriculumPlanStatus = "active" | "transition" | "archived"'),"ثلاث حالات للصحيفة: حالية وانتقالية ومؤرشفة");
check(types.includes('CourseCodeSnapshot?: string')&&types.includes('CourseNameSnapshot?: string'),"هوية المقرر التاريخية محفوظة داخل موعد الجدول");
check(repo.includes('if(!plans.length)return new Set(courses.map(row=>Number(row.AdCourseId)))'),"قبل إنشاء أي صحيفة: كل الكتالوج الحالي فعّال تلقائياً");
check(repo.includes('name:"الصحيفة السابقة"')&&repo.includes('status:"transition"'),"أول صحيفة جديدة تثبّت الكتالوج الحالي كصحيفة انتقالية");
check(repo.includes('status:"active"')&&repo.includes('db.curriculumPlans.push(newPlan)'),"الصحيفة الجديدة تصبح الحالية");
check(repo.includes('attachCourseToActiveCurriculum(newCourse)'),"أي مقرر جديد يُلحق تلقائياً بالصحيفة الحالية");
check(repo.includes('livePlanIds')&&repo.includes('row.status!=="archived"'),"المقرر المؤرشف لا يدخل مجموعة التشغيل");
check(repo.includes('const planIdsByCourse=new Map<number,string[]>()')&&repo.includes('return !planIds.length||planIds.some(planId=>livePlanIds.has(planId))'),"المقرر الموجود في كتالوج القسم بلا عضوية صحيفة لا يختفي، بينما المؤرشف صراحة يبقى مخفياً");
check(repo.includes('where("AdSectionId", "==", String(sid))'),"عضويات الصحائف القديمة تُقرأ سواء خُزّن رقم القسم كرقم أو كنص");
check(repo.includes('schedule.CourseNameSnapshot || schedule.AdCourseName'),"قراءة الجدول التاريخي تفضل الاسم المحفوظ وقت الطرح");

check(server.includes('app.get("/api/curriculum/sections/:sectionId"'),"للصحائف واجهة API إدارية مستقلة");
check(server.includes('app.post("/api/curriculum/plans/:planId/archive"'),"للأدمن إجراء أرشفة على مستوى الصحيفة");
check(server.includes('oldOnlyCourseIds'),"فحص الأرشفة يفرّق المقرر القديم فقط عن المقرر المشترك مع الصحيفة الجديدة");
check(server.includes('curriculumPlanId')&&server.includes('linkedStudentRequests'),"فحص الأرشفة يراعي الطلبة المرتبطين بالصحيفة عندما تكون المعلومة متاحة");
check(server.includes('هذا المقرر مؤرشف أكاديمياً ولا يمكن إضافته إلى جدول جديد'),"الحفظ المباشر للجدول يمنع المقرر المؤرشف");
check(server.includes('code:"archived-curriculum-courses"'),"نسخ فصل قديم لا يعيد المقررات المؤرشفة بصمت");
check(server.includes('async function instructorRequestSectionCourses')&&server.includes('Repository.getCoursesBySection(sectionId)')&&server.includes('Repository.getOperationalCourseIds(sectionId)'),"رابط الأستاذ يعرض كتالوج القسم التشغيلي كاملاً مع إخفاء المؤرشف فقط");
check(server.includes('operationalLinkIds')&&server.includes('surveyCourseIdsForSection'),"استبيان الطالب يطبق فلتر الصحائف على المقررات المتاحة");
check(server.includes('operationalImportIds'),"الاستيراد لا يستطيع تجاوز الأرشفة");
check(server.includes('CourseCodeSnapshot: String(course.CourseCode || "")'),"إنشاء الموعد يحفظ رمز المقرر كما كان يوم إنشائه");
check(server.includes('لا تغيّر رقمه أو اسمه فوق التاريخ'),"تعديل كتالوج مستخدم تاريخياً لا يمحو هوية المقرر القديمة");

check(courses.includes('/api/courses?operational=1'),"شاشة المقررات اليومية تعرض التشغيل فقط");
check(courses.includes('الصحائف الأكاديمية'),"مدخل إدارة الصحائف ظاهر من شاشة المقررات");
check(plans.includes('كل المقررات الحالية فعّالة تلقائياً'),"الوضع الانتقالي الأول موضح للأدمن بصرياً");
check(plans.includes('تبدأ الصحيفة الجديدة فارغة')&&plans.includes('90٪'),"إنشاء الصحيفة الجديدة لا يكرر 90٪ من القديمة");
check(plans.includes('أرشفة الصحيفة'),"إجراء الإغلاق/الأرشفة ظاهر في الإدارة");
check(plans.includes('خريطة الانتقال'),"تغيّر الرقم/الاسم/الاستبدال/الإلغاء موثق بعلاقة صريحة");
check(schedules.includes('operational=1'),"منتقي المقررات في الجدول يطلب المقررات التشغيلية فقط");

check(server.includes('app.get("/api/curriculum/plans/:planId/archive-readiness"'),"الأرشفة تسبقها معاينة جاهزية مستقلة قبل الإغلاق");
check(server.includes('remainsOperational')&&server.includes('آخر صحيفة فعالة'),"إزالة مقرر من الصحيفة لا تخفي طرحاً قائماً بالخطأ");
check(server.includes('existingTransitions.filter')&&server.includes('Repository.deleteCourseTransition(existing.id)'),"إعادة حفظ علاقة الانتقال تعدّل الربط ولا تخلق روابط متضاربة");
check(server.includes('belongsToFrozenCurriculum')&&server.includes('جُمّدت هويته الأكاديمية'),"هوية مقرر الصحيفة الانتقالية تُجمّد حتى لو لم يكن له طرح تاريخي");
check(plans.includes('archive-readiness')&&plans.includes('الصحيفة جاهزة للأرشفة'),"واجهة الأدمن تعرض فحص الجاهزية قبل الأرشفة الفعلية");
check(reports.includes('CourseCodeSnapshot')&&reports.includes('CourseNameSnapshot'),"التقارير تفضّل رمز واسم المقرر المحفوظين تاريخياً");

console.log(`\nCurriculum transition audit: ${passed} passed, ${failed} failed`);
if(failed)process.exit(1);
