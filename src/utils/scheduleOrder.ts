import { byArabic } from "./sorting";

/** A lecture is identified by its course code and section, never its title. */
export function compareCourseSection(
  a: { courseCode?: unknown; sectionCode?: unknown; courseName?: unknown; id?: unknown },
  b: { courseCode?: unknown; sectionCode?: unknown; courseName?: unknown; id?: unknown },
): number {
  return byArabic(a.courseCode, b.courseCode)
    || byArabic(a.sectionCode, b.sectionCode)
    || byArabic(a.courseName, b.courseName)
    || Number(a.id || 0) - Number(b.id || 0);
}
