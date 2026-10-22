import type {
  AdCollege, AdCollegeUserAssign, AdCourse, AdInstructor, AdRoom, AdSection,
  AdTerm, FSchedule, FormName, FormSecurity, ScheduleApproval, ScheduleComment,
  ScheduleVersion, SystemUser, MasterBuilding, MasterRoom, AuditLogEntry
} from "../types";
import { generateSyntheticCivilId } from "../utils/civilId";
import { AR, countOf } from "../utils/arabicCount";
import { roleDefinition, type AcademicRole } from "../utils/academicRoles";
import { TECHNOLOGY_EDUCATION_CURRICULA } from "../data/technologyEducationCurricula";

/*
 * ── الصندوق التجريبي: كليةٌ واحدة، وعدة أقسام لعرض استعارة القاعات ─────────
 *
 * يُعرض الديمو على الأقسام، وكلُّ ما يحتاجه العارض أن يجد «كلَّ شيء» في مكانٍ
 * واضح: كلية التربية الأساسية ← قسم تكنولوجيا التعليم ← 2026/2027. تظهر إلى
 * جانبه أقسامٌ تجريبية قليلة لشرح استعارة القاعات، من دون تشتيت بقية المشهد.
 * وحالاتُ دورة الاعتماد تتوزّع على
 * الفصول الثلاثة نفسها لتُرى كلُّها بلا تنقّل بين أقسام:
 *
 *   • الأول 2026/2027 (الجاري):  اعتُمد ثم أرجعه التسجيل بملاحظات مفتوحة
 *     وفيه تعارضان مقصودان — عملُ اللجنة ورئيس القسم. والعميدان يقرآن نسخته المعتمدة.
 *   • الثاني 2026/2027 (القادم): عند التسجيل في جولته الثانية، بأساسٍ محفوظ، وردٍّ
 *     من القسم، واستثناءٍ ممنوح، ومخالفاتٍ لائحية مقصودة — عملُ التسجيل.
 *   • الصيفي 2026/2027: قيد الإعداد، وطلبُ تمديدٍ ينتظر رئيسَ التسجيل.
 *
 * المقرراتُ مقرراتُ القسم الحقيقية من صحيفتيه (القديمة 2010/2011 والجديدة
 * 2026/2027)، والأساتذةُ أسماؤهم محايدةٌ بالترقيم فقط: الوضع التجريبي حسّاس.
 */

export const DEMO_COLLEGE_ID = 1;
export const DEMO_SECTION_ID = 1;
export const DEMO_TERM_CURRENT = 1;
export const DEMO_TERM_SECOND = 2;
export const DEMO_COLLEGE_NAME = "كلية التربية الأساسية";
export const DEMO_SECTION_NAME = "تكنولوجيا التعليم";

const colleges: AdCollege[] = [
  { AdCollegeId: DEMO_COLLEGE_ID, AdCollegeCode: "01", AdCollegeName: DEMO_COLLEGE_NAME },
];
const sections: AdSection[] = [
  { AdSectionId: DEMO_SECTION_ID, AdCollegeId: DEMO_COLLEGE_ID, AdSectionCode: "09", AdSectionName: DEMO_SECTION_NAME },
  { AdSectionId: 2, AdCollegeId: DEMO_COLLEGE_ID, AdSectionCode: "10", AdSectionName: "التربية الفنية (تجريبي)" },
  { AdSectionId: 3, AdCollegeId: DEMO_COLLEGE_ID, AdSectionCode: "11", AdSectionName: "التصميم التعليمي (تجريبي)" },
];

/* اثنا عشر أستاذاً للقسم، وأربعة منتدبون من أقسامٍ أخرى (13–16). */
const DEPARTMENT_INSTRUCTORS = 12;
const instructorNames = Array.from({ length: 16 }, (_, index) => `عضو هيئة تدريس تجريبي ${index + 1}`);
export const DEMO_VISITING_INSTRUCTOR_IDS = [13, 14, 15] as const;

export interface DemoSandboxState {
  users: SystemUser[]; formNames: FormName[]; formSecurity: FormSecurity[]; collegeUserAssign: AdCollegeUserAssign[];
  terms: AdTerm[]; colleges: AdCollege[]; sections: AdSection[]; instructors: AdInstructor[]; courses: AdCourse[];
  schedules: FSchedule[]; rooms: AdRoom[];
  auditLogs: any[]; scheduleVersions: any[]; scheduleDrafts: any[]; scheduleOpenDecisions: any[]; clientTelemetry: any[];
  scheduleComments: any[]; studentNeeds: any[]; schedulePublications: any[]; scheduleConstraints: any[]; visitingRosters: any[]; departmentDelegates: any[]; departmentRooms: any[];
  scheduleDecisionMemories: any[]; campusMobilityProfiles: any[]; scheduleShareLinks: any[]; hallBarterRequests: any[];
  /* دورة الاعتماد تعمل في البيئة التجريبية كما تعمل في الحقيقية: المدير يجرّب
     الدورة كاملةً — توقيعاً وإرسالاً وإرجاعاً وقبولاً — بحساباتٍ وهمية. */
  scheduleApprovals: any[];
  /* سجلُّ المباني والقاعات: بدونه لا يُحفظ موعدٌ في الصندوق (locationPreflight). */
  locationBuildings: MasterBuilding[]; locationRooms: MasterRoom[];
  registrationStats?: any[];
  /* النصاب التدريسي (ميزةٌ اختيارية مفعَّلةٌ في الصندوق لتُشرح): انظر DEMO_TEACHING_LOAD. */
  teachingLoadConfig?: any[];
}

function syntheticInstructors(): AdInstructor[] {
  return instructorNames.map((name, index) => ({
    AdInstructorId: index + 1,
    AdInstructorCivil: generateSyntheticCivilId(),
    AdInstructorName: name,
    AdInstructorMobile: `5000${String(index + 1).padStart(4, "0")}`,
  }));
}

/* مقرراتُ القسم من الصحيفتين (رمزها يبدأ بـ0109)، الجديدةُ أولاً فتغلب تسميتُها
   على القديمة إن اتفق الرمز. السعةُ تتدرّج مع المستوى، وعملياتُ الأربع ساعاتٍ أصغر. */
function syntheticCourses(): AdCourse[] {
  const seen = new Map<string, { code: string; name: string; credit: number; hours: number }>();
  for (const reference of [...TECHNOLOGY_EDUCATION_CURRICULA].sort((a, b) => (a.id === "new" ? -1 : 1) - (b.id === "new" ? -1 : 1))) {
    for (const group of reference.groups) for (const course of group.courses) {
      if (course.code.startsWith("0109") && !seen.has(course.code)) seen.set(course.code, course);
    }
  }
  return [...seen.values()].sort((a, b) => a.code.localeCompare(b.code)).map((course, index) => {
    const level = Number(course.code[4]) || 1;
    return {
      AdCourseId: index + 1, AdCollegeId: DEMO_COLLEGE_ID, AdSectionId: DEMO_SECTION_ID,
      CourseCode: course.code, CourseName: course.name, CourseCredit: course.credit, CourseHours: course.hours,
      MaxStudent: course.hours >= 4 ? 30 : Math.max(40, 70 - level * 5),
    };
  });
}

/* ── سجلُّ مبانٍ وقاعاتٍ للبيئة التجريبية ─────────────────────────────────
 *
 * كلُّ كتابةٍ على موعد تمرّ بـlocationPreflight وتطلب مبنىً وقاعةً من سجلّ
 * المباني الرسمي، فللصندوق سجلُّه الوهمي بالشكل الذي يقرؤه النظام في الحقيقي
 * (كودٌ رسميّ الشكل: فرعٌ من ثلاثة أرقام — 9xx لا يوجد في الجامعة —، حرفُ
 * موقع، رقمُ مبنى). مبنىً للقسم بقاعاته ومختبراته، وقاعتان كبيرتان مشتركتان. */
