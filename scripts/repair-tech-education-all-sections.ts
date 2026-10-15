/**
 * Aligns every Technology Education section to the two supplied BA-0115 sheets.
 * Girls' Basic Education (section 7) is the exact seat-capacity source.
 * Dry-run by default; --apply performs only section-scoped catalog/membership
 * repairs and copies missing rule drafts from the verified source, still in review.
 */
import { TECHNOLOGY_EDUCATION_CURRICULA } from "../src/data/technologyEducationCurricula";
import type { AdCourse, CurriculumPlan, CurriculumRuleSet } from "../src/types";
import { isTechnologyEducation, referenceCodeKey } from "../src/utils/curriculumReference";

const apply = process.argv.includes("--apply");
const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
const databaseId = process.env.FIREBASE_DATABASE_ID?.trim();
if (!projectId || !databaseId) throw new Error("حدّد FIREBASE_PROJECT_ID وFIREBASE_DATABASE_ID صراحةً.");
process.env.DATA_MODE = "firestore";

const { initDatabase, Repository } = await import("../src/db/repository");
await initDatabase();
const [sections, colleges, allInitialCourses] = await Promise.all([Repository.getSections(), Repository.getColleges(), Repository.getCourses()]);
const technologySections = sections.filter(row => isTechnologyEducation(row.AdSectionName));
const source = technologySections.find(row => Number(row.AdSectionId) === 7);
const sourceCollege = colleges.find(row => Number(row.AdCollegeId) === Number(source?.AdCollegeId));
if (!source || !sourceCollege || !String(sourceCollege.AdCollegeName).includes("بنات")) throw new Error("لم يتم التحقق من قسم البنات رقم 7 كمصدر للسعة.");
if (technologySections.length !== 4) throw new Error(`عدد أقسام تكنولوجيا التعليم ${technologySections.length}؛ المتوقع 4. أُوقف التنفيذ قبل الكتابة.`);

type RefRow = { code: string; name: string; credit: number; hours: number; prerequisites: string[]; groupId: string; groupName: string; elective: boolean };
const referenceByKind = new Map(TECHNOLOGY_EDUCATION_CURRICULA.map(ref => [ref.id, {
  reference: ref,
  rows: ref.groups.flatMap(group => group.courses.filter(row => row.code.slice(2, 4) === "09")
    .map(row => ({ ...row, groupId: group.id, groupName: group.name, elective: group.elective }))),
}] as const));
const merged = new Map<string, RefRow>();
for (const entry of referenceByKind.values()) for (const row of entry.rows) {
  const key = row.code.slice(-3), prior = merged.get(key);
  if (prior && (prior.name !== row.name || prior.credit !== row.credit || prior.hours !== row.hours)) throw new Error(`الصحيفتان تختلفان في ${row.code}.`);
  merged.set(key, row);
}
const sourceRows = allInitialCourses.filter(row => Number(row.AdSectionId) === 7);
const capacityByCode = new Map<string, number>();
for (const row of sourceRows) {
  const key = referenceCodeKey(row.CourseCode).slice(-3);
  if (capacityByCode.has(key)) throw new Error(`رمز سعة مكرر في القسم المرجعي: ${key}`);
  capacityByCode.set(key, Number(row.MaxStudent ?? 0));
}
for (const key of merged.keys()) if (!capacityByCode.has(key)) throw new Error(`لا توجد قيمة سعة مرجعية مطابقة للمقرر ${key} في قسم البنات؛ أُوقف التنفيذ.`);

