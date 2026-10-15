import { rankDemandRepairsBySimulation } from "../src/server/simulationData";
import type { FSchedule } from "../src/types";
import type { DemandRepair } from "../src/utils/demandRepair";
import type { AdCourse } from "../src/types";
import type { SimInput } from "../src/utils/registrationSim";

const check = (ok: boolean, label: string) => {
  if (!ok) throw new Error(`✗ ${label}`);
  console.log(`✓ ${label}`);
};

const courses: AdCourse[] = Array.from({ length: 5 }, (_, i) => ({
  AdCourseId: i + 1, AdCollegeId: 1, AdSectionId: 11, CourseCode: `C${i + 1}`,
  CourseName: `مقرر ${i + 1}`, CourseCredit: 3, CourseHours: 3, MaxStudent: 2,
}));
const schedules: FSchedule[] = courses.map((course, i) => ({
  id: i + 1, AdCollegeId: 1, AdSectionId: 11, AdTermId: 7, AdCourseId: course.AdCourseId,
  AdCourseName: course.CourseName, SCode: "01", AdInstructorId: i + 1,
  fsunday: i < 2, fmonday: i === 2, ftuesday: i === 3, fwednesday: i === 4, fthursday: false,
  fstarttime: "08:00", fendtime: "09:00", AdRoomCode: `R${i + 1}`, AdRoomHall: "",
}));
const input: SimInput = {
  students: [{ fp: "anon-1", planId: "p", collegeId: 1, sectionId: 11, passed: [], assessable: true, wishes: { targetUnits: 15, courseIds: [], constraints: {} } }],
  offerings: [], plans: [{ planId: "p", courseIds: courses.map(course => course.AdCourseId), hasApprovedRules: true,
    rules: courses.map(course => ({ courseId: course.AdCourseId, level: 1, kind: "compulsory" })), groups: [] }],
  credit: new Map(courses.map(course => [course.AdCourseId, 3])), rounds: 1,
};
const repair: DemandRepair = {
  rowId: 2, courseId: 2, courseName: "مقرر 2", sectionCode: "01", room: "R2",
  againstCourseId: 1, againstCourseName: "مقرر 1", shared: 1,
  from: { day: "fsunday", dayLabel: "الأحد", start: "08:00", end: "09:00" },
  to: { day: "fthursday", dayLabel: "الخميس", start: "08:00", end: "09:00" },
  removes: 1, adds: 0, distanceMinutes: 1440, sameDay: false, sentence: "",
};
const coursesById = new Map(courses.map(course => [course.AdCourseId, course]));
const ranked = rankDemandRepairsBySimulation(input, schedules, coursesById, 7, [repair], { collegeId: 1, sectionId: 11 });
check(ranked.length === 1, "إظهار نقلة أثبتت تحسناً بعد إعادة المحاكاة");
check(ranked[0].simulationImpact.before.canReach15 === 0 && ranked[0].simulationImpact.after.canReach15 === 1 && ranked[0].simulationImpact.delta15 === 1,
  "احتساب أثر بلوغ 15 وحدة من الجدول المعدل فعلياً");
check(ranked[0].simulationImpact.respondents === 1 && ranked[0].simulationImpact.virtualCapacity,
  "إظهار حجم العينة والتنبيه إلى أن السعة افتراضية");
check(schedules[1].fsunday && !schedules[1].fthursday, "المعاينة لا تغيّر مسودة الجدول الأصلية");
