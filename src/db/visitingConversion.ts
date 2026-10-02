/**
 * تنفيذ خطة التحويل منتدب ⇄ معيّن على المستودع. يبني الحالة من السجلات،
 * ويسأل planVisitingConversion، ثم يكتب التعديلات وحدها عبر حافظات العائلة.
 * لا يمسّ الجداول ولا رواستر الفصول الماضية.
 */
import { Repository } from "./repository";
import { departmentFamilyResolver } from "../utils/sectionLabel";
import { sortTermsNewest } from "../utils/termSequence";
import { ConversionChange, ConversionRequest, ConversionState, planVisitingConversion } from "../utils/visitingConversion";

export async function readConversionState(instructorId: number): Promise<ConversionState & { currentTermId: number }> {
  const [affiliations, sections, terms] = await Promise.all([Repository.getDelegateAffiliations(), Repository.getSections(), Repository.getTerms()]);
  const id = Number(instructorId);
  const ordered = sortTermsNewest(terms as any[]);
  const currentTermId = Number(ordered[0]?.AdTermId || 0);
  return {
    currentTermId,
    directory: affiliations.filter(r => r.kind === "directory" && r.instructorIds.includes(id)).map(r => ({ collegeId: r.collegeId, sectionId: r.sectionId })),
    rosters: affiliations.filter(r => r.kind === "roster" && r.termId && r.instructorIds.includes(id)).map(r => ({ collegeId: r.collegeId, sectionId: r.sectionId, termId: Number(r.termId) })),
    pastTermIds: ordered.slice(1).map(t => Number(t.AdTermId)),
    knownTermIds: ordered.map(t => Number(t.AdTermId)),
    familyOf: departmentFamilyResolver(sections as any[]),
  };
}

export async function runVisitingConversion(request: ConversionRequest, options: { dryRun?: boolean } = {}) {
  const state = await readConversionState(request.instructorId);
  const plan = planVisitingConversion(request, state);
  if (plan.errors.length || options.dryRun) return { ...plan, applied: false };
  const id = Number(request.instructorId);
  for (const change of plan.changes as ConversionChange[]) {
    const { collegeId, sectionId } = change;
    if (change.kind === "directory-remove") {
      const list = await Repository.getDepartmentDelegates(collegeId, sectionId);
      await Repository.saveDepartmentDelegates(collegeId, sectionId, list.filter(x => Number(x) !== id));
    } else if (change.kind === "directory-add") {
      await Repository.addDepartmentDelegate(collegeId, sectionId, id);
    } else if (change.kind === "roster-remove") {
      const list = await Repository.getVisitingRoster(collegeId, sectionId, change.termId);
      await Repository.saveVisitingRoster(collegeId, sectionId, change.termId, list.filter(x => Number(x) !== id));
    } else if (change.kind === "roster-add") {
      const list = await Repository.getVisitingRoster(collegeId, sectionId, change.termId);
      await Repository.saveVisitingRoster(collegeId, sectionId, change.termId, [...list, id]);
    }
  }
  return { ...plan, applied: true };
}
