import type {
  AdCollege, AdCollegeUserAssign, AdCourse, AdInstructor, AdRoom, AdSection,
  AdTerm, FSchedule, FormName, FormSecurity, ScheduleApproval, ScheduleComment,
  ScheduleVersion, SystemUser, MasterBuilding, MasterRoom
} from "../types";
import { generateSyntheticCivilId } from "../utils/civilId";
import { ACADEMIC_ROLES, roleDefinition, type AcademicRole } from "../utils/academicRoles";

const instructorNames = [
  "د. سالم فهد", "د. نورة خالد", "د. محمد عبدالله", "د. سارة محمود",
  "د. يوسف إبراهيم", "د. ريم حسن", "د. خالد ناصر", "د. مريم علي",
  "د. عبدالله راشد", "د. هدى فهد", "د. فيصل عمر", "د. دانة بدر",
];

const colleges: AdCollege[] = [
  { AdCollegeId: 1, AdCollegeCode: "SCI", AdCollegeName: "كلية العلوم التطبيقية" },
  { AdCollegeId: 2, AdCollegeCode: "BUS", AdCollegeName: "كلية الأعمال والابتكار" },
  { AdCollegeId: 3, AdCollegeCode: "EDU", AdCollegeName: "كلية التربية المستقبلية" },
];

/* ── قسمٌ في عدّة مواقع ────────────────────────────────────────────────────
 *
 * يُلحق بعد الأقسام الخمسة، وبأرقامٍ بعدها، فلا يمسّ مسرحَ دورة الاعتماد ولا
 * توزيعَ المواعيد المبنيّ عليها: مقرّرٌ واحد لكل موقع، وموعدان يومَ الخميس
 * (يومٌ لا يدرّس فيه أحدٌ في الصندوق، فلا تعارضَ يُصنع)، وقاعةٌ في مبنى
 * الكلية. */
const MULTI_SITE_NAME = "الدراسات الإسلامية";
const MULTI_SITE_SECTIONS: AdSection[] = [
  { AdSectionId: 6, AdCollegeId: 1, AdSectionCode: "ISL", AdSectionName: MULTI_SITE_NAME },
  { AdSectionId: 7, AdCollegeId: 2, AdSectionCode: "ISL", AdSectionName: MULTI_SITE_NAME },
  { AdSectionId: 8, AdCollegeId: 3, AdSectionCode: "ISL", AdSectionName: MULTI_SITE_NAME },
];

const sections: AdSection[] = [
  { AdSectionId: 1, AdCollegeId: 1, AdSectionCode: "CS", AdSectionName: "علوم الحاسب" },
  { AdSectionId: 2, AdCollegeId: 1, AdSectionCode: "DS", AdSectionName: "علم البيانات" },
  { AdSectionId: 3, AdCollegeId: 2, AdSectionCode: "MGT", AdSectionName: "الإدارة" },
  { AdSectionId: 4, AdCollegeId: 2, AdSectionCode: "ENT", AdSectionName: "ريادة الأعمال" },
  { AdSectionId: 5, AdCollegeId: 3, AdSectionCode: "EDT", AdSectionName: "تقنيات التعليم" },
  /* قسمٌ واحد يُدرَّس في الكليات الثلاث — كقسم «الدراسات الإسلامية» الحقيقي في
     ثلاث عشرة كليةً وفرعاً. حسابُه (DEMO_MULTI_SITE) يرى «قسمك في 3 مواقع». */
  ...MULTI_SITE_SECTIONS,
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
  /* دورة الاعتماد تعمل في البيئة التجريبية كما تعمل في الحقيقية: المدير يجرّب
     الدورة كاملةً — توقيعاً وإرسالاً وإرجاعاً وقبولاً — بحساباتٍ وهمية قبل أن
     يسلّم العميدَ حسابَه. ومجموعةٌ غائبةٌ هنا تعني شاشةً تنكسر في التجربة
     وحدها، وهو أسوأ موضعٍ ينكسر فيه شيء: حيث يُختبر. */
  scheduleApprovals: any[];
  /* سجلُّ المباني والقاعات: بدونه لا يُحفظ موعدٌ في الصندوق (locationPreflight). */
  locationBuildings: MasterBuilding[]; locationRooms: MasterRoom[];
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
  return [...courseNames.map(([code, name], index) => {
    const sectionId = index < 3 ? 1 : index < 6 ? 2 : index < 9 ? 3 : index < 12 ? 4 : index < 16 ? 5 : index === 16 ? 1 : 2;
    const section = sections.find(row => row.AdSectionId === sectionId)!;
    return {
      AdCourseId: index + 1, AdCollegeId: section.AdCollegeId, AdSectionId: sectionId,
      CourseCode: code, CourseName: name, CourseCredit: 3, CourseHours: 3, MaxStudent: 30 + ((index % 4) * 5),
    };
  }), ...MULTI_SITE_SECTIONS.map((section, index) => ({
    AdCourseId: courseNames.length + index + 1, AdCollegeId: section.AdCollegeId, AdSectionId: section.AdSectionId,
    CourseCode: "ISL101", CourseName: "مدخل إلى الدراسات الإسلامية", CourseCredit: 2, CourseHours: 2, MaxStudent: 40,
  }))];
}

