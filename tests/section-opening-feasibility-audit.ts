import { readSectionOpenings } from "../src/utils/sectionOpening";
import type { AdCourse, AdInstructor, FSchedule, MasterRoom } from "../src/types";

const check = (ok: boolean, label: string) => {
  if (!ok) throw new Error(`✗ ${label}`);
  console.log(`✓ ${label}`);
};

const course: AdCourse = { AdCourseId: 1, AdCollegeId: 1, AdSectionId: 11, CourseCode: "A1", CourseName: "مقرر أ", CourseCredit: 3, CourseHours: 3, MaxStudent: 30 };
const existing: AdCourse = { AdCourseId: 2, AdCollegeId: 1, AdSectionId: 11, CourseCode: "B1", CourseName: "مقرر ب", CourseCredit: 3, CourseHours: 3, MaxStudent: 30 };
const weekRow: FSchedule = {
  id: 2, AdCollegeId: 1, AdSectionId: 11, AdTermId: 7, AdCourseId: 2, AdCourseName: existing.CourseName, SCode: "01", AdInstructorId: 2,
  fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, fstarttime: "08:00", fendtime: "09:00",
  AdRoomCode: "R2", AdRoomHall: "1", buildingId: "b", roomId: "r2", locationStatus: "VERIFIED",
};
const pastRow: FSchedule = {
  ...weekRow, id: 1, AdTermId: 6, AdCourseId: 1, AdCourseName: course.CourseName, SCode: "01", AdInstructorId: 1,
  AdRoomCode: "R1", roomId: "r1",
};
const instructor = (id: number, AdInstructorLoad?: number): AdInstructor => ({
  AdInstructorId: id, AdInstructorName: `أستاذ ${id}`, AdInstructorCivil: "", AdInstructorMobile: "", AdInstructorLoad,
});
const room = (capacity?: number): MasterRoom => ({
  id: "r1", buildingId: "b", buildingCode: "B1", canonicalCode: "R1", capacity, active: true,
  aliases: [], collegeIds: [1], sectionIds: [11], shared: false, historicalUsageCount: 1,
  confidence: "CONFIRMED", source: "TEST", adminVerified: true, evidence: [], auditHistory: [],
});
const demand: any = { respondents: 25, courses: [{ courseId: 1, name: course.CourseName, code: course.CourseCode, students: 25, share: 100 }], pairs: [], unwanted: [], headline: "" };
const rhythm: any = { forDay: () => ({ ladder: ["08:00"] }), patterns: [], learnedFrom: { rows: 1, terms: 1 } };
const read = (people: AdInstructor[], rooms: MasterRoom[]) => readSectionOpenings(
  [weekRow], [weekRow], [course, existing], people, [pastRow], demand, null, rhythm, 0, 6, rooms,
);

check(read([instructor(1, 3), instructor(2, 3)], [room(30)]).proposals[0]?.placements[0]?.instructorId === 1,
  "الشعبة لا تظهر كتوصية قابلة للتطبيق إلا بأستاذ متاح ضمن النصاب وقاعة موثقة تكفي السعة");
check(read([instructor(1), instructor(2, 3)], [room(30)]).proposals[0]?.placements.length === 0,
  "نصاب الأستاذ المجهول لا يُعامل كسعة متاحة ولا يُخترع له حد");
check(read([instructor(1, 3), instructor(2, 3)], [room(15)]).proposals[0]?.placements.length === 0,
  "قاعة أصغر من سعة الشعبة لا تدخل في اقتراح فتحها");
check(read([instructor(1, 3), instructor(2, 3)], []).proposals[0]?.placements.length === 0,
  "غياب سجل قاعات موثوق يمنع اقتراح مورد مكاني غير مؤكد");
