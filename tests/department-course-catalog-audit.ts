import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const reviewRoutes = readFileSync(new URL("../src/server/planReviewRoutes.ts", import.meta.url), "utf8");
const referenceView = readFileSync(new URL("../src/components/CurriculumReferenceReview.tsx", import.meta.url), "utf8");
const coursesView = readFileSync(new URL("../src/components/Courses.tsx", import.meta.url), "utf8");
const planReviewView = readFileSync(new URL("../src/components/PlanReview.tsx", import.meta.url), "utf8");
const check = (ok: boolean, label: string) => {
  if (!ok) throw new Error(`✗ ${label}`);
  console.log(`✓ ${label}`);
};

check(/sessionRole\.id !== "departmentHead" \|\| id === ACADEMIC_PERM\.courses/.test(app),
  "رئيس القسم لا يرى في المرجع الأكاديمي إلا شاشة المقررات");
check(/sessionRole\.id === "committeeChair" \|\| sessionRole\.id === "departmentHead"/.test(app)
  && /singleDepartmentOf\(scopes, 0, false\) !== null/.test(app),
  "إتاحة مدخل المقررات لرئيس القسم محصورة بنطاق قسم واحد");
check(/app\.(?:post|put)\("\/api\/courses(?:\/:id)?", requirePermission\(6\)/.test(server)
  && /!isScopeAllowed\(req, collegeId, sectionId\)/.test(server)
  && /!isScopeAllowed\(req, currentCourse\.AdCollegeId, currentCourse\.AdSectionId\)/.test(server),
  "إنشاء وتعديل المقرر يظلان محميين بإذن 6 ونطاق القسم في الخادم");
check(/sectionIdsByCollegeCode\.get\(`\$\{Number\(target\.AdCollegeId\)\}:\$\{course\.code\.slice\(2, 4\)\}`\)/.test(reviewRoutes)
  && /inferred\.length === 1 \? inferred\[0\] : 0/.test(reviewRoutes),
  "تحديد مالك المقرر الناقص يستخدم رمز القسم داخل الكلية ويطلب حسم الالتباس عند التكرار");
check(/course\.ownerSectionId === selectedSectionId/.test(referenceView)
  && /course\.current!\.id/.test(referenceView),
  "تصحيح السجل وبدء الإضافة يظهران للقسم المالك المختار وحده");
check(!/!course\.ownerSectionId \|\|/.test(referenceView) && !referenceView.includes("كل الأقسام")
  && /group\.courses\.filter\(course => course\.ownerSectionId === selectedSectionId\)/.test(referenceView),
  "صحيفة التخرج تحذف ما ليس للقسم المفتوح (لا «كل الأقسام»)، والعدّادات من مقررات القسم وحدها");
check(/collegeName/.test(referenceView) && /body\.sections/.test(referenceView)
  && /deps\.isScopeAllowed\(req, Number\(row\.AdCollegeId\), Number\(row\.AdSectionId\)\)/.test(reviewRoutes),
  "مقارنة كل كلية تبقى محصورة بأقسام المستخدم المصرح بها");
check(/schedule-reference-course-action/.test(coursesView)
  && /setCapacity\(""\)/.test(coursesView),
  "التحويل إلى نموذج المقرر يملأ المصدر ويترك السعة الفعلية للقسم ليحددها");
check(/onSaveCourse=\{values => saveCourseDetails\(sel, values\)\}/.test(planReviewView)
  && /courseId: course\.id, \.\.\.values/.test(planReviewView)
  && /app\.put\("\/api\/plan-review\/course-details"/.test(reviewRoutes)
  && /حفظ بيانات المقرر/.test(planReviewView),
  "النقر على بطاقة الصحيفة يفتح محررها السريع لحفظ الوحدات والساعات والسعة دون مغادرة الشاشة");
check(/تصحيح الوحدات والساعات والسعة مسموحٌ لمالك المقرر حتى في الصحيفة الانتقالية/.test(server)
  && /belongsToFrozenCurriculum&&identityChanged/.test(server),
  "تصحيح بيانات المقرر القديمة مسموح مع استمرار تجميد الرمز والاسم التاريخيين");