/* ── سجلُّ مبانٍ وقاعاتٍ للبيئة التجريبية ─────────────────────────────────
 *
 * كلُّ كتابةٍ على موعد (إضافة، تعديل، نقل) تمرّ بـlocationPreflight، وهو يطلب
 * مبنى وقاعةً من سجلّ المباني الرسمي. والصندوقُ كان بلا سجلّ، وصفوفُه قاعاتٌ
 * نصّية («A/101») لا ترتبط بشيء — فلم يكن في البيئة التجريبية موعدٌ واحدٌ
 * يُعدَّل أو يُنقل: كلُّ حفظٍ يُرفض «اختر مبنى رسميًا من سجل المباني».
 *
 * فللصندوق سجلُّه الوهمي بالشكل الذي يقرؤه النظام في الحقيقي: مبنىً بكودٍ رسميّ
 * الشكل (فرعٌ من ثلاثة أرقام — 9xx لا يوجد في الجامعة —، حرفُ موقع، رقمُ مبنى)
 * لكل كلية، وقاعاتٌ لكل قسم، ومختبرٌ مشترك بين قسمَي كلية العلوم. وكلُّ صفٍّ
 * مبذور مرتبطٌ بمبناه وقاعته (buildingId/roomId، والكودان الرسميان، و«VERIFIED»).
 *
 * والقاعاتُ لقسمها: فلا تظهر قاعةُ قسمٍ خارجَ كليته، ولا يقع تعارضٌ عابرٌ
 * للكليات — وهو ما كان يُشعل اللوحة كلّها «خارج النطاق» في أول نظرة. */
interface DemoBuildingSeed {
  prefix: string; siteLetter: string; number: string; collegeId: number; name: string;
  rooms: ReadonlyArray<readonly [hall: string, sectionIds: readonly number[], description: string]>;
}
const DEMO_BUILDINGS: readonly DemoBuildingSeed[] = [
  { prefix: "901", siteLetter: "A", number: "01", collegeId: 1, name: "مبنى العلوم التطبيقية", rooms: [
    ["101", [1], "قاعة ذكية 40 مقعدًا"], ["102", [1], "قاعة محاضرات 35 مقعدًا"], ["203", [1], "مختبر حاسب"],
    ["104", [2], "قاعة بيانات 30 مقعدًا"], ["110", [2], "قاعة محاضرات 45 مقعدًا"],
  ] },
  { prefix: "901", siteLetter: "A", number: "02", collegeId: 1, name: "مبنى المختبرات المشتركة", rooms: [
    ["L01", [1, 2], "مختبر مشترك للحاسب والبيانات"],
  ] },
  { prefix: "902", siteLetter: "B", number: "01", collegeId: 2, name: "مبنى الأعمال والابتكار", rooms: [
    ["205", [3], "قاعة نقاش"], ["206", [3], "قاعة محاضرات"], ["301", [4], "مختبر ابتكار"], ["315", [4], "قاعة مشاريع"],
  ] },
  { prefix: "903", siteLetter: "D", number: "01", collegeId: 3, name: "مبنى التربية المستقبلية", rooms: [
    ["120", [5], "مختبر تعلم رقمي"], ["220", [5], "قاعة نقاش"], ["221", [5], "قاعة مرنة"],
  ] },
  /* قاعةٌ لقسم الدراسات الإسلامية في كل كلية — مبنىً مستقلٌّ بعد المباني،
     فلا تنزاح أرقامُ القاعات التي قبله. */
  { prefix: "901", siteLetter: "A", number: "03", collegeId: 1, name: "مبنى الدراسات الإسلامية — العلوم", rooms: [["130", [6], "قاعة محاضرات"]] },
  { prefix: "902", siteLetter: "B", number: "02", collegeId: 2, name: "مبنى الدراسات الإسلامية — الأعمال", rooms: [["130", [7], "قاعة محاضرات"]] },
  { prefix: "903", siteLetter: "D", number: "02", collegeId: 3, name: "مبنى الدراسات الإسلامية — التربية", rooms: [["130", [8], "قاعة محاضرات"]] },
];
const demoBuildingCode = (b: DemoBuildingSeed) => `${b.prefix}${b.siteLetter}${b.number}`;
const demoBuildingId = (b: DemoBuildingSeed) => `building_${demoBuildingCode(b)}`;
const demoRoomId = (b: DemoBuildingSeed, hall: string) => `room_${demoBuildingCode(b)}_${hall}`;

/** قاعةٌ واحدة من سجلّ الصندوق بما يكتبه الصفُّ عنها. */
interface DemoHall { buildingId: string; roomId: string; code: string; hall: string; sectionIds: readonly number[]; collegeId: number; description: string; }
const DEMO_HALLS: readonly DemoHall[] = DEMO_BUILDINGS.flatMap(b => b.rooms.map(([hall, sectionIds, description]) => ({
  buildingId: demoBuildingId(b), roomId: demoRoomId(b, hall), code: demoBuildingCode(b), hall, sectionIds, collegeId: b.collegeId, description,
})));
const hallsForSection = (sectionId: number) => DEMO_HALLS.filter(h => h.sectionIds.includes(sectionId));
/** ما يكتبه الصفُّ عن قاعته — الشكلُ نفسه الذي يُخرجه locationPreflight عند الحفظ. */
function hallFields(hall: DemoHall): Partial<FSchedule> {
  return { buildingId: hall.buildingId, roomId: hall.roomId, AdRoomCode: hall.code, AdRoomHall: hall.hall, locationStatus: "VERIFIED" };
}

