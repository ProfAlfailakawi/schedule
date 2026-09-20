import type {
  AdCollege, AdCollegeUserAssign, AdCourse, AdInstructor, AdRoom, AdSection,
  AdTerm, FSchedule, FormName, FormSecurity, ScheduleApproval, ScheduleComment,
  ScheduleVersion, SystemUser
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
  /* دورة الاعتماد تعمل في البيئة التجريبية كما تعمل في الحقيقية: المدير يجرّب
     الدورة كاملةً — توقيعاً وإرسالاً وإرجاعاً وقبولاً — بحساباتٍ وهمية قبل أن
     يسلّم العميدَ حسابَه. ومجموعةٌ غائبةٌ هنا تعني شاشةً تنكسر في التجربة
     وحدها، وهو أسوأ موضعٍ ينكسر فيه شيء: حيث يُختبر. */
  scheduleApprovals: any[];
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

/* Rooms and instructors belong to ONE college each.
 *
 * The board loads a single college, but the "outside-scope" sweep compares it
 * against every row in the term — so any hall or instructor shared across two
 * colleges surfaces on the board as «خارج النطاق». The old generator drew from
 * one global pool of 8 halls and 12 instructors with a small modulus, so almost
 * every synthetic row collided with a same-hour twin in a sibling college and
 * the whole demo board lit up dashed-red on first sight. Giving each college its
 * own disjoint band of halls and instructors makes a cross-college clash
 * impossible by construction, while the in-college conflicts that power the
 * "معالجة التعارضات" showcase are untouched — a college's own sections still
 * share its band, so same-hall / same-instructor overlaps within it remain. */
const ROOM_BANDS: Record<number, ReadonlyArray<readonly [string, string]>> = {
  1: [["A", "101"], ["A", "203"], ["B", "110"]],
  2: [["B", "205"], ["C", "301"], ["C", "315"]],
  3: [["D", "120"], ["D", "220"]],
};
const INSTRUCTOR_BANDS: Record<number, ReadonlyArray<number>> = {
  1: [1, 2, 3, 4],
  2: [5, 6, 7, 8],
  3: [9, 10, 11, 12],
};

function syntheticSchedules(courses: AdCourse[]): FSchedule[] {
  const times = [["08:00", "09:15"], ["09:30", "10:45"], ["11:00", "12:15"], ["12:30", "13:45"], ["14:00", "15:15"], ["15:30", "16:45"]];
  return Array.from({ length: 30 }, (_, index) => {
    const course = courses[index % courses.length];
    const roomBand = ROOM_BANDS[course.AdCollegeId] ?? ROOM_BANDS[1];
    const instructorBand = INSTRUCTOR_BANDS[course.AdCollegeId] ?? INSTRUCTOR_BANDS[1];
    const [start, end] = times[index % times.length];
    const [code, hall] = roomBand[index % roomBand.length];
    const pattern = index % 4;
    return {
      id: index + 1, AdCollegeId: course.AdCollegeId, AdSectionId: course.AdSectionId, AdTermId: 1,
      AdCourseId: course.AdCourseId, AdCourseName: course.CourseName, SCode: `0${(index % 3) + 1}`,
      AdInstructorId: instructorBand[index % instructorBand.length],
      fsunday: pattern === 0 || pattern === 2, fmonday: pattern === 1 || pattern === 3,
      ftuesday: pattern === 0 || pattern === 2, fwednesday: pattern === 1 || pattern === 3,
      fthursday: index % 5 === 0, fstarttime: start, fendtime: end,
      AdRoomCode: code, AdRoomHall: hall, fdetail: index % 7 === 0 ? "حالة تجريبية معدّة لاستعراض معالجة التعارضات" : "", rev: 0,
    };
  });
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

/** الحسابات الوهمية التي يبدّل بينها شريط الديمو، بالترتيب الذي تُعرض به. */
export const DEMO_ROLE_ACCOUNTS: Array<{ role: AcademicRole; label: string; SystemUserId: number }> =
  DEMO_ROLE_SEEDS.map(seed => ({ role: seed.role, label: roleDefinition(seed.role).label, SystemUserId: seed.id }));

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
 * شيء» — فيظنّ المجرِّب أن الميزة معطّلة وهي تعمل. فتُبذَر دورةٌ عاشت: قسمٌ
 * أُرسل جدولُه وعاد بملاحظاتٍ ثم أُرسل ثانيةً وهو الآن عند التسجيل، وقسمٌ
 * مُرجَعٌ ينتظر القسم، وقسمٌ اعتُمد. والمقارنةُ لها أساسٌ محفوظ، فالتقرير يُظهر
 * «ما تحرّك» فعلاً لا جدولاً كاملاً بوصفه جديداً.
 */
function seedApprovalUniverse(schedules: FSchedule[]): {
  approvals: ScheduleApproval[]; versions: ScheduleVersion[]; comments: ScheduleComment[];
} {
  const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  const stage = schedules.filter(r => Number(r.AdCollegeId) === 1 && Number(r.AdSectionId) === 1);

  const versions: ScheduleVersion[] = [];
  const comments: ScheduleComment[] = [];
  const approvals: ScheduleApproval[] = [];

  // ── قسم علوم الحاسب: عند التسجيل، الجولة الثانية، بأساسٍ محفوظ يُظهر ما تحرّك.
  if (stage.length >= 4) {
    const baseline = structuredClone(stage);
    // خانتان تغيّرتا منذ ما رآه التسجيل: قاعةٌ ووقت — فيُقرآن «معدّلَين».
    baseline[0].AdRoomHall = "999";
    baseline[1].fstarttime = "07:00"; baseline[1].fendtime = "08:15";
    // صفٌّ في الجدول الحيّ ليس في نسخة التسجيل — فيُقرأ «مضافاً».
    baseline.pop();
    // صفٌّ كان في نسخة التسجيل وحُذف بعدها — يجب أن يبقى في الأساس ويغيب عن
    // الحيّ ليُقرأ «محذوفاً»؛ فيُوضع في الأساس وحده بمعرّفٍ لا وجود له في الحيّ.
    const removedId = Math.max(0, ...schedules.map(r => Number(r.id))) + 1;
    baseline.push({
      ...structuredClone(stage[0]), id: removedId,
      AdCourseName: "مادةٌ أُلغيت بعد المراجعة", SCode: "09",
      fstarttime: "16:00", fendtime: "17:15", AdRoomCode: "A", AdRoomHall: "101",
    });
    const versionId = "demo-ver-cs-round1";
    versions.push({
      id: versionId, scopeKey: "1:1:1", createdAt: iso(9), rowCount: baseline.length,
      SystemUserId: 16, userName: "د. رئيس لجنة جدول الحاسب",
      AdCollegeId: 1, AdSectionId: 1, AdTermId: 1,
      label: "نسخة الجولة الأولى — كما رآها التسجيل", source: "manual", rows: baseline,
    });

    // ملاحظتا تسجيلٍ مفتوحتان (القيمة لم تتغيّر منذ كتابتهما)، وثالثةٌ رُدَّ عليها.
    comments.push(
      {
        id: "demo-note-cs-1", createdAt: iso(3), SystemUserId: 13, userName: "أ. رئيس التسجيل",
        scheduleId: Number(stage[2].id), AdCollegeId: 1, AdSectionId: 1, AdTermId: 1,
        text: "القاعة محجوزة لقسمٍ آخر في هذا الوقت — يرجى مراجعتها.",
        resolved: false, field: "room", valueAtNote: noteValue(stage[2], "room"), round: 2, origin: "registrar",
      },
      {
        id: "demo-note-cs-2", createdAt: iso(3), SystemUserId: 13, userName: "أ. رئيس التسجيل",
        scheduleId: Number(stage[3].id), AdCollegeId: 1, AdSectionId: 1, AdTermId: 1,
        text: "تأكّدوا من إسناد الأستاذ — يظهر لديه تعارضٌ في موعدٍ آخر.",
        resolved: false, field: "instructor", valueAtNote: noteValue(stage[3], "instructor"), round: 2, origin: "registrar",
      },
      {
        id: "demo-note-cs-3", createdAt: iso(2), SystemUserId: 13, userName: "أ. رئيس التسجيل",
        scheduleId: Number(stage[0].id), AdCollegeId: 1, AdSectionId: 1, AdTermId: 1,
        text: "يُفضّل تقديم الموعد نصف ساعة.",
        resolved: false, field: "time", valueAtNote: noteValue(stage[0], "time"), round: 2, origin: "registrar",
        rebuttal: { text: "الموعد مثبّت بطلب القسم لتوافقه مع مختبرٍ مشترك.", at: iso(1), SystemUserId: 16, userName: "د. رئيس لجنة جدول الحاسب" },
      },
      // ملاحظةٌ داخلية من القسم نفسه — لا تمنع الإرسال، تُقرأ فقط.
      {
        id: "demo-note-cs-dept", createdAt: iso(2), SystemUserId: 15, userName: "د. رئيس قسم علوم الحاسب",
        scheduleId: Number(stage[1].id), AdCollegeId: 1, AdSectionId: 1, AdTermId: 1,
        text: "ملاحظة داخلية: راجعوا سعة القاعة قبل الاعتماد.",
        resolved: false, field: "room", valueAtNote: noteValue(stage[1], "room"), round: 2, origin: "department",
      },
    );

    approvals.push({
      id: "1:1:1", scopeKey: "1:1:1", AdCollegeId: 1, AdSectionId: 1, AdTermId: 1,
      status: "submitted", currentRound: 2,
      signatures: [
        { stage: "committee", SystemUserId: 16, userName: "د. رئيس لجنة جدول الحاسب", roleLabel: "رئيس لجنة الجدول", at: iso(9), versionId, rowCount: baseline.length, regulationNoticeCount: 1, verifyCode: "CMT-2481" },
        { stage: "head", SystemUserId: 15, userName: "د. رئيس قسم علوم الحاسب", roleLabel: "رئيس القسم العلمي", at: iso(9), versionId, rowCount: baseline.length, regulationNoticeCount: 1, verifyCode: "HEAD-7193" },
      ],
      rounds: [
        { number: 1, submittedAt: iso(9), submittedBy: "د. رئيس لجنة جدول الحاسب", returnedAt: iso(5), returnedBy: "أ. رئيس التسجيل", returnedNoteCount: 2, changedRowCount: 3, reviewedVersionId: versionId },
        { number: 2, submittedAt: iso(2), submittedBy: "د. رئيس لجنة جدول الحاسب" },
      ],
      pendingAdditions: [], updatedAt: iso(2),
    });
  }

  // ── قسم علم البيانات: مُرجَعٌ بملاحظات، ينتظر القسم.
  approvals.push({
    id: "1:2:1", scopeKey: "1:2:1", AdCollegeId: 1, AdSectionId: 2, AdTermId: 1,
    status: "returned", currentRound: 1,
    signatures: [
      { stage: "committee", SystemUserId: 16, userName: "لجنة علم البيانات", roleLabel: "رئيس لجنة الجدول", at: iso(6), rowCount: 6, verifyCode: "CMT-5510" },
      { stage: "head", SystemUserId: 15, userName: "رئيس قسم علم البيانات", roleLabel: "رئيس القسم العلمي", at: iso(6), rowCount: 6, verifyCode: "HEAD-6620" },
    ],
    rounds: [{ number: 1, submittedAt: iso(6), submittedBy: "لجنة علم البيانات", returnedAt: iso(4), returnedBy: "أ. رئيس التسجيل", returnedNoteCount: 1 }],
    pendingAdditions: [], updatedAt: iso(4),
  });
  const dataRow = schedules.find(r => Number(r.AdCollegeId) === 1 && Number(r.AdSectionId) === 2);
  if (dataRow) comments.push({
    id: "demo-note-ds-1", createdAt: iso(4), SystemUserId: 13, userName: "أ. رئيس التسجيل",
    scheduleId: Number(dataRow.id), AdCollegeId: 1, AdSectionId: 2, AdTermId: 1,
    text: "القاعة صغيرة على عدد الطلبة المتوقّع.",
    resolved: false, field: "room", valueAtNote: noteValue(dataRow, "room"), round: 1, origin: "registrar",
  });

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

  return { approvals, versions, comments };
}

export function createDemoSandboxState(): DemoSandboxState {
  const instructors = syntheticInstructors();
  const courses = syntheticCourses();
  const schedules = syntheticSchedules(courses);
  const formNames: FormName[] = Array.from({ length: 17 }, (_, index) => ({ FormNameId: index + 1, FormName: `صلاحية ${index + 1}` }));

  const users: SystemUser[] = [
    { SystemUserId: 1, Name: "مدير البيئة التجريبية", SystemUserLogin: "demo.admin", SystemUserPass: "", IsAdminUser: true, IsActive: true, IsLocked: false, IsDeleted: false },
    ...DEMO_ROLE_SEEDS.map(seed => ({
      SystemUserId: seed.id, Name: seed.name, SystemUserLogin: seed.login, SystemUserPass: "",
      IsAdminUser: false, IsActive: true, IsLocked: false, IsDeleted: false, Role: seed.role,
    } as SystemUser)),
  ];

  // المدير يملك كل الشاشات؛ وكلُّ صفةٍ تحمل قالبها من `formIds` نفسه الذي يحكم الحقيقي.
  let legacy = 0;
  const formSecurity: FormSecurity[] = [
    ...formNames.map(form => ({ legacyId: ++legacy, SystemUserId: 1, FormNameId: form.FormNameId })),
    ...DEMO_ROLE_SEEDS.flatMap(seed => roleDefinition(seed.role).formIds.map(formId => ({ legacyId: ++legacy, SystemUserId: seed.id, FormNameId: formId }))),
  ];

  // المدير على كل الأقسام؛ وكلُّ صفةٍ على نطاقها المشتقّ من `scopeMode`.
  let assignId = 0;
  const collegeUserAssign: AdCollegeUserAssign[] = [
    ...sections.map(section => ({ legacyId: ++assignId, SystemUserId: 1, AdCollegeId: section.AdCollegeId, AdSectionId: section.AdSectionId })),
    ...DEMO_ROLE_SEEDS.flatMap(seed => demoAssignsFor(seed.role).map(a => ({ legacyId: ++assignId, SystemUserId: seed.id, AdCollegeId: a.AdCollegeId, AdSectionId: a.AdSectionId }))),
  ];

  const rooms: AdRoom[] = [
    ["A", "101", "قاعة ذكية 40 مقعدًا"], ["A", "203", "مختبر حاسب"], ["B", "110", "قاعة محاضرات"], ["B", "205", "مختبر ابتكار"],
    ["C", "301", "قاعة مرنة"], ["C", "315", "قاعة مشاريع"], ["D", "120", "مختبر تعلم رقمي"], ["D", "220", "قاعة نقاش"],
  ].map((row, index) => ({ AdRoomId: index + 1, AdRoomCode: row[0], AdRoomHall: row[1], AdRoomDescrip: row[2] }));

  const seeded = seedApprovalUniverse(schedules);

  return {
    users, formNames, formSecurity, collegeUserAssign,
    terms: [{ AdTermId: 1, AdTermName: "الفصل الأول 2026/2027", AdTermStart: "2026-09-06", AdTermWeeks: 15, AdTermSubmissionDeadline: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10) }],
    colleges: structuredClone(colleges), sections: structuredClone(sections), instructors, courses,
    schedules, rooms,
    auditLogs: [], scheduleVersions: seeded.versions, scheduleDrafts: [], scheduleOpenDecisions: [], clientTelemetry: [], scheduleComments: seeded.comments,
    studentNeeds: [], schedulePublications: [], scheduleConstraints: [], visitingRosters: [], departmentDelegates: [], departmentRooms: [], scheduleDecisionMemories: [],
    campusMobilityProfiles: [], scheduleShareLinks: [], hallBarterRequests: [], scheduleApprovals: seeded.approvals,
  };
}
