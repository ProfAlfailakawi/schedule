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

export interface FSchedule {
  id: number;
  AdCollegeId: number;
  AdSectionId: number;
  AdTermId: number;
  AdCourseId: number;
  AdCourseName: string;
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
  fdetail?: string;
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
 * A student's answer to «أي المقررات تحتاج؟», and deliberately the thinnest
 * record this system holds.
 *
 * **There is no name and there is no civil ID here.** The civil ID is typed,
 * checked against the Kuwaiti checksum so an invented number is refused, then
 * hashed on the server and thrown away — what survives is a fingerprint that
 * can tell two submissions apart and can never be turned back into a person.
 * The name is asked for, shown back on the confirmation so the student knows
 * their own answer landed, and never written anywhere.
 *
 * That is not caution for its own sake. A department needs counts and needs to
 * know that forty answers came from forty people; it does not need to know who
 * they are, and a table that says who wanted what is a thing that can be
 * misused, subpoenaed, leaked, or simply read by someone it was not meant for.
 * The cheapest way to protect it is not to have it.
 *
 * The fingerprint is still a JOIN key: the registrar's own civil IDs, hashed
 * with the same secret, match these exactly — so the department keeps the
 * ability to cross-check without ever holding an identity.
 */
export interface StudentNeed {
  id: string;
  /** HMAC of the civil ID. Distinguishes people; identifies nobody. */
  fingerprint: string;
  AdCollegeId: number;
  /** The section the LINK belongs to — never something the student picks. */
  AdSectionId: number;
  AdTermId: number;
  /** Every course this student says they need. */
  courseIds: number[];
  createdAt: string;
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
}


export type ScheduleConstraintType = "instructor_latest_end" | "instructor_day_off" | "department_day_off" | "course_room" | "max_instructor_gap" | "room_doorway";

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
  kind?: "department" | "staff" | "survey";
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