function demoLocationRegistry(schedules: FSchedule[]): { buildings: MasterBuilding[]; rooms: MasterRoom[] } {
  const at = new Date().toISOString();
  const usage = (key: "buildingId" | "roomId", id: string) => schedules.filter(r => (r as any)[key] === id).length;
  const evidence = ["سجلٌّ وهمي للبيئة التجريبية — لا يمثّل مبنىً حقيقياً."];
  const buildings: MasterBuilding[] = DEMO_BUILDINGS.map(b => {
    const sectionIds = [...new Set(b.rooms.flatMap(([, ids]) => ids))];
    return {
      id: demoBuildingId(b), officialCode: demoBuildingCode(b), sitePrefix: `${b.prefix}${b.siteLetter}`,
      prefix: b.prefix, siteLetter: b.siteLetter, buildingNumber: String(Number(b.number)),
      siteName: "", branchName: colleges.find(c => c.AdCollegeId === b.collegeId)?.AdCollegeName || "", description: b.name,
      active: true, aliases: [], collegeIds: [b.collegeId], sectionIds,
      historicalUsageCount: usage("buildingId", demoBuildingId(b)), firstTermId: 1, lastTermId: 1, roomCount: b.rooms.length,
      confidence: "CONFIRMED", source: "DEMO_SANDBOX", adminVerified: true, evidence, auditHistory: [],
      createdAt: at, updatedAt: at, lastVerifiedAt: at,
    };
  });
  const rooms: MasterRoom[] = DEMO_HALLS.map(h => ({
    id: h.roomId, buildingId: h.buildingId, buildingCode: h.code, canonicalCode: h.hall, active: true, aliases: [],
    collegeIds: [h.collegeId], sectionIds: [...h.sectionIds], primarySectionIds: [...h.sectionIds],
    shared: h.sectionIds.length > 1, sharedConfidence: "CONFIRMED",
    historicalUsageCount: usage("roomId", h.roomId), firstTermId: 1, lastTermId: 1,
    confidence: "CONFIRMED", source: "DEMO_SANDBOX", adminVerified: true, evidence, auditHistory: [],
    createdAt: at, updatedAt: at, lastVerifiedAt: at,
  }));
  return { buildings, rooms };
}

const INSTRUCTOR_BANDS: Record<number, ReadonlyArray<number>> = {
  1: [1, 2, 3, 4],
  2: [5, 6, 7, 8],
  3: [9, 10, 11, 12],
};

/* ── جدولٌ ممكن، وتعارضٌ مقصودٌ واحدٌ مشروح ──────────────────────────────
 *
 * The old generator cycled 30 rows over 18 courses with `SCode = index % 3`, so
 * the same course and section came back eighteen rows later in the same hall at
 * the same hour with a different doctor — an impossible duplicate — and the
 * sections the demo shows as SUBMITTED and ACCEPTED carried approval blockers
 * the product itself would have refused. A demo that contradicts the rules it
 * is demonstrating teaches the wrong thing.
 *
 * Now each college's rows take distinct slots by construction: a row's slot is
 * its position inside its college (pattern, then hour, then hall), and the
 * rows that share a pattern and an hour never share a hall or a doctor. Every
 * course's second pass is a NEW section (01, 02…), never the same one again.
 *
 * The conflict showcase is kept, but honestly: one department that is still
 * drafting (ريادة الأعمال — no approval yet) carries one room clash and one
 * doctor clash, each explained in its own note. `tests/blockers-stream-audit.ts`
 * holds this with the approval-blocker oracle.
 */
export const DEMO_CONFLICT_SECTION_ID = 4;
function syntheticSchedules(courses: AdCourse[]): FSchedule[] {
  const times = [["08:00", "09:15"], ["09:30", "10:45"], ["11:00", "12:15"], ["12:30", "13:45"], ["14:00", "15:15"], ["15:30", "16:45"]];
  const positionInCollege = new Map<number, number>();
  const positionInSection = new Map<number, number>();
  /* قاعةٌ مشغولة في نمطٍ وساعة — فلا يُسند صفّان القاعةَ نفسها في الموعد نفسه. */
  const taken = new Set<string>();
  const core = courses.filter(course => !MULTI_SITE_SECTIONS.some(section => section.AdSectionId === course.AdSectionId));
  const rows: FSchedule[] = Array.from({ length: 30 }, (_, index) => {
    const course = core[index % core.length];
    const instructorBand = INSTRUCTOR_BANDS[course.AdCollegeId] ?? INSTRUCTOR_BANDS[1];
    const k = positionInCollege.get(course.AdCollegeId) ?? 0;
    positionInCollege.set(course.AdCollegeId, k + 1);
    const j = positionInSection.get(course.AdSectionId) ?? 0;
    positionInSection.set(course.AdSectionId, j + 1);
    /* pattern alternates, the hour advances every two rows; the doctor advances
       with the hour and every twelve rows — so two rows at one pattern+hour
       never share a doctor. */
    const pattern = k % 2;
    const [start, end] = times[Math.floor(k / 2) % times.length];
    const lap = Math.floor(k / (2 * times.length));
    /* القاعة: من قاعات القسم، تدور مع ترتيب الصفّ في قسمه — فتنتشر محاضراتُ
       القسم على قاعاته كما تنتشر في الحقيقة — وتتخطّى ما هو مشغولٌ في الموعد. */
    const band = hallsForSection(course.AdSectionId);
    const slot = `${pattern}|${start}`;
    const hall = band.map((_, step) => band[(j + step) % band.length]).find(h => !taken.has(`${slot}|${h.roomId}`)) ?? band[j % band.length];
    taken.add(`${slot}|${hall.roomId}`);
    return {
      id: index + 1, AdCollegeId: course.AdCollegeId, AdSectionId: course.AdSectionId, AdTermId: 1,
      AdCourseId: course.AdCourseId, AdCourseName: course.CourseName,
      SCode: `0${Math.floor(index / core.length) + 1}`,
      AdInstructorId: instructorBand[(lap + Math.floor(k / 2)) % instructorBand.length],
      fsunday: pattern === 0, fmonday: pattern === 1,
      ftuesday: pattern === 0, fwednesday: pattern === 1,
      fthursday: false, fstarttime: start, fendtime: end,
      ...hallFields(hall), fdetail: "", rev: 0,
    } as FSchedule;
  });
  /* The two deliberate conflicts, in the drafting department only. */
  const drafting = rows.filter(row => Number(row.AdSectionId) === DEMO_CONFLICT_SECTION_ID);
  if (drafting.length >= 3) {
    const [anchor, roomClash, teacherClash] = drafting;
    const sameSlot = (other: FSchedule) => other.fstarttime === anchor.fstarttime && Boolean(other.fsunday) === Boolean(anchor.fsunday)
      && Boolean(other.fmonday) === Boolean(anchor.fmonday);
    Object.assign(roomClash, {
      fsunday: anchor.fsunday, fmonday: anchor.fmonday, ftuesday: anchor.ftuesday, fwednesday: anchor.fwednesday, fthursday: anchor.fthursday,
      fstarttime: anchor.fstarttime, fendtime: anchor.fendtime,
      buildingId: anchor.buildingId, roomId: anchor.roomId, AdRoomCode: anchor.AdRoomCode, AdRoomHall: anchor.AdRoomHall,
      fdetail: "حالة تجريبية مقصودة: تعارض قاعة مع موعدٍ آخر في القسم نفسه — لاستعراض «معالجة التعارضات».",
    });
    const freeHall = hallsForSection(DEMO_CONFLICT_SECTION_ID).find(h =>
      !rows.some(other => other !== teacherClash && sameSlot(other) && other.roomId === h.roomId));
    Object.assign(teacherClash, {
      fsunday: anchor.fsunday, fmonday: anchor.fmonday, ftuesday: anchor.ftuesday, fwednesday: anchor.fwednesday, fthursday: anchor.fthursday,
      fstarttime: anchor.fstarttime, fendtime: anchor.fendtime, AdInstructorId: anchor.AdInstructorId,
      ...(freeHall ? hallFields(freeHall) : {}),
      fdetail: "حالة تجريبية مقصودة: الأستاذ نفسه في قاعتين في الساعة نفسها — لاستعراض «معالجة التعارضات».",
    });
  }
  /* قسمُ المواقع الثلاثة: موعدان لكل موقع يومَ الخميس — لا أحدَ في الصندوق
     يدرّس فيه، فلا تعارضَ يُصنع. أستاذا كلِّ موقعٍ من أساتذة كليته. */
  let nextId = rows.length;
  for (const course of courses.filter(row => MULTI_SITE_SECTIONS.some(section => section.AdSectionId === row.AdSectionId))) {
    const hall = hallsForSection(course.AdSectionId)[0];
    const band = INSTRUCTOR_BANDS[course.AdCollegeId] ?? INSTRUCTOR_BANDS[1];
    [["08:00", "09:40"], ["10:00", "11:40"]].forEach(([start, end], k) => {
      rows.push({
        id: ++nextId, AdCollegeId: course.AdCollegeId, AdSectionId: course.AdSectionId, AdTermId: 1,
        AdCourseId: course.AdCourseId, AdCourseName: course.CourseName, SCode: `0${k + 1}`,
        AdInstructorId: band[k % band.length],
        fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: true,
        fstarttime: start, fendtime: end, ...hallFields(hall), fdetail: "", rev: 0,
      } as FSchedule);
    });
  }
  return rows;
}

