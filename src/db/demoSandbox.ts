import type {
  AdCollege, AdCollegeUserAssign, AdCourse, AdInstructor, AdRoom, AdSection,
  AdTerm, FSchedule, FormName, FormSecurity, SystemUser
} from "../types";
import { generateSyntheticCivilId } from "../utils/civilId";

const instructorNames = [
  "د. أحمد سالم", "د. نورة خالد", "د. محمد عبدالله", "د. سارة محمود",
  "د. يوسف إبراهيم", "د. ريم حسن", "د. خالد ناصر", "د. مريم علي",
  "د. عبدالله راشد", "د. هدى فهد", "د. فيصل عمر", "د. دانة بدر",
];

const colleges: AdCollege[] = [
  { AdCollegeId: 1, AdCollegeCode: "SCI", AdCollegeName: "كلية العلوم التطبيقية" },
  { AdCollegeId: 2, AdCollegeCode: "BUS", AdCollegeName: "كلية الأعمال والابتكار" },
  { AdCollegeId: 3, AdCollegeCode: "EDU", AdCollegeName: "كلية التربية المستقبلية" },
];

const sections: AdSection[] = [
  { AdSectionId: 1, AdCollegeId: 1, AdSectionCode: "CS", AdSectionName: "علوم الحاسب" },
  { AdSectionId: 2, AdCollegeId: 1, AdSectionCode: "DS", AdSectionName: "علم البيانات" },
  { AdSectionId: 3, AdCollegeId: 2, AdSectionCode: "MGT", AdSectionName: "الإدارة" },
  { AdSectionId: 4, AdCollegeId: 2, AdSectionCode: "ENT", AdSectionName: "ريادة الأعمال" },
  { AdSectionId: 5, AdCollegeId: 3, AdSectionCode: "EDT", AdSectionName: "تقنيات التعليم" },
];

const courseNames = [
  ["CS101", "مدخل إلى البرمجة"], ["CS220", "هياكل البيانات"], ["CS315", "الذكاء الاصطناعي"],
  ["DS110", "أساسيات البيانات"], ["DS240", "تصوير البيانات"], ["DS330", "تعلم الآلة التطبيقي"],
  ["MGT101", "مبادئ الإدارة"], ["MGT230", "السلوك التنظيمي"], ["MGT340", "إدارة المشاريع"],
  ["ENT120", "التفكير الريادي"], ["ENT250", "تصميم نماذج الأعمال"], ["ENT360", "مختبر الابتكار"],
  ["EDT105", "مدخل إلى تقنيات التعليم"], ["EDT210", "التلعيب في التعليم"], ["EDT315", "تصميم خبرات التعلم"],
  ["EDT330", "الذكاء الاصطناعي في التعليم"], ["CS350", "أمن الأنظمة"], ["DS360", "تحليلات القرار"],
] as const;

export interface DemoSandboxState {
  users: SystemUser[]; formNames: FormName[]; formSecurity: FormSecurity[]; collegeUserAssign: AdCollegeUserAssign[];
  terms: AdTerm[]; colleges: AdCollege[]; sections: AdSection[]; instructors: AdInstructor[]; courses: AdCourse[];
  schedules: FSchedule[]; rooms: AdRoom[];
  auditLogs: any[]; scheduleVersions: any[]; scheduleDrafts: any[]; scheduleOpenDecisions: any[]; clientTelemetry: any[];
  scheduleComments: any[]; studentNeeds: any[]; schedulePublications: any[]; scheduleConstraints: any[]; visitingRosters: any[]; departmentDelegates: any[]; departmentRooms: any[];
  scheduleDecisionMemories: any[]; campusMobilityProfiles: any[]; scheduleShareLinks: any[]; hallBarterRequests: any[];
}

function syntheticInstructors(): AdInstructor[] {
  return instructorNames.map((name, index) => ({
    AdInstructorId: index + 1,
    AdInstructorCivil: generateSyntheticCivilId(),
    AdInstructorName: name,
    AdInstructorMobile: `5000${String(index + 1).padStart(4, "0")}`,
  }));
}

function syntheticCourses(): AdCourse[] {
  return courseNames.map(([code, name], index) => {
    const sectionId = index < 3 ? 1 : index < 6 ? 2 : index < 9 ? 3 : index < 12 ? 4 : index < 16 ? 5 : index === 16 ? 1 : 2;
    const section = sections.find(row => row.AdSectionId === sectionId)!;
    return {
      AdCourseId: index + 1, AdCollegeId: section.AdCollegeId, AdSectionId: sectionId,
      CourseCode: code, CourseName: name, CourseCredit: 3, CourseHours: 3, MaxStudent: 30 + ((index % 4) * 5),
    };
  });
}

