/**
 * Prepare the two Technology Education pilot colleges from the supplied BA-0115
 * references. Dry-run by default; pass --apply only after checking the summary.
 * Capacities are copied only from the girls' Technology Education section (7).
 * Missing baseline capacity stays 0 so the department can fill it in the UI.
 */
import { TECHNOLOGY_EDUCATION_CURRICULA } from "../src/data/technologyEducationCurricula";
import type { AdCourse, CurriculumCourseRule, CurriculumRuleSet, ElectiveGroup } from "../src/types";
import { referenceCodeKey } from "../src/utils/curriculumReference";

const apply = process.argv.includes("--apply");
const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
const databaseId = process.env.FIREBASE_DATABASE_ID?.trim();
if (!projectId || !databaseId) throw new Error("حدّد FIREBASE_PROJECT_ID وFIREBASE_DATABASE_ID صراحةً.");

const { initDatabase, Repository } = await import("../src/db/repository");
await initDatabase();
const [sections, colleges, initialCourses] = await Promise.all([Repository.getSections(), Repository.getColleges(), Repository.getCourses()]);
const sourceSection = sections.find(row => Number(row.AdSectionId) === 7);
const sourceCollege = colleges.find(row => Number(row.AdCollegeId) === Number(sourceSection?.AdCollegeId));
if (!sourceSection || !sourceCollege || !String(sourceCollege.AdCollegeName).includes("بنات")) throw new Error("لم يتم التحقق من قسم تكنولوجيا التعليم في كلية التربية الأساسية بنات (القسم 7).");
const targets = [
  { id: 54, expectedCollege: "كلية التربية الأساسية - بنات - الجهراء" },
  { id: 131, expectedCollege: "كلية التربية الأساسية - بنات - الفحيحيل" },
].map(item => {
  const section = sections.find(row => Number(row.AdSectionId) === item.id);
  const college = colleges.find(row => Number(row.AdCollegeId) === Number(section?.AdCollegeId));
  if (!section || !college || college.AdCollegeName !== item.expectedCollege || referenceCodeKey(section.AdSectionCode) !== "09") {
    throw new Error(`لم يطابق القسم ${item.id} كلية/رمز تكنولوجيا التعليم المتوقع.`);
  }
  return { section, college };
});

const sourceRows = TECHNOLOGY_EDUCATION_CURRICULA.map(reference => ({ reference, rows: reference.groups.flatMap(group => group.courses.map(course => ({ ...course, groupId: group.id, groupName: group.name, elective: group.elective }))).filter(course => course.code.slice(2, 4) === "09") }));
const merged = new Map<string, (typeof sourceRows)[number]["rows"][number]>();
for (const { rows } of sourceRows) for (const row of rows) {
  const prior = merged.get(row.code);
  if (prior && (prior.name !== row.name || prior.credit !== row.credit || prior.hours !== row.hours)) throw new Error(`تعارض بين الصحيفتين للمقرر ${row.code}.`);
  merged.set(row.code, row);
}
const codeLocal = (code: string) => code.slice(-3);
const sourceCapacity = new Map<string, number>();
for (const course of initialCourses.filter(row => Number(row.AdSectionId) === Number(sourceSection.AdSectionId))) {
  const key = referenceCodeKey(course.CourseCode);
  if (sourceCapacity.has(key)) throw new Error(`تكرر رمز مقرر مرجعي في القسم 7: ${key}`);
  sourceCapacity.set(key, Number(course.MaxStudent) > 0 ? Number(course.MaxStudent) : 0);
}

for (const { section } of targets) {
  const rows = [...merged.values()];
  const current = initialCourses.filter(course => Number(course.AdSectionId) === Number(section.AdSectionId));
  const existingByCode = new Map(current.map(course => [referenceCodeKey(course.CourseCode), course]));
  const existingPlans = await Repository.getCurriculumPlans(Number(section.AdSectionId));
  const active = existingPlans.find(plan => plan.code === "BA-0115-2026");
  const transition = existingPlans.find(plan => plan.code === "BA-0115-2010") || (active ? existingPlans.find(plan => plan.status === "transition") : undefined);
  if (existingPlans.length && !(active && transition)) throw new Error(`القسم ${section.AdSectionId} لديه صحائف قائمة خارج هيكل التجهيز المتوقع؛ لم تُجرَ أي كتابة.`);
  if (active && transition && (active.status !== "active" || transition.status !== "transition")) throw new Error(`حالة صحائف القسم ${section.AdSectionId} لا تطابق المسودة التجريبية.`);
  const newRows = rows.filter(row => !existingByCode.has(codeLocal(row.code))).length;
  const capacityCopies = rows.filter(row => (sourceCapacity.get(codeLocal(row.code)) || 0) > 0).length;
  const capacityMissing = rows.length - capacityCopies;
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run", projectId, databaseId, sectionId: section.AdSectionId,
    college: targets.find(target => target.section.AdSectionId === section.AdSectionId)?.college.AdCollegeName,
    oldPlan: "الصحيفة السابقة 2010/2011", newPlan: "صحيفة BA-0115 2026/2027",
    existingTechCourses: current.length, uniqueReferenceTechCourses: rows.length, recordsToAdd: newRows,
    capacitySource: `${sourceCollege.AdCollegeName} · ${sourceSection.AdSectionName}`,
    capacityAvailable: capacityCopies, capacityUnspecified: capacityMissing,
    status: active ? "already prepared" : "not yet prepared",
  }));
}
if (!apply) {
  console.log("معاينة فقط؛ لم تُكتب أي بيانات. شغّل مع --apply لتنفيذ تجهيز النموذج.");
  process.exit(0);
}

