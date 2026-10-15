/** Prepare section 7 (Technology Education, Basic Education - Girls) from BA-0115 PDFs.
 * Read-only by default. --apply corrects only section-owned course data and prepares
 * curriculum memberships/rules as review drafts; it never approves the academic rules.
 */
import { TECHNOLOGY_EDUCATION_CURRICULA, type CurriculumReferenceCourse } from "../src/data/technologyEducationCurricula";
import { referenceCodeKey } from "../src/utils/curriculumReference";
import type { AdCourse, CurriculumCourseRule, CurriculumPlan, CurriculumPlanCourse, CurriculumRuleSet, ElectiveGroup } from "../src/types";

const apply = process.argv.includes("--apply");
const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
const databaseId = process.env.FIREBASE_DATABASE_ID?.trim();
if (!projectId || !databaseId) throw new Error("حدّد FIREBASE_PROJECT_ID وFIREBASE_DATABASE_ID صراحةً.");
process.env.DATA_MODE = "firestore";

const { initDatabase, Repository } = await import("../src/db/repository");
await initDatabase();
const sectionId = 7;
const [sections, colleges] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
const section = sections.find(row => Number(row.AdSectionId) === sectionId);
const college = colleges.find(row => Number(row.AdCollegeId) === Number(section?.AdCollegeId));
if (!section || !college || !String(college.AdCollegeName).includes("بنات") || !String(section.AdSectionName).includes("تكنولوجيا التعليم")) {
  throw new Error("القسم 7 ليس تكنولوجيا التعليم في كلية التربية الأساسية بنات؛ لم تُجرَ أي كتابة.");
}
const plans = await Repository.getCurriculumPlans(sectionId);
const oldPlan = plans.find(plan => plan.status === "transition");
const newPlan = plans.find(plan => plan.status === "active");
if (!oldPlan || !newPlan || plans.filter(plan => plan.status === "transition").length !== 1 || plans.filter(plan => plan.status === "active").length !== 1) {
  throw new Error("يجب حسم وجود صحيفة قديمة واحدة وصحيفة جديدة واحدة قبل التعديل.");
}
const refs = TECHNOLOGY_EDUCATION_CURRICULA;
type SourceCourse = CurriculumReferenceCourse & { groupId: string; elective: boolean };
const sourceRows = new Map(refs.map(ref => [ref.id, ref.groups.flatMap(group => group.courses
  .filter(course => course.code.slice(2, 4) === "09")
  .map(course => ({ ...course, groupId: group.id, elective: group.elective } as SourceCourse)))] as const));
const merged = new Map<string, SourceCourse>();
for (const rows of sourceRows.values()) for (const row of rows) {
  const key = row.code.slice(-3);
  const existing = merged.get(key);
  if (existing && (existing.name !== row.name || existing.credit !== row.credit || existing.hours !== row.hours)) throw new Error(`الصحيفتان تختلفان في ${row.code}.`);
  merged.set(key, row);
}
const courses = await Repository.getCoursesBySection(sectionId);
const courseById = new Map(courses.map(course => [Number(course.AdCourseId), course]));
const existingDrafts = await Promise.all([oldPlan, newPlan].map(plan => Repository.getRuleDraft(plan.id)));
const byCode = new Map<string, AdCourse>();
for (const course of courses) {
  const key = referenceCodeKey(course.CourseCode).slice(-3);
  if (byCode.has(key)) throw new Error(`تكرر رمز مقرر في القسم 7: ${key}`);
  byCode.set(key, course);
}
const memberships = await Repository.getCurriculumPlanCourses(sectionId);
const membershipStats = (plan: CurriculumPlan, sourceId: "old" | "new") => {
  const expected = new Set((sourceRows.get(sourceId) || []).map(row => row.code.slice(-3)));
  const actual = new Set(memberships.filter(row => row.planId === plan.id).map(row => referenceCodeKey(courseById.get(Number(row.AdCourseId))?.CourseCode || "").slice(-3)));
  return { expected: expected.size, actual: actual.size, missing: [...expected].filter(code => !actual.has(code)), extra: [...actual].filter(code => code && !expected.has(code)) };
};
const oldMembership = membershipStats(oldPlan, "old");
const newMembership = membershipStats(newPlan, "new");
const missingCourses = [...merged.keys()].filter(code => !byCode.has(code));
const mismatchedCourses = [...merged.entries()].flatMap(([code, source]) => {
  const current = byCode.get(code);
  return current && (current.CourseName !== source.name || Number(current.CourseCredit) !== source.credit || Number(current.CourseHours) !== source.hours)
    ? [{ code, oldName: current.CourseName, name: source.name, oldCredit: current.CourseCredit, credit: source.credit, oldHours: current.CourseHours, hours: source.hours }] : [];
});
console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run", projectId, databaseId, section: section.AdSectionName, college: college.AdCollegeName,
  catalogueCourses: courses.length, referenceCourses: merged.size, missingCourses: missingCourses.length,
  missingCourseCodes: missingCourses, catalogueCourseCodes: courses.map(course => course.CourseCode),
  mismatchedCourses: mismatchedCourses.length, oldMembership, newMembership,
  activeExtraCoursesRemainInCatalogue: newMembership.extra,
  unresolvedPrerequisites: refs.flatMap(ref => (sourceRows.get(ref.id) || []).flatMap(row => row.prerequisites
    .filter(code => code.slice(2, 4) === "09" && !merged.has(code.slice(-3))).map(code => ({ plan: ref.id, course: row.code, prerequisite: code })))),
  preexistingRuleDrafts: existingDrafts.map((draft, index) => draft ? (index === 0 ? oldPlan.name : newPlan.name) : null).filter(Boolean),
}, null, 2));
if (!apply) { console.log("معاينة فقط؛ لم تُكتب أي بيانات."); process.exit(0); }
if (existingDrafts.some(Boolean)) throw new Error("توجد مسودة قواعد قائمة؛ لم تُجرَ أي كتابة كي لا تُستبدل مراجعة سابقة.");