interface DemoBuildingSeed {
  prefix: string; siteLetter: string; number: string; collegeId: number; name: string;
  rooms: ReadonlyArray<readonly [hall: string, sectionIds: readonly number[], description: string]>;
}
const DEMO_BUILDINGS: readonly DemoBuildingSeed[] = [
  { prefix: "901", siteLetter: "A", number: "01", collegeId: DEMO_COLLEGE_ID, name: "مبنى تكنولوجيا التعليم", rooms: [
    ["101", [1], "قاعة ذكية 40 مقعدًا"], ["102", [1], "قاعة محاضرات 35 مقعدًا"], ["103", [1], "قاعة نقاش 30 مقعدًا"],
    ["104", [1], "قاعة محاضرات 45 مقعدًا"], ["L01", [1], "مختبر حاسب"], ["S01", [1], "استوديو إنتاج"],
    ["201", [2], "قاعة قسم التربية الفنية 35 مقعدًا"], ["202", [3], "قاعة قسم التصميم التعليمي 30 مقعدًا"],
  ] },
  { prefix: "901", siteLetter: "A", number: "02", collegeId: DEMO_COLLEGE_ID, name: "مبنى القاعات المركزية", rooms: [
    ["301", [1], "قاعة كبرى 120 مقعدًا"], ["302", [1], "قاعة كبرى 100 مقعد"],
  ] },
];
const demoBuildingCode = (b: DemoBuildingSeed) => `${b.prefix}${b.siteLetter}${b.number}`;
const demoBuildingId = (b: DemoBuildingSeed) => `building_${demoBuildingCode(b)}`;
const demoRoomId = (b: DemoBuildingSeed, hall: string) => `room_${demoBuildingCode(b)}_${hall}`;

interface DemoHall { buildingId: string; roomId: string; code: string; hall: string; sectionIds: readonly number[]; collegeId: number; description: string; }
const DEMO_HALLS: readonly DemoHall[] = DEMO_BUILDINGS.flatMap(b => b.rooms.map(([hall, sectionIds, description]) => ({
  buildingId: demoBuildingId(b), roomId: demoRoomId(b, hall), code: demoBuildingCode(b), hall, sectionIds, collegeId: b.collegeId, description,
})));
const hallsForSection = (sectionId: number) => DEMO_HALLS.filter(h => h.sectionIds.includes(sectionId));
const isLabHall = (hall: DemoHall) => /^(L|S)\d/.test(hall.hall);
const demoRoomType = (hall: DemoHall) => hall.hall.startsWith("L") ? "مختبر حاسوب" : hall.hall.startsWith("S") ? "استوديو إنتاج" : "تدريسية";
const demoRoomCapacity = (hall: DemoHall) => Number(hall.description.match(/(\d+)\s*مقعد/)?.[1] || 0) || null;
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
    roomType: demoRoomType(h), capacity: demoRoomCapacity(h),
    collegeIds: [h.collegeId], sectionIds: [...h.sectionIds], primarySectionIds: [...h.sectionIds],
    shared: h.sectionIds.length > 1, sharedConfidence: "CONFIRMED",
    historicalUsageCount: usage("roomId", h.roomId), firstTermId: 1, lastTermId: 1,
    confidence: "CONFIRMED", source: "DEMO_SANDBOX", adminVerified: true, evidence, auditHistory: [],
    createdAt: at, updatedAt: at, lastVerifiedAt: at,
  }));
  return { buildings, rooms };
}

/* ── جدولٌ ممكن بالبناء، وحالاتٌ مقصودةٌ مشروحة ──────────────────────────────
 *
 * كلُّ فصلٍ يُوزَّع بخوارزميةٍ طمّاعةٍ حتمية: لا يُسند صفّان القاعةَ ولا الأستاذَ في
 * الموعد نفسه، ولا يحمل أستاذٌ أكثر من أربع محاضراتٍ في اليوم. فالجدول الذي يُعرض
 * على الأقسام لا يناقض القواعد التي يشرحها. والحالاتُ المقصودة وحدها هي ما يُفسد
 * ذلك، وكلٌّ منها يحمل في تفصيله «حالة تجريبية مقصودة» وتفسيرها:
 *   • الفصل الأول: تعارضُ قاعةٍ وتعارضُ أستاذ — لاستعراض «معالجة التعارضات».
 *   • الفصل الثاني: مخالفتان لائحيتان (م.6/3 و م.7/5) — لاستعراض كشف المخالفات.
 */
export const DEMO_CONFLICT_SECTION_ID = DEMO_SECTION_ID;
export const DEMO_REGULATION_SECTION_ID = DEMO_SECTION_ID;
export const DEMO_REGULATION_RUN_INSTRUCTOR_ID = 3;
export const DEMO_CONFLICT_MARK = "حالة تجريبية مقصودة";

const TIMES = [["08:00", "09:15"], ["09:30", "10:45"], ["11:00", "12:15"], ["12:30", "13:45"], ["14:00", "15:15"], ["15:30", "16:45"]] as const;
const SUN_TUE = { fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false };
const MON_WED = { fsunday: false, fmonday: true, ftuesday: false, fwednesday: true, fthursday: false };
const THU_ONLY = { fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: true };
interface Slot { key: string; days: typeof SUN_TUE; start: string; end: string; day: string }
const SLOTS: Slot[] = [
  ...TIMES.map(([start, end], k) => ({ key: `A|${k}`, days: SUN_TUE, start, end, day: "A" })),
  ...TIMES.map(([start, end], k) => ({ key: `B|${k}`, days: MON_WED, start, end, day: "B" })),
  /* الخميس: بعد الظهر فقط، فيبقى صباحُه خالياً للمخالفات اللائحية المقصودة. */
  ...TIMES.slice(4).map(([start, end], k) => ({ key: `T|${k + 4}`, days: THU_ONLY, start, end, day: "T" })),
];

/** ما يُدرَّس في كل فصل: رمز المقرر وعدد شعبه. الصيفيّ مقرراتٌ قليلة كعادة الجامعات. */
const OFFERINGS: Record<number, ReadonlyArray<readonly [code: string, sections: number]>> = {
  /* القوائمُ مرتّبةٌ في دفعاتٍ من ستة مقرراتٍ يأخذها طالبٌ واحد معاً (COHORT_SIZE): لا يتداخل موعدا مقررين في دفعةٍ واحدة،
     فيجد الطالبُ جدولاً ممكناً بالمقررات التي يحقّ له. */
  /* الأول: مقرراتٌ من كل المراحل، فلكل طالبٍ ما يسجّله مما أنجز متطلّباتِه (مستجدٌّ ومتقدّم وقريبٌ من التخرج). */
  [DEMO_TERM_CURRENT]: [
    ["0109105", 2], ["0109108", 1], ["0109122", 1], ["0109123", 1], ["0109221", 1], ["0109224", 1],
    ["0109233", 2], ["0109226", 1], ["0109323", 1], ["0109325", 1], ["0109343", 1], ["0109112", 1],
    ["0109347", 1], ["0109401", 1], ["0109453", 1], ["0109454", 1], ["0109455", 1], ["0109459", 1],
    /* الصحيفة القديمة (طلبةُ 2010/2011 المنتقلون) */
    ["0109114", 1], ["0109125", 1], ["0109135", 1], ["0109217", 1], ["0109227", 1], ["0109235", 1],
    ["0109247", 1], ["0109344", 1], ["0109354", 1],
  ],
};

/* ── النصاب التدريسي في الديمو ────────────────────────────────────────────────
 *
 * أربعُ درجات، وإسنادٌ لبعض أعضاء القسم يُري الحالتين معاً على جدول الفصل الجاري:
 *   ضمن النصاب : (4) أستاذ مشارك 13 من 13 · (5) أستاذ مشارك 15 من 13+2 إضافية · (6) أستاذ 11 من 12 · (8) أستاذ مساعد 12 من 15
 *   تجاوز      : (3) أستاذ 13 من 12 ← ساعةٌ واحدة · (12) أستاذ مساعد 19 من 15 ← أربع ساعات
 *   دون الأدنى : (2) أستاذ مساعد 7 من 12 (للإعداد وحده؛ لا يُنبَّه به المخطّط)
 * الأرقامُ نتيجةُ جدولٍ مبنيٍّ بخوارزميةٍ حتمية، ويحرسها اختبارُ النصاب فلا تنحرف بصمت. */
export const DEMO_TEACHING_LOAD_RANKS = [
  { id: "rank-professor", name: "أستاذ", minHours: 9, maxHours: 12 },
  { id: "rank-associate", name: "أستاذ مشارك", minHours: 10, maxHours: 13 },
  { id: "rank-assistant", name: "أستاذ مساعد", minHours: 12, maxHours: 15 },
  { id: "rank-lecturer", name: "مدرّس", minHours: 12, maxHours: 15 },
] as const;
export const DEMO_TEACHING_LOAD_ASSIGNMENTS: Record<string, { rankId: string; extraHours?: number }> = {
  "2": { rankId: "rank-assistant" },
  "3": { rankId: "rank-professor" },
  "4": { rankId: "rank-associate" },
  "5": { rankId: "rank-associate", extraHours: 2 },
  "6": { rankId: "rank-professor" },
  "8": { rankId: "rank-assistant" },
  "12": { rankId: "rank-assistant" },
};

