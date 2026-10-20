import type { AdCollege, AdCourse, AdInstructor, FSchedule } from "../types";
import { byArabic } from "./sorting";

export interface InstructorCourseLoad {
  collegeId: number;
  collegeName: string;
  instructorId: number;
  instructorName: string;
  courses: string[];
  courseCount: number;
  sectionCount: number;
}

/** Count distinct subjects and sections within each college, never lecture rows. */
export function instructorCourseLoad(
  rows: FSchedule[],
  instructors: Map<number, AdInstructor>,
  courses: Map<number, AdCourse>,
  colleges: Map<number, AdCollege>,
): InstructorCourseLoad[] {
  const groups = new Map<string, {
    collegeId: number; collegeName: string; instructorId: number; instructorName: string;
    subjects: Map<string, string>; sections: Set<string>;
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
    const groupKey = `${collegeId}:${instructorId}`;
    const group = groups.get(groupKey) || {
      collegeId, collegeName: colleges.get(collegeId)?.AdCollegeName || "كلية غير مسماة",
      instructorId, instructorName, subjects: new Map<string, string>(), sections: new Set<string>(),
    };
    group.subjects.set(subjectKey, courseName || code);
    group.sections.add(`${subjectKey}:${String(row.SCode || row.id).trim()}`);
    groups.set(groupKey, group);
  }
  return [...groups.values()].map(group => ({
    collegeId: group.collegeId, collegeName: group.collegeName,
    instructorId: group.instructorId, instructorName: group.instructorName,
    courses: [...group.subjects.values()].sort(byArabic),
    courseCount: group.subjects.size, sectionCount: group.sections.size,
  })).sort((a, b) => byArabic(a.collegeName, b.collegeName) || b.courseCount - a.courseCount || byArabic(a.instructorName, b.instructorName));
}