const actor = "مطابقة تكنولوجيا التعليم مع صحيفتي BA-0115 المرفقتين";
let allCourses = [...courses];
for (const [code, source] of merged) {
  let current = byCode.get(code);
  if (!current) {
    current = await Repository.createCourse(Number(college.AdCollegeId), sectionId, code, source.name, source.credit, source.hours, 0);
    byCode.set(code, current); allCourses.push(current);
  } else if (current.CourseName !== source.name || Number(current.CourseCredit) !== source.credit || Number(current.CourseHours) !== source.hours) {
    current = await Repository.updateCourse(Number(current.AdCourseId), Number(college.AdCollegeId), sectionId,
      String(current.CourseCode), source.name, source.credit, source.hours, Number(current.MaxStudent) > 0 ? Number(current.MaxStudent) : 0);
    byCode.set(code, current); allCourses = allCourses.map(row => Number(row.AdCourseId) === Number(current!.AdCourseId) ? current! : row);
  }
}

for (const [refId, plan] of [["old", oldPlan], ["new", newPlan]] as const) {
  const expectedRows = sourceRows.get(refId) || [];
  const expectedIds = new Set(expectedRows.map(row => Number(byCode.get(row.code.slice(-3))?.AdCourseId)).filter(Number.isFinite));
  let currentLinks = await Repository.getCurriculumPlanCourses(sectionId);
  for (const row of expectedRows) {
    const course = byCode.get(row.code.slice(-3));
    if (!course) throw new Error(`تعذر حفظ ${row.code} في الصحيفة ${refId}.`);
    if (!currentLinks.some(link => link.planId === plan.id && Number(link.AdCourseId) === Number(course.AdCourseId))) {
      await Repository.addCourseToCurriculumPlan(plan.id, course, actor);
      currentLinks = [...currentLinks, { id: `${plan.id}_${course.AdCourseId}`, planId: plan.id, AdCollegeId: Number(college.AdCollegeId), AdSectionId: sectionId, AdCourseId: Number(course.AdCourseId), createdAt: new Date().toISOString(), createdBy: actor } as CurriculumPlanCourse];
    }
  }
  for (const link of currentLinks.filter(item => item.planId === plan.id && !expectedIds.has(Number(item.AdCourseId)))) {
    await Repository.removeCourseFromCurriculumPlan(plan.id, Number(link.AdCourseId));
  }

  const ref = refs.find(item => item.id === refId)!;
  const refRows = expectedRows;
  const coursesBySource = new Map(refRows.map(source => [source.code, byCode.get(source.code.slice(-3))!]).filter((entry): entry is [string, AdCourse] => Boolean(entry[1])));
  const collegeCourseRows = (await Repository.getCourses()).filter(course => Number(course.AdCollegeId) === Number(college.AdCollegeId));
  const resolvePrerequisite = (code: string): number | undefined => {
    const own = coursesBySource.get(code);
    if (own) return Number(own.AdCourseId);
    const matches = collegeCourseRows.filter(course => referenceCodeKey(course.CourseCode) === code || referenceCodeKey(course.CourseCode).slice(-3) === code.slice(-3));
    return matches.length === 1 ? Number(matches[0].AdCourseId) : undefined;
  };
  const electiveGroups = ref.groups.filter(group => group.elective && group.courses.length > 0 && group.courses.every(course => course.code.slice(2, 4) === "09"));
  const groups: ElectiveGroup[] = electiveGroups.map(group => ({
    id: group.id, name: group.name, minCourses: Math.max(1, Math.ceil(group.requiredUnits / 3)), minUnits: group.requiredUnits,
    courseIds: group.courses.map(course => coursesBySource.get(course.code)?.AdCourseId).filter((id): id is number => Number.isFinite(Number(id))),
  }));
  const rules: CurriculumCourseRule[] = refRows.map(source => {
    const course = coursesBySource.get(source.code)!;
    const prereq: number[] = source.prerequisites.map(resolvePrerequisite).filter((id): id is number => Number.isFinite(id));
    const electiveGroup = electiveGroups.find(group => group.id === source.groupId);
    return { courseId: Number(course.AdCourseId), kind: source.elective ? "elective" : "compulsory", ...(electiveGroup ? { groupId: electiveGroup.id } : {}), ...(prereq.length ? { prereq: { all: [...new Set(prereq)], anyOf: [] } } : {}) };
  });
  const draft: CurriculumRuleSet = { id: plan.id, planId: plan.id, AdCollegeId: Number(college.AdCollegeId), AdSectionId: sectionId,
    rules, groups, version: 0, status: "review", basedOnVersion: 0, updatedAt: new Date().toISOString(), updatedBy: actor };
  await Repository.updateRuleDraft(plan.id, existing => {
    if (existing) throw new Error(`توجد مسودة قواعد سابقة للصحيفة ${plan.name}؛ لم تُستبدل.`);
    return draft;
  });
}