const COHORT_SIZE = 6;

/* ── تاريخٌ للديمو: أربعة فصولٍ سابقة ────────────────────────────────────────
 *
 * التنبّؤ وبصمة القسم يقرآن الفصولَ السابقة، ولا فصلَ سابقاً بلا تاريخ: فتظهر «تاريخ غير كافٍ».
 * فللقسم فصلان من كل سنة (الأول والثاني) لسنتين دراسيتين، بجداولَ تُبنى بالخوارزمية نفسها وبعدد
 * شعبٍ يتبدّل قليلاً بين فصلٍ وفصل — مقرراتٌ يتصاعد طلبُها، ومقرراتٌ ثابتة، ومقرراتٌ تتراجع —
 * وإحصاءِ «الباقي/الشاغر» لكل فصل. كلُّها مغلقةٌ للقراءة، بلا دورة اعتماد. */
export const DEMO_HISTORY_TERMS: ReadonlyArray<{ id: number; name: string; weeksBack: number }> = [
  { id: 3, name: "الفصل الأول 2024/2025", weeksBack: 104 },
  { id: 4, name: "الفصل الثاني 2024/2025", weeksBack: 82 },
  { id: 5, name: "الفصل الأول 2025/2026", weeksBack: 52 },
  { id: 6, name: "الفصل الثاني 2025/2026", weeksBack: 30 },
];
/** فرقُ عدد الشعب عن الفصل الجاري لكل مقرر (بالترتيب في قائمة الطرح)، فصلاً بعد فصل من الأقدم. */
const HISTORY_SHAPE: ReadonlyArray<readonly number[]> = [
  [0, 0, 1, 1], [1, 1, 1, 1], [0, 0, 0, 0], [-1, 0, 0, 0], [1, 1, 0, 0], [0, 0, 0, 0],
];
const historyOffer = (index: number): ReadonlyArray<readonly [code: string, sections: number]> =>
  (OFFERINGS[DEMO_TERM_CURRENT] || []).map(([code, count], order) =>
    [code, Math.max(1, count + HISTORY_SHAPE[order % HISTORY_SHAPE.length][index])] as const);
function placeTerm(termId: number, courses: AdCourse[], startId: number, offerOverride?: ReadonlyArray<readonly [code: string, sections: number]>): FSchedule[] {
  const rows: FSchedule[] = [];
  const halls = hallsForSection(DEMO_SECTION_ID);
  const busy = new Set<string>();
  const perDay = new Map<string, number>();
  const hallLoad = new Map<string, number>();
  const offer = offerOverride || OFFERINGS[termId] || [];
  const cohortSlots = new Map<number, Set<string>>();
  let index = 0;
  for (const [order, [code, count]] of offer.entries()) {
    const cohort = Math.floor(order / COHORT_SIZE);
    const used = cohortSlots.get(cohort) || new Set<string>();
    cohortSlots.set(cohort, used);
    const course = courses.find(row => row.CourseCode === code);
    if (!course) continue;
    const lab = course.CourseHours >= 4;
    const hallPool = lab ? [...halls.filter(isLabHall), ...halls.filter(h => !isLabHall(h))] : [...halls.filter(h => !isLabHall(h)), ...halls.filter(isLabHall)];
    for (let section = 1; section <= count; section += 1, index += 1) {
      const home = (course.AdCourseId * 2 + section) % DEPARTMENT_INSTRUCTORS;
      let placed: FSchedule | null = null;
      for (let s = 0; s < SLOTS.length && !placed; s += 1) {
        const slot = SLOTS[(index * 5 + s) % SLOTS.length];
        if (used.has(slot.key) && s < SLOTS.length - 1) continue;
        for (let h = 0; h < hallPool.length && !placed; h += 1) {
          const hall = hallPool[(index + h) % hallPool.length];
          if (busy.has(`${termId}|${slot.key}|hall|${hall.roomId}`)) continue;
          if ((hallLoad.get(hall.roomId) || 0) >= 5) continue; // لا قاعةٌ تحمل أكثر من خمس محاضرات في الفصل
          for (let i = 0; i < DEPARTMENT_INSTRUCTORS && !placed; i += 1) {
            const instructorId = ((home + i) % DEPARTMENT_INSTRUCTORS) + 1;
            if (busy.has(`${termId}|${slot.key}|ins|${instructorId}`)) continue;
            if ((perDay.get(`${termId}|${slot.day}|${instructorId}`) || 0) >= 2) continue;
            busy.add(`${termId}|${slot.key}|hall|${hall.roomId}`);
            busy.add(`${termId}|${slot.key}|ins|${instructorId}`);
            perDay.set(`${termId}|${slot.day}|${instructorId}`, (perDay.get(`${termId}|${slot.day}|${instructorId}`) || 0) + 1);
            used.add(slot.key);
            hallLoad.set(hall.roomId, (hallLoad.get(hall.roomId) || 0) + 1);
            placed = {
              id: startId + rows.length, AdCollegeId: DEMO_COLLEGE_ID, AdSectionId: DEMO_SECTION_ID, AdTermId: termId,
              AdCourseId: course.AdCourseId, AdCourseName: course.CourseName, SCode: String(section).padStart(2, "0"),
              AdInstructorId: instructorId, ...slot.days, fstarttime: slot.start, fendtime: slot.end,
              ...hallFields(hall), fdetail: "", rev: 0,
            } as FSchedule;
          }
        }
      }
      if (placed) rows.push(placed);
    }
  }
  return rows;
}

/** الفصل الأول: بعد الاعتماد عُدِّل جدولُه فصار فيه تعارضان مقصودان (قاعةٌ وأستاذ). */
function plantConflicts(rows: FSchedule[]): void {
  if (rows.length < 4) return;
  const anchor = rows[0];
  const sameSlot = (other: FSchedule) => other.fstarttime === anchor.fstarttime && Boolean(other.fsunday) === Boolean(anchor.fsunday)
    && Boolean(other.fmonday) === Boolean(anchor.fmonday) && Boolean(other.fthursday) === Boolean(anchor.fthursday);
  const atAnchor = rows.filter(sameSlot);
  /* التعارضان من صفين ينتقلان إلى موعد الأول: أستاذُ الأول يُزاحَم في قاعتين، وقاعةُ الأول يزاحمها صفٌّ لأستاذٍ حرٍّ في ذلك الموعد — فلا يتولّد تعارضٌ ثالثٌ بالصدفة. */
  const free = (row: FSchedule) => row !== anchor && !atAnchor.some(other => other !== row && other.AdInstructorId === row.AdInstructorId);
  const roomClash = rows.find(row => free(row) && row.AdInstructorId !== anchor.AdInstructorId);
  const teacherClash = rows.find(row => row !== anchor && row !== roomClash && !atAnchor.includes(row));
  if (!roomClash || !teacherClash) return;
  Object.assign(roomClash, {
    fsunday: anchor.fsunday, fmonday: anchor.fmonday, ftuesday: anchor.ftuesday, fwednesday: anchor.fwednesday, fthursday: anchor.fthursday,
    fstarttime: anchor.fstarttime, fendtime: anchor.fendtime,
    buildingId: anchor.buildingId, roomId: anchor.roomId, AdRoomCode: anchor.AdRoomCode, AdRoomHall: anchor.AdRoomHall,
    fdetail: `${DEMO_CONFLICT_MARK}: تعارض قاعة مع موعدٍ آخر في القسم نفسه — لاستعراض «معالجة التعارضات».`,
  });
  const freeHall = hallsForSection(DEMO_SECTION_ID).find(h => !rows.some(other => other !== teacherClash && sameSlot(other) && other.roomId === h.roomId));
  Object.assign(teacherClash, {
    fsunday: anchor.fsunday, fmonday: anchor.fmonday, ftuesday: anchor.ftuesday, fwednesday: anchor.fwednesday, fthursday: anchor.fthursday,
    fstarttime: anchor.fstarttime, fendtime: anchor.fendtime, AdInstructorId: anchor.AdInstructorId,
    ...(freeHall ? hallFields(freeHall) : {}),
    fdetail: `${DEMO_CONFLICT_MARK}: الأستاذ نفسه في قاعتين في الساعة نفسها — لاستعراض «معالجة التعارضات».`,
  });
}

