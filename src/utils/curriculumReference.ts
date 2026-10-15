import type { AdCourse } from "../types";
import type { CurriculumReference } from "../data/technologyEducationCurricula";
import { toEnglishDigits } from "./digits";
import { arabicMatchKey } from "./arabicText";

export const referenceCodeKey = (value: unknown) => toEnglishDigits(String(value ?? "")).replace(/[\s._-]/g, "");
export const isTechnologyEducation = (name: unknown) => arabicMatchKey(String(name || "").replace(/^قسم\s+/, "")) === arabicMatchKey("تكنولوجيا التعليم");

/** A department's short code is resolved only for its own 0109 courses.
 * Equal names never merge courses. The caller supplies the scoped catalog.
 */
export function compareCurriculumReference(reference: CurriculumReference, courses: readonly AdCourse[], memberIds?: ReadonlySet<number>) {
  return reference.groups.map(group => ({ ...group, courses: group.courses.map(source => {
    const exact = courses.filter(course => referenceCodeKey(course.CourseCode) === source.code);
    const candidates = exact.length ? exact : source.code.startsWith("0109")
      ? courses.filter(course => referenceCodeKey(course.CourseCode) === String(Number(source.code.slice(-3)))) : [];
    const current = candidates.length === 1 ? candidates[0] : undefined;
    const differences: string[] = [];
    if (current) {
      if (String(current.CourseName).normalize("NFKC").trim() !== source.name) differences.push("name");
      if (Number(current.CourseCredit) !== source.credit) differences.push("credit");
      if (Number(current.CourseHours) !== source.hours) differences.push("hours");
      if (memberIds && !memberIds.has(Number(current.AdCourseId))) differences.push("membership");
    }
    return { ...source, state: candidates.length > 1 ? "ambiguous" : current ? differences.length ? "different" : "matched" : "missing", differences,
      ...(current ? { current: { id: current.AdCourseId, code: current.CourseCode, name: String(current.CourseName).normalize("NFKC"), credit: current.CourseCredit, hours: current.CourseHours } } : {}) };
  }) }));
}
