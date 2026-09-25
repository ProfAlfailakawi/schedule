import type { AcademicRole } from "./utils/academicRoles";

export interface SystemUser {
  SystemUserId: number;
  Name: string;
  SystemUserLogin: string;
  SystemUserPass: string; // password hash
  SystemUserPassVault?: string; // AES-256-GCM legacy compatibility vault; never sent to normal clients
  IsAdminUser: boolean;
  IsActive: boolean;
  IsLocked: boolean;
  IsDeleted?: boolean;
  // Optional link used by the modern personal dashboard. Existing legacy users remain valid without it.
  AdInstructorId?: number;
  /**
   * ── الدور الأكاديمي ────────────────────────────────────────────────────────
   *
   * بُعدٌ فوق FormSecurity، لا بديلٌ عنه: الشاشة تقول «أين يدخل»، والدور يقول
   * «بماذا يدخل» — أيكتب أم يقرأ، وأين يقف من دورة اعتماد الجدول.
   *
   * اختياريّ عمداً: عشر سنوات من الحسابات سبقته. وكلُّ حسابٍ بلا دور يُقرأ
   * «رئيس لجنة» — وهو ما تفعله هذه الحسابات فعلاً اليوم — فلا يتغيّر سلوك أحد
   * يوم التحديث. انظر `utils/academicRoles`.
   */
  Role?: AcademicRole;
}

export interface FormName {
  FormNameId: number;
  FormName: string;
}

export interface FormSecurity {
  legacyId?: number;
  SystemUserId: number;
  FormNameId: number;
}

export interface AdCollegeUserAssign {
  legacyId?: number;
  SystemUserId: number;
  AdCollegeId: number;
  AdSectionId: number;
}

export interface AdTerm {
  AdTermId: number;
  AdTermName: string;
  /**
   * When teaching actually begins, as YYYY-MM-DD, and how many weeks it runs.
   *
   * Both optional, because ten years of terms exist with neither. Everything
   * that reads them must still work when they are absent — but where they ARE
   * present, a term stops being a name and becomes a period, which is what a
   * calendar has needed all along.
   */
  AdTermStart?: string;
  AdTermWeeks?: number;
  /**
   * Whether this term is over.
   *
   * Set explicitly by a coordinator; absent on the ten years of terms that
   * pre-date the flag. Anything that reads it should go through
   * `isTermClosed()` in utils/termSequence, which supplies the sane default —
   * only the newest term is still live — rather than treating "absent" as
   * "open" and offering room-borrowing on a term that ended years ago.
   */
  AdTermClosed?: boolean;
  /**
   * ── آخر موعد لتسليم الجداول ───────────────────────────────────────────────
   *
   * يضعه رئيس التسجيل مرة واحدة للفصل، كـ YYYY-MM-DD، فيظهر صريحاً لكل قسم
   * ولكل عميد. قبله: الجدول يُسلَّم كاملاً بتوقيعيه. بعده: لا يُستورد ملف، ولا
   * يُنسخ فصل، ولا يُحذف الجدول جملةً — وتبقى التعديلات الجزئية مفتوحة، لأن
   * القاعة تتغيّر والأستاذ يعتذر بعد الموعد كما قبله.
   *
   * اختياريّ: فصلٌ بلا موعد هو فصلٌ بلا قيد، وهذا هو حال كل فصل قديم.
   */
  AdTermSubmissionDeadline?: string;
}

export interface AdCollege {
  AdCollegeId: number;
  AdCollegeCode: string;
  AdCollegeName: string;
}

export interface AdSection {
  AdSectionId: number;
  AdCollegeId: number;
  AdSectionCode: string;
  AdSectionName: string;
}

export interface AdInstructor {
  AdInstructorId: number;
  AdInstructorCivil: string;
  AdInstructorName: string;
  AdInstructorMobile: string;
  /**
   * Additive, optional. Absent means an ordinary active teacher. A retired or
   * sabbatical member keeps every historical appointment but is hidden from new
   * assignment pickers so their name stops appearing where it should not (Note 2).
   */
  AdInstructorStatus?: "retired" | "sabbatical";
  /**
   * ── النصاب ────────────────────────────────────────────────────────────────
   *
   * الساعاتُ المعتمدة التي يُتوقّع أن يحملها هذا الأستاذ في الفصل.
   *
   * وهو القيدُ الذي كان غائباً حين صار الأستاذُ يطلب مقرّراً بنفسه: اللائحةُ
   * تقول أين يقع الموعد، والقاعةُ تقول أيمكن، ولا شيء كان يقول «هذا يتجاوز
   * نصابك». فكان القسمُ يكتشفه بعد أن يجمع الطلبات كلَّها ويحسبها بيده.
   *
   * اختياريٌّ عمداً: كلُّ سجلٍّ سابقٍ بلا نصابٍ مسجّل، وأستاذٌ بلا نصابٍ لا
   * يُفرَض عليه رقمٌ مخترع — يُترك القيدُ صامتاً، ولا يُمنع به أحد.
   */
  AdInstructorLoad?: number;
}

export interface AdCourse {
  AdCourseId: number;
  AdCollegeId: number;
  AdSectionId: number;
  CourseCode: string;
  CourseName: string;
  CourseCredit: number;
  CourseHours: number;
  MaxStudent: number;
}

/** Academic curriculum version for one scientific section. */
export type CurriculumPlanStatus = "active" | "transition" | "archived";

export interface CurriculumPlan {
  id: string;
  AdCollegeId: number;
  AdSectionId: number;
  name: string;
  code?: string;
  status: CurriculumPlanStatus;
  /** True only for the virtual compatibility plan synthesized before first setup. */
  virtual?: boolean;
  createdAt: string;
  createdBy?: string;
  activatedAt?: string;
  archivedAt?: string;
  archivedBy?: string;
}

export interface CurriculumPlanCourse {
  id: string;
  planId: string;
  AdCollegeId: number;
  AdSectionId: number;
  AdCourseId: number;
  createdAt: string;
  createdBy?: string;
}