/** الفصل الثاني: مخالفتان من قرار 1913/2016 — «مراجعة» لا «منع»، فيبقى الجدولُ المرسَل بلا مانع اعتماد. */
function plantRegulation(rows: FSchedule[], courses: AdCourse[], termId: number, startId: number): FSchedule[] {
  const halls = hallsForSection(DEMO_SECTION_ID).filter(h => !isLabHall(h));
  const own = [...new Set(rows.map(row => row.AdCourseId))].map(id => courses.find(c => c.AdCourseId === id)!).filter(Boolean);
  if (own.length < 2 || halls.length < 3) return [];
  const RUN_NOTE = `${DEMO_CONFLICT_MARK}: أربع محاضرات متتالية للأستاذ نفسه (م.6/3 — الحد ثلاث) — لاستعراض كشف المخالفات اللائحية.`;
  const SAME_HOUR_NOTE = `${DEMO_CONFLICT_MARK}: شعبتان من المقرر نفسه في الساعة نفسها (م.7/5) — لاستعراض كشف المخالفات اللائحية.`;
  const planned: Array<[AdCourse, string, number, string, string, DemoHall, string]> = [
    ...[["08:00", "08:50"], ["09:00", "09:50"], ["10:00", "10:50"], ["11:00", "11:50"]].map(([start, end], k) =>
      [own[k % own.length], "11", DEMO_REGULATION_RUN_INSTRUCTOR_ID, start, end, halls[k % 2], RUN_NOTE] as [AdCourse, string, number, string, string, DemoHall, string]),
    [own[0], "12", 4, "12:00", "12:50", halls[1], SAME_HOUR_NOTE],
    [own[0], "13", 1, "12:00", "12:50", halls[2], SAME_HOUR_NOTE],
  ];
  return planned.map(([course, sCode, instructorId, start, end, hall, note], k) => ({
    id: startId + k, AdCollegeId: DEMO_COLLEGE_ID, AdSectionId: DEMO_SECTION_ID, AdTermId: termId,
    AdCourseId: course.AdCourseId, AdCourseName: course.CourseName, SCode: sCode, AdInstructorId: instructorId,
    ...THU_ONLY, fstarttime: start, fendtime: end, ...hallFields(hall), fdetail: note, rev: 0,
  } as FSchedule));
}

/* ── فصولٌ بأسماء 2026/2027 وتواريخَ تتبع اليوم ───────────────────────────────
 *
 * الأسماءُ ثابتة (السنةُ الدراسية الواحدة التي يُعرض عليها الديمو)، والتواريخُ تتبع
 * يومَ الدخول: فالأول جارٍ أيّاً كان اليوم (بدأ قبل ثلاثة أسابيع) ولا يقول الاستبيانُ
 * يوماً «انتهى هذا الفصل»، والثاني والصيفيُّ قادمان في مرحلة التخطيط. */
function demoTerms(now: Date): AdTerm[] {
  const day = 86_400_000;
  const start = new Date(now.getTime() - 21 * day);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay()); // الأحد
  return [
    { AdTermId: DEMO_TERM_CURRENT, AdTermName: "الفصل الأول 2026/2027", AdTermStart: start.toISOString().slice(0, 10), AdTermWeeks: 15, AdTermSubmissionDeadline: new Date(now.getTime() + 7 * day).toISOString().slice(0, 10) },
    { AdTermId: DEMO_TERM_SECOND, AdTermName: "الفصل الثاني 2026/2027", AdTermStart: new Date(now.getTime() + 110 * day).toISOString().slice(0, 10), AdTermWeeks: 15, AdTermSubmissionDeadline: new Date(now.getTime() + 125 * day).toISOString().slice(0, 10) },
    /* التاريخُ بعد الجاري والقادم في القائمة: ما يُفتح افتراضياً هو الجاري. */
    ...DEMO_HISTORY_TERMS.map(term => ({
      AdTermId: term.id, AdTermName: term.name, AdTermStart: new Date(start.getTime() - term.weeksBack * 7 * day).toISOString().slice(0, 10),
      AdTermWeeks: 15, AdTermClosed: true,
    } as AdTerm)),
  ];
}

/*
 * ── حسابٌ لكل صفة داخل البيئة التجريبية ─────────────────────────────────────
 *
 * البيئة التجريبية ليست جلسة هوية: لا حساب ولا خادم. وعرضُ النظام على الأقسام
 * يقتضي أن تُرى شاشةُ كل صفة. فيُبدّل شريطُ الديمو الصفةَ المعروضة، وهذا التبديل
 * لا يرفع صلاحية: هو اختيار أيّ حسابٍ من حسابات الصندوق المعزول يُعرض، والنطاق
 * يُشتقّ من `scopeMode` نفسه الذي يحكم الحساب الحقيقي.
 */
const DEMO_MASTER_STAGE = { collegeId: DEMO_COLLEGE_ID, sectionId: DEMO_SECTION_ID } as const;

interface DemoRoleSeed { role: AcademicRole; id: number; name: string; login: string; }

/** حسابٌ تجريبي ← أستاذٌ في سجلّ الأساتذة. */
const DEMO_USER_INSTRUCTOR_LINKS: Record<number, number> = { 15: 1, 16: 2, 17: 3 };

const DEMO_ROLE_SEEDS: DemoRoleSeed[] = [
  { role: "dean",           id: 10, name: "د. عميد كلية التربية الأساسية",    login: "demo.dean" },
  { role: "viceDean",       id: 11, name: "د. العميد المساعد الأكاديمي",      login: "demo.vicedean" },
  { role: "registrarDean",  id: 12, name: "د. عميد التسجيل",                 login: "demo.regdean" },
  { role: "registrarHead",  id: 13, name: "أ. رئيس التسجيل",                 login: "demo.reghead" },
  { role: "registrarStaff", id: 14, name: "أ. موظف التسجيل",                 login: "demo.regstaff" },
  { role: "departmentHead", id: 15, name: "د. رئيس قسم تكنولوجيا التعليم",    login: "demo.dept" },
  { role: "advisor",        id: 19, name: "أ. مرشد قسم تكنولوجيا التعليم",     login: "demo.advisor" },
  { role: "committeeChair", id: 16, name: "د. رئيس لجنة جدول تكنولوجيا التعليم", login: "demo.committee" },
  { role: "standard",       id: 17, name: "أ. مستخدم عادي",                  login: "demo.standard" },
];
/* حسابان إضافيان لعرض الديمو على الإدارة العامة: «المسجل العام» بصلاحيات عميد التسجيل نفسها،
   و«الإرشاد العام» بصفة المرشد. وفي الصندوق قسمٌ واحدٌ ذو بيانات، فنطاقاهما نطاقُ صفتيهما نفسُه؛ وصفتاهما من الصفات القائمة، فلا قاعدةَ جديدة
   ولا شاشة؛ ومفتاحُ الشريط وحدَه يميّزهما، لأن التبديل يتمّ بمفتاح الصفة. */
interface DemoExtraSeed extends DemoRoleSeed { key: string; label: string }
const DEMO_EXTRA_SEEDS: DemoExtraSeed[] = [
  { key: "registrarGeneral", label: "المسجل العام", role: "registrarDean", id: 20, name: "د. المسجل العام", login: "demo.regeneral" },
  { key: "advisorGeneral", label: "الإرشاد العام", role: "advisor", id: 21, name: "أ. الإرشاد العام", login: "demo.advisorgeneral" },
];
const DEMO_ACCOUNT_SEEDS: DemoRoleSeed[] = [...DEMO_ROLE_SEEDS, ...DEMO_EXTRA_SEEDS];
const COMMITTEE_NAME = "د. رئيس لجنة جدول تكنولوجيا التعليم";
const HEAD_NAME = "د. رئيس قسم تكنولوجيا التعليم";

/** كل ما يبدّل إليه شريطُ الديمو: الصفات بالترتيب الذي تُعرض به. */
export const DEMO_SWITCH_ACCOUNTS: Array<{ role: string; label: string; SystemUserId: number }> = [];

/** مفتاحُ الشريط للحساب المعروض الآن. */
export function demoActiveRoleKey(userId: number, role: unknown): string {
  return DEMO_EXTRA_SEEDS.find(seed => seed.id === Number(userId))?.key || String(role || "");
}

export const DEMO_ROLE_ACCOUNTS: Array<{ role: AcademicRole; label: string; SystemUserId: number }> =
  DEMO_ROLE_SEEDS.map(seed => ({ role: seed.role, label: roleDefinition(seed.role).label, SystemUserId: seed.id }));
DEMO_SWITCH_ACCOUNTS.push(...DEMO_ROLE_ACCOUNTS, ...DEMO_EXTRA_SEEDS.map(seed => ({ role: seed.key, label: seed.label, SystemUserId: seed.id })));

