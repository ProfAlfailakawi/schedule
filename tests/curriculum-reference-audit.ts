import assert from "node:assert/strict";
import { TECHNOLOGY_EDUCATION_CURRICULA as references } from "../src/data/technologyEducationCurricula";
import { compareCurriculumReference, isTechnologyEducation } from "../src/utils/curriculumReference";
import type { AdCourse } from "../src/types";
for (const reference of references) {
  assert.equal(reference.groups.reduce((sum, group) => sum + group.requiredUnits, 0), reference.degreeUnits);
  const courses = reference.groups.flatMap(group => group.courses);
  assert.equal(courses.length, reference.id === "old" ? 73 : 64);
  assert.equal(new Set(courses.map(course => course.code)).size, courses.length);
  assert(courses.every(course => /^\d{7}$/.test(course.code) && course.hours > 0 && course.credit >= 0));
  for (const group of reference.groups) {
    const sum = group.courses.reduce((sum, course) => sum + course.credit, 0);
    assert(group.elective ? sum >= group.requiredUnits : sum === group.requiredUnits);
    for (const course of group.courses) for (const code of course.prerequisites) assert(courses.some(other => other.code === code), `${reference.id}: ${course.code} -> ${code}`);
  }
  const categories = Object.fromEntries([...new Set(reference.groups.map(group => group.category))].map(category => [category, reference.groups.filter(group => group.category === category).reduce((sum, group) => sum + group.requiredUnits, 0)]));
  assert.deepEqual(Object.values(categories), reference.id === "old" ? [30, 60, 40] : [25, 66, 24, 10]);
}
const source = references[1].groups.flatMap(group => group.courses).find(course => course.code === "0109105")!;
const current: AdCourse = { AdCourseId: 1, AdCollegeId: 5, AdSectionId: 6, CourseCode: "105", CourseName: "أسس تكنولوجيا التعلم", CourseCredit: 2, CourseHours: 4, MaxStudent: 40 };
const find = (courses: AdCourse[], memberIds = new Set([1])) => compareCurriculumReference(references[1], courses, memberIds).flatMap(group => group.courses).find(course => course.code === source.code)!;
assert.deepEqual(find([current]).differences, ["name", "credit", "hours"]);
assert.equal(find([{ ...current, CourseCode: "0109105", CourseName: source.name, CourseCredit: source.credit, CourseHours: source.hours }]).state, "matched");
assert.equal(find([{ ...current, CourseCode: "150", CourseName: source.name }]).state, "missing");
assert.equal(find([current, { ...current, AdCourseId: 2 }]).state, "ambiguous");
assert(find([current], new Set()).differences.includes("membership"));
assert(isTechnologyEducation("قسم تكنولوجيا التعليم"));
assert(!isTechnologyEducation("التربية الإسلامية"));
const snapshots = references.map(reference => reference.groups.flatMap(group => group.courses).find(course => course.code === "0109468")!);
assert.notDeepEqual(snapshots[0].prerequisites, snapshots[1].prerequisites);
console.log("Curriculum reference audit passed: all 137 source rows, both totals, all prerequisites, identities and differences.");
