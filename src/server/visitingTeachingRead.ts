/**
 * ── قراءة استعلام المنتدبين عبر كليات القسم ────────────────────────────────
 * القلب الذي يقرؤه المسار /api/reports/visiting-teaching، مفصولاً عن Express
 * ليُختبر على الصندوق التجريبي بصلاحياتٍ مقيّدة. الصلاحية تُمرَّر دالةً:
 * ما لا يجيزه القارئ لا يُقرأ أصلاً، ويُذكر في family بـ allowed=false.
 */
import { Repository } from "../db/repository";
import { departmentFamily } from "../utils/sectionLabel";
import { liveVisitingIds } from "../utils/liveVisiting";
import { dedupeVisitingRows } from "../utils/visitingTeaching";

export interface VisitingFamilyMember { collegeId: number; sectionId: number; collegeName: string; sectionName: string; allowed: boolean }

export async function readVisitingTeaching(
  allowed: (collegeId: number, sectionId: number) => boolean,
  collegeId: number, sectionId: number, termId: number,
) {
  const [sections, colleges, instructors] = await Promise.all([Repository.getSections(), Repository.getColleges(), Repository.getInstructors()]);
  const sectionName = new Map((sections as any[]).map(row => [Number(row.AdSectionId), String(row.AdSectionName || "")]));
  const collegeName = new Map((colleges as any[]).map(row => [Number(row.AdCollegeId), String(row.AdCollegeName || "")]));
  const family: VisitingFamilyMember[] = departmentFamily(sections as any[], collegeId, sectionId).map(member => ({
    ...member,
    collegeName: collegeName.get(member.collegeId) || "",
    sectionName: sectionName.get(member.sectionId) || "",
    allowed: allowed(member.collegeId, member.sectionId),
  }));
  const readable = family.filter(member => member.allowed);
  const instructorById = new Map((instructors as any[]).map(person => [Number(person.AdInstructorId), person]));
  const [rosterGroups, rowGroups] = await Promise.all([
    Promise.all(readable.map(async member => liveVisitingIds(
      await Repository.getVisitingRoster(member.collegeId, member.sectionId, termId),
      await Repository.getDepartmentDelegates(member.collegeId, member.sectionId),
      id => instructorById.has(id),
    ))),
    Promise.all(readable.map(member => Repository.getSchedulesByScope({ collegeId: member.collegeId, sectionId: member.sectionId, termId }))),
  ]);
  const instructorIds = [...new Set(rosterGroups.flat())];
  const wanted = new Set(instructorIds);
  return {
    family,
    complete: family.every(member => member.allowed),
    instructorIds,
    instructors: instructorIds.map(id => instructorById.get(id)).filter(Boolean),
    rows: dedupeVisitingRows(rowGroups.flat().filter(row => wanted.has(Number(row.AdInstructorId)))),
  };
}