/* ── فصلان يتبعان التاريخ، لا تاريخاً مكتوباً ───────────────────────────────
 *
 * كان الفصلُ مكتوباً بتاريخه («الأول 2026/2027» يبدأ 2026-09-06)، فيأتي يومٌ
 * ينتهي فيه ويقول الاستبيانُ لكل زائر «انتهى هذا الفصل». فالفصلُ الجاري يبدأ
 * قبل ثلاثة أسابيع من الدخول أيّاً كان يومه، واسمُه من تقويم الجامعة
 * (سبتمبر→ديسمبر الأول، فبراير→مايو الثاني، يونيو→يوليو الصيفي)، والفصلُ
 * السابق قبله بفصلٍ كامل وقد انتهى. */
export const DEMO_PREVIOUS_TERM_ID = 2;
function demoTermName(start: Date): string {
  const month = start.getUTCMonth() + 1, year = start.getUTCFullYear();
  if (month >= 8) return `الفصل الأول ${year}/${year + 1}`;
  if (month >= 6) return `الفصل الصيفي ${year - 1}/${year}`;
  return `الفصل الثاني ${year - 1}/${year}`;
}
function demoTerms(now: Date): AdTerm[] {
  const day = 86_400_000;
  const start = new Date(now.getTime() - 21 * day);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay()); // الأحد
  const previous = new Date(start.getTime() - 22 * 7 * day);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return [
    { AdTermId: 1, AdTermName: demoTermName(start), AdTermStart: iso(start), AdTermWeeks: 15, AdTermSubmissionDeadline: iso(new Date(now.getTime() + 7 * day)) },
    { AdTermId: DEMO_PREVIOUS_TERM_ID, AdTermName: demoTermName(previous), AdTermStart: iso(previous), AdTermWeeks: 15 },
  ];
}
function previousTermRows(current: FSchedule[]): FSchedule[] {
  const top = Math.max(0, ...current.map(row => Number(row.id)));
  return current.filter(row => !String(row.fdetail || "").includes("حالة تجريبية مقصودة"))
    .map((row, index) => ({ ...structuredClone(row), id: top + 1000 + index, AdTermId: DEMO_PREVIOUS_TERM_ID, rev: 0 }));
}

/*
 * ── حسابٌ لكل صفة داخل البيئة التجريبية ─────────────────────────────────────
 *
 * الجلسة الحقيقية تربط كل حساب بصفةٍ من الخادم، ولا تتبدّل الصفة إلا بهوية
 * موثّقة. لكنّ البيئة التجريبية ليست جلسة هوية أصلاً — لا حساب ولا خادم — وعرضُ
 * النظام على العميد يقتضي أن تُرى شاشةُ كل صفة: العميد والتسجيل ورئيس القسم، لا
 * حساب المدير وحده. فيُبدّل شريطُ الديمو الصفةَ المعروضة، وهذا التبديل لا يرفع
 * صلاحية: هو اختيار أيّ حسابٍ من حسابات الصندوق المعزول يُعرض، وكلُّها وهمية.
 *
 * والنطاق يُشتقّ من `scopeMode` نفسه الذي يحكم الحساب الحقيقي، فما يراه المجرِّب
 * هو ما سيراه صاحبُ الصفة بالضبط.
 */
