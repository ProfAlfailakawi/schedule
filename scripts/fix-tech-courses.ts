/**
 * مقررات «قسم تكنولوجيا التعليم»: ثلاثة إلى الصحيفة القديمة، ومقررٌ تجريبي يُحذف.
 *
 *   «التصوير الضوئي والإضاءة» 199 · «مبادئ التصوير الضوئي 2» 198 · «ورشة إنتاج مواد تعليمية» 213
 *     ← عضويتها في الصحيفة القديمة (status «transition»)، وتُخرج من الصحيفة الحالية
 *       (status «active») — فأُضيفت إليها تلقائياً عند الإنشاء (attachCourseToActiveCurriculum).
 *     ← واسمها يُطبَّع NFKC إن حُفظ بـ«أشكال العرض» (U+FB50–FDFF، U+FE70–FEFF).
 *   «test» 1111 ← يُحذف مع عضوياته، بعد نسخه إلى deletedRecords كما يفعل الخادم.
 *     يُرفض الحذف إن كان له موعدٌ في أي جدول.
 *
 * الرقم يُطابَق كاملاً أو آخرَ الرمز (الرمز الكامل ٧ أرقام: كلية+قسم+مقرر)، والاسم
 * يُطابَق بعد التطبيع — فلا يُمسّ مقررٌ يوافق الرقم ويخالف الاسم. يعمل على كل
 * قسمٍ بهذا الاسم في كل كلية، ويطبع لكل واحدٍ ما وجد وما سيفعل.
 *
 *   npx tsx scripts/fix-tech-courses.ts                 # معاينة
 *   npx tsx scripts/fix-tech-courses.ts --apply         # تطبيق
 *   (اختياري) --section=ID لقسمٍ واحد · --plan=ID للصحيفة القديمة إن كان في القسم أكثر من واحدة
 */
import { APPLY, argValue, connectFirestore, finish } from "./lib/firestoreScript";
import { arabicMatchKey, hasArabicPresentationForms, normalizeArabicText } from "../src/utils/arabicText";
import type { AdCourse, CurriculumPlan, CurriculumPlanCourse } from "../src/types";

const SECTION_NAME = "قسم تكنولوجيا التعليم";
const TO_OLD_SHEET = [
  { number: "199", name: "التصوير الضوئي والإضاءة" },
  { number: "198", name: "مبادئ التصوير الضوئي 2" },
  { number: "213", name: "ورشة إنتاج مواد تعليمية" },
];
const TO_DELETE = { number: "1111", name: "test" };

const codeMatches = (code: unknown, number: string) => {
  const text = normalizeArabicText(code).replace(/\s+/g, "");
  return text === number || (text.length === 7 && text.endsWith(number.padStart(3, "0")));
};
const nameMatches = (name: unknown, wanted: string) => arabicMatchKey(name) === arabicMatchKey(wanted);