export type CourseTransitionKind =
  | "renumbered"
  | "renamed"
  | "renumbered-renamed"
  | "replaced"
  | "removed";

export interface CourseTransition {
  id: string;
  AdCollegeId: number;
  AdSectionId: number;
  fromPlanId: string;
  toPlanId: string;
  fromCourseId: number;
  toCourseId?: number;
  kind: CourseTransitionKind;
  note?: string;
  createdAt: string;
  createdBy?: string;
}

export interface FSchedule {
  id: number;
  AdCollegeId: number;
  AdSectionId: number;
  AdTermId: number;
  AdCourseId: number;
  AdCourseName: string;
  /** Immutable academic identity as it stood when this appointment was created. */
  CourseCodeSnapshot?: string;
  CourseNameSnapshot?: string;
  CurriculumPlanIdSnapshot?: string;
  SCode: string;
  AdInstructorId: number;
  fsunday: boolean;
  fmonday: boolean;
  ftuesday: boolean;
  fwednesday: boolean;
  fthursday: boolean;
  fstarttime: string;
  fendtime: string;
  AdRoomCode: string;
  AdRoomHall: string;
  /** Stable canonical location references. Raw legacy strings remain for historical display/audit only. */
  buildingId?: string;
  roomId?: string;
  locationStatus?: "VERIFIED" | "PENDING_ROOM" | "LOCATION_REVIEW_REQUIRED" | "INVALID_HISTORICAL";
  sourceBuildingText?: string;
  sourceRoomText?: string;
  locationMigrationId?: string;
  locationMigrationVersion?: string;
  locationResolvedAt?: string;
  fdetail?: string;
  /** Source-PDF trace. Empty for ordinary/new rows; never used as an internal id. */
  referenceNumber?: string;
  sourceOrder?: number;
  /** Raw instructor text read from the imported PDF. Kept only as a review aid
   * when a catalogue match is uncertain; reports always print the system name. */
  sourceInstructorText?: string;
  /** Immutable source cells and their canonicalization proof for imported PDFs. */
  sourceCourseCode?: string;
  sourceCourseText?: string;
  sourceSectionText?: string;
  importEvidence?: Partial<Record<"course"|"section"|"instructor"|"building"|"room", {
    raw?: string;
    normalized?: string;
    canonical?: string;
    confidence?: "CONFIRMED"|"REVIEW_REQUIRED"|"UNRESOLVED";
    reason?: string;
    evidence?: string[];
  }>>;
  /**
   * How many times this appointment has been written.
   *
   * Two coordinators can open the same lecture, and until now the second save
   * simply won: the first person's change vanished with nothing said to either
   * of them. The versions log could show what had happened afterwards; it could
   * not stop it happening. This number is what makes the stop possible — a save
   * carries the revision it was based on, and the store refuses to write over a
   * newer one.
   *
   * Optional and treated as 0 when absent, so every row already in the database
   * is valid as it stands and takes its first number on its next write.
   */
  rev?: number;
}

export interface AdRoom {
  AdRoomId: number;
  AdRoomCode: string;
  AdRoomHall: string;
  AdRoomDescrip: string;
}

export type LocationConfidence = "CONFIRMED" | "PROBABLE" | "REVIEW_REQUIRED" | "INVALID";
export type ScheduleLocationStatus = "VERIFIED" | "PENDING_ROOM" | "LOCATION_REVIEW_REQUIRED" | "INVALID_HISTORICAL";

export interface LocationRegistryAlias {
  value: string;
  usageCount?: number;
  confidence: LocationConfidence;
  evidence?: string[];
}

export interface LocationAuditRecord {
  id?: string;
  at: string;
  byUserId?: number;
  action: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  note?: string;
}

export interface MasterBuilding {
  id: string;
  officialCode: string;
  /** Authoritative college/site identity, e.g. 012B, 0510. */
  sitePrefix?: string;
  prefix: string;
  siteLetter: string;
  buildingNumber: string;
  siteName?: string;
  branchName?: string;
  description?: string;
  active: boolean;
  aliases: LocationRegistryAlias[];
  collegeIds: number[];
  sectionIds: number[];
  historicalUsageCount: number;
  firstTermId?: number;
  lastTermId?: number;
  roomCount: number;
  confidence: LocationConfidence;
  source: string;
  adminVerified: boolean;
  evidence: string[];
  auditHistory: LocationAuditRecord[];
  createdAt?: string;
  updatedAt?: string;
  lastVerifiedAt?: string;
}

export interface MasterRoom {
  id: string;
  buildingId: string;
  buildingCode: string;
  canonicalCode: string;
  active: boolean;
  aliases: LocationRegistryAlias[];
  collegeIds: number[];
  sectionIds: number[];
  primarySectionIds?: number[];
  shared: boolean;
  sharedConfidence?: LocationConfidence;
  historicalUsageCount: number;
  firstTermId?: number;
  lastTermId?: number;
  confidence: LocationConfidence;
  source: string;
  adminVerified: boolean;
  evidence: string[];
  auditHistory: LocationAuditRecord[];
  createdAt?: string;
  updatedAt?: string;
  lastVerifiedAt?: string;
}

export interface LocationReviewCase {
  id: string;
  kind: "BUILDING" | "ROOM" | "PAIR" | "SWAPPED_FIELDS" | "UNKNOWN_PREFIX" | "CROSS_BUILDING_ROOM_CODE";
  rawValue: string;
  occurrences: number;
  termNames: string[];
  sectionNames: string[];
  collegeNames: string[];
  sectionIds: number[];
  collegeIds: number[];
  buildingCandidate?: string;
  buildingCandidates: string[];
  roomCandidate?: string;
  roomCandidates: string[];
  reason: string;
  recommendation: string;
  confidence: LocationConfidence;
  status: "open" | "resolved" | "ignored";
  resolution?: string;
  resolvedAt?: string;
  resolvedBy?: number;
}