const [finalCourses, finalLinks, finalPlans, finalOldDraft, finalNewDraft] = await Promise.all([
  Repository.getCoursesBySection(sectionId), Repository.getCurriculumPlanCourses(sectionId), Repository.getCurriculumPlans(sectionId),
  Repository.getRuleDraft(oldPlan.id), Repository.getRuleDraft(newPlan.id),
]);
const verify = (plan: CurriculumPlan, expected: number) => new Set(finalLinks.filter(row => row.planId === plan.id).map(row => Number(row.AdCourseId))).size === expected;
if (!verify(oldPlan, (sourceRows.get("old") || []).length) || !verify(newPlan, (sourceRows.get("new") || []).length)
  || finalOldDraft?.rules.length !== (sourceRows.get("old") || []).length || finalNewDraft?.rules.length !== (sourceRows.get("new") || []).length) {
  throw new Error("فشل التحقق النهائي من عضويات الصحائف أو مسودات القواعد.");
}
await Repository.createAuditLog({ SystemUserId: 0, userName: "SCHEDULE curriculum repair", method: "SCRIPT",
  path: "scripts/repair-tech-education-home-section.ts", action: "مطابقة الصحيفتين لقسم تكنولوجيا التعليم",
  entity: "curriculumPlans", entityId: `${oldPlan.id},${newPlan.id}`,
  changes: `القسم ${sectionId}: ${merged.size} مقرراً مرجعياً؛ القديمة ${oldMembership.expected} مقرراً؛ الجديدة ${newMembership.expected} مقرراً؛ مسودتا قواعد بانتظار المراجعة والاعتماد`, status: 200 });
console.log(JSON.stringify({ applied: true, sectionId, plans: finalPlans.map(plan => ({ name: plan.name, status: plan.status })),
  courses: finalCourses.length, oldPlanCourses: finalLinks.filter(row => row.planId === oldPlan.id).length,
  newPlanCourses: finalLinks.filter(row => row.planId === newPlan.id).length,
  oldRuleDraft: { status: finalOldDraft?.status, rules: finalOldDraft?.rules.length },
  newRuleDraft: { status: finalNewDraft?.status, rules: finalNewDraft?.rules.length },
  note: "السعات القائمة محفوظة؛ سعة المقررات الجديدة 0 حتى يحددها القسم. لا اعتماد تلقائي." }, null, 2));
