import assert from "node:assert/strict";
import { instructorCourseLoad } from "../src/utils/instructorCourseLoad";

const instructors = new Map<number, any>([[1, { AdInstructorName: "د. سارة" }], [2, { AdInstructorName: "د. خالد" }]]);
const colleges = new Map<number, any>([[5, { AdCollegeName: "كلية التربية الأساسية - بنات" }], [6, { AdCollegeName: "كلية التربية الأساسية - بنين" }], [7, { AdCollegeName: "كلية التربية الأساسية - بنات - الجهراء" }]]);
const courses = new Map<number, any>([[10, { CourseCode: "A101", CourseName: "مادة أ" }], [11, { CourseCode: "B201", CourseName: "مادة ب" }]]);
const row = (id: number, college: number, instructor: number, course: number, section: string, code = "") => ({
  id, AdCollegeId: college, AdInstructorId: instructor, AdCourseId: course, SCode: section,
  CourseCodeSnapshot: code,
}) as any;
const result = instructorCourseLoad([
  row(1, 5, 1, 10, "01"), row(2, 5, 1, 10, "01"), // two meetings of one section
  row(3, 5, 1, 10, "02"), row(4, 5, 1, 11, "01"),
  row(5, 5, 2, 10, "03"), row(6, 6, 1, 10, "01"), row(8, 7, 1, 11, "01"),
  row(7, 5, 0, 11, "04"), // unassigned
], instructors, courses, colleges);

assert.equal(result.length, 2);
const sara = result.find(x => x.instructorId === 1)!;
assert.deepEqual([sara.courseCount, sara.sectionCount, sara.sites.length], [2, 5, 3]);
assert.deepEqual(sara.courses, ["مادة أ", "مادة ب"]);
assert.deepEqual(Object.fromEntries(sara.sites.map(site => [site.collegeId, site.courseCount])), { 5: 2, 6: 1, 7: 1 });
assert(sara.sites.some(site => site.siteName.includes("الجهراء")));
assert.deepEqual([result.find(x => x.instructorId === 2)?.courseCount, result.find(x => x.instructorId === 2)?.sites.length], [1, 1]);
assert(result.every(x => x.instructorId !== 0));
console.log("✓ توزيع المواد: الأستاذ مرة واحدة، مع البنين والبنات والجهراء وإجمالي بلا تكرار المواعيد");