export interface LocationMigrationLog {
  id: string;
  migrationId: string;
  scheduleId: number;
  timestamp: string;
  oldBuilding: string;
  newBuilding?: string;
  oldRoom: string;
  newRoom?: string;
  oldBuildingId?: string;
  newBuildingId?: string;
  oldRoomId?: string;
  newRoomId?: string;
  oldStatus?: ScheduleLocationStatus;
  newStatus?: ScheduleLocationStatus;
  oldMigrationVersion?: string;
  newMigrationVersion?: string;
  confidence: LocationConfidence;
  rule: string;
}

export interface LocationMigrationRun {
  id: string;
  version: string;
  createdAt: string;
  completedAt?: string;
  byUserId: number;
  status: "preview" | "running" | "completed" | "rolled_back" | "failed";
  restorePointId?: string;
  stats: Record<string, number>;
}

// Additive campus-mobility settings. Existing legacy college/room records stay untouched.
// Building codes are learned from the room codes already used by the college, while the
// travel matrix lets administrators express the real walking time between buildings.
export interface CampusTravelPair {
  fromBuilding: string;
  toBuilding: string;
  minutes: number;
}

export interface CampusMobilityProfile {
  AdCollegeId: number;
  defaultTravelMinutes: number;
  sameBuildingMinutes: number;
  pairs: CampusTravelPair[];
  updatedAt?: string;
  updatedBy?: string;
}


export interface AuditLogEntry {
  id: string;
  timestamp: string;
  SystemUserId: number;
  userName: string;
  method: string;
  path: string;
  action: string;
  entity: string;
  entityId?: string;
  /**
   * What changed, in words — «الوقت 10:00 ← 11:00 · القاعة A/101 ← B/202».
   * Optional and additive: entries written before this existed simply have
   * none, and a handler that cannot describe its change omits it.
   */
  changes?: string;
  status: number;
}

// Additive smart-workspace records. They live beside the verified legacy tables and never
// change their schema or semantics.
export interface ScheduleVersion {
  id: string;
  scopeKey: string;
  createdAt: string;
  /** How many appointments the snapshot holds, so a list never reads `rows`. */
  rowCount?: number;
  SystemUserId: number;
  userName: string;
  AdCollegeId: number;
  AdSectionId: number;
  AdTermId: number;
  label: string;
  source: "manual" | "draft" | "publish" | "undo" | "copy" | "import";
  rows: FSchedule[];
}

export interface ScheduleDraft {
  id: string;
  scopeKey: string;
  createdAt: string;
  updatedAt: string;
  SystemUserId: number;
  userName: string;
  AdCollegeId: number;
  AdSectionId: number;
  AdTermId: number;
  name: string;
  status: "draft" | "published" | "archived";
  source: "what-if" | "auto" | "import" | "manual";
  rows: FSchedule[];
  /** Original scanned table, kept immutable for the colour-coded change report. */
  baselineRows?: FSchedule[];
  sourceFileName?: string;
  importLayout?: "authority-pdf" | "worksheet";
  /** Branch label read from the source PDF header (for the authority report). */
  sourceBranchCode?: string;
  sourceBranchName?: string;
  /** Server-signed proof that the PDF header matched this exact academic scope. */
  importReceipt?: string;
  publishedAt?: string;
}

/** A decision that is intentionally not finished yet. */
export interface ScheduleOpenDecision {
  id: string;
  scopeKey: string;
  createdAt: string;
  updatedAt: string;
  SystemUserId: number;
  userName: string;
  AdCollegeId: number;
  AdSectionId: number;
  AdTermId: number;
  title: string;
  detail?: string;
  owner?: string;
  dueAt?: string;
  priority: "low" | "medium" | "high";
  status: "open" | "done";
  scheduleId?: number;
  source: "manual" | "assistant";
}

/** Sparse operational telemetry: slow/failing interactions only, never schedule content. */
export interface ClientTelemetryEntry {
  id: string;
  timestamp: string;
  SystemUserId: number;
  userName: string;
  AdCollegeId?: number;
  AdSectionId?: number;
  AdTermId?: number;
  kind: "api" | "error" | "offline" | "sync" | "guide";
  name: string;
  durationMs?: number;
  status?: number;
  ok?: boolean;
  message?: string;
  breadcrumbs?: Array<{ at: string; action: string }>;
  /** Firestore TTL: operational telemetry is short-lived by design. */
  expiresAtTtl?: Date | string;
}

/**
 * ── ما يحتاجه الطالب ────────────────────────────────────────────────────────
 *
 * A student's structured case. Identity is encrypted at rest and is decrypted
 * only in the permission-7 coordinator response; the fingerprint remains the
 * duplicate-prevention key and never leaves the server.
 */
/* ── حالةُ المقرّر عند التسجيل ───────────────────────────────────────────────
 *
 * القسم يجمع رغبات الطلبة بالاستبيان، ثم يسلّمها التسجيلَ يدوياً إلى اليوم.
 * والطالبُ بينهما لا يعرف شيئاً: أرسل، ثم صمتَ النظام، فجاء يسأل.
 *
 * هذه الحالةُ هي الخيط الذي يربط الثلاثة. يكتبها التسجيلُ على الكشف نفسه الذي
 * يقرؤه القسم — لا على كشفٍ آخرَ يفترق عنه عند أول تعديل — فيراها القسمُ
 * لحظتَها، ويراها الطالبُ في صفحته.
 *
 * **ولا تُكتب على الجدول.** هي قولٌ عن طلب طالبٍ بعينه، لا عن شعبةٍ ولا عن
 * مقعد. النظام لا يملك مقاعد ولا يدّعي امتلاكها.
 */

/** أين وصل مقرّرٌ واحدٌ من طلب طالب. */
export type StudentCourseStateValue =
  | "awaiting-registration"  // وافقت لجنة القسم وسلّمته، والتسجيل لم يقل شيئاً بعد
  | "committee-rejected"     // لم توافق عليه لجنة القسم، ومعه سبب — لا يصل التسجيل
  | "registered"             // التسجيل سجّله
  | "rejected";              // التسجيل ردّه، ومعه سبب