function demoAssignsFor(role: AcademicRole): Array<{ AdCollegeId: number; AdSectionId: number }> {
  const mode = roleDefinition(role).scopeMode;
  switch (mode) {
    case "allColleges": return colleges.map(c => ({ AdCollegeId: c.AdCollegeId, AdSectionId: 0 }));
    case "college": return [{ AdCollegeId: DEMO_MASTER_STAGE.collegeId, AdSectionId: 0 }];
    // النطاق اليدويّ صفوفٌ بأقسامٍ حقيقية — الصفرُ لا يُفسَّر «كليةً كاملة» إلا للصفات الكلّية.
    case "manual":
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
 * لكل فصلٍ حالةٌ من الدورة، ولكل صفةٍ فيها ما تفعله من أول نظرة (انظر رأس الملف).
 * والإحصاءُ والملاحظاتُ والنسخُ وسجلُّ العمليات مبذورةٌ بالشكل الذي يكتبه الخادم.
 */
function seedApprovalUniverse(schedules: FSchedule[], acceptedFirst: FSchedule[]): {
  approvals: ScheduleApproval[]; versions: ScheduleVersion[]; comments: ScheduleComment[]; audit: AuditLogEntry[];
} {
  const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  const rowsOf = (termId: number) => schedules.filter(r => Number(r.AdTermId) === termId);
  const nextId = (() => { let top = Math.max(0, ...schedules.map(r => Number(r.id))); return () => ++top; })();
  const key = (termId: number) => `${DEMO_COLLEGE_ID}:${DEMO_SECTION_ID}:${termId}`;

  const versions: ScheduleVersion[] = [];
  const comments: ScheduleComment[] = [];
  const approvals: ScheduleApproval[] = [];
  const audit: AuditLogEntry[] = [];
  const logged = (hoursAgo: number, who: [number, string], method: string, path: string, action: string, changes: string, status = 200) => {
    const pieces = path.replace(/^\/api\//, "").split("/").filter(Boolean);
    audit.push({
      id: `demo-audit-${audit.length + 1}`, timestamp: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
      SystemUserId: who[0], userName: who[1], method, path, action, entity: pieces[0] || "system",
      entityId: pieces.length > 1 ? pieces[pieces.length - 1] : undefined, changes, status,
    });
  };
  const COMMITTEE: [number, string] = [16, COMMITTEE_NAME], HEAD: [number, string] = [15, HEAD_NAME];
  const REG_HEAD: [number, string] = [13, "أ. رئيس التسجيل"], REG_STAFF: [number, string] = [14, "أ. موظف التسجيل"];

  /* نسخةُ ما رآه التسجيل: خانتان تغيّرتا بعدها (قاعةٌ ووقت)، وصفٌّ أُضيف بعدها،
     وصفٌّ كان فيها وحُذف — فيُقرأ التقريرُ «معدّلاً ومضافاً ومحذوفاً» لا جدولاً جديداً. */
  function seenBaseline(stage: FSchedule[], termId: number): FSchedule[] {
    const baseline = structuredClone(stage);
    const movedFrom = hallsForSection(DEMO_SECTION_ID).find(h => h.roomId !== baseline[0].roomId)!;
    Object.assign(baseline[0], hallFields(movedFrom));
    baseline[1].fstarttime = "07:00"; baseline[1].fendtime = "08:15";
    baseline.pop();
    baseline.push({
      ...structuredClone(stage[0]), id: nextId(), AdTermId: termId,
      AdCourseName: "مادةٌ أُلغيت بعد المراجعة", SCode: "09",
      fstarttime: "16:00", fendtime: "17:15", ...hallFields(hallsForSection(DEMO_SECTION_ID)[0]),
    });
    return baseline;
  }

  // ── الفصل الأول: قُبل في الجولة الأولى، ثم أرجعه التسجيل بملاحظاتٍ مفتوحة في جولة تعديل.
  const t1 = rowsOf(DEMO_TERM_CURRENT);
  if (t1.length >= 6) {
    const finalId = "demo-ver-t1-accepted", seenId = "demo-ver-t1-round1";
    const finalRows = structuredClone(acceptedFirst);
    versions.push(
      {
        id: seenId, scopeKey: key(1), createdAt: iso(24), rowCount: finalRows.length, SystemUserId: 16, userName: COMMITTEE_NAME,
        AdCollegeId: DEMO_COLLEGE_ID, AdSectionId: DEMO_SECTION_ID, AdTermId: DEMO_TERM_CURRENT,
        label: "نسخة الجولة الأولى — كما رآها التسجيل", source: "manual", rows: seenBaseline(finalRows, DEMO_TERM_CURRENT),
      },
      {
        id: finalId, scopeKey: key(1), createdAt: iso(18), rowCount: finalRows.length, SystemUserId: 16, userName: COMMITTEE_NAME,
        AdCollegeId: DEMO_COLLEGE_ID, AdSectionId: DEMO_SECTION_ID, AdTermId: DEMO_TERM_CURRENT,
        label: "النسخة المقبولة — الجولة الثانية", source: "manual", rows: finalRows,
      },
    );
    comments.push(
      {
        id: "demo-note-t1-1", createdAt: iso(3), SystemUserId: 13, userName: "أ. رئيس التسجيل",
        scheduleId: Number(t1[4].id), AdCollegeId: DEMO_COLLEGE_ID, AdSectionId: DEMO_SECTION_ID, AdTermId: DEMO_TERM_CURRENT,
        text: "سعة القاعة أقل من عدد المسجّلين المتوقّع — يرجى مراجعتها.",
        resolved: false, field: "room", valueAtNote: noteValue(t1[4], "room"), round: 3, origin: "registrar",
      },
      {
        id: "demo-note-t1-2", createdAt: iso(3), SystemUserId: 13, userName: "أ. رئيس التسجيل",
        scheduleId: Number(t1[5].id), AdCollegeId: DEMO_COLLEGE_ID, AdSectionId: DEMO_SECTION_ID, AdTermId: DEMO_TERM_CURRENT,
        text: "تأكّدوا من إسناد الأستاذ — نصابه هذا الفصل يتجاوز المعتاد.",
        resolved: false, field: "instructor", valueAtNote: noteValue(t1[5], "instructor"), round: 3, origin: "registrar",
      },
      // ملاحظةٌ داخلية من رئيس القسم — لا تمنع الإرسال، تُقرأ فقط.
      {
        id: "demo-note-t1-dept", createdAt: iso(2), SystemUserId: 15, userName: HEAD_NAME,
        scheduleId: Number(t1[1].id), AdCollegeId: DEMO_COLLEGE_ID, AdSectionId: DEMO_SECTION_ID, AdTermId: DEMO_TERM_CURRENT,
        text: "ملاحظة داخلية: راجعوا سعة القاعة قبل الاعتماد.",
        resolved: false, field: "room", valueAtNote: noteValue(t1[1], "room"), round: 3, origin: "department",
      },
      // ملاحظةٌ من الجولة الأولى عولجت وأُغلقت بالقبول — يبقى سجلُّها للقراءة.
      {
        id: "demo-note-t1-old", createdAt: iso(22), SystemUserId: 13, userName: "أ. رئيس التسجيل",
        scheduleId: Number(t1[0].id), AdCollegeId: DEMO_COLLEGE_ID, AdSectionId: DEMO_SECTION_ID, AdTermId: DEMO_TERM_CURRENT,
        text: "يُفضّل تقديم الموعد نصف ساعة.",
        resolved: true, field: "time", valueAtNote: noteValue(t1[0], "time"), round: 1, origin: "registrar",
        rebuttal: { text: "الموعد مثبّت بطلب القسم لتوافقه مع مختبرٍ مشترك.", at: iso(21), SystemUserId: 16, userName: COMMITTEE_NAME },
        rebuttalVerdict: "accepted", resolution: "rebuttal-accepted",
      },
    );
    approvals.push({
      id: key(1), scopeKey: key(1), AdCollegeId: DEMO_COLLEGE_ID, AdSectionId: DEMO_SECTION_ID, AdTermId: DEMO_TERM_CURRENT,
      status: "returned", currentRound: 3,
      signatures: [
        { stage: "committee", SystemUserId: 16, userName: COMMITTEE_NAME, roleLabel: "رئيس لجنة الجدول", at: iso(18), versionId: finalId, rowCount: finalRows.length, regulationNoticeCount: 0, verifyCode: "CMT-2481" },
        { stage: "head", SystemUserId: 15, userName: HEAD_NAME, roleLabel: "رئيس القسم العلمي", at: iso(18), versionId: finalId, rowCount: finalRows.length, regulationNoticeCount: 0, verifyCode: "HEAD-7193" },
      ],
      rounds: [
        { number: 1, submittedAt: iso(24), submittedBy: COMMITTEE_NAME, returnedAt: iso(22), returnedBy: "أ. رئيس التسجيل", returnedNoteCount: 1, changedRowCount: 3, reviewedVersionId: seenId },
        { number: 2, submittedAt: iso(18), submittedBy: COMMITTEE_NAME, acceptedAt: iso(16), acceptedBy: "أ. رئيس التسجيل", acceptedVersionId: finalId },
        { number: 3, amendment: true, baselineVersionId: finalId, returnedAt: iso(3), returnedBy: "أ. رئيس التسجيل", returnedNoteCount: 2 },
      ],
      pendingAdditions: [], updatedAt: iso(3),
    });
    logged(24 * 24, COMMITTEE, "POST", "/api/approvals/sign", "إضافة", `توقيع اللجنة — تكنولوجيا التعليم · الجولة 1 · ${countOf(finalRows.length, AR.appointment)}`);
    logged(24 * 22, REG_HEAD, "POST", "/api/approvals/return", "إضافة", "إرجاع تكنولوجيا التعليم بملاحظة: تقديم الموعد — الجولة 1");
    logged(24 * 18, HEAD, "POST", "/api/approvals/sign", "إضافة", "توقيع رئيس القسم — أُرسل إلى التسجيل · الجولة 2");
    logged(24 * 16, REG_HEAD, "POST", "/api/approvals/accept", "إضافة", "اعتماد جدول تكنولوجيا التعليم — الجولة 2");
    logged(24 * 3, REG_HEAD, "POST", "/api/approvals/return", "إضافة", "إرجاع الجدول المعتمد بملاحظتين: سعة القاعة، ونصاب الأستاذ");
    logged(30, COMMITTEE, "PUT", `/api/schedules/${t1[0].id}`, "تعديل", `القاعة ${t1[0].AdRoomCode}/${t1[0].AdRoomHall}`);
  }

  /* ── مواعيد التسليم: طلبُ تمديدٍ من القسم ينتظر رئيسَ التسجيل، فيفتح لوحته على ما يفعله: يمنح أو يرفض. */
  const first = approvals.find(row => row.scopeKey === key(1));
  if (first) {
    /* استثناءٌ مُنح سابقاً (3 أيام)، ثم طلبٌ جديدٌ بخمسة أيام ينتظر القرار. */
    const termDeadline = demoTerms(new Date())[0].AdTermSubmissionDeadline!;
    first.extensionUntil = new Date(Date.parse(`${termDeadline}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10);
    first.extensionReason = "تأخّر اعتماد المنتدبين من الكلية";
    first.extensionBy = "أ. رئيس التسجيل";
    first.extensionAt = iso(5);
    first.extensionRequest = { by: COMMITTEE_NAME, role: "committeeChair", at: iso(1), reason: "انتظار توزيع القاعات الجديدة للمبنى", days: 5 };
    first.events = [{ at: iso(1), by: COMMITTEE_NAME, role: "committeeChair", action: "extension-request", round: 3, detail: "5 أيام — انتظار توزيع القاعات الجديدة للمبنى" }];
  }

  logged(26, REG_STAFF, "POST", "/api/auth/login", "تسجيل دخول", "", 200);
  logged(5, [17, "أ. مستخدم عادي"], "PUT", `/api/schedules/${schedules.find(r => Number(r.AdTermId) === DEMO_TERM_CURRENT)?.id ?? 1}`, "تعديل — مرفوض (خارج الصلاحية)", "", 403);
  logged(3, REG_STAFF, "POST", "/api/auth/login", "تسجيل دخول", "", 200);
  audit.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return { approvals, versions, comments, audit };
}


/*
 * ── مركز الذكاء: قيودٌ وذاكرةُ قراراتٍ وقاعاتُ القسم وتنقّلُ الحرم ─────────────
 *
 * شاشاتُ «الجداول ومركز الذكاء» تُفتح على قيودٍ فعّالة وأخرى معطَّلة، وقراراتٍ سابقةٍ
 * (خيارٌ رُفض، وملاحظةٌ قُبلت، وقرارُ اجتماع)، ودليلِ قاعات القسم، ومسافاتِ التنقّل
 * بين المباني. كلُّها مشتقّةٌ من صفوف الفصل الأول الفعلية، فلا قيدَ يخالفه جدولٌ ساكن
 * إلا ما أُريد مخالفاً: القيدُ المعطَّل.
 */
function seedIntelligenceExtras(schedules: FSchedule[], courses: AdCourse[]) {
  const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  const rows = schedules.filter(row => Number(row.AdTermId) === DEMO_TERM_CURRENT && !String(row.fdetail || "").includes(DEMO_CONFLICT_MARK));
  const scopeKey = `${DEMO_COLLEGE_ID}:${DEMO_SECTION_ID}:${DEMO_TERM_CURRENT}`;
  const base = { scopeKey, createdAt: iso(14), updatedAt: iso(14), SystemUserId: 16, userName: COMMITTEE_NAME, AdCollegeId: DEMO_COLLEGE_ID, AdSectionId: DEMO_SECTION_ID, AdTermId: DEMO_TERM_CURRENT };
  const DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
  const nameOf = (id: number) => instructorNames[id - 1] || `أستاذ ${id}`;
  const constraints: any[] = [];
  const teacher = rows[4]?.AdInstructorId;
  if (teacher) {
    const free = DAYS.find(day => !rows.some(row => row.AdInstructorId === teacher && (row as any)[day]));
    const latest = rows.filter(row => row.AdInstructorId === teacher).map(row => row.fendtime).sort().pop() || "16:45";
    constraints.push({ ...base, id: "demo-constraint-latest", type: "instructor_latest_end", label: `${nameOf(teacher)} لا يتأخّر عن ${latest}`, enabled: true, AdInstructorId: teacher, time: latest });
    if (free) constraints.push({ ...base, id: "demo-constraint-dayoff", type: "instructor_day_off", label: `${nameOf(teacher)} إجازته يوم ${{ fsunday: "الأحد", fmonday: "الاثنين", ftuesday: "الثلاثاء", fwednesday: "الأربعاء", fthursday: "الخميس" }[free]}`, enabled: true, AdInstructorId: teacher, day: free });
  }
  const sound = rows.find(row => courses.find(c => c.AdCourseId === row.AdCourseId)?.CourseCode === "0109220");
  if (sound) constraints.push({ ...base, id: "demo-constraint-room", type: "course_room", label: `«${sound.AdCourseName}» في ${sound.AdRoomCode}/${sound.AdRoomHall}`, enabled: true, AdCourseId: sound.AdCourseId, buildingId: sound.buildingId, roomId: sound.roomId, roomCode: sound.AdRoomCode, roomHall: sound.AdRoomHall });
  constraints.push({ ...base, id: "demo-constraint-gap", type: "max_instructor_gap", label: "ألّا تزيد فجوة الأستاذ بين محاضرتين على ساعتين", enabled: true, maxMinutes: 120 });
  constraints.push({ ...base, id: "demo-constraint-off", type: "department_day_off", label: "القسم بلا محاضرات يوم الخميس (قيدٌ معطَّل للتجربة)", enabled: false, day: "fthursday" });

  const memoryRow = (at: number) => rows[at];
  const memories = [
    { id: "demo-memory-1", createdAt: iso(12), SystemUserId: 16, userName: COMMITTEE_NAME, AdCollegeId: DEMO_COLLEGE_ID, AdSectionId: DEMO_SECTION_ID, AdTermId: DEMO_TERM_CURRENT,
      AdCourseId: memoryRow(2)?.AdCourseId, SCode: memoryRow(2)?.SCode, scheduleId: memoryRow(2)?.id, optionSignature: "demo-option-a", kind: "rejected-option", reason: "الموعد المقترح يخلّ بساعات الأستاذ المكتبية." },
    { id: "demo-memory-2", createdAt: iso(9), SystemUserId: 15, userName: HEAD_NAME, AdCollegeId: DEMO_COLLEGE_ID, AdSectionId: DEMO_SECTION_ID, AdTermId: DEMO_TERM_CURRENT,
      AdCourseId: memoryRow(5)?.AdCourseId, SCode: memoryRow(5)?.SCode, scheduleId: memoryRow(5)?.id, kind: "accepted-note", reason: "قُبلت القاعة الصغيرة هذا الفصل لأن الشعبة لا تتجاوز عشرين طالباً." },
    { id: "demo-memory-3", createdAt: iso(6), SystemUserId: 16, userName: COMMITTEE_NAME, AdCollegeId: DEMO_COLLEGE_ID, AdSectionId: DEMO_SECTION_ID, AdTermId: DEMO_TERM_CURRENT,
      kind: "meeting-decision", reason: "اجتماع القسم: تُحجز مختبرات الإنتاج صباحاً، وتبقى القاعات الكبرى للمقررات المشتركة." },
  ];
  const departmentRooms = [{
    id: `${DEMO_COLLEGE_ID}:${DEMO_SECTION_ID}`, scopeKey: `${DEMO_COLLEGE_ID}:${DEMO_SECTION_ID}`, collegeId: DEMO_COLLEGE_ID, sectionId: DEMO_SECTION_ID,
    rooms: DEMO_HALLS.map(hall => ({ building: hall.code, hall: hall.hall })), updatedAt: iso(20),
  }];
  const [first, second] = DEMO_BUILDINGS.map(demoBuildingCode);
  const mobility = [{ AdCollegeId: DEMO_COLLEGE_ID, defaultTravelMinutes: 10, sameBuildingMinutes: 5, pairs: [{ fromBuilding: first, toBuilding: second, minutes: 8 }], updatedAt: iso(20), updatedBy: HEAD_NAME }];
  return { constraints, memories, departmentRooms, mobility };
}

export function createDemoSandboxState(): DemoSandboxState {
  const instructors = syntheticInstructors();
  const courses = syntheticCourses();

  /* الفصل الأول يُبنى نظيفاً، وتُحفظ صورتُه — هي ما قُبل — ثم تُزرع فيه التعارضات
     المقصودة (تعديلٌ بعد القبول). والثاني فيه المخالفات اللائحية. والصيفيُّ نظيف. */
  const first = placeTerm(DEMO_TERM_CURRENT, courses, 1);
  /* مشهدٌ ترويجيٌّ واحد ومقصود: مقررٌ يفضّل مختبر الحاسوب، وقاعته الحالية
     تدريسيةٌ أصغر من تقدير سعة الشعبة. يرى المخطط التحذير والبدائل في الجدول؛
     لا تُعرض أرقام السعة في الواجهات العامة. */
  const demoFitCourse=first.map(row=>courses.find(course=>Number(course.AdCourseId)===Number(row.AdCourseId))).find((course):course is AdCourse=>Boolean(course&&Number(course.MaxStudent)>40&&OFFERINGS[DEMO_TERM_CURRENT]?.find(([code])=>code===course.CourseCode)?.[1]===1));
  const demoFitRow=demoFitCourse?first.find(row=>Number(row.AdCourseId)===Number(demoFitCourse.AdCourseId)):undefined;
  if(demoFitCourse&&demoFitRow){
    demoFitCourse.CourseRoomType="مختبر حاسوب";
    const occupied=(hall:DemoHall)=>first.some(row=>row!==demoFitRow&&row.roomId===hall.roomId&&["fsunday","fmonday","ftuesday","fwednesday","fthursday"].some(day=>Boolean((row as any)[day])&&Boolean((demoFitRow as any)[day])&&Number(row.fstarttime.replace(":",""))<Number(demoFitRow.fendtime.replace(":",""))&&Number(row.fendtime.replace(":",""))>Number(demoFitRow.fstarttime.replace(":",""))));
    const hall=DEMO_HALLS.find(item=>demoRoomType(item)==="تدريسية"&&Number(demoRoomCapacity(item)||0)<Number(demoFitCourse.MaxStudent)&&!occupied(item));
    if(hall)Object.assign(demoFitRow,hallFields(hall));
  }
  const acceptedFirst = structuredClone(first);
  plantConflicts(first);
  /* مخالفتان لائحيتان تُضافان بعد القبول (مراجعةٌ لا منع)، فيُقرأ تقريرُ الجدول بكشفهما. */
  first.push(...plantRegulation(first, courses, DEMO_TERM_CURRENT, first.length + 1));
  /* المنتدبون يدرّسون شعباً فعلية (لا يزاحمون أحداً: لا يظهرون في الإسناد الطمّاع). */
  for (const [rows, picks] of [[first, [[6, 13], [9, 14], [12, 15]]]] as const) {
    for (const [at, instructorId] of picks) if (rows[at]) rows[at].AdInstructorId = instructorId;
  }
  /* لقطةٌ ترويجيةٌ لتغييرات الجدول: شعبتان من مقررين مختلفين حُذفتا بعد
     اعتماد النسخة الأولى، فتظهران بوضوح في تقرير الديمو كمقررات محذوفة. */
  const demoDeletedIds = new Set<number>();
  const deletedCourseIds = new Set<number>();
  /* لا نحذف صفوف المرساة التي صنعتها plantConflicts ولا الصفوف المتعارضة معها؛
     فهي مشهد مستقل لشرح معالجة التعارضات في الديمو. */
  const conflictRows = first.filter(row => String(row.fdetail || "").includes(DEMO_CONFLICT_MARK));
  const protectedConflictIds = new Set<number>();
  for (const conflict of conflictRows) {
    for (const row of first) {
      const sameSlot = row.fstarttime === conflict.fstarttime
        && Boolean(row.fsunday) === Boolean(conflict.fsunday)
        && Boolean(row.fmonday) === Boolean(conflict.fmonday)
        && Boolean(row.ftuesday) === Boolean(conflict.ftuesday)
        && Boolean(row.fwednesday) === Boolean(conflict.fwednesday)
        && Boolean(row.fthursday) === Boolean(conflict.fthursday);
      if (sameSlot && (row.roomId === conflict.roomId || row.AdInstructorId === conflict.AdInstructorId)) {
        protectedConflictIds.add(Number(row.id));
      }
    }
  }
  for (const baselineRow of acceptedFirst) {
    const currentRow = first.find(row => Number(row.id) === Number(baselineRow.id));
    const courseId = Number(baselineRow.AdCourseId);
    if (!currentRow || protectedConflictIds.has(Number(currentRow.id)) || deletedCourseIds.has(courseId)) continue;
    demoDeletedIds.add(Number(currentRow.id));
    deletedCourseIds.add(courseId);
    if (demoDeletedIds.size === 2) break;
  }
  for (let index = first.length - 1; index >= 0; index -= 1) {
    if (demoDeletedIds.has(Number(first[index].id))) first.splice(index, 1);
  }
  /* فصولُ التاريخ: جداولُها مبنيةٌ نظيفة، تُقرأ ولا تُعدَّل. */
  const history = DEMO_HISTORY_TERMS.flatMap((term, index) => placeTerm(term.id, courses, 10_000 + term.id * 1_000, historyOffer(index)));
  const schedules = [...first, ...history];

  /* أسماءُ الشاشات كما في academicRoles.ts (2…17). الرقمان 1 و13 غير موصوفين هناك فسُمّيا بما اختاره المالك (تجريبي فقط). */
  const FORM_LABELS = ["الصفحة الرئيسية", "الكليات", "الأساتذة", "الأقسام", "الفصول", "المقررات", "الجداول ومركز الذكاء", "استعلام الأساتذة", "استعلام القاعات", "استعلام الأوقات", "المستخدمون", "الصلاحيات", "لوحة المؤشرات", "تقرير القسم", "النطاقات", "القاعات والأوقات", "البحث المتقدم"];
  const formNames: FormName[] = FORM_LABELS.map((label, index) => ({ FormNameId: index + 1, FormName: label }));

  const users: SystemUser[] = [
    { SystemUserId: 1, Name: "مدير البيئة التجريبية", SystemUserLogin: "demo.admin", SystemUserPass: "", IsAdminUser: true, IsActive: true, IsLocked: false, IsDeleted: false },
    ...DEMO_ACCOUNT_SEEDS.map(seed => ({
      SystemUserId: seed.id, Name: seed.name, SystemUserLogin: seed.login, SystemUserPass: "",
      IsAdminUser: false, IsActive: true, IsLocked: false, IsDeleted: false, Role: seed.role,
      /* من يدرّس فعلاً (رئيس القسم، رئيس اللجنة، المستخدم العادي) مربوطٌ بأستاذٍ في
         سجلّ الأساتذة: فيعرض «المستخدمون» لوحاتٍ شخصيةً ولا يبقى العدّاد صفراً. */
      ...(DEMO_USER_INSTRUCTOR_LINKS[seed.id] ? { AdInstructorId: DEMO_USER_INSTRUCTOR_LINKS[seed.id] } : {}),
    } as SystemUser)),
  ];

  // المدير يملك كل الشاشات؛ وكلُّ صفةٍ تحمل قالبها من `formIds` نفسه الذي يحكم الحقيقي.
  let legacy = 0;
  const formSecurity: FormSecurity[] = [
    ...formNames.map(form => ({ legacyId: ++legacy, SystemUserId: 1, FormNameId: form.FormNameId })),
    ...DEMO_ACCOUNT_SEEDS.flatMap(seed => roleDefinition(seed.role).formIds.map(formId => ({ legacyId: ++legacy, SystemUserId: seed.id, FormNameId: formId }))),
  ];

  let assignId = 0;
  const collegeUserAssign: AdCollegeUserAssign[] = [
    ...sections.map(section => ({ legacyId: ++assignId, SystemUserId: 1, AdCollegeId: section.AdCollegeId, AdSectionId: section.AdSectionId })),
    ...DEMO_ACCOUNT_SEEDS.flatMap(seed => demoAssignsFor(seed.role).map(a => ({ legacyId: ++assignId, SystemUserId: seed.id, AdCollegeId: a.AdCollegeId, AdSectionId: a.AdSectionId }))),
  ];

  const rooms: AdRoom[] = DEMO_HALLS.map((hall, index) => ({ AdRoomId: index + 1, AdRoomCode: hall.code, AdRoomHall: hall.hall, AdRoomDescrip: hall.description }));
  const registry = demoLocationRegistry(schedules);
  const seeded = seedApprovalUniverse(schedules, acceptedFirst);

  const now = new Date().toISOString();
  const extras = seedIntelligenceExtras(schedules, courses);
  /* شارة «التخطيط» في جدول الديمو تحتاج قرارات تخطيط محفوظة، لا مجرد
     نافذة الرفع. ثلاثة مقررات مفتوحة تُظهر القائمة نفسها التي يراها القسم
     بعد رفع كشف المتبقي واختيار عدد الشعب. هذه الأرقام وهمية وفي الصندوق فقط. */
  const sectionsByCourse = new Map<number, Set<string>>();
  for (const row of schedules.filter(row => Number(row.AdTermId) === DEMO_TERM_CURRENT)) {
    const id = Number(row.AdCourseId);
    if (!sectionsByCourse.has(id)) sectionsByCourse.set(id, new Set());
    sectionsByCourse.get(id)!.add(String(row.SCode));
  }
  const plannedCourses = [...sectionsByCourse].filter(([, sections]) => sections.size > 0).slice(0, 3);
  const accepted = Object.fromEntries(plannedCourses.map(([id, sections], index) => [String(id), sections.size + (index === 0 ? 2 : 1)]));
  const remaining = Object.fromEntries(plannedCourses.map(([id], index) => [String(id), [1315, 3, 268][index]]));
  const planScope = `${DEMO_COLLEGE_ID}:${DEMO_SECTION_ID}:${DEMO_TERM_CURRENT}`;
  /* «الباقي/الشاغر» لكل فصلٍ سابق: من تعذّر عليه التسجيل (يتصاعد حيث زاد الطلب)، والمقاعد التي بقيت
     فارغة (حيث تراجع). بالعمود نفسه الذي يقرؤه التنبّؤ (`unregistered`). */
  const historyStats = DEMO_HISTORY_TERMS.map((term, index) => {
    const remainingByCourse: Record<string, number> = {}, vacantByCourse: Record<string, number> = {};
    (OFFERINGS[DEMO_TERM_CURRENT] || []).forEach(([code], order) => {
      const course = courses.find(row => row.CourseCode === code);
      if (!course) return;
      const delta = HISTORY_SHAPE[order % HISTORY_SHAPE.length][index];
      const capacity = Number(course.MaxStudent) || 40;
      remainingByCourse[String(course.AdCourseId)] = delta > 0 && index === DEMO_HISTORY_TERMS.length - 1 ? Math.round(capacity * 0.7) : 0;
      vacantByCourse[String(course.AdCourseId)] = delta < 0 ? Math.round(capacity * 0.4) : 0;
    });
    const scope = `${DEMO_COLLEGE_ID}:${DEMO_SECTION_ID}:${term.id}`;
    return {
      id: scope, scopeKey: scope, collegeId: DEMO_COLLEGE_ID, sectionId: DEMO_SECTION_ID, termId: term.id,
      counts: {}, remaining: remainingByCourse, vacant: vacantByCourse, accepted: {},
      remainingSource: { fileName: "كشف المتبقي التجريبي (تاريخ).pdf", importedAt: now, column: "unregistered" },
      updatedAt: now, updatedBy: "بيانات الديمو",
    };
  });
  return {
    users, formNames, formSecurity, collegeUserAssign,
    terms: demoTerms(new Date()),
    colleges: structuredClone(colleges), sections: structuredClone(sections), instructors, courses,
    schedules, rooms,
    auditLogs: seeded.audit, scheduleVersions: seeded.versions, scheduleDrafts: [], scheduleOpenDecisions: [], clientTelemetry: [], scheduleComments: seeded.comments,
    studentNeeds: [], schedulePublications: [], scheduleConstraints: extras.constraints,
    /* المنتدبون: ثلاثةٌ من أقسامٍ أخرى يدرّسون شعباً في القسم — في دليل القسم وفي
       سجلّ منتدبيه للفصلين الأول والثاني، فتُقرأ عدسةُ «المنتدبون» لكل صفة. */
    visitingRosters: [DEMO_TERM_CURRENT].map(termId => ({
      id: `${DEMO_COLLEGE_ID}:${DEMO_SECTION_ID}:${termId}`, scopeKey: `${DEMO_COLLEGE_ID}:${DEMO_SECTION_ID}:${termId}`,
      collegeId: DEMO_COLLEGE_ID, sectionId: DEMO_SECTION_ID, termId, instructorIds: [...DEMO_VISITING_INSTRUCTOR_IDS], updatedAt: now,
    })),
    departmentDelegates: [{
      id: `${DEMO_COLLEGE_ID}:${DEMO_SECTION_ID}`, scopeKey: `${DEMO_COLLEGE_ID}:${DEMO_SECTION_ID}`,
      collegeId: DEMO_COLLEGE_ID, sectionId: DEMO_SECTION_ID, instructorIds: [...DEMO_VISITING_INSTRUCTOR_IDS], updatedAt: now,
    }],
    departmentRooms: extras.departmentRooms, scheduleDecisionMemories: extras.memories,
    campusMobilityProfiles: extras.mobility, scheduleShareLinks: [], hallBarterRequests: [{
      id: "demo-hall-barter-pending-1", createdAt: now, updatedAt: now,
      AdTermId: DEMO_TERM_CURRENT, buildingId: demoBuildingId(DEMO_BUILDINGS[1]), roomId: demoRoomId(DEMO_BUILDINGS[1], "301"),
      roomCode: demoBuildingCode(DEMO_BUILDINGS[1]), roomHall: "301", day: "fwednesday", startTime: "17:00", endTime: "18:00",
      requesterCollegeId: DEMO_COLLEGE_ID, requesterSectionId: 2, requesterUserId: 15, requesterName: "رئيس قسم التربية الفنية",
      ownerCollegeId: DEMO_COLLEGE_ID, ownerSectionId: DEMO_SECTION_ID,
      confidence: 0, historyTerms: 0, status: "pending",
    }], scheduleApprovals: seeded.approvals,
    locationBuildings: registry.buildings, locationRooms: registry.rooms,
    teachingLoadConfig: [{
      id: "main", enabled: true, ranks: DEMO_TEACHING_LOAD_RANKS.map(rank => ({ ...rank })),
      assignments: structuredClone(DEMO_TEACHING_LOAD_ASSIGNMENTS), updatedAt: now, updatedBy: "بيانات الديمو",
    }],
    registrationStats: [
      {
        id: planScope, scopeKey: planScope, collegeId: DEMO_COLLEGE_ID, sectionId: DEMO_SECTION_ID,
        termId: DEMO_TERM_CURRENT, counts: {}, remaining, vacant: {}, accepted,
        remainingSource: { fileName: "كشف المتبقي التجريبي.pdf", importedAt: now, column: "unregistered" },
        updatedAt: now, updatedBy: "بيانات الديمو",
      },
      {
        id: `${DEMO_COLLEGE_ID}:${DEMO_SECTION_ID}:${DEMO_TERM_SECOND}`, scopeKey: `${DEMO_COLLEGE_ID}:${DEMO_SECTION_ID}:${DEMO_TERM_SECOND}`,
        collegeId: DEMO_COLLEGE_ID, sectionId: DEMO_SECTION_ID, termId: DEMO_TERM_SECOND,
        counts: {}, remaining: {}, vacant: {}, accepted: {}, updatedAt: now, updatedBy: "بيانات الديمو",
      },
      ...historyStats,
    ],
  };
}
