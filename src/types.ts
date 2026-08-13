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
  status: number;
}

// Additive smart-workspace records. They live beside the verified legacy tables and never
// change their schema or semantics.
export interface ScheduleVersion {
  id: string;
  scopeKey: string;
  createdAt: string;
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
}


export type ScheduleConstraintType = "instructor_latest_end" | "instructor_day_off" | "department_day_off" | "course_room" | "max_instructor_gap";

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
  kind?: "department" | "staff";
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