const DEMO_MASTER_STAGE = { collegeId: 1, sectionId: 1 } as const;

interface DemoRoleSeed { role: AcademicRole; id: number; name: string; login: string; }

const DEMO_ROLE_SEEDS: DemoRoleSeed[] = [
  { role: "dean",           id: 10, name: "د. عميد كلية العلوم",       login: "demo.dean" },
  { role: "viceDean",       id: 11, name: "د. العميد المساعد الأكاديمي", login: "demo.vicedean" },
  { role: "registrarDean",  id: 12, name: "د. عميد التسجيل",           login: "demo.regdean" },
  { role: "registrarHead",  id: 13, name: "أ. رئيس التسجيل",           login: "demo.reghead" },
  { role: "registrarStaff", id: 14, name: "أ. موظف التسجيل",           login: "demo.regstaff" },
  { role: "departmentHead", id: 15, name: "د. رئيس قسم علوم الحاسب",   login: "demo.dept" },
  { role: "committeeChair", id: 16, name: "د. رئيس لجنة جدول الحاسب",  login: "demo.committee" },
  { role: "standard",       id: 17, name: "أ. مستخدم عادي",            login: "demo.standard" },
];

/**
 * ── حسابُ القسم المتعدّد المواقع ────────────────────────────────────────────
 *
 * ليس صفةً جديدة: رئيسُ لجنةٍ نطاقُه قسمٌ واحد («الدراسات الإسلامية») في
 * الكليات الثلاث — الشكلُ الذي اشتكى منه المالك في حسابٍ حقيقي. يُعرض في شريط
 * الديمو بمفتاحٍ خاصّ بعد الصفات، فيُجرَّب «قسمك في 3 مواقع» كما يراه صاحبه.
 */
export const DEMO_MULTI_SITE = {
  key: "committeeChairMultiSite", role: "committeeChair" as AcademicRole, id: 18,
  name: "د. رئيس لجنة الدراسات الإسلامية", login: "demo.multisite",
  label: "رئيس لجنة — قسمٌ في ثلاث كليات",
} as const;

/** كل ما يبدّل إليه شريطُ الديمو: الصفاتُ، ثم الحسابُ المتعدّد المواقع. */
export const DEMO_SWITCH_ACCOUNTS: Array<{ role: string; label: string; SystemUserId: number }> = [];

/** مفتاحُ الشريط للحساب المعروض الآن — الحسابُ المتعدّد المواقع مفتاحُه لا صفتُه. */
export function demoActiveRoleKey(userId: number, role: unknown): string {
  if (Number(userId) === DEMO_MULTI_SITE.id) return DEMO_MULTI_SITE.key;
  return String(role || "");
}

/** الحسابات الوهمية التي يبدّل بينها شريط الديمو، بالترتيب الذي تُعرض به. */
export const DEMO_ROLE_ACCOUNTS: Array<{ role: AcademicRole; label: string; SystemUserId: number }> =
  DEMO_ROLE_SEEDS.map(seed => ({ role: seed.role, label: roleDefinition(seed.role).label, SystemUserId: seed.id }));
DEMO_SWITCH_ACCOUNTS.push(...DEMO_ROLE_ACCOUNTS, { role: DEMO_MULTI_SITE.key, label: DEMO_MULTI_SITE.label, SystemUserId: DEMO_MULTI_SITE.id });

function demoAssignsFor(role: AcademicRole): Array<{ AdCollegeId: number; AdSectionId: number }> {
  const mode = roleDefinition(role).scopeMode;
  switch (mode) {
    // كل الكليات: تُقرأ من سجلّ الكليات وقت البناء، فتلحق كليةٌ أُضيفت لاحقاً.
    case "allColleges": return colleges.map(c => ({ AdCollegeId: c.AdCollegeId, AdSectionId: 0 }));
    // كلية كاملة: كلية العلوم بأقسامها، بضغطةٍ واحدة لا قسماً قسماً.
    case "college": return [{ AdCollegeId: DEMO_MASTER_STAGE.collegeId, AdSectionId: 0 }];
    // النطاق اليدويّ صفوفٌ بأقسامٍ حقيقية — شاشةُ النطاقات ترفض الصفر صراحةً،
    // و`isScopeAllowed` لا يفسّر الصفرَ «كليةً كاملة» إلا للصفات الكلّية. فموظّف
    // التسجيل يُعطى أقسامَ كليّتيه صفّاً صفّاً (فيرى واردَها كرئيس التسجيل، لكن
    // ضمن نطاقه)، والمستخدم العادي قسمَه.
    case "manual": return role === "registrarStaff"
      ? sections.filter(s => s.AdCollegeId === 1 || s.AdCollegeId === 2)
          .map(s => ({ AdCollegeId: s.AdCollegeId, AdSectionId: s.AdSectionId }))
      : [{ AdCollegeId: DEMO_MASTER_STAGE.collegeId, AdSectionId: DEMO_MASTER_STAGE.sectionId }];
    // قسمه: قسم علوم الحاسب — مسرحُ دورة الاعتماد في هذه البيئة.
    case "section": return [{ AdCollegeId: DEMO_MASTER_STAGE.collegeId, AdSectionId: DEMO_MASTER_STAGE.sectionId }];
    default: return [];
  }
}

/** قيمة الخانة كما يقرؤها الخادم، ليُبنى `valueAtNote` مطابقاً فتبقى الملاحظة «مفتوحة». */
function noteValue(row: FSchedule, field: "room" | "instructor" | "time"): string {
  if (field === "room") return `${String((row as any).AdRoomCode || "")}/${String((row as any).AdRoomHall || "")}`;
  if (field === "instructor") return String(Number((row as any).AdInstructorId || 0));
  return `${String((row as any).fstarttime || "")}-${String((row as any).fendtime || "")}`;
}