/**
 * أسبابُ عدم موافقة لجنة القسم، من قائمةٍ مغلقة.
 *
 * الطلبُ يمرّ على اللجنة أولاً: ما توافق عليه يُسلَّم للتسجيل، وما لا توافق
 * عليه يبقى عند القسم ولا يراه التسجيل. والسببُ يصل الطالب في صفحته.
 */
export type StudentCommitteeRejectReason =
  | "not-eligible"   // لا تنطبق عليه الشروط
  | "not-in-plan"    // ليس من خطته الدراسية
  | "prerequisite"   // متطلّبٌ سابق
  | "duplicate"      // طلبٌ مكرر أو سبق تسجيله
  | "other";

/**
 * أسبابُ الردّ، من قائمةٍ مغلقة.
 *
 * مغلقةٌ لنفس السبب الذي أُغلقت له أسبابُ رفض طلب الأستاذ: سببٌ حرٌّ لا
 * يُقارن ولا يُحصى، ويدفع الطالبَ إلى المكتب ليسأل «ليش؟». والسطرُ الحرّ يبقى
 * لما لا تسعه القائمة — تفصيلُ الحالة لا نوعُها.
 */
export type StudentCourseRejectReason =
  | "no-seat"        // لا مقاعد
  | "prerequisite"   // متطلّبٌ سابق
  | "level"          // المستوى
  | "conflict"       // تعارضٌ في جدوله
  | "closed"         // الشعبة مغلقة
  | "other";

export interface StudentCourseState {
  courseId: number;
  state: StudentCourseStateValue;
  reasonCode?: StudentCourseRejectReason | StudentCommitteeRejectReason;
  note?: string;
  /** من كتبها: القسم (اللجنة) حين يوافق أو لا يوافق، والتسجيل حين يقرّر. */
  by: "department" | "registration";
  /** الصفةُ لا الاسم: «موظف التسجيل»، «رئيس لجنة الجدول». */
  byRole?: string;
  at: string;
}

/**
 * قرارُ جهةٍ واحدةٍ في طلبٍ لا مقرّرات فيه (حالة الخريج).
 *
 * طلبُ الخريج لا يسمّي مقرّراً: يطلب ترتيباً للميداني بسببٍ من قائمةٍ مغلقة
 * وملاحظاتٍ إلزامية. فالقرارُ فيه قرارٌ في الحالة كلها، لا في مقرّر — وكان
 * الكشفُ يُسقطه لأنه لا يجد مقرّراً يعلّق عليه قراراً، فلا يُجاب أبداً.
 * الترتيبُ نفسُه: اللجنةُ أولاً، ثم التسجيل.
 */
export interface StudentCaseDecision {
  /** اللجنة: وافقت/لم توافق. التسجيل: نفّذه/ردّه. */
  state: "approved" | "rejected";
  reasonCode?: StudentCourseRejectReason | StudentCommitteeRejectReason;
  /** «سطرٌ للطالب» — يصله في صفحة حالته. */
  note?: string;
  byRole?: string;
  at: string;
}

export interface StudentCaseState {
  committee?: StudentCaseDecision;
  registrar?: StudentCaseDecision;
}

export interface StudentNeed {
  id: string;
  /** HMAC of the civil ID. Distinguishes people; identifies nobody. */
  fingerprint: string;
  AdCollegeId: number;
  /** The student's own scientific section, validated in the link's college. */
  AdSectionId: number;
  /** The department whose survey link received this request. New records always
   * carry it; older records are recovered from their requested courses. */
  surveySectionId?: number;
  /** Exact share-link provenance, so one request is never attributed to the
   * student's home department merely because they study there. */
  surveyLinkId?: string;
  /** Explicit alias retained for reporting/migrations; AdSectionId remains the
   * student's selected/home section for degree-rule checks. */
  studentSectionId?: number;
  AdTermId: number;
  /** Curriculum version selected/derived for this survey answer when available. */
  curriculumPlanId?: string;
  /** Every course this student says they need. */
  courseIds: number[];
  requestType?: "new-course" | "course-conflict" | "graduate";
  nameCipher?: string;
  civilCipher?: string;
  details?: string;
  graduateReason?: "field-conflict" | "field-prerequisite-conflict" | "other";
  passedUnits?: number;
  requiredUnits?: number;
  degreeUnits?: number;
  eligibility?: "eligible" | "ineligible" | "not-checked";
  proofNameMatched?: boolean;
  createdAt: string;
  /**
   * أين وصل كلُّ مقرّرٍ طلبه هذا الطالب.
   *
   * غيابُها يعني أن أحداً لم يقل شيئاً بعد — وهي الحالة الطبيعية للسجلّات
   * كلها قبل أن يبدأ التسليم، وللسجلّات القديمة كلها إلى الأبد. فلا يُكتب
   * صفٌّ ليقول «لا جديد».
   */
  courseStates?: StudentCourseState[];
  /** قرارُ الحالة كلها حين لا يسمّي الطلبُ مقرّراً (الخريج). */
  caseState?: StudentCaseState;
  /**
   * رقمُ الحالة كما أُعطي للطالب، ثابتٌ عبر إعادة الإرسال.
   *
   * كان يُشتقّ من معرّف السجلّ، والسجلُّ يُستبدل كلّما غيّر الطالبُ رأيه —
   * فالرقمُ الذي طُلب منه أن يحفظه يتغيّر تحت يده، ويبحث به موظّفُ التسجيل
   * فلا يجده. فصار يُولَّد مرّةً ويُورَّث.
   *
   * اختياريٌّ لأن كلَّ سجلٍّ سابقٍ بلا هذا الحقل: تلك تُقرأ بالاشتقاق القديم
   * من معرّفها، وهو ما أُعطي لأصحابها فعلاً.
   */
  caseRef?: string;
}

