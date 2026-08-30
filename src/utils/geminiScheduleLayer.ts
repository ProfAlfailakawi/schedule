import type { FSchedule } from "../types";
import { normalizeClock } from "./scheduleTime";
import { DAY_FLAGS, DAY_LABELS, parseNaturalQuery } from "./naturalQuery";

export type GeminiScheduleFunctionName =
  | "check_conflicts"
  | "find_rooms"
  | "check_instructors"
  | "check_regulations"
  | "simulate_schedule";

export const GEMINI_SCHEDULE_FUNCTION_NAMES: GeminiScheduleFunctionName[] = [
  "check_conflicts",
  "find_rooms",
  "check_instructors",
  "check_regulations",
  "simulate_schedule",
];

const allowedFunctionNames = new Set<string>(GEMINI_SCHEDULE_FUNCTION_NAMES);
const mutationWords = /(create|update|delete|replace|publish|commit|save|apply|execute|write|drop|truncate|اعتمد|انشر|احفظ|نفذ|طبّق|طبق|احذف)/i;

export interface SmartImportContext {
  collegeId: number;
  sectionId: number;
  termId: number;
}

export interface GeminiScheduleCall {
  name: GeminiScheduleFunctionName;
  args: Record<string, unknown>;
}

export function extractJsonObject(text: unknown): any | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(clean); } catch { /* fall through */ }
  const first = clean.search(/[\[{]/);
  if (first < 0) return null;
  for (let end = clean.length; end > first; end -= 1) {
    const candidate = clean.slice(first, end).trim();
    if (!candidate.endsWith("}") && !candidate.endsWith("]")) continue;
    try { return JSON.parse(candidate); } catch { /* keep shrinking */ }
  }
  return null;
}

const asciiDigits = (value: unknown) => String(value ?? "")
  .normalize("NFKC")
  .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

function boolDay(raw: any, key: typeof DAY_FLAGS[number], label: string) {
  const value = raw?.[key];
  if (value === true || value === 1 || String(value).toLowerCase() === "true") return true;
  const text = asciiDigits([raw?.days, raw?.day, raw?.["الأيام"], raw?.weekday].filter(Boolean).join(" "));
  return text.includes(label) || new RegExp(`\\b${DAY_FLAGS.indexOf(key) + 1}\\b`).test(text);
}

function readTimePair(raw: any) {
  const directStart = raw?.fstarttime ?? raw?.startTime ?? raw?.start ?? raw?.from;
  const directEnd = raw?.fendtime ?? raw?.endTime ?? raw?.end ?? raw?.to;
  if (directStart || directEnd) return { start: normalizeClock(String(directStart || "")), end: normalizeClock(String(directEnd || "")) };
  const time = asciiDigits(raw?.time ?? raw?.["الوقت"] ?? "");
  const pair = time.match(/(\d{1,2})\s*:?\s*(\d{2})\s*[-–—]\s*(\d{1,2})\s*:?\s*(\d{2})/);
  if (!pair) return { start: "", end: "" };
  return { start: normalizeClock(`${pair[1]}:${pair[2]}`), end: normalizeClock(`${pair[3]}:${pair[4]}`) };
}

export function normalizeGeminiScheduleRows(input: unknown, context: SmartImportContext): any[] {
  const root: any = Array.isArray(input) ? { rows: input } : input;
  const rows = Array.isArray(root?.rows) ? root.rows : Array.isArray(root?.schedule) ? root.schedule : [];
  return rows.slice(0, 450).map((raw: any, index: number) => {
    const time = readTimePair(raw);
    const row: any = {
      id: Number.isFinite(Number(raw?.id)) ? Number(raw.id) : -(index + 1),
      AdCollegeId: context.collegeId,
      AdSectionId: context.sectionId,
      AdTermId: context.termId,
      AdCourseId: Number(raw?.AdCourseId ?? raw?.courseId ?? 0),
      AdCourseName: String(raw?.AdCourseName ?? raw?.courseName ?? raw?.["المقرر الدراسي"] ?? "").trim(),
      SCode: asciiDigits(raw?.SCode ?? raw?.section ?? raw?.sectionCode ?? raw?.["الشعبة"] ?? "").replace(/\D/g, "").slice(0, 4),
      AdInstructorId: Number(raw?.AdInstructorId ?? raw?.instructorId ?? 0),
      fsunday: boolDay(raw, "fsunday", DAY_LABELS[0]),
      fmonday: boolDay(raw, "fmonday", DAY_LABELS[1]),
      ftuesday: boolDay(raw, "ftuesday", DAY_LABELS[2]),
      fwednesday: boolDay(raw, "fwednesday", DAY_LABELS[3]),
      fthursday: boolDay(raw, "fthursday", DAY_LABELS[4]),
      fstarttime: time.start,
      fendtime: time.end,
      AdRoomCode: String(raw?.AdRoomCode ?? raw?.building ?? raw?.buildingCode ?? raw?.["المبنى"] ?? "").trim().slice(0, 40),
      AdRoomHall: String(raw?.AdRoomHall ?? raw?.room ?? raw?.hall ?? raw?.["القاعة"] ?? "").trim().slice(0, 40),
      buildingId: String(raw?.buildingId || "").trim() || undefined,
      roomId: String(raw?.roomId || "").trim() || undefined,
      locationStatus: raw?.locationStatus,
      sourceCourseCode: String(raw?.sourceCourseCode ?? raw?.courseCode ?? raw?.["رمز المقرر"] ?? "").trim().slice(0, 40) || undefined,
      sourceCourseText: String(raw?.sourceCourseText ?? raw?.courseText ?? raw?.["المقرر الدراسي"] ?? "").trim().slice(0, 220) || undefined,
      sourceSectionText: String(raw?.sourceSectionText ?? raw?.sectionText ?? raw?.["الشعبة"] ?? "").trim().slice(0, 40) || undefined,
      sourceInstructorText: String(raw?.sourceInstructorText ?? raw?.instructorName ?? raw?.["أستاذ المقرر"] ?? "").trim().slice(0, 180) || undefined,
      sourceBuildingText: String(raw?.sourceBuildingText ?? raw?.building ?? raw?.["المبنى"] ?? "").trim().slice(0, 80) || undefined,
      sourceRoomText: String(raw?.sourceRoomText ?? raw?.room ?? raw?.hall ?? raw?.["القاعة"] ?? "").trim().slice(0, 80) || undefined,
      referenceNumber: String(raw?.referenceNumber ?? raw?.crn ?? raw?.reference ?? "").trim().slice(0, 30),
      sourceOrder: Number.isFinite(Number(raw?.sourceOrder)) ? Number(raw.sourceOrder) : index + 1,
      sourcePage: Number.isFinite(Number(raw?.sourcePage)) ? Math.max(1, Math.floor(Number(raw.sourcePage))) : undefined,
      importEvidence: raw?.importEvidence && typeof raw.importEvidence === "object" ? raw.importEvidence : undefined,
    };
    row.fdetail = DAY_FLAGS.map((key, dayIndex) => row[key] ? String(dayIndex + 1) : "").filter(Boolean).join(",");
    return row;
  });
}

// Personal identifiers (civil/national IDs) must never leave the server to
// Google. This is the single place that builds the catalogue we send to Gemini,
// so the redaction cannot drift: instructors are exposed by id + name only, and
// any civil-shaped key is defensively stripped.
const CIVIL_KEY = /civil|nationalid|national_id|ssn|الرقم.?المدني|مدني/i;

export function buildSmartImportCatalogue(
  courses: any[],
  instructors: any[],
  limits: { courses?: number; instructors?: number } = {},
) {
  const scrub = (entry: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(entry).filter(([key]) => !CIVIL_KEY.test(key)));
  return {
    courses: courses.slice(0, limits.courses ?? 260).map((course: any) => scrub({
      id: course.AdCourseId, code: course.CourseCode, name: course.CourseName, hours: course.CourseHours,
    })),
    instructors: instructors.slice(0, limits.instructors ?? 360).map((person: any) => scrub({
      id: person.AdInstructorId, name: person.AdInstructorName,
    })),
  };
}

export function bindGeminiRowsToCatalogue(rows: any[], courses: any[], instructors: any[]) {
  const courseById = new Map(courses.map((course: any) => [Number(course.AdCourseId), course]));
  const courseByCode = new Map(courses.map((course: any) => [asciiDigits(course.CourseCode).trim().toLowerCase(), course]));
  const instructorById = new Map(instructors.map((person: any) => [Number(person.AdInstructorId), person]));
  const instructorByCivil = new Map(instructors.map((person: any) => [asciiDigits(person.AdInstructorCivil).trim(), person]));
  const instructorByName = new Map(instructors.map((person: any) => [String(person.AdInstructorName || "").trim().toLowerCase(), person]));
  return rows.map(row => {
    const course = courseById.get(Number(row.AdCourseId)) || courseByCode.get(asciiDigits(row.sourceCourseCode || row.courseCode || "").trim().toLowerCase());
    /* «هيئة تدريسية» and its cousins are how a model says "somebody" — never a
       person. Even when the registry happens to hold a row by that name, binding
       it would put a real id behind a guess, so placeholders bind to no one. */
    const writtenName = String(row.sourceInstructorText || row.instructorName || "").trim();
    const instructor = instructorById.get(Number(row.AdInstructorId))
      || instructorByCivil.get(asciiDigits(row.instructorCivil || row.sourceInstructorCivil || ""))
      || (writtenName && !PLACEHOLDER.test(writtenName) ? instructorByName.get(writtenName.toLowerCase()) : undefined);
    return {
      ...row,
      AdCourseId: Number(course?.AdCourseId || row.AdCourseId || 0),
      AdCourseName: course?.CourseName || row.AdCourseName || "",
      AdInstructorId: Number(instructor?.AdInstructorId || row.AdInstructorId || 0),
    };
  });
}

/* Filling gaps, never rewriting a reading.
 *
 * The approved engine's output is the record. A sharper second reading may only
 * supply a cell that came back EMPTY: no row is added, removed, reordered, or
 * overwritten, so a page with one blank cell can never lose the twenty-seven
 * rows it read correctly. If the two readings disagree on a filled cell, the
 * approved engine wins and the disagreement is reported, not applied.
 */
const FILLABLE_TEXT = ["AdRoomCode","AdRoomHall","fstarttime","fendtime","SCode","AdCourseName","referenceNumber"] as const;
const FILLABLE_ID = ["AdCourseId","AdInstructorId"] as const;
/* Registry identifiers are resolved from the visible codes by the location
   registry, not read off the page. Proposing them would ask a reviewer to
   approve an opaque string they cannot check against the document, so the
   sharper reading offers only what is printed there. */
const FILLABLE_REF = [] as const;

/* Placeholders a model reaches for when it cannot read a cell. Treating them as
   values is how a blank turned into «هيئة تدريسية» across a whole page, so they
   are stripped before anything is filled. */
const PLACEHOLDER = /^(?:—|-|–|_+|\.+|n\/?a|tba|tbd|unknown|none|null|undefined|غير\s*محدد|غير\s*معروف|غير\s*متاح|لا\s*يوجد|هيئة\s*تدريسية|أستاذ\s*المقرر|بدون)$/i;

const blankText = (value: unknown) => {
  const text = String(value ?? "").trim();
  return !text || PLACEHOLDER.test(text);
};

/** A value that only says "somebody" or "something". Exported so the screen can
 *  refuse to offer one even if it ever reaches that far. */
export const isPlaceholderValue = (value: unknown) => blankText(value);
const blankId = (value: unknown) => !Number(value);
const hasNoDays = (row: any) => !DAY_FLAGS.some(flag => Boolean(row?.[flag]));

/* A candidate must be provably the SAME row, never merely the row in the same
 * position. Position matching paired section 501 with section 503 and copied a
 * building across unrelated rows, so it is gone: when no identifier matches, the
 * row is left exactly as the approved engine read it.
 */
function smartCandidate(row: any, pool: any[], usedIndexes: Set<number>) {
  const free = (index: number) => !usedIndexes.has(index);
  const same = (a: unknown, b: unknown) => {
    const left = String(a ?? "").trim(), right = String(b ?? "").trim();
    return Boolean(left) && left === right;
  };

  const reference = String(row?.referenceNumber ?? "").trim();
  if (reference) {
    const byReference = pool.findIndex((item, index) => free(index) && same(item?.referenceNumber, reference));
    if (byReference >= 0) return byReference;
  }
  const section = String(row?.SCode ?? "").trim();
  if (section) {
    const bySection = pool.findIndex((item, index) => free(index) && same(item?.SCode, section));
    if (bySection >= 0) return bySection;
  }
  /* A row whose own section is unreadable is still identifiable by where and
     when it meets — two lectures cannot share a start time and a room. */
  const start = String(row?.fstarttime ?? "").trim();
  if (start) {
    const byPlacement = pool.findIndex((item, index) => free(index)
      && same(item?.fstarttime, start)
      && (same(item?.AdRoomCode, row?.AdRoomCode) || same(item?.AdRoomHall, row?.AdRoomHall)));
    if (byPlacement >= 0) return byPlacement;
  }
  const courseCode = String(row?.sourceCourseCode ?? "").trim();
  if (courseCode && start) {
    const byCourse = pool.findIndex((item, index) => free(index)
      && same(item?.sourceCourseCode, courseCode) && same(item?.fstarttime, start));
    if (byCourse >= 0) return byCourse;
  }
  return -1;   // not provably the same row — leave it untouched
}

export const SMART_FIELD_LABELS: Record<string, string> = {
  AdCourseName: "المقرر", SCode: "الشعبة", AdRoomCode: "المبنى", AdRoomHall: "القاعة",
  fstarttime: "بداية الوقت", fendtime: "نهاية الوقت", referenceNumber: "الرقم المرجعي",
  AdCourseId: "ربط المقرر", AdInstructorId: "أستاذ المقرر", buildingId: "معرّف المبنى",
  roomId: "معرّف القاعة", days: "الأيام", sourceCourseCode: "رمز المقرر",
};

export interface SmartFill {
  rowIndex: number;
  page: number;
  section: string;
  course: string;
  field: string;
  label: string;
  value: string;
  days?: Record<string, boolean>;
  /** Registry ids that travel WITH a visible fill (a room's verified id rides
   *  with its printed code). Never shown — the reviewer approves what the page
   *  says; the registry linkage is bookkeeping that comes along. */
  carry?: Record<string, unknown>;
}

/** What the sharper reading WANTS to fill, described but not yet applied, so a
 *  person can see every proposed cell before a single one changes. */
export function proposeSmartFills(baseRows: any[], smartRows: any[], readPages: number[]) {
  const outcome = fillMissingCellsFromSmartRead(baseRows, smartRows, readPages, true);
  return { fills: outcome.fills, conflicts: outcome.conflicts, notes: outcome.notes };
}

/** Apply exactly the fills a person approved — nothing else is touched. */
/* Review-table evidence key for each fillable field. Writing a value without
 * flipping its evidence left the cell red and the row counted «للمراجعة» after
 * an approved fill — the 51 that refused to move. */
const EVIDENCE_KEY_BY_FIELD: Record<string, string> = {
  AdCourseName: "course", AdCourseId: "course", sourceCourseCode: "course",
  SCode: "section", days: "days",
  fstarttime: "time", fendtime: "time",
  AdInstructorId: "instructor",
  AdRoomCode: "building", AdRoomHall: "room",
};

export function applySmartFills(baseRows: any[], fills: SmartFill[]) {
  if (!Array.isArray(fills) || !fills.length) return baseRows;
  const byRow = new Map<number, SmartFill[]>();
  for (const fill of fills) {
    if (!byRow.has(fill.rowIndex)) byRow.set(fill.rowIndex, []);
    byRow.get(fill.rowIndex)!.push(fill);
  }
  return baseRows.map((row, index) => {
    const list = byRow.get(index);
    if (!list?.length) return row;
    const next: any = { ...row, importEvidence: { ...(row.importEvidence || {}) } };
    for (const fill of list) {
      if (fill.field === "days" && fill.days) {
        for (const flag of DAY_FLAGS) next[flag] = Boolean(fill.days[flag]);
        next.fdetail = DAY_FLAGS.map((flag, day) => next[flag] ? String(day + 1) : "").filter(Boolean).join(",");
      } else if ((FILLABLE_ID as readonly string[]).includes(fill.field)) {
        next[fill.field] = Number(fill.value);
      } else {
        next[fill.field] = fill.value;
      }
      /* An approved fill IS a resolution: the reviewer saw the value and said
         yes. Evidence flips with the cell, so the red drains, the counters
         move, and the page stops being counted as troubled. */
      if (fill.carry) Object.assign(next, fill.carry);
      const evidenceKey = EVIDENCE_KEY_BY_FIELD[fill.field];
      if (evidenceKey) {
        next.importEvidence[evidenceKey] = {
          ...(next.importEvidence[evidenceKey] || {}),
          confidence: "CONFIRMED", score: 95, source: "SMART", method: "SMART_FILL",
          derived: false, reason: "عُبّئت عبر القراءة الأدق واعتمدها المراجع.",
        };
      }
    }
    return next;
  });
}

export function fillMissingCellsFromSmartRead(baseRows: any[], smartRows: any[], readPages: number[], proposeOnly = false) {
  const pages = new Set(readPages.map(page => Number(page)).filter(Boolean));
  if (!pages.size || !Array.isArray(baseRows) || !baseRows.length) {
    return { rows: baseRows, filled: 0, conflicts: [] as string[], notes: [] as string[], fills: [] as SmartFill[] };
  }
  const byPage = new Map<number, any[]>();
  for (const row of Array.isArray(smartRows) ? smartRows : []) {
    const page = Number(row?.sourcePage) || 1;
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page)!.push(row);
  }
  const used = new Map<number, Set<number>>();
  const conflicts: string[] = [];
  const notes: string[] = [];
  const fills: SmartFill[] = [];

  /* Corroboration before contribution. A candidate may only fill blanks when
     everything BOTH readings saw agrees, on at least two cells — one shared
     identifier is how section 505's building landed on section 503. And one
     contradiction on any readable cell voids the whole candidate: a reading
     that got the start time wrong has no business supplying the instructor. */
  /* Identity fields decide; bookkeeping fields advise. A wrong start time means
     a different (or invented) meeting — the row is void. But a reference number
     is a long digit string one of the two readers often garbles: when section,
     time and room agree, a garbled reference must not throw away the row — it
     only disqualifies itself and is reported. That one rule was silently
     discarding most of a page. A MATCHING reference still counts double, since
     a CRN is unique by construction. */
  const STRONG_FIELDS = ["SCode","fstarttime","fendtime","AdRoomCode","AdRoomHall"] as const;
  const SOFT_FIELDS = ["referenceNumber","sourceCourseCode"] as const;
  const corroborates = (row: any, candidate: any) => {
    let agreements = 0;
    const distrusted: string[] = [];
    /* Proven identity outranks a garbled clock. A CRN is unique by construction;
       CRN + section agreeing means this IS the same row, and a start time one of
       the two readers misread should cost that reader its clock — not cost the
       row its rescue. Without that double proof, the old strictness stands. */
    const same = (field: string) => {
      const ours = String(row?.[field] ?? "").trim(), theirs = String(candidate?.[field] ?? "").trim();
      return !blankText(ours) && !blankText(theirs) && ours === theirs;
    };
    const identityProven = same("referenceNumber") && same("SCode");
    for (const field of STRONG_FIELDS) {
      const ours = String(row?.[field] ?? "").trim(), theirs = String(candidate?.[field] ?? "").trim();
      if (blankText(ours) || blankText(theirs)) continue;
      if (ours !== theirs) {
        if (identityProven) { distrusted.push(field); continue; }
        return { ok: false, field, distrusted };
      }
      agreements += 1;
    }
    for (const field of SOFT_FIELDS) {
      let ours = String(row?.[field] ?? "").trim(), theirs = String(candidate?.[field] ?? "").trim();
      if (blankText(ours) || blankText(theirs)) continue;
      if (field === "sourceCourseCode") {
        /* The approved reader stores the 7-digit authority code; the page often
           prints a short department code. Different shapes are different
           dialects, not a disagreement — compare digits, and accept a suffix
           match. Only a same-shape clash earns distrust. */
        const oursDigits = ours.replace(/\D/g, ""), theirsDigits = theirs.replace(/\D/g, "");
        if (!oursDigits || !theirsDigits) continue;
        if (oursDigits === theirsDigits || oursDigits.endsWith(theirsDigits) || theirsDigits.endsWith(oursDigits)) { agreements += 1; continue; }
        if (oursDigits.length !== theirsDigits.length) continue;   // structurally different — silence, not noise
        distrusted.push(field); continue;
      }
      if (ours !== theirs) { distrusted.push(field); continue; }
      agreements += field === "referenceNumber" ? 2 : 1;
    }
    // Days count too: if both readings have days and they differ, the candidate
    // is describing a different meeting — or inventing one.
    if (!hasNoDays(row) && !hasNoDays(candidate)) {
      let daysAgree = true;
      for (const flag of DAY_FLAGS) {
        if (Boolean(row?.[flag]) !== Boolean(candidate?.[flag])) { daysAgree = false; break; }
      }
      if (!daysAgree) {
        if (!identityProven) return { ok: false, field: "days", distrusted };
        distrusted.push("days");
      } else {
        agreements += 1;
      }
    }
    return { ok: agreements >= 2, field: "", distrusted };
  };

  const rows = baseRows.map((row, rowIndex) => {
    const page = Number(row?.sourcePage) || 1;
    if (!pages.has(page)) return row;                 // page was read cleanly — untouched
    const pool = byPage.get(page) || [];
    if (!pool.length) return row;
    if (!used.has(page)) used.set(page, new Set());
    const index = smartCandidate(row, pool, used.get(page)!);
    if (index < 0) return row;
    used.get(page)!.add(index);
    const candidate = pool[index];
    const witness = corroborates(row, candidate);
    if (!witness.ok) {
      if (witness.field) {
        const where = String(row?.SCode ?? "").trim() || String(row?.AdCourseName ?? "").trim() || `صف ${rowIndex + 1}`;
        conflicts.push(`${where} (صفحة ${page}): القراءتان اختلفتا في ${SMART_FIELD_LABELS[witness.field] || witness.field} — أُهمل اقتراح هذا الصف كاملاً.`);
      }
      return row;                                     // not certain ⇒ not offered
    }
    const distrustedFields = new Set<string>(witness.distrusted);
    for (const field of witness.distrusted) {
      const where = String(row?.SCode ?? "").trim() || String(row?.AdCourseName ?? "").trim() || `صف ${rowIndex + 1}`;
      notes.push(`${where} (صفحة ${page}): القراءتان اختلفتا في ${SMART_FIELD_LABELS[field] || field} — بقي الصف، وأُهمل هذا الحقل وحده.`);
    }
    const next: any = { ...row };
    const describe = (field: string, value: string, days?: Record<string, boolean>) => {
      let carry: Record<string, unknown> | undefined;
      if (field === "AdRoomCode" && candidate?.buildingId) carry = { buildingId: candidate.buildingId };
      if (field === "AdRoomHall" && candidate?.roomId) {
        carry = { roomId: candidate.roomId };
        if (candidate?.buildingId) carry.buildingId = candidate.buildingId;
        if (candidate?.locationStatus === "VERIFIED") carry.locationStatus = "VERIFIED";
      }
      fills.push({
        rowIndex, page,
        section: String(row?.SCode ?? "").trim(),
        course: String(row?.AdCourseName ?? "").trim(),
        field, label: SMART_FIELD_LABELS[field] || field, value, days, carry,
      });
    };

    for (const field of FILLABLE_TEXT) {
      if (distrustedFields.has(field)) continue;
      /* A location is only an answer once the registry recognises it. Offering
         a code the registry could not link fills the cell with text that still
         counts as missing — a red cell with a value inside it, which is worse
         than an honest blank. The server drops unlinked codes; this is the
         guarantee that holds even if it ever forgets to. */
      if (field === "AdRoomCode" && !candidate?.buildingId) continue;
      if (field === "AdRoomHall" && !candidate?.roomId) continue;
      if (!blankText(next[field])) continue;
      const value = String(candidate?.[field] ?? "").trim();
      // blankText also rejects the model's placeholders, so a guess never lands.
      if (value && !blankText(value)) { describe(field, value); if (!proposeOnly) next[field] = value; }
    }
    /* «هيئة تدريسية» may be exactly what the page prints — a correct reading of
       "not assigned yet", not an invention. Either way it names no one, so it
       fills nothing; but saying so is more useful than dropping it in silence,
       because the reviewer then knows to assign the row by hand. */
    const writtenTeacher = String(candidate?.sourceInstructorText ?? candidate?.instructorName ?? "").trim();
    if (blankId(next.AdInstructorId) && writtenTeacher && PLACEHOLDER.test(writtenTeacher)) {
      const where = String(row?.SCode ?? "").trim() || String(row?.AdCourseName ?? "").trim() || `صف ${rowIndex + 1}`;
      notes.push(`${where} (صفحة ${page}): المطبوع في الورقة «${writtenTeacher}» — لا يُربط بأستاذ، يحتاج إسناداً يدوياً.`);
    }
    for (const field of FILLABLE_ID) {
      if (!blankId(next[field])) continue;
      const value = Number(candidate?.[field]);
      if (Number.isFinite(value) && value > 0) { describe(field, String(value)); if (!proposeOnly) next[field] = value; }
    }
    for (const field of FILLABLE_REF) {
      if (!blankText(next[field])) continue;
      const value = String(candidate?.[field] ?? "").trim();
      if (value) { describe(field, value); if (!proposeOnly) next[field] = value; }
    }
    // Days move as one unit: a half-filled week is worse than an empty one.
    if (hasNoDays(next) && !hasNoDays(candidate)) {
      const days = Object.fromEntries(DAY_FLAGS.map(flag => [flag, Boolean(candidate?.[flag])]));
      describe("days", DAY_FLAGS.map((flag, day) => days[flag] ? DAY_LABELS[day] : "").filter(Boolean).join("، "), days);
      if (!proposeOnly) {
        for (const flag of DAY_FLAGS) next[flag] = days[flag];
        next.fdetail = DAY_FLAGS.map((flag, day) => next[flag] ? String(day + 1) : "").filter(Boolean).join(",");
      }
    }
    // Disagreements on cells that were already read are reported, never applied.
    const section = String(row?.SCode ?? "").trim();
    if (section && String(candidate?.SCode ?? "").trim() && String(candidate.SCode).trim() !== section) {
      conflicts.push(`الشعبة ${section} (صفحة ${page}): القراءة الأدق تقترح ${String(candidate.SCode).trim()} — أُبقيت قراءة المحرك المعتمد.`);
    }
    return next;
  });

  return { rows, filled: fills.length, conflicts: conflicts.slice(0, 20), notes: [...new Set(notes)].slice(0, 20), fills };
}

