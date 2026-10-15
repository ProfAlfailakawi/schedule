/** Read-only audit of BA-0115 old/new memberships across every Technology Education section. */
import { TECHNOLOGY_EDUCATION_CURRICULA } from "../src/data/technologyEducationCurricula";
import { isTechnologyEducation, referenceCodeKey } from "../src/utils/curriculumReference";

const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
const databaseId = process.env.FIREBASE_DATABASE_ID?.trim();
if (!projectId || !databaseId) throw new Error("حدّد FIREBASE_PROJECT_ID وFIREBASE_DATABASE_ID صراحةً.");
process.env.DATA_MODE = "firestore";

const { initDatabase, Repository } = await import("../src/db/repository");
await initDatabase();
const [sections, colleges, courses] = await Promise.all([Repository.getSections(), Repository.getColleges(), Repository.getCourses()]);
const techSections = sections.filter(section => isTechnologyEducation(section.AdSectionName));
const collegeName = new Map(colleges.map(college => [Number(college.AdCollegeId), String(college.AdCollegeName || "")]));
const references = new Map(TECHNOLOGY_EDUCATION_CURRICULA.map(reference => [reference.id, reference.groups.flatMap(group => group.courses.filter(course => course.code.slice(2, 4) === "09"))]));
const source = techSections.find(section => Number(section.AdSectionId) === 7);
const sourceCapacity = new Map(courses.filter(course => Number(course.AdSectionId) === 7).map(course => [referenceCodeKey(course.CourseCode).slice(-3), Number(course.MaxStudent) > 0 ? Number(course.MaxStudent) : 0]));

const results = [];
for (const section of techSections) {
  const sectionId = Number(section.AdSectionId);
  const ownCourses = courses.filter(course => Number(course.AdSectionId) === sectionId);
  const byCode = new Map<string, typeof ownCourses>();
  for (const course of ownCourses) {
    const key = referenceCodeKey(course.CourseCode).slice(-3);
    byCode.set(key, [...(byCode.get(key) || []), course]);
  }
  const plans = await Repository.getCurriculumPlans(sectionId);
  const links = await Repository.getCurriculumPlanCourses(sectionId);
  const drafts = await Promise.all(plans.map(async plan => {
    const draft = await Repository.getRuleDraft(plan.id);
    return draft ? { planName: plan.name, status: draft.status, rules: draft.rules.length, groups: draft.groups.length, version: draft.version, updatedAt: draft.updatedAt } : null;
  }));
  const planResults = (['old', 'new'] as const).map(kind => {
    const code = kind === "old" ? "BA-0115-2010" : "BA-0115-2026";
    const expected = new Set((references.get(kind) || []).map(row => row.code.slice(-3)));
    const byCode = plans.filter(plan => plan.code === code);
    const candidates = byCode.length ? byCode : plans.filter(plan => plan.status === (kind === "old" ? "transition" : "active"));
    const plan = candidates.length === 1 ? candidates[0] : null;
    const linked = new Set(links.filter(link => link.planId === plan?.id).map(link => referenceCodeKey(ownCourses.find(course => Number(course.AdCourseId) === Number(link.AdCourseId))?.CourseCode || "").slice(-3)).filter(Boolean));
    const missing = [...expected].filter(courseCode => !linked.has(courseCode));
    const extra = [...linked].filter(courseCode => !expected.has(courseCode));
    return { kind, planCount: candidates.length, planName: plan?.name || null, planStatus: plan?.status || null, expected: expected.size, linked: linked.size, missing, extra };
  });
  const expectedCourses = new Set([...references.values()].flat().map(row => row.code.slice(-3)));
  const missingCourses = [...expectedCourses].filter(code => !byCode.has(code));
  const duplicateCourseCodes = [...byCode].filter(([, rows]) => rows.length > 1).map(([code]) => code);
  const fieldMismatches = [...expectedCourses].flatMap(code => {
    const current = byCode.get(code);
    const reference = [...references.values()].flat().find(row => row.code.slice(-3) === code);
    if (!current || current.length !== 1 || !reference) return [];
    return current[0].CourseName !== reference.name || Number(current[0].CourseCredit) !== reference.credit || Number(current[0].CourseHours) !== reference.hours ? [code] : [];
  });
  const capacityCompareCodes = [...expectedCourses];
  const capacityMismatches = sectionId === 7 ? [] : capacityCompareCodes.filter(code => byCode.has(code) && Number(byCode.get(code)?.[0]?.MaxStudent ?? 0) !== Number(sourceCapacity.get(code) ?? 0));
  results.push({
    sectionId, sectionName: section.AdSectionName, college: collegeName.get(Number(section.AdCollegeId)) || "",
    courses: ownCourses.length, missingCourses, duplicateCourseCodes, fieldMismatches,
    existingPlans: plans.map(plan => ({ name: plan.name, code: plan.code || null, status: plan.status })), drafts: drafts.filter(Boolean), plans: planResults,
    capacity: { compared: capacityCompareCodes.length, differentFromSection7: capacityMismatches, sourceHasNoCapacity: expectedCourses.size - [...expectedCourses].filter(code => (sourceCapacity.get(code) || 0) > 0).length },
  });
}

console.log(JSON.stringify({
  mode: "read-only", projectId, databaseId, sourceSection: source ? { sectionId: Number(source.AdSectionId), college: collegeName.get(Number(source.AdCollegeId)) || "" } : null,
  technologyEducationSections: techSections.length,
  sections: results,
  complete: results.every(result => !result.missingCourses.length && !result.duplicateCourseCodes.length && !result.fieldMismatches.length && !result.capacity.differentFromSection7.length && result.plans.every(plan => plan.planCount === 1 && plan.linked === plan.expected && !plan.missing.length && !plan.extra.length)),
  note: "المعاينة للقراءة فقط؛ لا تحفظ مقررات أو عضويات أو قواعد.",
}, null, 2));