/**
 * A digitally approved right to use another college's historically-owned hall
 * for one recurring weekly window in one term.
 *
 * The request is intentionally separate from FSchedule: approving access must
 * never invent a course, instructor or lecture. Once approved it behaves as a
 * reservation guard around the room, while the borrowing department still
 * creates its real lecture through the normal schedule editor and therefore
 * passes every existing conflict check.
 */
export interface HallBarterRequest {
  id: string;
  createdAt: string;
  updatedAt: string;
  AdTermId: number;
  buildingId?: string;
  roomId?: string;
  roomCode: string;
  roomHall: string;
  day: "fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday";
  startTime: string;
  endTime: string;
  requesterCollegeId: number;
  requesterSectionId: number;
  requesterUserId: number;
  requesterName: string;
  ownerCollegeId: number;
  ownerSectionId: number;
  /** Percentage of historical terms in which the window was free. */
  confidence: number;
  /** Number of historical terms used to compute confidence. */
  historyTerms: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  respondedAt?: string;
  responderUserId?: number;
  responderName?: string;
  /** سبب الإلغاء — يُملأ حين يُلغى الطلب تلقائياً بانتهاء مهلته. */
  cancelReason?: string;
}

/**
 * ── استثناء أسبوع واحد ──────────────────────────────────────────────────────
 *
 * The schedule models the ideal repeating week; reality has a lecture that was
 * cancelled THIS Tuesday, or covered by a colleague THIS Thursday. An exception
 * is one dated fact laid OVER an appointment — it never touches the FSchedule
 * row itself, so nothing about the recurring plan, its conflicts or its
 * history can be disturbed by recording what happened in a single week.
 *
 * The calendar feeds read these: a cancelled date becomes an EXDATE in the
 * subscription, and a covering colleague's personal feed gains that one day —
 * which is what makes the phone's calendar follow reality automatically.
 */
export interface ScheduleWeekException {
  id: string;
  createdAt: string;
  /** The appointment this dated fact sits over. */
  scheduleId: number;
  AdCollegeId: number;
  AdSectionId: number;
  AdTermId: number;
  /** The one specific day, as YYYY-MM-DD. */
  date: string;
  /** cancel = لا تُعقد هذا اليوم · cover = تُعقد بأستاذ بديل هذا اليوم */
  kind: "cancel" | "cover";
  coverInstructorId?: number;
  coverInstructorName?: string;
  note?: string;
  SystemUserId: number;
  userName: string;
}

export interface ScheduleComment {
  id: string;
  createdAt: string;
  SystemUserId: number;
  userName: string;
  scheduleId: number;
  AdCollegeId: number;
  AdSectionId: number;
  AdTermId: number;
  text: string;
  resolved: boolean;
  /**
   * Where this note came in from.
   *
   * A note from the staff card is the same record the appointment panel already
   * shows and resolves — no second inbox, no second lifecycle. The two fields
   * exist only so the department can tell «قالها زميل في النظام» apart from
   * «قالها الأستاذ نفسه من بطاقته».
   */
  source?: "staff-card";
  fromInstructorId?: number;
  /** What the instructor is saying: an apology, or a request to change. */
  kind?: "apology" | "change";
  /** The day or range it concerns, as YYYY-MM-DD. Optional — «كل أسبوع» is a
   *  real answer too. */
  fromDate?: string;
  toDate?: string;
  /**
   * ── ملاحظة على الخانة، لا على الصف ────────────────────────────────────────
   *
   * موظّف التسجيل لا يكتب «راجع الموعد رقم ٤١٨»؛ هو ينقر على القاعة نفسها.
   * والخانة تحمل ثلاث معلومات دفعةً واحدة: أيُّ صفّ، وأيُّ حقل، وما القيمة
   * المرفوضة — فتسقط الحاجة إلى شرحٍ من الطرفين.
   *
   * كلها اختيارية: الملاحظات القديمة، وملاحظات بطاقة الأستاذ، لا خانة لها،
   * وتبقى تُقرأ وتُحلّ كما كانت تماماً.
   */
  field?: ScheduleNoteField;
  /** القيمة كما كانت لحظة كتابة الملاحظة، ليُعرف لاحقاً أتغيّرت أم لا. */
  valueAtNote?: string;
  /** رقم الجولة التي كُتبت فيها. الجولة الأولى هي ١. */
  round?: number;
  /** من أي جهة: التسجيل، أو القسم، أو بطاقة الأستاذ. */
  origin?: "registrar" | "department";
  /**
   * ردّ اللجنة حين ترى الملاحظة غير صحيحة.
   *
   * «أبقيها كما هي، لهذا السبب» — والسبب إلزاميّ هنا وحده، لأن رفضاً بلا سبب
   * يدفع الطرفين إلى الهاتف، فتضيع الحجّة خارج النظام.
   */
  rebuttal?: { text: string; at: string; SystemUserId: number; userName: string };
  /** قرار التسجيل على ردّ اللجنة في الجولة التالية. */
  rebuttalVerdict?: "accepted" | "insisted";
  /**
   * كم مرّةً أصرّ التسجيل على هذه الخانة بعد ردٍّ من القسم.
   *
   * خانةٌ يُصرّ عليها طرفٌ ويردّ عليها الآخر ثلاث مرّات ليست خلافاً على قاعة؛
   * هي خلافٌ لم يُحسم، ومكانُه فوق مستوى الاثنين. فيُعدّ صراحةً ليُعرض لرئيس
   * القسم — إعلاماً لا إجباراً، فلا شيء في النظام يقف عليه.
   */
  insistCount?: number;
}

/** الحقول التي يجوز أن تُعلَّق عليها ملاحظةٌ بالنقر. */
export type ScheduleNoteField = "time" | "days" | "room" | "instructor" | "sectionCode" | "course" | "row";


export type ScheduleConstraintType = "instructor_latest_end" | "instructor_day_off" | "department_day_off" | "course_room" | "max_instructor_gap" | "room_doorway";