export function sanitizeGeminiScheduleCalls(input: unknown): GeminiScheduleCall[] {
  const root: any = Array.isArray(input) ? { calls: input } : input;
  const rawCalls = Array.isArray(root?.functionCalls) ? root.functionCalls
    : Array.isArray(root?.calls) ? root.calls
      : Array.isArray(root?.toolCalls) ? root.toolCalls
        : [];
  const safe: GeminiScheduleCall[] = [];
  for (const raw of rawCalls.slice(0, 8)) {
    const name = String(raw?.name ?? raw?.functionName ?? raw?.toolName ?? "").trim();
    if (!allowedFunctionNames.has(name) || mutationWords.test(name)) continue;
    const args = raw?.args && typeof raw.args === "object" ? raw.args : raw?.arguments && typeof raw.arguments === "object" ? raw.arguments : {};
    const cleanArgs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args).slice(0, 24)) {
      if (mutationWords.test(key) || key === "commit" || key === "confirmed") continue;
      if (typeof value === "string") cleanArgs[key] = value.slice(0, 240);
      else if (typeof value === "number" || typeof value === "boolean" || value == null) cleanArgs[key] = value;
      else if (Array.isArray(value)) cleanArgs[key] = value.slice(0, 20);
      else if (typeof value === "object") cleanArgs[key] = JSON.parse(JSON.stringify(value).slice(0, 2000));
    }
    safe.push({ name: name as GeminiScheduleFunctionName, args: cleanArgs });
  }
  return safe;
}

