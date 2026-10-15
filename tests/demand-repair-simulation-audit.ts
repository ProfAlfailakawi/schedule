import { rankDemandRepairsBySimulation, rankSectionOpeningsBySimulation } from "../src/server/simulationData";
import { readDemandRepairs } from "../src/utils/demandRepair";
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
check(ranked[0].simulationImpact.deltaConflicts >= 0 && ranked[0].simulationImpact.scheduleChanges === 1,
  "التوصية تعرض تغير التعارضات وعدد تغييرات الجدول المحسوبين من السيناريو");
check(schedules[1].fsunday && !schedules[1].fthursday, "المعاينة لا تغيّر مسودة الجدول الأصلية");

const swapRows: FSchedule[] = [
  { ...schedules[0], id: 21, AdCourseId: 1, AdCourseName: "أ", SCode: "01", AdInstructorId: 1, fsunday: true, fmonday: false, fstarttime: "08:00", fendtime: "09:00", AdRoomCode: "R1" },
  { ...schedules[1], id: 22, AdCourseId: 2, AdCourseName: "ب", SCode: "01", AdInstructorId: 1, fsunday: false, fmonday: true, fstarttime: "08:00", fendtime: "09:00", AdRoomCode: "R2" },
  { ...schedules[2], id: 23, AdCourseId: 3, AdCourseName: "ج", SCode: "01", AdInstructorId: 3, fsunday: true, fmonday: false, fstarttime: "08:00", fendtime: "09:00", AdRoomCode: "R3" },
  { ...schedules[3], id: 24, AdCourseId: 4, AdCourseName: "د", SCode: "01", AdInstructorId: 4, fstarttime: "08:00", fendtime: "09:00", AdRoomCode: "R4" },
  { ...schedules[4], id: 25, AdCourseId: 5, AdCourseName: "هـ", SCode: "01", AdInstructorId: 5, fstarttime: "08:00", fendtime: "09:00", AdRoomCode: "R5" },
].map(row => ({ ...row, ftuesday: row.id === 24, fwednesday: row.id === 25, fthursday: false }));
const swapDemand: any = {
  respondents: 3, courses: [], pairs: [{ a: 1, b: 3, shared: 3, nameA: "أ", nameB: "ج" }], unwanted: [], headline: "",
};
const rhythm: any = { forDay: () => ({ ladder: ["08:00"] }) };
const swapCandidates = readDemandRepairs(swapRows, swapDemand, rhythm, 0).repairs;
const swap = swapCandidates.find(item => item.swapWith?.rowId === 22);
check(Boolean(swap), "اقتراح تبديل شعبة مع شعبة أخرى يفك تعارض الفوج دون تعارض موارد جديد");
if (swap) {
  const swappedRank = rankDemandRepairsBySimulation(input, swapRows, coursesById, 7, [swap], { collegeId: 1, sectionId: 11 });
  check(swappedRank.length === 1 && swappedRank[0].swapWith?.rowId === 22 && swappedRank[0].simulationImpact.scheduleChanges === 2,
    "إعادة محاكاة التبديل تحفظ المقترح فقط إذا تحسنت قدرة الطلبة، وتعدّ التغييرين");
}
const opening = rankSectionOpeningsBySimulation(input, swapRows.filter(row => row.AdCourseId !== 3), coursesById, 7, [{
  courseId: 3, courseName: "ج", courseCode: "C3", demand: 1, predicted: false, capacity: 2,
  openSections: 0, seats: 0, shortfall: 1, needed: 1,
  placements: [{ index: 1, day: "fthursday", dayLabel: "الخميس", start: "08:00", end: "09:00", buildingId: "b", roomId: "r", roomCode: "R", roomHall: "1", instructorId: 3, instructorName: "د", sectionCode: "02", note: "" }],
  sentence: "",
}]);
check(opening.tested === 1 && opening.proposals.length === 1 && opening.proposals[0].simulationImpact.delta15 === 1,
  "فتح الشعبة لا يُوصى به إلا بعد تحسن 15 وحدة في إعادة المحاكاة الفعلية");
check(opening.proposals[0].simulationImpact.conflictsBefore >= 0 && opening.proposals[0].simulationImpact.conflictsAfter >= 0,
  "فتح الشعبة يعرض حالات التعارض قبلها وبعدها من إعادة المحاكاة نفسها");