type Target = { sectionId: number; sectionName: string; collegeId: number; collegeName: string; oldPlan: CurriculumPlan; newPlan: CurriculumPlan; courses: AdCourse[]; byCode: Map<string, AdCourse>; links: Awaited<ReturnType<typeof Repository.getCurriculumPlanCourses>>; oldDraft?: CurriculumRuleSet; newDraft?: CurriculumRuleSet };
const targets: Target[] = [];
for (const section of technologySections) {
  const sectionId = Number(section.AdSectionId);
  const college = colleges.find(row => Number(row.AdCollegeId) === Number(section.AdCollegeId));
  if (!college) throw new Error(`الكلية غير موجودة للقسم ${sectionId}.`);
  const courses = allInitialCourses.filter(row => Number(row.AdSectionId) === sectionId);
  const byCode = new Map<string, AdCourse>();
  for (const course of courses) {
    const key = referenceCodeKey(course.CourseCode).slice(-3);
    if (byCode.has(key)) throw new Error(`رمز مقرر مكرر داخل القسم ${sectionId}: ${key}; أُوقف التنفيذ قبل الكتابة.`);
    byCode.set(key, course);
  }
  const plans = await Repository.getCurriculumPlans(sectionId);
  const oldPlans = plans.filter(plan => plan.status === "transition"), newPlans = plans.filter(plan => plan.status === "active");
  if (oldPlans.length !== 1 || newPlans.length !== 1) throw new Error(`القسم ${sectionId} لا يملك صحيفة قديمة وجديدة وحيدتين؛ أُوقف التنفيذ قبل الكتابة.`);
  const [oldDraft, newDraft] = await Promise.all([Repository.getRuleDraft(oldPlans[0].id), Repository.getRuleDraft(newPlans[0].id)]);
  const links = await Repository.getCurriculumPlanCourses(sectionId);
  const ownedPlanIds = new Set(plans.map(plan => plan.id));
  const scopedLinks = links.filter(link => ownedPlanIds.has(link.planId));
  for (const link of scopedLinks) {
    if (Number(link.AdSectionId) !== sectionId || Number(link.AdCollegeId) !== Number(college.AdCollegeId)) throw new Error(`رابطة صحيفة غير متسقة في القسم ${sectionId}; أُوقف التنفيذ.`);
    if (!courses.some(course => Number(course.AdCourseId) === Number(link.AdCourseId))) throw new Error(`رابطة صحيفة تشير لمقرر خارج القسم ${sectionId}; أُوقف التنفيذ.`);
  }
  targets.push({ sectionId, sectionName: section.AdSectionName, collegeId: Number(college.AdCollegeId), collegeName: college.AdCollegeName, oldPlan: oldPlans[0], newPlan: newPlans[0], courses, byCode, links: scopedLinks, oldDraft, newDraft });
}

const sourceTarget = targets.find(target => target.sectionId === 7)!;
if (!sourceTarget.oldDraft || !sourceTarget.newDraft) throw new Error("مسودات قسم البنات المرجعي غير مكتملة؛ أُوقف التنفيذ قبل الكتابة.");
const sourceCourseById = new Map(allInitialCourses.map(course => [Number(course.AdCourseId), course]));
const sourceDraftFor = (kind: "old" | "new") => kind === "old" ? sourceTarget.oldDraft! : sourceTarget.newDraft!;
for (const target of targets.filter(row => row.sectionId !== 7)) {
  for (const kind of ["old", "new"] as const) {
    const draft = sourceDraftFor(kind);
    const referencedIds = [
      ...draft.rules.map(rule => rule.courseId),
      ...draft.rules.flatMap(rule => [...(rule.prereq?.all || []), ...(rule.prereq?.anyOf || []).flat(), ...(rule.coreq || [])]),
      ...draft.groups.flatMap(group => group.courseIds),
    ];
    for (const id of referencedIds) {
      const referenceCourse = sourceCourseById.get(Number(id));
      if (!referenceCourse || !merged.has(referenceCodeKey(referenceCourse.CourseCode).slice(-3))) {
        throw new Error(`تعذّر نقل مرجع قاعدة ${id} من صحيفة البنات إلى القسم ${target.sectionId} دون تخمين؛ أُوقف التنفيذ قبل الكتابة.`);
      }
    }
  }
}