const actor = "إعداد نموذج تكنولوجيا التعليم بناءً على الصحيفتين المعتمدتين";
for (const { section, college } of targets) {
  let allCourses = await Repository.getCourses();
  let owned = allCourses.filter(course => Number(course.AdSectionId) === Number(section.AdSectionId));
  const plansNow = await Repository.getCurriculumPlans(Number(section.AdSectionId));
  const hasPreparedPlans = plansNow.some(plan => plan.code === "BA-0115-2026") && plansNow.some(plan => plan.code === "BA-0115-2010");
  if (!hasPreparedPlans) {
    const oldRows = sourceRows.find(row => row.reference.id === "old")!.rows;
    for (const source of oldRows) {
      const local = codeLocal(source.code), capacity = sourceCapacity.get(local) || 0;
      const current = owned.find(course => referenceCodeKey(course.CourseCode) === local);
      if (current) {
        const nextCapacity = capacity || (Number(current.MaxStudent) > 0 ? Number(current.MaxStudent) : 0);
        if (current.CourseName !== source.name || Number(current.CourseCredit) !== source.credit || Number(current.CourseHours) !== source.hours || Number(current.MaxStudent) !== nextCapacity) {
          await Repository.updateCourse(Number(current.AdCourseId), Number(college.AdCollegeId), Number(section.AdSectionId), String(current.CourseCode), source.name, source.credit, source.hours, nextCapacity);
        }
      } else {
        const course = await Repository.createCourse(Number(college.AdCollegeId), Number(section.AdSectionId), local, source.name, source.credit, source.hours, capacity);
        owned.push(course);
      }
    }
    await Repository.createCurriculumPlan({ collegeId: Number(college.AdCollegeId), sectionId: Number(section.AdSectionId), name: "صحيفة BA-0115 2026/2027", code: "BA-0115-2026", by: actor });
    const oldPlan = (await Repository.getCurriculumPlans(Number(section.AdSectionId))).find(row => row.status === "transition");
    if (!oldPlan) throw new Error(`تعذر إنشاء صحيفة انتقالية للقسم ${section.AdSectionId}.`);
    const oldMembership = await Repository.getCurriculumPlanCourses(Number(section.AdSectionId));
    const currentCourses = await Repository.getCourses();
    for (const source of oldRows) {
      const course = currentCourses.find(item => Number(item.AdSectionId) === Number(section.AdSectionId) && referenceCodeKey(item.CourseCode) === codeLocal(source.code));
      if (!course) throw new Error(`تعذر مطابقة المقرر ${source.code} للقسم ${section.AdSectionId}.`);
      if (!oldMembership.some(link => link.planId === oldPlan.id && Number(link.AdCourseId) === Number(course.AdCourseId))) {
        await Repository.addCourseToCurriculumPlan(oldPlan.id, course, actor);
      }
    }
  }

  let all = await Repository.getCourses();
  let planList = await Repository.getCurriculumPlans(Number(section.AdSectionId));
  const activePlan = planList.find(plan => plan.code === "BA-0115-2026");
  const oldPlan = planList.find(plan => plan.code === "BA-0115-2010") || planList.find(plan => plan.status === "transition");
  if (!activePlan || !oldPlan) throw new Error(`تعذر العثور على نسختي الصحيفة للقسم ${section.AdSectionId}.`);

  for (const source of sourceRows.find(row => row.reference.id === "new")!.rows) {
    const local = codeLocal(source.code), capacity = sourceCapacity.get(local) || 0;
    let current = all.find(course => Number(course.AdSectionId) === Number(section.AdSectionId) && referenceCodeKey(course.CourseCode) === local);
    if (!current) {
      current = await Repository.createCourse(Number(college.AdCollegeId), Number(section.AdSectionId), local, source.name, source.credit, source.hours, capacity);
      all = [...all, current];
    } else {
      const nextCapacity = capacity || (Number(current.MaxStudent) > 0 ? Number(current.MaxStudent) : 0);
      if (current.CourseName !== source.name || Number(current.CourseCredit) !== source.credit || Number(current.CourseHours) !== source.hours || Number(current.MaxStudent) !== nextCapacity) {
        current = await Repository.updateCourse(Number(current.AdCourseId), Number(college.AdCollegeId), Number(section.AdSectionId), String(current.CourseCode), source.name, source.credit, source.hours, nextCapacity);
        all = all.map(course => Number(course.AdCourseId) === Number(current!.AdCourseId) ? current! : course);
      }
    }
    await Repository.addCourseToCurriculumPlan(activePlan.id, current, actor);
  }

  all = await Repository.getCourses();
  const buildRuleDraft = (referenceId: "old" | "new", planId: string): CurriculumRuleSet => {
    const reference = TECHNOLOGY_EDUCATION_CURRICULA.find(row => row.id === referenceId)!;
    const sourceCourses = sourceRows.find(row => row.reference.id === referenceId)!.rows;
    const courseBySourceCode = new Map(sourceCourses.map(source => [source.code, all.find(course => Number(course.AdSectionId) === Number(section.AdSectionId) && referenceCodeKey(course.CourseCode) === codeLocal(source.code))]).filter((entry): entry is [string, AdCourse] => Boolean(entry[1])));
    const electiveSourceGroups = reference.groups.filter(group => group.elective && group.courses.length && group.courses.every(course => course.code.slice(2, 4) === "09"));
    const groups: ElectiveGroup[] = electiveSourceGroups.map(group => ({
      id: group.id, name: group.name, minCourses: Math.max(1, Math.floor(group.requiredUnits / 3)), minUnits: group.requiredUnits,
      courseIds: group.courses.map(course => courseBySourceCode.get(course.code)?.AdCourseId).filter((id): id is number => Number.isFinite(Number(id))),
    }));
    const rules: CurriculumCourseRule[] = sourceCourses.map(source => {
      const course = courseBySourceCode.get(source.code)!;
      const prereqIds = source.prerequisites.map(code => courseBySourceCode.get(code)?.AdCourseId).filter((id): id is number => Number.isFinite(Number(id)));
      const electiveGroup = electiveSourceGroups.find(group => group.id === source.groupId);
      return { courseId: Number(course.AdCourseId), kind: source.elective ? "elective" : "compulsory", ...(electiveGroup ? { groupId: electiveGroup.id } : {}), ...(prereqIds.length ? { prereq: { all: [...new Set(prereqIds)], anyOf: [] } } : {}) };
    });
    return { id: planId, planId, AdCollegeId: Number(college.AdCollegeId), AdSectionId: Number(section.AdSectionId), rules, groups, version: 0, status: "review", basedOnVersion: 0, updatedAt: new Date().toISOString(), updatedBy: actor };
  };
  await Repository.updateRuleDraft(oldPlan.id, () => buildRuleDraft("old", oldPlan.id));
  await Repository.updateRuleDraft(activePlan.id, () => buildRuleDraft("new", activePlan.id));

  planList = await Repository.getCurriculumPlans(Number(section.AdSectionId));
  const newMembership = await Repository.getCurriculumPlanCourses(Number(section.AdSectionId));
  const expectedNew = sourceRows.find(row => row.reference.id === "new")!.rows.length;
  const actualNew = new Set(newMembership.filter(link => link.planId === activePlan.id).map(link => Number(link.AdCourseId))).size;
  if (actualNew !== expectedNew || !planList.some(plan => plan.id === oldPlan.id && plan.status === "transition")) throw new Error(`التحقق النهائي أخفق للقسم ${section.AdSectionId}: عضوية الجديدة ${actualNew}/${expectedNew}.`);
  console.log(JSON.stringify({ applied: true, sectionId: section.AdSectionId, college: college.AdCollegeName, oldPlanId: oldPlan.id, oldStatus: oldPlan.status, newPlanId: activePlan.id, newStatus: activePlan.status, newTechCourses: actualNew, oldSheetReferenceCourses: sourceRows.find(row => row.reference.id === "old")!.rows.length, ruleDraftsPendingReview: 2, capacityUnspecified: merged.size - [...merged.keys()].filter(code => (sourceCapacity.get(codeLocal(code)) || 0) > 0).length }));
}
