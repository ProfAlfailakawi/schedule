/**
 * ── لمن هذا الطلب؟ — قاعدةٌ واحدة للسجلّ وللكشف ─────────────────────────────
 *
 * The intelligence centre's case register and the registration sheet read the
 * same term's student cases, and each decided on its own which of them belong
 * to the department on screen. They drifted: a case the register showed (a
 * graduate request from a student of another department, answered through
 * this department's survey) was missing from the sheet where the committee is
 * supposed to decide it.
 *
 *   • `surveyOwnsNeed` — the department whose survey received the request. A
 *     modern record says so (`surveySectionId`); an older one is recovered from
 *     the section it was filed under, or from the courses it asks for. This is
 *     the register's rule.
 *   • `sectionOwnsNeed` — the registration sheet's rule: every case the
 *     register shows, PLUS any case that names one of this department's
 *     courses (a «تعارض مقررين» filed elsewhere), because each course is
 *     decided in the sheet of the department that owns it.
 *
 * So the sheet is a superset of the register by construction, never a second
 * reading of it. `tests/student-registration-audit.ts` holds both.
 */
export interface StudentNeedScope {
  surveySectionId?: number;
  AdSectionId?: number;
  courseIds?: number[];
}

export function surveyOwnsNeed(need: StudentNeedScope, sectionId: number, sectionCourseIds: Set<number>): boolean {
  const explicit = Number(need?.surveySectionId || 0);
  if (explicit) return explicit === sectionId;
  if (Number(need?.AdSectionId || 0) === sectionId) return true;
  /* Legacy new-course/conflict records carried no survey provenance; the
     requested course is authoritative enough to return them to its owner. */
  return Array.isArray(need?.courseIds) && need.courseIds.some(id => sectionCourseIds.has(Number(id)));
}

export function sectionOwnsNeed(
  need: StudentNeedScope,
  courses: Array<{ AdCourseId: number; AdSectionId: number }>,
  sectionId: number,
): boolean {
  const own = new Set(courses.filter(row => Number(row.AdSectionId) === sectionId).map(row => Number(row.AdCourseId)));
  if (surveyOwnsNeed(need, sectionId, own)) return true;
  return (need.courseIds || []).some(id => own.has(Number(id)));
}
