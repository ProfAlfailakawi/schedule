import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const reviewRoutes = readFileSync(new URL("../src/server/planReviewRoutes.ts", import.meta.url), "utf8");
const referenceView = readFileSync(new URL("../src/components/CurriculumReferenceReview.tsx", import.meta.url), "utf8");
const coursesView = readFileSync(new URL("../src/components/Courses.tsx", import.meta.url), "utf8");
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
check(/sectionIdsByCode\.get\(course\.code\.slice\(2, 4\)\)/.test(reviewRoutes)
  && /inferred\.length === 1 \? inferred\[0\] : 0/.test(reviewRoutes),
  "تحديد القسم المالك للمقرر الناقص لا يعتمد تشابه الأسماء ويطلب حسم الالتباس");
check(/course\.ownerSectionId === sectionId/.test(referenceView)
  && /course\.current!\.id/.test(referenceView),
  "تصحيح السجل وبدء الإضافة يظهران للقسم المالك وحده");
check(/schedule-reference-course-action/.test(coursesView)
  && /setCapacity\(""\)/.test(coursesView),
  "التحويل إلى نموذج المقرر يملأ المصدر ويترك السعة الفعلية للقسم ليحددها");