/**
 * What a degree costs, per scientific department.
 *
 * These numbers gate the graduate case in the student survey: the transcript is
 * read, and the units it reports are measured against the department's own
 * requirement. They used to be inferred from the department NAME by regular
 * expression, so a department earned 134 units by containing the word «انجليزي»
 * and every unmatched department silently fell to 130 — a rule nobody chose,
 * that no screen showed, and that a rename could change without warning.
 */
export interface AdDegreeRule {
  AdSectionId: number;
  degreeUnits: number;
  /** Units that must be passed before field training opens. */
  fieldTrainingRequired: number;
  graduateRegularPassed: number;
  graduateSummerPassed: number;
  updatedAt: string;
  updatedBy: string;
}

export interface ScheduleConstraint {
  id: string;
  scopeKey: string;
  createdAt: string;
  updatedAt: string;
  SystemUserId: number;
  userName: string;
  AdCollegeId: number;
  AdSectionId: number;
  AdTermId: number;
  type: ScheduleConstraintType;
  label: string;
  enabled: boolean;
  AdInstructorId?: number;
  AdCourseId?: number;
  day?: "fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday";
  time?: string;
  buildingId?: string;
  roomId?: string;
  /** Canonical display values retained for readable audit/history; IDs are authoritative. */
  roomCode?: string;
  roomHall?: string;
  maxMinutes?: number;
}


export interface ScheduleDecisionMemory {
  id: string;
  createdAt: string;
  SystemUserId: number;
  userName: string;
  AdCollegeId: number;
  AdSectionId: number;
  AdTermId: number;
  AdCourseId?: number;
  SCode?: string;
  scheduleId?: number;
  optionSignature?: string;
  kind: "rejected-option" | "accepted-note" | "meeting-decision";
  reason: string;
}

// Read-only publication of one scope to a non-guessable public token. The token
// carries no account, expires on its own, and exposes only what a printed
// timetable already shows: course, section, time, room and instructor name.
export interface ScheduleShareLink {
  id: string;
  scopeKey: string;
  AdCollegeId: number;
  AdSectionId: number;
  AdTermId: number;
  label: string;
  createdAt: string;
  expiresAt: string;
  revoked?: boolean;
  SystemUserId: number;
  userName: string;
  views: number;
  lastViewedAt?: string;
  showInstructors: boolean;
  /**
   * "department" publishes the whole section's timetable to anyone holding the
   * link. "staff" publishes nothing on its own: the page asks for a civil ID
   * and returns only that one instructor's own card. Links created before this
   * field existed are department links.
   */
  /**
   * "survey" is a door for students. It is scoped to ONE section, and that is
   * load-bearing: sections here are already separated by gender, so the link
   * decides which cohort is answering and nobody has to guess anything from a
   * person's name. A boys' survey and a girls' survey are two links.
   */
  /**
   * "request" is a door for ONE instructor, and it is the only kind that both
   * shows a person their own draft and accepts a change to it. It is issued per
   * instructor — never per section — because what it opens is that person's
   * timetable and nobody else's, and the link IS the identity.
   */
  kind?: "department" | "staff" | "survey" | "request";
  /** صاحبُ الرابط حين يكون `kind === "request"`. لا معنى له في غيره. */
  AdInstructorId?: number;
}

/* ── طلبُ الأستاذ على مسوّدة جدوله ───────────────────────────────────────────
 *
 * القسم ينسخ الجدول من فصلٍ ماضٍ ثم يرسله للأساتذة، أو يرسله ثم ينسخ — وكلتا
 * الحالتين تنتهيان إلى شيءٍ واحد: أستاذٌ يفتح مسوّدةَ جدوله فيقول «أبقِه» أو
 * «عدّله» أو «احذفه» أو «أضف». وهذا السجلّ هو ما يحمل قولَه وردَّ القسم عليه.
 *
 * وهو **ليس مخزناً موازياً للجدول**. لا شيء فيه يظهر في جدولٍ ولا في تقرير
 * تغييرات. حين يُثبَّت بندٌ منه يُنفَّذ عبر مسار الحفظ نفسه الذي يستعمله
 * المنسّق بيده، فيُسجَّل في `scheduleComments` و`scheduleVersions` كما يُسجَّل
 * أيُّ تعديل — والجدولُ يبقى مصدرَ الحقيقة الوحيد.
 */

/** ما يطلبه الأستاذ في صفٍّ واحد. */
export type InstructorRequestAction = "keep" | "change" | "delete" | "add";

/** حُكمُ النظام المسبق على البند: يمضي، أو يحتاج استثناءً، أو لا يجوز. */
export type InstructorRequestVerdictKind = "clear" | "exception" | "conflict";

/** قرارُ القسم على البند. */
export type InstructorRequestDecisionState = "pending" | "fixed" | "rejected";

/**
 * أسبابُ الرفض، من قائمةٍ مغلقة.
 *
 * الرفضُ الحرّ كان يُنتج جملاً لا تُقارن ولا تُحصى، ويدفع الأستاذَ إلى الهاتف
 * ليسأل «ليش؟». القائمةُ المغلقةُ تجعل السببَ قابلاً للعدّ عبر الفصول، وتترك
 * السطرَ الحرَّ لما لا تسعه: تفصيلُ الحالة، لا نوعُها.
 */
export type InstructorRequestRejectReason =
  | "room"            // لا قاعةَ مناسبة
  | "instructor"      // يتعارض مع أستاذٍ آخر
  | "regulation"      // مخالفةُ لائحة
  | "cohort"          // يتقاطع مع مقرّرٍ يشترك طلبتُه
  | "load"            // النصاب
  | "department"      // قرارُ قسم
  | "other";

export interface InstructorRequestSlot {
  day: "fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday";
  /** أيامُ النمط كلُّها حين يكون البديلُ نقلاً للمحاضرة بأيامها، لا ليومٍ واحد منها. */
  days?: Array<"fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday">;
  start: string;
  end: string;
}