/*
 * ── دورةٌ محكيّة، لا صندوقٌ فارغ ─────────────────────────────────────────────
 *
 * بيئةٌ بلا سجلّ اعتمادٍ تُفتح فيها شاشةُ التغييرات على «لا وارد» و«لم يتغيّر
 * شيء» — فيظنّ المجرِّب أن الميزة معطّلة وهي تعمل. فتُبذَر دورةٌ عاشت، ولكل صفةٍ
 * فيها ما تفعله من أول نظرة:
 *
 *   • علوم الحاسب (مسرحُ اللجنة ورئيس القسم): أرجعه التسجيل بملاحظاتٍ مفتوحة،
 *     فاللجنةُ تعدّل وتنقل وتضيف وتعالج الملاحظات ثم توقّع، ورئيسُ القسم يعلّق
 *     ويوقّع فيصل الجدول إلى التسجيل. ولا يُقفل: جدولٌ عند التسجيل لا يُعدَّل،
 *     واللجنةُ لا تجرّب شيئاً على جدولٍ مقفل.
 *   • علم البيانات (وارد التسجيل): عند التسجيل في جولته الثانية، بأساسٍ محفوظ
 *     يُظهر «ما تحرّك»، وملاحظتين مفتوحتين، وردٍّ من القسم ينتظر القرار.
 *   • الإدارة: معتمد.
 */
