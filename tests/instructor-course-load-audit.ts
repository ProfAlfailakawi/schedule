import assert from "node:assert/strict";
import { instructorCourseLoad } from "../src/utils/instructorCourseLoad";

const instructors = new Map<number, any>([[1, { AdInstructorName: "د. سارة" }], [2, { AdInstructorName: "د. خالد" }]]);
const colleges = new Map<number, any>([[5, { AdCollegeName: "كلية البنات" }], [6, { AdCollegeName: "كلية البنين" }]]);
const courses = new Map<number, any>([[10, { CourseCode: "A101", CourseName: "مادة أ" }], [11, { CourseCode: "B201", CourseName: "مادة ب" }]]);
const row = (id: number, college: number, instructor: number, course: number, section: string, code = "") => ({
  id, AdCollegeId: college, AdInstructorId: instructor, AdCourseId: course, SCode: section,
  CourseCodeSnapshot: code,
}) as any;
const result = instructorCourseLoad([
  row(1, 5, 1, 10, "01"), row(2, 5, 1, 10, "01"), // two meetings of one section
  row(3, 5, 1, 10, "02"), row(4, 5, 1, 11, "01"),
  row(5, 5, 2, 10, "03"), row(6, 6, 1, 10, "01"),
  row(7, 5, 0, 11, "04"), // unassigned
], instructors, courses, colleges);

assert.equal(result.length, 3);
const saraGirls = result.find(x => x.collegeId === 5 && x.instructorId === 1)!;
assert.deepEqual([saraGirls.courseCount, saraGirls.sectionCount], [2, 3]);
assert.deepEqual(saraGirls.courses, ["مادة أ", "مادة ب"]);
assert.deepEqual([result.find(x => x.collegeId === 5 && x.instructorId === 2)?.courseCount,
  result.find(x => x.collegeId === 6 && x.instructorId === 1)?.courseCount], [1, 1]);
assert(result.every(x => x.instructorId !== 0));
console.log("✓ تقرير مواد الأساتذة: المقرر والشعبة يحسبان مرة لكل أستاذ وكلية، والمواعيد المتكررة لا تضاعفهما");