/** لقطةُ صفٍّ كما تُقرأ، لا كما تُخزَّن — ليُفهم «كان» و«طلب» بلا فكّ رموز. */
export interface InstructorRequestSnapshot {
  courseId: number;
  courseName: string;
  /** Target teaching location for a new appointment. Existing rows inherit their own scope. */
  collegeId?: number;
  collegeName?: string;
  sectionId?: number;
  sectionCode: string;
  days: string;
  time: string;
  /** القاعة. تُملأ في «كان» وتبقى فارغةً في «طلب»: الأستاذ لا يختار قاعة. */
  room?: string;
}

export interface InstructorRequestReason {
  source: "regulation" | "instructor" | "room" | "cohort" | "window" | "shape";
  article?: string;
  text: string;
  blocking: boolean;
}

export interface InstructorRequestItem {
  /** الصفُّ الأصلي، و`null` في الإضافة. */
  rowId: number | null;
  action: InstructorRequestAction;
  before?: InstructorRequestSnapshot;
  /** ما طلبه الأستاذ. **لا يحمل قاعةً أبداً.** */
  after?: InstructorRequestSnapshot;
  /** اليومُ والبدايةُ كما اختارهما، والنهايةُ محسوبةٌ باللائحة. */
  slots?: InstructorRequestSlot[];
  verdict?: InstructorRequestVerdictKind;
  reasons?: InstructorRequestReason[];
  /** سببُ الاستثناء حين يطلبه النظام. إلزاميٌّ في `exception` وحده. */
  excuse?: string;
  /** القاعاتُ المرشّحة — **للقسم وحده**، ولا تُرسل إلى صفحة الأستاذ. */
  roomCandidates?: string[];
  /** أقربُ الأوقات المتاحة حين يُمنع الطلب. */
  nearestTimes?: InstructorRequestSlot[];
  decision?: {
    state: InstructorRequestDecisionState;
    reasonCode?: InstructorRequestRejectReason;
    note?: string;
    /** بدائلُ يعرضها القسم فيختار الأستاذ منها. */
    alternatives?: InstructorRequestSlot[];
    decidedBy?: string;
    decidedAt?: string;
    /** الصفُّ الذي أنتجه التثبيت، ليُربط القرارُ بأثره في الجدول. */
    scheduleId?: number;
  };
  /** البديلُ الذي اختاره الأستاذ بعد الرفض. */
  chosenAlternative?: InstructorRequestSlot;
}

/** حدثٌ في حياة الطلب. الأستاذ يراها كلَّها عن طلبه هو، ولا يرى طلبَ غيره. */
export type InstructorRequestEventKind =
  | "link-created" | "link-opened" | "submitted" | "received"
  | "item-fixed" | "item-rejected" | "alternative-offered" | "alternative-chosen"
  | "settled" | "schedule-approved";

export interface InstructorRequestEvent {
  kind: InstructorRequestEventKind;
  at: string;
  /** الصفةُ لا الاسم حين يكون الفاعلُ من القسم: «المنسّق»، «رئيس القسم». */
  by?: string;
  itemIndex?: number;
  detail?: string;
}

export type InstructorRequestStatus = "sent" | "submitted" | "in-review" | "settled";

export interface InstructorRequest {
  id: string;
  AdCollegeId: number;
  AdSectionId: number;
  AdTermId: number;
  AdInstructorId: number;
  /** رابطُ هذا الأستاذ وحده. هو المعرّفُ والبابُ معاً. */
  linkId: string;
  /** أولُ فتحٍ للرابط. غيابُه يعني أنه لم يُفتح، لا أنه لم يصل. */
  linkOpenedAt?: string;
  window: { opensAt: string; closesAt: string };
  /**
   * من أين جاءت المسوّدة: من جدولٍ منسوخٍ لهذا الفصل، أو من الفصل السابق حين
   * يُرسل الرابطُ قبل النسخ. الصفحةُ واحدةٌ والمصدرُ يختلف، ويُقال للأستاذ.
   */
  source: "draft" | "previous-term";
  status: InstructorRequestStatus;
  items: InstructorRequestItem[];
  timeline: InstructorRequestEvent[];
  createdAt: string;
  submittedAt?: string;
  /**
   * توقيعُ الأستاذ.
   *
   * ضغطةُ «أرسل» وحدَها لا تُثبت شيئاً: الرابطُ يصل في واتساب، ويُعاد توجيهه،
   * ويُفتح من هاتفٍ ليس هاتفَه. فيُطلب رقمُه المدنيُّ عند الإرسال، ويُطابَق
   * بسجلّه — وهو الشيءُ الذي لا يعرفه عنه غيرُه.
   *
   * ولا يُحفظ الرقمُ نفسُه: بصمتُه تُثبت أنه هو ولا تكشف رقمَه، ورمزٌ قصيرٌ
   * يُطبع على الورقة فيُطابَق بعد شهرين بورقةٍ في ملفّ.
   */
  signature?: InstructorRequestSignature;
  updatedAt: string;
}

export interface InstructorRequestSignature {
  at: string;
  /** بصمةُ الرقم المدني. تُثبت أنه هو، ولا تكشف رقمَه. */
  fingerprint: string;
  /** ستّةُ محارفَ تُطبع وتُطابَق. */
  verifyCode: string;
}

export interface SchedulePublication {
  id: string;
  scopeKey: string;
  AdCollegeId: number;
  AdSectionId: number;
  AdTermId: number;
  publishedAt: string;
  SystemUserId: number;
  userName: string;
  draftId?: string;
}

/**
 * The department's seconded teaching staff for one term.
 *
 * Visiting instructors change every term and belong to the department that
 * invited them, not to the university's permanent register — so they are kept
 * per scope and per term, and a new term starts by copying the previous list
 * rather than typing it again.
 */
export interface VisitingRoster {
  id: string;
  scopeKey: string;
  collegeId: number;
  sectionId: number;
  termId: number;
  instructorIds: number[];
  updatedAt: string;
}