function seedApprovalUniverse(schedules: FSchedule[]): {
  approvals: ScheduleApproval[]; versions: ScheduleVersion[]; comments: ScheduleComment[];
} {
  const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  const scopeRows = (sectionId: number) => schedules.filter(r => Number(r.AdCollegeId) === 1 && Number(r.AdSectionId) === sectionId);
  const nextId = (() => { let top = Math.max(0, ...schedules.map(r => Number(r.id))); return () => ++top; })();

  const versions: ScheduleVersion[] = [];
  const comments: ScheduleComment[] = [];
  const approvals: ScheduleApproval[] = [];

  /* نسخةُ ما رآه التسجيل: خانتان تغيّرتا بعدها (قاعةٌ ووقت)، وصفٌّ أُضيف بعدها،
     وصفٌّ كان فيها وحُذف — فيُقرأ التقريرُ «معدّلاً ومضافاً ومحذوفاً» لا جدولاً جديداً. */
  function seenBaseline(stage: FSchedule[], sectionId: number): FSchedule[] {
    const baseline = structuredClone(stage);
    const movedFrom = hallsForSection(sectionId).find(h => h.roomId !== baseline[0].roomId)!;
    Object.assign(baseline[0], hallFields(movedFrom));
    baseline[1].fstarttime = "07:00"; baseline[1].fendtime = "08:15";
    baseline.pop();
    baseline.push({
      ...structuredClone(stage[0]), id: nextId(),
      AdCourseName: "مادةٌ أُلغيت بعد المراجعة", SCode: "09",
      fstarttime: "16:00", fendtime: "17:15", ...hallFields(hallsForSection(sectionId)[0]),
    });
    return baseline;
  }

  // ── علوم الحاسب: مُرجَعٌ بملاحظاتٍ مفتوحة — عملُ اللجنة ورئيس القسم الآن.
  const cs = scopeRows(1);
  if (cs.length >= 4) {
    const baseline = seenBaseline(cs, 1);
    const versionId = "demo-ver-cs-round1";
    versions.push({
      id: versionId, scopeKey: "1:1:1", createdAt: iso(9), rowCount: baseline.length,
      SystemUserId: 16, userName: "د. رئيس لجنة جدول الحاسب",
      AdCollegeId: 1, AdSectionId: 1, AdTermId: 1,
      label: "نسخة الجولة الأولى — كما رآها التسجيل", source: "manual", rows: baseline,
    });
    comments.push(
      {
        id: "demo-note-cs-1", createdAt: iso(3), SystemUserId: 13, userName: "أ. رئيس التسجيل",
        scheduleId: Number(cs[2].id), AdCollegeId: 1, AdSectionId: 1, AdTermId: 1,
        text: "سعة القاعة أقل من عدد المسجّلين المتوقّع — يرجى مراجعتها.",
        resolved: false, field: "room", valueAtNote: noteValue(cs[2], "room"), round: 1, origin: "registrar",
      },
      {
        id: "demo-note-cs-2", createdAt: iso(3), SystemUserId: 13, userName: "أ. رئيس التسجيل",
        scheduleId: Number(cs[3].id), AdCollegeId: 1, AdSectionId: 1, AdTermId: 1,
        text: "تأكّدوا من إسناد الأستاذ — نصابه هذا الفصل يتجاوز المعتاد.",
        resolved: false, field: "instructor", valueAtNote: noteValue(cs[3], "instructor"), round: 1, origin: "registrar",
      },
      // ملاحظةٌ داخلية من رئيس القسم — لا تمنع الإرسال، تُقرأ فقط.
      {
        id: "demo-note-cs-dept", createdAt: iso(2), SystemUserId: 15, userName: "د. رئيس قسم علوم الحاسب",
        scheduleId: Number(cs[1].id), AdCollegeId: 1, AdSectionId: 1, AdTermId: 1,
        text: "ملاحظة داخلية: راجعوا سعة القاعة قبل الاعتماد.",
        resolved: false, field: "room", valueAtNote: noteValue(cs[1], "room"), round: 1, origin: "department",
      },
    );
    approvals.push({
      id: "1:1:1", scopeKey: "1:1:1", AdCollegeId: 1, AdSectionId: 1, AdTermId: 1,
      status: "returned", currentRound: 1,
      signatures: [
        { stage: "committee", SystemUserId: 16, userName: "د. رئيس لجنة جدول الحاسب", roleLabel: "رئيس لجنة الجدول", at: iso(9), versionId, rowCount: baseline.length, regulationNoticeCount: 1, verifyCode: "CMT-2481" },
        { stage: "head", SystemUserId: 15, userName: "د. رئيس قسم علوم الحاسب", roleLabel: "رئيس القسم العلمي", at: iso(9), versionId, rowCount: baseline.length, regulationNoticeCount: 1, verifyCode: "HEAD-7193" },
      ],
      rounds: [
        { number: 1, submittedAt: iso(9), submittedBy: "د. رئيس لجنة جدول الحاسب", returnedAt: iso(3), returnedBy: "أ. رئيس التسجيل", returnedNoteCount: 2, reviewedVersionId: versionId },
      ],
      pendingAdditions: [], updatedAt: iso(3),
    });
  }

  // ── علم البيانات: عند التسجيل، الجولة الثانية، بأساسٍ محفوظ يُظهر ما تحرّك.
  const ds = scopeRows(2);
  if (ds.length >= 4) {
    const baseline = seenBaseline(ds, 2);
    const versionId = "demo-ver-ds-round1";
    versions.push({
      id: versionId, scopeKey: "1:2:1", createdAt: iso(10), rowCount: baseline.length,
      SystemUserId: 16, userName: "لجنة علم البيانات",
      AdCollegeId: 1, AdSectionId: 2, AdTermId: 1,
      label: "نسخة الجولة الأولى — كما رآها التسجيل", source: "manual", rows: baseline,
    });
    comments.push(
      {
        id: "demo-note-ds-1", createdAt: iso(1), SystemUserId: 13, userName: "أ. رئيس التسجيل",
        scheduleId: Number(ds[2].id), AdCollegeId: 1, AdSectionId: 2, AdTermId: 1,
        text: "القاعة صغيرة على عدد الطلبة المتوقّع.",
        resolved: false, field: "room", valueAtNote: noteValue(ds[2], "room"), round: 2, origin: "registrar",
      },
      {
        id: "demo-note-ds-2", createdAt: iso(1), SystemUserId: 13, userName: "أ. رئيس التسجيل",
        scheduleId: Number(ds[3].id), AdCollegeId: 1, AdSectionId: 2, AdTermId: 1,
        text: "تأكّدوا من إسناد الأستاذ — نصابه هذا الفصل يتجاوز المعتاد.",
        resolved: false, field: "instructor", valueAtNote: noteValue(ds[3], "instructor"), round: 2, origin: "registrar",
      },
      {
        id: "demo-note-ds-3", createdAt: iso(4), SystemUserId: 13, userName: "أ. رئيس التسجيل",
        scheduleId: Number(ds[0].id), AdCollegeId: 1, AdSectionId: 2, AdTermId: 1,
        text: "يُفضّل تقديم الموعد نصف ساعة.",
        resolved: false, field: "time", valueAtNote: noteValue(ds[0], "time"), round: 2, origin: "registrar",
        rebuttal: { text: "الموعد مثبّت بطلب القسم لتوافقه مع مختبرٍ مشترك.", at: iso(2), SystemUserId: 16, userName: "لجنة علم البيانات" },
      },
    );
    approvals.push({
      id: "1:2:1", scopeKey: "1:2:1", AdCollegeId: 1, AdSectionId: 2, AdTermId: 1,
      status: "submitted", currentRound: 2,
      signatures: [
        { stage: "committee", SystemUserId: 16, userName: "لجنة علم البيانات", roleLabel: "رئيس لجنة الجدول", at: iso(10), versionId, rowCount: baseline.length, regulationNoticeCount: 0, verifyCode: "CMT-5510" },
        { stage: "head", SystemUserId: 15, userName: "رئيس قسم علم البيانات", roleLabel: "رئيس القسم العلمي", at: iso(10), versionId, rowCount: baseline.length, regulationNoticeCount: 0, verifyCode: "HEAD-6620" },
      ],
      rounds: [
        { number: 1, submittedAt: iso(10), submittedBy: "لجنة علم البيانات", returnedAt: iso(6), returnedBy: "أ. رئيس التسجيل", returnedNoteCount: 2, changedRowCount: 3, reviewedVersionId: versionId },
        { number: 2, submittedAt: iso(2), submittedBy: "لجنة علم البيانات" },
      ],
      pendingAdditions: [], updatedAt: iso(2),
    });
  }

  // ── قسم الإدارة: اعتُمد.
  approvals.push({
    id: "2:3:1", scopeKey: "2:3:1", AdCollegeId: 2, AdSectionId: 3, AdTermId: 1,
    status: "accepted", currentRound: 1,
    signatures: [
      { stage: "committee", SystemUserId: 16, userName: "لجنة الإدارة", roleLabel: "رئيس لجنة الجدول", at: iso(8), rowCount: 5, verifyCode: "CMT-3300" },
      { stage: "head", SystemUserId: 15, userName: "رئيس قسم الإدارة", roleLabel: "رئيس القسم العلمي", at: iso(8), rowCount: 5, verifyCode: "HEAD-4410" },
    ],
    rounds: [{ number: 1, submittedAt: iso(8), submittedBy: "لجنة الإدارة", acceptedAt: iso(3), acceptedBy: "أ. رئيس التسجيل" }],
    pendingAdditions: [], updatedAt: iso(3),
  });

  /* ── مواعيد التسليم: موعدُ الفصل بعد أسبوع (demoTerms)، واستثناءٌ واحد، وطلبٌ
     واحد ينتظر — فيفتح رئيسُ التسجيل لوحته على ما يفعله: يمنح أو يرفض، ويرى
     استثناءً قائماً يُعدَّل ويُرفع. والقسمان خارج مسرح اللجنة ورئيس القسم. */
  const termDeadline = demoTerms(new Date())[0].AdTermSubmissionDeadline!;
  const plus = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  /* علم البيانات: استثناءٌ ثلاثة أيام مُنح قبل أن يُرسل جولته الثانية. (ريادةُ
     الأعمال قسمُ الاستعراض بلا سجلّ اعتماد عمداً — B15 — فلا يُبذر فيه شيء.) */
  const ds1 = approvals.find(row => row.scopeKey === "1:2:1");
  if (ds1) {
    Object.assign(ds1, {
      extensionUntil: plus(termDeadline, 3), extensionReason: "تأخّر اعتماد المنتدبين من الكلية",
      extensionBy: "أ. رئيس التسجيل", extensionAt: iso(5),
    });
  }
  // تقنيات التعليم: قيد الإعداد، ويطلب خمسة أيام.
  approvals.push({
    id: "3:5:1", scopeKey: "3:5:1", AdCollegeId: 3, AdSectionId: 5, AdTermId: 1,
    status: "drafting", currentRound: 0, signatures: [], rounds: [], pendingAdditions: [],
    extensionRequest: { by: "رئيس لجنة جدول تقنيات التعليم", role: "committeeChair", at: iso(1), reason: "انتظار توزيع القاعات الجديدة للمبنى", days: 5 },
    events: [{ at: iso(1), by: "رئيس لجنة جدول تقنيات التعليم", role: "committeeChair", action: "extension-request", round: 0, detail: "5 أيام — انتظار توزيع القاعات الجديدة للمبنى" }],
    updatedAt: iso(1),
  });

  return { approvals, versions, comments };
}

