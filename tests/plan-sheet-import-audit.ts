/**
 * رفع «الخطة الدراسية» لقسمٍ واحد على الصحيفة الحقيقية: لا يُقبل إلا كشفُ الكلية والقسم المختارين،
 * مقررات القسم وحدها (رقم المقرر بثلاث خانات)، والأسماء تُصحَّح، والمرجع المبنيّ يغذّي القواعد.
 */
import fs from "fs";
import { extractPlanItems } from "../src/server/planPdfExtract";
import { parsePlanItems, type ParsedPlan } from "../src/utils/planPdfParser";
import { correctCourseName } from "../src/utils/courseNameCorrection";
import { buildReferenceRules } from "../src/utils/referenceApply";
import { checkSheetScope, correctedNames, departmentNameNote, dominantDepartment, ownCourses, sheetToReference, storedCode } from "../src/utils/planSheetImport";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const load = async (name: string): Promise<ParsedPlan> => parsePlanItems(await extractPlanItems(fs.readFileSync(`tests/fixtures/plans/${name}.pdf`)));

(async () => {
  const plan = await load("tech-edu-2026");
  const scope = { collegeName: "كلية التربية الأساسية - بنات", sectionName: "تكنولوجيا التعليم", departmentKey: "0109" };

  /* ── الأسماء ── */
  check(correctCourseName("التوجيه والإرشاد").name === "التوجيه والإرشاد", "«التوجيه» لا تُغيَّر");
  for (const keep of ["تجويد القرآن الكريم وحفظه (2)", "تأثيث المنزل وأجهزته", "نظم القوى الكهربائية", "المستوى الأول", "فقه العبادات في الإسلام", "الله"]) {
    check(correctCourseName(keep).name === keep, `كلمةٌ صحيحة لا تُمسّ: ${keep}`);
  }
  check(correctCourseName("مقدمه فى الحاسوب").name === "مقدمة في الحاسوب" && correctCourseName("أوعيه المعلومات").name === "أوعية المعلومات", "الأخطاء المعروفة تُصحَّح من القاموس");
  check(correctCourseName("الذكاء الإصطناعي في التعليم").name === "الذكاء الاصطناعي في التعليم" && correctCourseName("نظرية الدوائرالكهربائية").name === "نظرية الدوائر الكهربائية", "همزة زائدة وكلمتان ملتصقتان");
  check(correctCourseName("لغة انجليزية (1)").name === "لغة إنجليزية (1)", "همزة «إنجليزية»");
  check(correctCourseName("المستوى الاول").name === "المستوى الأول", "همزة «الأول»");
  for (const raw of ["لغة انجليزية(1)", "تدريب ميداني", "اسس التربية"]) {
    const once = correctCourseName(raw).name;
    check(correctCourseName(once).name === once && correctCourseName(once).rules.length === 0, `تصحيح الاسم لا يتكرر: ${once}`);
  }

  /* ── القبول ── */
  check(dominantDepartment(plan) === "09", "قسم الصحيفة الغالب 09");
  check(checkSheetScope(plan, scope) === null, "الصحيفة تُقبل لقسمها وكليتها");
  const own = ownCourses(plan, "0109");
  check(own.length === 27, `مقررات القسم وحدها: ${own.length} من ${plan.courses.length}`);
  check(own.every(course => /^\d{2,3}$/.test(storedCode(course)) && course.dept === "09" && course.college === "01"), "المحفوظ رقم المقرر وحده (105 لا 0109105)");
  check(own.some(course => storedCode(course) === "105"), "المقرر 105 موجود");

  /* ── الرفض ── */
  const other = checkSheetScope(plan, { ...scope, sectionName: "أصول التربية", departmentKey: "0101" });
  check(other?.kind === "department" && other.mismatch?.fields.includes("department") === true, "قسمٌ آخر يُرفض");
  const college = checkSheetScope(plan, { ...scope, collegeName: "كلية العلوم الإدارية", departmentKey: "0209" });
  check(college?.kind === "college" && college.mismatch?.fields.includes("college") === true, "كليةٌ أخرى تُرفض");
  const noCode = checkSheetScope(plan, { ...scope, departmentKey: "" });
  check(noCode?.kind === "noCode", "قسمٌ بلا رمز هيئة لا يُتحقَّق منه فيُرفض");
  check(checkSheetScope(plan, { ...scope, sectionName: "قسم الوسائل التعليمية" }) === null, "تسمية مختلفة والرمزان يطابقان: تُقبل");
  check(departmentNameNote(plan, { sectionName: "قسم الوسائل التعليمية" }).includes("طابق الرمز") && departmentNameNote(plan, scope) === "", "ملاحظة التسمية تظهر عند الاختلاف فقط");
  const wrongCode = checkSheetScope(plan, { ...scope, departmentKey: "0120" });
  check(wrongCode?.kind === "departmentCode", "اسم القسم يطابق ورمزه لا يطابق: يُرفض");
  check(checkSheetScope({ ...plan, courses: [] }, scope)?.kind === "unreadable", "ملفٌ بلا مقررات مقروءة يُرفض");
  check(checkSheetScope({ ...plan, warnings: ["سطرٌ لم يُفهم: «x»"] }, scope)?.kind === "unverified", "سطرٌ لم يُفهم: لا تُكتب");
  check(checkSheetScope({ ...plan, warnings: ["مقرر 0109105: لم تُقرأ الوحدات"] }, scope)?.kind === "unverified", "وحداتٌ مفقودة: لا تُكتب");
  check(checkSheetScope({ ...plan, warnings: ["قسم «مقررات مهنية»: مجموع مجموعاته 35 والمطبوع 36"] }, scope) === null, "مجموعٌ مطبوع لا يطابق: تُقبل وتُذكر ملاحظة");
  check(checkSheetScope({ ...plan, warnings: ["متطلب 0101102 في 0109105 ليس في الخطة"] }, scope) === null, "تحذير المتطلب الخارجي لا يمنع");

  /* ── المرجع والقواعد ── */
  const { names, fixes } = correctedNames(own);
  const { reference } = sheetToReference(plan, own, names);
  const refCourses = reference.groups.flatMap(group => group.courses);
  check(refCourses.length === own.length, `المرجع يضمّ مقررات القسم وحدها (${refCourses.length})`);
  check(refCourses.every(course => course.code.startsWith("0109")), "كل رموز المرجع 0109xxx");
  const ids = new Map(refCourses.map((course, i) => [course.code, i + 1] as const));
  const built = buildReferenceRules(reference, ids, ids, new Set());
  check(built.rules.length === own.length, "قاعدةٌ لكل مقرر");
  console.log(`  تصحيحات الأسماء: ${fixes.length}`);
  for (const fix of fixes.slice(0, 5)) console.log(`   ${fix.code}: ${fix.before} ← ${fix.after}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