/** Persistent department-owned directory of visiting instructors.
 * Unlike VisitingRoster this survives term changes; the roster is only the
 * subset teaching in one term. The same person may appear in several
 * departments without being duplicated in the instructor register. */
export interface DepartmentDelegateDirectory {
  id: string;
  scopeKey: string;
  collegeId: number;
  sectionId: number;
  instructorIds: number[];
  updatedAt: string;
}

/** Rooms the department has used or deliberately pinned for future use. */
export interface DepartmentRoomDirectory {
  id: string;
  scopeKey: string;
  collegeId: number;
  sectionId: number;
  rooms: Array<{ building: string; hall: string }>;
  updatedAt: string;
}

/* ══════════════════════════════════════════════════════════════════════════
   دورة اعتماد الجدول
   ══════════════════════════════════════════════════════════════════════════

   الجدول في هذا النظام كان حقيقةً واحدة: صفوفٌ محفوظة. وهذه الإضافة تجعل له
   سيرةً أيضاً — من وقّعه، ومتى أُرسل، وكم مرّة عاد، وعلى أيّ خانةٍ اختلف
   الطرفان. السيرة تُحفظ بجانب الصفوف ولا تمسّها، فكل ما كان يعمل قبلها يعمل
   بعدها بلا فرق.                                                            */

/**
 * حالة القسم في فصلٍ واحد.
 *
 * «قيد الإعداد» هي الحالة الضمنية لكل قسم لم يبدأ الدورة بعد — ولذلك لا يُنشأ
 * سجلّ لها إطلاقاً. أول توقيعٍ هو ما يُنشئ السجل.
 */
export type ScheduleApprovalStatus =
  | "drafting"    // قيد الإعداد
  | "committee"   // موقّع من لجنة الجدول
  | "head"        // موقّع من رئيس القسم — جاهز للإرسال
  | "submitted"   // عند التسجيل
  | "returned"    // مُرجَع بملاحظات
  | "accepted";   // معتمد

/** توقيعٌ واحد، مشدودٌ إلى نسخةٍ بعينها من الجدول. */
export interface ScheduleApprovalSignature {
  stage: "committee" | "head";
  SystemUserId: number;
  userName: string;
  /** اسم الدور كما يُطبع في الوثيقة: «رئيس لجنة الجدول» أو «رئيس القسم العلمي». */
  roleLabel: string;
  at: string;
  /** النسخة التي وُقّعت. بها يُعرف ما أُضيف بعد التوقيع. */
  versionId?: string;
  /** عدد الصفوف لحظة التوقيع — الدليل الرخيص على أن شيئاً أُضيف. */
  rowCount: number;
  /**
   * عدد الملاحظات اللائحية التي كانت ظاهرة وقت التوقيع.
   *
   * اللائحة لا تمنع، لكنها لا تُنسى: يُطبع مع التوقيع «وقّع مع علمه بكذا
   * ملاحظة لائحية»، فيبقى القرار للموقّع وتبقى المسؤولية موثّقة.
   */
  regulationNoticeCount?: number;
  /** رمز تحقّق قصير يُطبع في الوثيقة ويُشتقّ من النسخة الموقّعة. */
  verifyCode: string;
}

/** جولةٌ واحدة بين القسم والتسجيل: تبدأ بإرجاع، وتنتهي بإعادة إرسال. */
export interface ScheduleApprovalRound {
  number: number;
  /** من أرسل، ومتى. */
  submittedAt?: string;
  submittedBy?: string;
  /** من أرجع، ومتى، وبكم ملاحظة. */
  returnedAt?: string;
  returnedBy?: string;
  returnedNoteCount?: number;
  /**
   * كم صفّاً تحرّك رداً على ملاحظات هذه الجولة.
   *
   * يُحسب لحظةَ إعادة الإرسال بمقارنة الجدول بالنسخة التي رآها التسجيل، فيقرأ
   * الشريطُ الزمني «أُرجعت بأربع ملاحظات، فتحرّك خمسة صفوف» — وهو ما يُقاس به
   * الردّ: عددُ الملاحظات يقول ما طُلب، وعددُ الصفوف يقول ما فُعل.
   */
  changedRowCount?: number;
  /** من قبِل، ومتى. */
  acceptedAt?: string;
  acceptedBy?: string;
  /** النسخة التي رآها التسجيل في هذه الجولة — أساس المقارنة للجولة التالية. */
  reviewedVersionId?: string;
  /** النسخة كما قبِلها التسجيل — ما يراه العميد جدولاً نهائياً حتى يُقبل غيره. */
  acceptedVersionId?: string;
}

/**
 * صفٌّ أُضيف بعد التوقيع وينتظر إقرار رئيس القسم.
 *
 * التوقيع مرّة واحدة، وكلُّ تعديلٍ بعده يمرّ — إلا إضافة شعبة أو مقرر، فهي
 * وحدها ما لم يره رئيس القسم حين وقّع. والإقرار ضغطةٌ واحدة، لا توقيعٌ جديد.
 */
export interface ScheduleAdditionPending {
  scheduleId: number;
  courseId: number;
  courseName?: string;
  sectionCode?: string;
  addedAt: string;
  addedBy: string;
}

/** سجلّ الاعتماد لقسمٍ واحد في فصلٍ واحد. مفتاحه scopeKey نفسه المستعمل في النسخ. */
export interface ScheduleApproval {
  id: string;
  scopeKey: string;
  AdCollegeId: number;
  AdSectionId: number;
  AdTermId: number;
  status: ScheduleApprovalStatus;
  signatures: ScheduleApprovalSignature[];
  rounds: ScheduleApprovalRound[];
  /** الجولة الجارية. الإرسال الأول هو الجولة ١. */
  currentRound: number;
  pendingAdditions: ScheduleAdditionPending[];
  /** تمديدٌ خاصّ بهذا القسم يتجاوز موعد الفصل، بسببه ومن منحه. */
  extensionUntil?: string;
  extensionReason?: string;
  extensionBy?: string;
  extensionAt?: string;
  updatedAt: string;
}
