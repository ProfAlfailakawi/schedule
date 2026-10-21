import type { AdCollege, AdCourse, AdInstructor, FSchedule } from "../types";
import { byArabic } from "./sorting";
import { officialCollegeSitePrefix, officialSiteLabel } from "./locationCollegePrefixes";

export interface InstructorSiteLoad {
  collegeId: number;
  siteName: string;
  courses: string[];
  courseCount: number;
  sectionCount: number;
}

export interface InstructorCourseSiteLoad {
  collegeId: number;
  siteName: string;
  sectionCount: number;
}

export interface InstructorCourseLocationLoad {
  courseName: string;
  sites: InstructorCourseSiteLoad[];
}

export interface InstructorCourseLoad {
  instructorId: number;
  instructorName: string;
  sites: InstructorSiteLoad[];
  courses: string[];
  courseLocations: InstructorCourseLocationLoad[];
  courseCount: number;
  sectionCount: number;
}

/** One professor across all accessible sites; a subject counts once in the total,
 * and once at every site where it is actually taught. Repeated meetings do not
 * become extra sections. */
export function instructorCourseLoad(
  rows: FSchedule[],
  instructors: Map<number, AdInstructor>,
  courses: Map<number, AdCourse>,
  colleges: Map<number, AdCollege>,
): InstructorCourseLoad[] {
  const groups = new Map<number, {
    instructorId: number; instructorName: string;
    subjects: Map<string, string>; sections: Set<string>;
    sites: Map<number, { siteName: string; subjects: Map<string, string>; sections: Set<string> }>;
    courseLocations: Map<string, { courseName: string; sites: Map<number, { siteName: string; sections: Set<string> }> }>;
  }>();
  for (const row of rows) {
    const instructorId = Number(row.AdInstructorId);
    const instructorName = instructors.get(instructorId)?.AdInstructorName?.trim();
    if (!instructorId || !instructorName) continue;
    const collegeId = Number(row.AdCollegeId);
    const code = String(row.CourseCodeSnapshot || courses.get(Number(row.AdCourseId))?.CourseCode || "").trim().normalize("NFKC");
    const courseName = String(row.CourseNameSnapshot || row.AdCourseName || courses.get(Number(row.AdCourseId))?.CourseName || code).trim();
    const subjectKey = code || `id:${Number(row.AdCourseId)}`;
    if (!subjectKey || subjectKey === "id:0") continue;
    const group = groups.get(instructorId) || {
      instructorId, instructorName, subjects: new Map<string, string>(), sections: new Set<string>(), sites: new Map(), courseLocations: new Map(),
    };
    const collegeName = colleges.get(collegeId)?.AdCollegeName || "موقع غير مسمى";
    const prefix = officialCollegeSitePrefix(collegeName);
    const site = group.sites.get(collegeId) || {
      siteName: prefix ? officialSiteLabel(prefix, collegeName) : collegeName,
      subjects: new Map<string, string>(), sections: new Set<string>(),
    };
    group.subjects.set(subjectKey, courseName || code);
    const sectionKey = `${collegeId}:${subjectKey}:${String(row.SCode || row.id).trim()}`;
    group.sections.add(sectionKey);
    site.subjects.set(subjectKey, courseName || code);
    site.sections.add(sectionKey);
    const courseLocation = group.courseLocations.get(subjectKey) || { courseName: courseName || code, sites: new Map() };
    const courseSite = courseLocation.sites.get(collegeId) || { siteName: site.siteName, sections: new Set<string>() };
    courseSite.sections.add(sectionKey);
    courseLocation.sites.set(collegeId, courseSite);
    group.courseLocations.set(subjectKey, courseLocation);
    group.sites.set(collegeId, site);
    groups.set(instructorId, group);
  }
  return [...groups.values()].map(group => ({
    instructorId: group.instructorId, instructorName: group.instructorName,
    sites: [...group.sites.entries()].map(([collegeId, site]) => ({
      collegeId, siteName: site.siteName, courses: [...site.subjects.values()].sort(byArabic),
      courseCount: site.subjects.size, sectionCount: site.sections.size,
    })).sort((a, b) => byArabic(a.siteName, b.siteName)),
    courses: [...group.subjects.values()].sort(byArabic),
    courseLocations: [...group.courseLocations.values()].map(course => ({
      courseName: course.courseName,
      sites: [...course.sites.entries()].map(([collegeId, site]) => ({ collegeId, siteName: site.siteName, sectionCount: site.sections.size }))
        .sort((a, b) => byArabic(a.siteName, b.siteName)),
    })).sort((a, b) => byArabic(a.courseName, b.courseName)),
    courseCount: group.subjects.size, sectionCount: group.sections.size,
  })).sort((a, b) => byArabic(a.instructorName, b.instructorName));
}

/** Resolve only the selected department's counterparts across official sites.
 * A section code must be unique within each college; ambiguous duplicates are
 * excluded instead of risking a cross-department schedule in a report. */
export function departmentSiteScopes(
  sections: ReadonlyArray<{ AdSectionId: number; AdCollegeId: number; AdSectionCode: string }>,
  selectedSectionId: number,
): Array<{ collegeId: number; sectionId: number }> {
  const selected = sections.find(section => Number(section.AdSectionId) === Number(selectedSectionId));
  const code = String(selected?.AdSectionCode || "").trim();
  if (!selected || !code) return [];
  const byCollege = new Map<number, typeof sections[number][]>();
  for (const section of sections) {
    if (String(section.AdSectionCode || "").trim() !== code) continue;
    const collegeId = Number(section.AdCollegeId);
    const matches = byCollege.get(collegeId) || [];
    matches.push(section);
    byCollege.set(collegeId, matches);
  }
  return [...byCollege.entries()]
    .filter(([, matches]) => matches.length === 1)
    .map(([collegeId, matches]) => ({ collegeId, sectionId: Number(matches[0].AdSectionId) }))
    .filter(scope => scope.collegeId > 0 && scope.sectionId > 0);
}