function syntheticSchedules(courses: AdCourse[]): FSchedule[] {
  const times = [["08:00", "09:15"], ["09:30", "10:45"], ["11:00", "12:15"], ["12:30", "13:45"], ["14:00", "15:15"], ["15:30", "16:45"]];
  const rooms = [["A", "101"], ["A", "203"], ["B", "110"], ["B", "205"], ["C", "301"], ["C", "315"], ["D", "120"], ["D", "220"]];
  return Array.from({ length: 30 }, (_, index) => {
    const course = courses[index % courses.length];
    const [start, end] = times[index % times.length];
    const [code, hall] = rooms[index % rooms.length];
    const pattern = index % 4;
    return {
      id: index + 1, AdCollegeId: course.AdCollegeId, AdSectionId: course.AdSectionId, AdTermId: 1,
      AdCourseId: course.AdCourseId, AdCourseName: course.CourseName, SCode: `0${(index % 3) + 1}`,
      AdInstructorId: (index % instructorNames.length) + 1,
      fsunday: pattern === 0 || pattern === 2, fmonday: pattern === 1 || pattern === 3,
      ftuesday: pattern === 0 || pattern === 2, fwednesday: pattern === 1 || pattern === 3,
      fthursday: index % 5 === 0, fstarttime: start, fendtime: end,
      AdRoomCode: code, AdRoomHall: hall, fdetail: index % 7 === 0 ? "حالة تجريبية معدّة لاستعراض معالجة التعارضات" : "", rev: 0,
    };
  });
}

export function createDemoSandboxState(): DemoSandboxState {
  const instructors = syntheticInstructors();
  const courses = syntheticCourses();
  const formNames: FormName[] = Array.from({ length: 17 }, (_, index) => ({ FormNameId: index + 1, FormName: `صلاحية ${index + 1}` }));
  const users: SystemUser[] = [
    { SystemUserId: 1, Name: "مدير البيئة التجريبية", SystemUserLogin: "demo.admin", SystemUserPass: "", IsAdminUser: true, IsActive: true, IsLocked: false, IsDeleted: false },
    { SystemUserId: 2, Name: "منسق قسم تجريبي", SystemUserLogin: "demo.scheduler", SystemUserPass: "", IsAdminUser: false, IsActive: true, IsLocked: false, IsDeleted: false },
    { SystemUserId: 3, Name: "مستخدم للعرض", SystemUserLogin: "demo.viewer", SystemUserPass: "", IsAdminUser: false, IsActive: true, IsLocked: false, IsDeleted: false },
  ];
  const formSecurity: FormSecurity[] = formNames.map((form, index) => ({ legacyId: index + 1, SystemUserId: 1, FormNameId: form.FormNameId }));
  const collegeUserAssign: AdCollegeUserAssign[] = sections.map((section, index) => ({ legacyId: index + 1, SystemUserId: 1, AdCollegeId: section.AdCollegeId, AdSectionId: section.AdSectionId }));
  const rooms: AdRoom[] = [
    ["A", "101", "قاعة ذكية 40 مقعدًا"], ["A", "203", "مختبر حاسب"], ["B", "110", "قاعة محاضرات"], ["B", "205", "مختبر ابتكار"],
    ["C", "301", "قاعة مرنة"], ["C", "315", "قاعة مشاريع"], ["D", "120", "مختبر تعلم رقمي"], ["D", "220", "قاعة نقاش"],
  ].map((row, index) => ({ AdRoomId: index + 1, AdRoomCode: row[0], AdRoomHall: row[1], AdRoomDescrip: row[2] }));
  return {
    users, formNames, formSecurity, collegeUserAssign,
    terms: [{ AdTermId: 1, AdTermName: "الفصل الأول 2026/2027", AdTermStart: "2026-09-06", AdTermWeeks: 15 }],
    colleges: structuredClone(colleges), sections: structuredClone(sections), instructors, courses,
    schedules: syntheticSchedules(courses), rooms,
    auditLogs: [], scheduleVersions: [], scheduleDrafts: [], scheduleOpenDecisions: [], clientTelemetry: [], scheduleComments: [],
    studentNeeds: [], schedulePublications: [], scheduleConstraints: [], visitingRosters: [], departmentDelegates: [], departmentRooms: [], scheduleDecisionMemories: [],
    campusMobilityProfiles: [], scheduleShareLinks: [], hallBarterRequests: [],
  };
}