const expectedFor = (kind: "old" | "new") => new Set(referenceByKind.get(kind)!.rows.map(row => row.code.slice(-3)));
const planChanges = (target: Target, plan: CurriculumPlan, kind: "old" | "new") => {
  const expected = expectedFor(kind);
  const linkedCodes = target.links.filter(link => link.planId === plan.id).map(link => referenceCodeKey(target.courses.find(course => Number(course.AdCourseId) === Number(link.AdCourseId))?.CourseCode || "").slice(-3));
  return { missing: [...expected].filter(code => !linkedCodes.includes(code)), extraIds: target.links.filter(link => link.planId === plan.id && !expected.has(referenceCodeKey(target.courses.find(course => Number(course.AdCourseId) === Number(link.AdCourseId))?.CourseCode || "").slice(-3))).map(link => Number(link.AdCourseId)) };
};

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run", projectId, databaseId,
  capacitySource: { sectionId: 7, college: sourceCollege.AdCollegeName, exactReferenceCourses: merged.size, noCapacityValueKeptAsZero: [...capacityByCode.values()].filter(value => value === 0).length },
  sections: targets.map(target => ({ sectionId: target.sectionId, college: target.collegeName,
    courseRowsToCreate: [...merged.keys()].filter(code => !target.byCode.has(code)).length,
    courseRowsToCorrect: [...merged].filter(([code, ref]) => { const row = target.byCode.get(code); return row && (row.CourseName !== ref.name || Number(row.CourseCredit) !== ref.credit || Number(row.CourseHours) !== ref.hours || Number(row.MaxStudent ?? 0) !== Number(capacityByCode.get(code))); }).map(([code]) => code),
    oldPlan: { name: target.oldPlan.name, status: target.oldPlan.status, ...planChanges(target, target.oldPlan, "old") },
    newPlan: { name: target.newPlan.name, status: target.newPlan.status, ...planChanges(target, target.newPlan, "new") },
    ruleDraftsToCopy: [!target.oldDraft && "old", !target.newDraft && "new"].filter(Boolean),
    existingRuleDraftsPreserved: [Boolean(target.oldDraft), Boolean(target.newDraft)]
  })),
  note: "المعاينة لا تكتب شيئًا. --apply يحافظ على المسودات الموجودة ولا يعتمد أي صحيفة."
}, null, 2));

if (!apply) { console.log("معاينة فقط؛ لم تُكتب أي بيانات. أضف --apply للتنفيذ."); process.exit(0); }