async function main() {
  const db = await connectFirestore();
  let changes = 0;
  const sections = (await db.collection("sections").get()).docs.map(doc => doc.data() as any)
    .filter(row => argValue("section") ? Number(row.AdSectionId) === Number(argValue("section")) : arabicMatchKey(row.AdSectionName) === arabicMatchKey(SECTION_NAME));
  const colleges = new Map((await db.collection("colleges").get()).docs.map(doc => [Number(doc.data().AdCollegeId), String(doc.data().AdCollegeName || "")]));
  if (!sections.length) throw new Error(`لا قسم باسم «${SECTION_NAME}».`);

  for (const section of sections) {
    const sectionId = Number(section.AdSectionId);
    console.log(`\n══ ${section.AdSectionName} (#${sectionId}) · ${colleges.get(Number(section.AdCollegeId)) || section.AdCollegeId}`);
    /* رقم القسم مخزّنٌ رقماً في الأغلب ونصّاً في سجلاتٍ قديمة: يُقرأ الشكلان. */
    const bySection = async <T,>(collection: string): Promise<T[]> => {
      const [asNumber, asText] = await Promise.all([
        db.collection(collection).where("AdSectionId", "==", sectionId).get(),
        db.collection(collection).where("AdSectionId", "==", String(sectionId)).get(),
      ]);
      return [...new Map([...asNumber.docs, ...asText.docs].map(doc => [doc.id, { ...doc.data(), __docId: doc.id } as T])).values()];
    };
    const courses = await bySection<AdCourse & { __docId: string }>("courses");
    const plans = await bySection<CurriculumPlan>("curriculumPlans");
    const memberships = await bySection<CurriculumPlanCourse & { __docId: string }>("curriculumPlanCourses");
    console.log(`  الصحائف: ${plans.map(plan => `${plan.name} [${plan.status}] ${plan.id}`).join(" · ") || "لا صحائف"}`);

    /* ── الثلاثة إلى الصحيفة القديمة ── */
    const found = TO_OLD_SHEET.map(target => ({ target, hits: courses.filter(course => codeMatches(course.CourseCode, target.number) && nameMatches(course.CourseName, target.name)) }));
    for (const { target, hits } of found) {
      if (!hits.length) { console.log(`  — «${target.name}» ${target.number}: غير موجود في هذا القسم`); continue; }
      if (hits.length > 1) { console.log(`  ! «${target.name}» ${target.number}: ${hits.length} مقررات تطابق — تُترك للمراجعة اليدوية`); continue; }
      const course = hits[0];
      const courseId = Number(course.AdCourseId);
      const olds = argValue("plan") ? plans.filter(plan => plan.id === argValue("plan")) : plans.filter(plan => plan.status === "transition");
      if (olds.length !== 1) { console.log(`  ! «${course.CourseName}»: الصحائف القديمة في القسم ${olds.length} (المطلوب واحدة) — مرّر --plan=ID`); continue; }
      const oldPlan = olds[0];
      const active = plans.filter(plan => plan.status === "active").map(plan => plan.id);
      const mine = memberships.filter(row => Number(row.AdCourseId) === courseId);
      console.log(`  • ${course.CourseCode} «${course.CourseName}» (#${courseId}) — في: ${mine.map(row => plans.find(plan => plan.id === row.planId)?.name || row.planId).join("، ") || "لا صحيفة"}`);

      const cleanName = normalizeArabicText(course.CourseName);
      if (cleanName !== course.CourseName) {
        console.log(`    ✎ الاسم يُطبَّع${hasArabicPresentationForms(course.CourseName) ? " (أشكال عرض)" : ""}: «${cleanName}»`);
        changes++;
        if (APPLY) await db.collection("courses").doc(course.__docId).set({ CourseName: cleanName }, { merge: true });
      }
      if (!mine.some(row => row.planId === oldPlan.id)) {
        const row: CurriculumPlanCourse = { id: `${oldPlan.id}_${courseId}`, planId: oldPlan.id, AdCollegeId: Number(course.AdCollegeId), AdSectionId: sectionId, AdCourseId: courseId, createdAt: new Date().toISOString(), createdBy: "fix-tech-courses" };
        console.log(`    + يُضاف إلى «${oldPlan.name}»`);
        changes++;
        if (APPLY) await db.collection("curriculumPlanCourses").doc(row.id).set(row);
      }
      for (const row of mine.filter(item => active.includes(item.planId))) {
        console.log(`    − يُخرج من «${plans.find(plan => plan.id === row.planId)?.name}» (الحالية)`);
        changes++;
        if (APPLY) await db.collection("curriculumPlanCourses").doc(row.__docId).delete();
      }
    }

    /* ── المقرر التجريبي ── */
    const tests = courses.filter(course => codeMatches(course.CourseCode, TO_DELETE.number) && nameMatches(course.CourseName, TO_DELETE.name));
    for (const course of tests) {
      const courseId = Number(course.AdCourseId);
      const scheduled = await db.collection("schedules").where("AdCourseId", "==", courseId).limit(1).get();
      if (!scheduled.empty) { console.log(`  ! «${course.CourseName}» ${course.CourseCode} (#${courseId}) له مواعيد في الجداول — لا يُحذف. احذف مواعيده أولاً.`); continue; }
      const mine = memberships.filter(row => Number(row.AdCourseId) === courseId);
      const claims = (await db.collection("courseCodeClaims").where("AdCourseId", "==", courseId).get()).docs;
      console.log(`  ✗ يُحذف «${course.CourseName}» ${course.CourseCode} (#${courseId}) مع ${mine.length} عضوية و${claims.length} حجز رمز`);
      changes++;
      if (APPLY) {
        const batch = db.batch();
        const { __docId, ...payload } = course;
        batch.set(db.collection("deletedRecords").doc(`courses__${__docId}`), { collection: "courses", docId: __docId, deletedAt: new Date().toISOString(), payload });
        for (const row of mine) batch.delete(db.collection("curriculumPlanCourses").doc(row.__docId));
        for (const claim of claims) batch.delete(claim.ref);
        batch.delete(db.collection("courses").doc(course.__docId));
        await batch.commit();
      }
    }
    if (!tests.length) console.log(`  — «${TO_DELETE.name}» ${TO_DELETE.number}: غير موجود في هذا القسم`);
  }
  if (APPLY && changes) console.log("\nملاحظة: ذاكرة المراجع في الخادم تتجدّد وحدها؛ أعد تحميل الشاشة إن بقي القديم ظاهراً.");
  finish(changes);
}

main().catch(error => { console.error(`\n✗ ${error instanceof Error ? error.message : error}`); process.exit(1); });