export function deterministicSchedulingCalls(text: string): GeminiScheduleCall[] {
  const parsed = parseNaturalQuery(text);
  const calls: GeminiScheduleCall[] = [];
  if (parsed.intent === "move" && parsed.code) {
    calls.push({ name: "simulate_schedule", args: { action: "move", code: parsed.code, dayIndex: parsed.day, time: parsed.time } });
    calls.push({ name: "check_conflicts", args: { code: parsed.code, dayIndex: parsed.day, time: parsed.time } });
    calls.push({ name: "check_regulations", args: { code: parsed.code, dayIndex: parsed.day, time: parsed.time } });
  } else if (parsed.intent === "freeRooms") {
    calls.push({ name: "find_rooms", args: { dayIndex: parsed.day, time: parsed.time } });
  } else if (parsed.intent === "instructor" || parsed.intent === "gaps") {
    calls.push({ name: "check_instructors", args: { name: parsed.name, dayIndex: parsed.day, time: parsed.time } });
  }
  return calls;
}

export function scheduleDelta(before: Partial<FSchedule>, after: Partial<FSchedule>) {
  const fields = ["fsunday","fmonday","ftuesday","fwednesday","fthursday","fstarttime","fendtime","AdRoomCode","AdRoomHall","AdInstructorId","SCode"] as const;
  return fields.filter(field => String((before as any)?.[field] ?? "") !== String((after as any)?.[field] ?? ""));
}
