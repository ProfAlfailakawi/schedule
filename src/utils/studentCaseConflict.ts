import type { SimOffering, SimSlot } from "./registrationSim";

export interface StudentConflictPair { ownCourseId: number; otherCourseId: number }

const overlaps = (a: readonly SimSlot[], b: readonly SimSlot[]): boolean =>
  a.some(left => b.some(right => left.day === right.day && left.start < right.end && right.start < left.end));

/**
 * Return only course pairs for which every confirmed, published offering
 * combination overlaps. A pair with a non-overlapping alternative is
 * resolvable by choosing another section and must not become an exception case.
 * Callers must pass offerings after `auditSimOfferings`; this helper deliberately
 * does not infer missing meetings or capacities.
 */
export function verifiedUnresolvableStudentConflicts(
  ownCourseIds: readonly number[],
  otherCourseIds: readonly number[],
  offerings: readonly SimOffering[],
  signed: ReadonlySet<string>,
  home: { collegeId: number; sectionId: number },
): StudentConflictPair[] {
  const rows = offerings.filter(row => row.collegeId > 0 && row.sectionId > 0 && row.slots.length > 0
    && signed.has(`${row.collegeId}:${row.sectionId}`));
  const ownSet = new Set(ownCourseIds.map(Number));
  const out: StudentConflictPair[] = [];
  for (const ownCourseId of ownSet) {
    const own = rows.filter(row => row.courseId === ownCourseId && row.collegeId === home.collegeId && row.sectionId === home.sectionId);
    if (!own.length) continue;
    for (const otherCourseId of new Set(otherCourseIds.map(Number))) {
      if (!Number.isInteger(otherCourseId) || otherCourseId <= 0 || otherCourseId === ownCourseId) continue;
      const other = rows.filter(row => row.courseId === otherCourseId && row.collegeId === home.collegeId && row.sectionId !== home.sectionId);
      if (!other.length) continue;
      const hasResolvablePair = own.some(left => other.some(right => !overlaps(left.slots, right.slots)));
      if (!hasResolvablePair && own.some(left => other.some(right => overlaps(left.slots, right.slots)))) {
        out.push({ ownCourseId, otherCourseId });
      }
    }
  }
  return out;
}