export function createDemoSandboxState(): DemoSandboxState {
  const instructors = syntheticInstructors();
  const courses = syntheticCourses();
  const schedules = [...syntheticSchedules(courses)];
  /* الفصلُ السابق: جدولُ الأقسام نفسُه قبل فصل — تاريخٌ تتعلّم منه القراءاتُ
     (إيقاعُ القسم، ما دُرِّس فعلاً في الاستبيان)، ومصدرٌ يُبنى منه الفصلُ الجديد
     («بداية الفصل»). والحالتان التجريبيتان المقصودتان لا تُورَّثان. */
  const history = previousTermRows(schedules);

  const formNames: FormName[] = Array.from({ length: 17 }, (_, index) => ({ FormNameId: index + 1, FormName: `صلاحية ${index + 1}` }));

  const users: SystemUser[] = [
    { SystemUserId: 1, Name: "مدير البيئة التجريبية", SystemUserLogin: "demo.admin", SystemUserPass: "", IsAdminUser: true, IsActive: true, IsLocked: false, IsDeleted: false },
    ...DEMO_ROLE_SEEDS.map(seed => ({
      SystemUserId: seed.id, Name: seed.name, SystemUserLogin: seed.login, SystemUserPass: "",
      IsAdminUser: false, IsActive: true, IsLocked: false, IsDeleted: false, Role: seed.role,
    } as SystemUser)),
    {
      SystemUserId: DEMO_MULTI_SITE.id, Name: DEMO_MULTI_SITE.name, SystemUserLogin: DEMO_MULTI_SITE.login, SystemUserPass: "",
      IsAdminUser: false, IsActive: true, IsLocked: false, IsDeleted: false, Role: DEMO_MULTI_SITE.role,
    } as SystemUser,
  ];

  // المدير يملك كل الشاشات؛ وكلُّ صفةٍ تحمل قالبها من `formIds` نفسه الذي يحكم الحقيقي.
  let legacy = 0;
  const formSecurity: FormSecurity[] = [
    ...formNames.map(form => ({ legacyId: ++legacy, SystemUserId: 1, FormNameId: form.FormNameId })),
    ...DEMO_ROLE_SEEDS.flatMap(seed => roleDefinition(seed.role).formIds.map(formId => ({ legacyId: ++legacy, SystemUserId: seed.id, FormNameId: formId }))),
    ...roleDefinition(DEMO_MULTI_SITE.role).formIds.map(formId => ({ legacyId: ++legacy, SystemUserId: DEMO_MULTI_SITE.id, FormNameId: formId })),
  ];

  // المدير على كل الأقسام؛ وكلُّ صفةٍ على نطاقها المشتقّ من `scopeMode`.
  let assignId = 0;
  const collegeUserAssign: AdCollegeUserAssign[] = [
    ...sections.map(section => ({ legacyId: ++assignId, SystemUserId: 1, AdCollegeId: section.AdCollegeId, AdSectionId: section.AdSectionId })),
    ...DEMO_ROLE_SEEDS.flatMap(seed => demoAssignsFor(seed.role).map(a => ({ legacyId: ++assignId, SystemUserId: seed.id, AdCollegeId: a.AdCollegeId, AdSectionId: a.AdSectionId }))),
    ...MULTI_SITE_SECTIONS.map(section => ({ legacyId: ++assignId, SystemUserId: DEMO_MULTI_SITE.id, AdCollegeId: section.AdCollegeId, AdSectionId: section.AdSectionId })),
  ];

  const rooms: AdRoom[] = DEMO_HALLS.map((hall, index) => ({ AdRoomId: index + 1, AdRoomCode: hall.code, AdRoomHall: hall.hall, AdRoomDescrip: hall.description }));
  const registry = demoLocationRegistry(schedules);

  const seeded = seedApprovalUniverse(schedules);

  return {
    users, formNames, formSecurity, collegeUserAssign,
    terms: demoTerms(new Date()),
    colleges: structuredClone(colleges), sections: structuredClone(sections), instructors, courses,
    schedules: [...schedules, ...history], rooms,
    auditLogs: [], scheduleVersions: seeded.versions, scheduleDrafts: [], scheduleOpenDecisions: [], clientTelemetry: [], scheduleComments: seeded.comments,
    studentNeeds: [], schedulePublications: [], scheduleConstraints: [], visitingRosters: [], departmentDelegates: [], departmentRooms: [], scheduleDecisionMemories: [],
    campusMobilityProfiles: [], scheduleShareLinks: [], hallBarterRequests: [], scheduleApprovals: seeded.approvals,
    locationBuildings: registry.buildings, locationRooms: registry.rooms,
  };
}