const actor = "مطابقة صحائف تكنولوجيا التعليم مع صحيفة البنات المرجعية";
for (const target of targets) {
  // Re-read each course just before editing; only update rows still owned by this exact section.
  let currentRows = await Repository.getCoursesBySection(target.sectionId);
  let byCode = new Map(currentRows.map(row => [referenceCodeKey(row.CourseCode).slice(-3), row]));
  for (const [code, reference] of merged) {
    const capacity = Number(capacityByCode.get(code));
    const current = byCode.get(code);
    if (!current) {
      const created = await Repository.createCourse(target.collegeId, target.sectionId, code, reference.name, reference.credit, reference.hours, capacity);
      byCode.set(code, created);
      continue;
    }
    if (Number(current.AdSectionId) !== target.sectionId || Number(current.AdCollegeId) !== target.collegeId) throw new Error(`تغير مالك المقرر ${code} بالقسم ${target.sectionId} بعد المعاينة.`);
    if (current.CourseName !== reference.name || Number(current.CourseCredit) !== reference.credit || Number(current.CourseHours) !== reference.hours || Number(current.MaxStudent ?? 0) !== capacity) {
      const updated = await Repository.updateCourse(Number(current.AdCourseId), target.collegeId, target.sectionId, String(current.CourseCode), reference.name, reference.credit, reference.hours, capacity);
      byCode.set(code, updated);
    }
  }
  currentRows = await Repository.getCoursesBySection(target.sectionId);
  byCode = new Map(currentRows.map(row => [referenceCodeKey(row.CourseCode).slice(-3), row]));
  target.byCode.clear(); for (const [key, course] of byCode) target.byCode.set(key, course);
  for (const [kind, plan] of [["old", target.oldPlan], ["new", target.newPlan]] as const) {
    const expected = expectedFor(kind);
    const expectedIds = new Set([...expected].map(code => Number(byCode.get(code)?.AdCourseId)).filter(Number.isFinite));
    let links = await Repository.getCurriculumPlanCourses(target.sectionId);
    for (const code of expected) {
      const course = byCode.get(code);
      if (!course) throw new Error(`بعد الكتابة لا يوجد مقرر ${code} بالقسم ${target.sectionId}.`);
      if (!links.some(link => link.planId === plan.id && Number(link.AdCourseId) === Number(course.AdCourseId))) {
        await Repository.addCourseToCurriculumPlan(plan.id, course, actor);
        links = [...links, { id: `${plan.id}_${course.AdCourseId}`, planId: plan.id, AdCollegeId: target.collegeId, AdSectionId: target.sectionId, AdCourseId: Number(course.AdCourseId), createdAt: new Date().toISOString(), createdBy: actor }];
      }
    }
    for (const link of links.filter(item => item.planId === plan.id && !expectedIds.has(Number(item.AdCourseId)))) await Repository.removeCourseFromCurriculumPlan(plan.id, Number(link.AdCourseId));
  }
  for (const kind of ["old", "new"] as const) {
    const existing = kind === "old" ? target.oldDraft : target.newDraft;
    if (existing) continue;
    const sourceDraft = sourceDraftFor(kind);
    const targetPlan = kind === "old" ? target.oldPlan : target.newPlan;
    const mapCourseId = (id: number): number => {
      const sourceCourse = sourceCourseById.get(Number(id));
      const mapped = sourceCourse && byCode.get(referenceCodeKey(sourceCourse.CourseCode).slice(-3));
      if (!mapped) throw new Error(`تعذر ربط قاعدة ${id} بعد استكمال القسم ${target.sectionId}.`);
      return Number(mapped.AdCourseId);
    };
    const copiedDraft: CurriculumRuleSet = {
      ...sourceDraft,
      id: targetPlan.id,
      planId: targetPlan.id,
      AdCollegeId: target.collegeId,
      AdSectionId: target.sectionId,
      rules: sourceDraft.rules.map(rule => ({
        ...rule,
        courseId: mapCourseId(rule.courseId),
        ...(rule.prereq ? { prereq: { ...rule.prereq, all: rule.prereq.all.map(mapCourseId), anyOf: rule.prereq.anyOf.map(group => group.map(mapCourseId)) } } : {}),
        ...(rule.coreq ? { coreq: rule.coreq.map(mapCourseId) } : {}),
      })),
      groups: sourceDraft.groups.map(group => ({ ...group, courseIds: group.courseIds.map(mapCourseId) })),
      status: "review",
      basedOnVersion: 0,
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
    };
    await Repository.updateRuleDraft(targetPlan.id, current => current ? undefined : copiedDraft);
  }
  const [finalCourses, finalLinks, finalDrafts] = await Promise.all([Repository.getCoursesBySection(target.sectionId), Repository.getCurriculumPlanCourses(target.sectionId), Promise.all([Repository.getRuleDraft(target.oldPlan.id), Repository.getRuleDraft(target.newPlan.id)])]);
  const finalByCode = new Map(finalCourses.map(row => [referenceCodeKey(row.CourseCode).slice(-3), row]));
  const courseProblems = [...merged].filter(([code, reference]) => {
    const row = finalByCode.get(code);
    return !row || row.CourseName !== reference.name || Number(row.CourseCredit) !== reference.credit || Number(row.CourseHours) !== reference.hours || Number(row.MaxStudent ?? 0) !== Number(capacityByCode.get(code));
  }).map(([code]) => code);
  const membershipProblems = ([target.oldPlan, target.newPlan] as const).flatMap((plan, index) => {
    const expected = expectedFor(index === 0 ? "old" : "new");
    const actual = new Set(finalLinks.filter(link => link.planId === plan.id).map(link => referenceCodeKey(finalCourses.find(course => Number(course.AdCourseId) === Number(link.AdCourseId))?.CourseCode || "").slice(-3)));
    return [...expected].filter(code => !actual.has(code)).map(code => `${plan.id}:missing:${code}`).concat([...actual].filter(code => !expected.has(code)).map(code => `${plan.id}:extra:${code}`));
  });
  if (courseProblems.length || membershipProblems.length || finalDrafts.some(draft => !draft)) throw new Error(`التحقق النهائي للقسم ${target.sectionId} لم ينجح: courses=${courseProblems.join(",")}; memberships=${membershipProblems.join(",")}`);
  console.log(JSON.stringify({ applied: true, sectionId: target.sectionId, college: target.collegeName, verifiedCourses: merged.size, capacityMatchesSection7: true, oldPlanCourses: expectedFor("old").size, newPlanCourses: expectedFor("new").size, ruleDraftStates: finalDrafts.map(draft => draft?.status || null) }));
}
