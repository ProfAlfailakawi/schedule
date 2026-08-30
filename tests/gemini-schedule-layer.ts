import assert from "node:assert/strict";
import {
  applySmartFills,
  bindGeminiRowsToCatalogue,
  buildSmartImportCatalogue,
  fillMissingCellsFromSmartRead,
  proposeSmartFills,
  deterministicSchedulingCalls,
  extractJsonObject,
  normalizeGeminiScheduleRows,
  sanitizeGeminiScheduleCalls,
  scheduleDelta,
} from "../src/utils/geminiScheduleLayer";

const parsed = extractJsonObject("```json\n{\"rows\":[{\"courseCode\":\"101\"}],\"issues\":[]}\n```");
assert.equal(parsed.rows[0].courseCode, "101");

const calls = sanitizeGeminiScheduleCalls({
  functionCalls: [
    { name: "simulate_schedule", args: { code: "101", time: "11:00", commit: true } },
    { name: "updateSchedule", args: { id: 7 } },
    { name: "check_conflicts", args: { save: true, rowId: 7 } },
  ],
});
assert.equal(calls.length, 2);
assert.equal(calls[0].name, "simulate_schedule");
assert.equal(Object.hasOwn(calls[0].args, "commit"), false);
assert.equal(calls[1].name, "check_conflicts");
assert.equal(Object.hasOwn(calls[1].args, "save"), false);

const fallback = deterministicSchedulingCalls("انقل مقرر 101 إلى الأربعاء 11:00");
assert.deepEqual(fallback.map(call => call.name), ["simulate_schedule", "check_conflicts", "check_regulations"]);
assert.equal(fallback[0].args.code, "101");
assert.equal(fallback[0].args.dayIndex, 3);
assert.equal(fallback[0].args.time, "11:00");

const rows = normalizeGeminiScheduleRows({
  rows: [{
    courseCode: "١٠١",
    courseName: "مدخل",
    section: "٥٠١",
    days: "الأحد والثلاثاء والخميس",
    time: "08:00-09:20",
    instructorName: "د. نورة",
    building: "012B09",
    room: "F13",
    referenceNumber: "18945",
  }],
}, { collegeId: 6, sectionId: 9, termId: 20261 });
assert.equal(rows.length, 1);
assert.equal(rows[0].AdCollegeId, 6);
assert.equal(rows[0].SCode, "501");
assert.equal(rows[0].fsunday, true);
assert.equal(rows[0].ftuesday, true);
assert.equal(rows[0].fthursday, true);
assert.equal(rows[0].fstarttime, "08:00");
assert.equal(rows[0].fendtime, "09:20");
assert.equal(rows[0].sourceCourseCode, "١٠١");

const before: any = { fsunday: true, fmonday: false, fstarttime: "08:00", fendtime: "09:20", AdRoomCode: "012B09", AdRoomHall: "F13", AdInstructorId: 10, SCode: "501" };
const after: any = { ...before, fsunday: false, fmonday: true, fstarttime: "11:00", fendtime: "12:20" };
assert.deepEqual(scheduleDelta(before, after), ["fsunday", "fmonday", "fstarttime", "fendtime"]);

// Civil/national IDs must never be placed in the payload sent to Google.
const catalogue = buildSmartImportCatalogue(
  [{ AdCourseId: 1, CourseCode: "101", CourseName: "مدخل", CourseHours: 3 }],
  [{ AdInstructorId: 10, AdInstructorName: "د. نورة", AdInstructorCivil: "290010112233", civil: "290010112233" }],
);
const catalogueText = JSON.stringify(catalogue);
assert.equal(catalogueText.includes("290010112233"), false);
assert.equal(Object.hasOwn(catalogue.instructors[0], "civil"), false);
assert.equal(catalogue.instructors[0].name, "د. نورة");
assert.equal(catalogue.instructors[0].id, 10);

/* The sharper reading fills blanks and nothing else. These four assertions are
   the ones that matter: a page read cleanly is untouched, a filled cell is
   never overwritten, invented placeholders are refused, and a missing page list
   fills nothing rather than replacing a correct table. */
const approved = [
  { sourcePage: 1, sourceOrder: 1, SCode: "501", AdCourseId: 7, AdCourseName: "الثقافة الإسلامية", AdInstructorId: 4, AdRoomCode: "012B09", AdRoomHall: "F13", fstarttime: "08:00", fendtime: "09:20", fsunday: true, referenceNumber: "18945" },
  { sourcePage: 1, sourceOrder: 2, SCode: "502", AdCourseId: 0, AdCourseName: "", AdInstructorId: 0, AdRoomCode: "012B07", AdRoomHall: "", fstarttime: "", fendtime: "", referenceNumber: "18946" },
  { sourcePage: 2, sourceOrder: 1, SCode: "601", AdCourseId: 9, AdCourseName: "مقرر سليم", AdInstructorId: 5, AdRoomCode: "012B10", AdRoomHall: "F20", fstarttime: "10:00", fendtime: "10:50", fmonday: true, referenceNumber: "18950" },
];
const smart = [
  { sourcePage: 1, SCode: "501", AdCourseName: "اسم مختلف تماماً", AdRoomHall: "Z99", fstarttime: "23:00", referenceNumber: "18945" },
  { sourcePage: 1, SCode: "502", AdCourseName: "مبادئ الإدارة", AdRoomHall: "F31", roomId: "room-31", buildingId: "b-7", fstarttime: "11:00", fendtime: "11:50", ftuesday: true, referenceNumber: "18946" },
  { sourcePage: 2, SCode: "601", AdCourseName: "هيئة تدريسية", AdRoomHall: "زائف", referenceNumber: "18950" },
];
const outcome = fillMissingCellsFromSmartRead(approved, smart, [1]);
// The clean cells of row 1 survive untouched — no overwrite, ever.
assert.equal(outcome.rows[0].AdCourseName, "الثقافة الإسلامية");
assert.equal(outcome.rows[0].AdRoomHall, "F13");
assert.equal(outcome.rows[0].fstarttime, "08:00");
// The blank cells of row 2 are filled from the sharper reading.
assert.equal(outcome.rows[1].AdCourseName, "مبادئ الإدارة");
assert.equal(outcome.rows[1].AdRoomHall, "F31");
assert.equal(outcome.rows[1].fstarttime, "11:00");
assert.equal(outcome.rows[1].ftuesday, true);
// Page 2 was not re-read, so it is identical to what the approved engine wrote.
assert.deepEqual(outcome.rows[2], approved[2]);
assert.equal(outcome.rows.length, approved.length);

// A generic placeholder is a refusal to read, not a value.
const placeheld = fillMissingCellsFromSmartRead(
  [{ sourcePage: 1, SCode: "701", AdCourseName: "", AdRoomHall: "" }],
  [{ sourcePage: 1, SCode: "701", AdCourseName: "هيئة تدريسية", AdRoomHall: "—" }],
  [1],
);
assert.equal(placeheld.rows[0].AdCourseName, "");
assert.equal(placeheld.rows[0].AdRoomHall, "");
assert.equal(placeheld.filled, 0);

// Without a page list nothing is filled — the correct table is never replaced.
const noPages = fillMissingCellsFromSmartRead(approved, smart, []);
assert.deepEqual(noPages.rows, approved);
assert.equal(noPages.filled, 0);

/* Proposing describes the change without making it; applying writes exactly the
   approved cells. A reviewer who declines must be left with the original. */
const proposal = proposeSmartFills(approved, smart, [1]);
assert.ok(proposal.fills.length > 0);
assert.deepEqual(approved[1].AdCourseName, "");            // proposing mutated nothing
assert.ok(proposal.fills.every(fill => fill.page === 1));  // page 2 was never offered
assert.ok(proposal.fills.some(fill => fill.field === "AdRoomHall" && fill.value === "F31"));
const applied = applySmartFills(approved, proposal.fills);
assert.equal(applied[1].AdRoomHall, "F31");
assert.equal(applied[0].AdRoomHall, "F13");                // a read cell stays read
assert.deepEqual(applied[2], approved[2]);                 // untouched page is identical
// Approving a subset writes that subset only.
const oneOnly = applySmartFills(approved, proposal.fills.filter(fill => fill.field === "AdRoomHall"));
assert.equal(oneOnly[1].AdRoomHall, "F31");
assert.equal(oneOnly[1].fstarttime, "");

/* Position is not identity. Pairing "the third row here" with "the third row
   there" once copied a building from section 503 onto section 501; a row that
   cannot be proven to be the same row must be left alone. */
const shifted = fillMissingCellsFromSmartRead(
  [{ sourcePage: 2, SCode: "501", AdRoomCode: "", fstarttime: "08:00", AdRoomHall: "F13" }],
  [{ sourcePage: 2, SCode: "503", AdRoomCode: "012F15", fstarttime: "13:00", AdRoomHall: "F40" }],
  [2],
);
assert.equal(shifted.rows[0].AdRoomCode, "");     // nothing borrowed from a different section
assert.equal(shifted.filled, 0);

// A row whose own section is unreadable is still matched by time + place.
const byPlacement = fillMissingCellsFromSmartRead(
  [{ sourcePage: 3, SCode: "", AdRoomCode: "012B07", fstarttime: "10:00", AdCourseName: "" }],
  [{ sourcePage: 3, SCode: "705", AdRoomCode: "012B07", fstarttime: "10:00", AdCourseName: "الإحصاء" }],
  [3],
);
assert.equal(byPlacement.rows[0].AdCourseName, "الإحصاء");
assert.equal(byPlacement.rows[0].SCode, "705");

/* Certainty means corroboration. A candidate that contradicts ANY cell the
   approved engine read — a start time, a room — is a different or invented
   meeting, and contributes nothing at all. */
const contradicted = fillMissingCellsFromSmartRead(
  [{ sourcePage: 1, SCode: "506", AdRoomCode: "012B09", fstarttime: "08:00", fendtime: "09:20", AdInstructorId: 0, sourceInstructorText: "" }],
  [{ sourcePage: 1, SCode: "506", AdRoomCode: "012B09", fstarttime: "10:00", fendtime: "10:50", instructorName: "د. مؤلّف" }],
  [1],
);
assert.equal(contradicted.filled, 0);
assert.ok(contradicted.conflicts.some(note => note.includes("اختلفتا")));

// One weak identifier is not certainty: two agreements or nothing.
const thinMatch = fillMissingCellsFromSmartRead(
  [{ sourcePage: 1, SCode: "701", AdCourseName: "", AdRoomCode: "", fstarttime: "", fendtime: "" }],
  [{ sourcePage: 1, SCode: "701", AdCourseName: "مقرر مقترح" }],
  [1],
);
assert.equal(thinMatch.filled, 0);

/* A reference number is unique by construction, so matching one is identity on
   its own. Demanding a second witness discarded rows we had already proven. */
const byReference = fillMissingCellsFromSmartRead(
  [{ sourcePage: 1, referenceNumber: "18945", SCode: "", AdCourseName: "", AdRoomHall: "" }],
  [{ sourcePage: 1, referenceNumber: "18945", SCode: "801", AdCourseName: "أصول الفقه", AdRoomHall: "F22", roomId: "room-22" }],
  [1],
);
assert.equal(byReference.rows[0].AdCourseName, "أصول الفقه");
assert.equal(byReference.rows[0].SCode, "801");
assert.equal(byReference.rows[0].AdRoomHall, "F22");

// A placeholder name binds to no one, even if the registry holds such a row.
const bound = bindGeminiRowsToCatalogue(
  [{ AdCourseId: 0, AdInstructorId: 0, sourceInstructorText: "هيئة تدريسية", sourceCourseCode: "101" }],
  [{ AdCourseId: 1, CourseCode: "101", CourseName: "مدخل" }],
  [{ AdInstructorId: 26, AdInstructorName: "هيئة تدريسية", AdInstructorCivil: "0" }],
);
assert.equal(bound[0].AdInstructorId, 0);
assert.equal(bound[0].AdCourseId, 1);   // the real course code still binds

/* «هيئة تدريسية» may be exactly what the Authority page prints — a correct
   reading of "not assigned yet". It still names nobody, so it fills nothing;
   but it is reported, because silence would leave the row unexplained. */
const printedPlaceholder = fillMissingCellsFromSmartRead(
  [{ sourcePage: 1, SCode: "501", AdInstructorId: 0, AdRoomCode: "012B09", fstarttime: "08:00" }],
  [{ sourcePage: 1, SCode: "501", AdInstructorId: 0, sourceInstructorText: "هيئة تدريسية", AdRoomCode: "012B09", fstarttime: "08:00" }],
  [1],
);
assert.equal(printedPlaceholder.rows[0].AdInstructorId, 0);
assert.equal(printedPlaceholder.filled, 0);
assert.ok(printedPlaceholder.notes.some(note => note.includes("هيئة تدريسية") && note.includes("501")));

/* The 51 that refused to move: an approved fill must flip its evidence, so the
   review counters and the red cells drain with it. */
const evidenced = applySmartFills(
  [{ sourcePage: 1, SCode: "501", AdRoomHall: "", importEvidence: { room: { confidence: "UNRESOLVED" }, time: { confidence: "CONFIRMED" } } }],
  [{ rowIndex: 0, page: 1, section: "501", course: "", field: "AdRoomHall", label: "القاعة", value: "F31" }],
);
assert.equal(evidenced[0].AdRoomHall, "F31");
assert.equal(evidenced[0].importEvidence.room.confidence, "CONFIRMED");
assert.equal(evidenced[0].importEvidence.room.source, "SMART");
assert.equal(evidenced[0].importEvidence.time.confidence, "CONFIRMED"); // untouched evidence survives

/* A garbled reference or course code must not discard a row whose section,
   time and room all agree — it only disqualifies itself, and is reported. */
const softClash = fillMissingCellsFromSmartRead(
  [{ sourcePage: 1, SCode: "501", fstarttime: "08:00", fendtime: "09:20", AdRoomCode: "012B09", AdRoomHall: "", referenceNumber: "18945", sourceCourseCode: "1023101" }],
  [{ sourcePage: 1, SCode: "501", fstarttime: "08:00", fendtime: "09:20", AdRoomCode: "012B09", AdRoomHall: "F13", roomId: "room-13", referenceNumber: "18948", sourceCourseCode: "1023102" }],
  [1],
);
assert.equal(softClash.rows[0].AdRoomHall, "F13");                 // the row survived and filled
assert.equal(softClash.rows[0].referenceNumber, "18945");          // the garbled fields stayed ours
assert.equal(softClash.rows[0].sourceCourseCode, "1023101");
assert.ok(softClash.notes.some(note => note.includes("بقي الصف")));
// A strong-field contradiction still voids the row entirely.
const strongClash = fillMissingCellsFromSmartRead(
  [{ sourcePage: 1, SCode: "501", fstarttime: "08:00", fendtime: "09:20", AdRoomCode: "012B09", AdRoomHall: "" }],
  [{ sourcePage: 1, SCode: "501", fstarttime: "10:00", fendtime: "10:50", AdRoomCode: "012B09", AdRoomHall: "F13" }],
  [1],
);
assert.equal(strongClash.rows[0].AdRoomHall, "");
assert.equal(strongClash.filled, 0);

/* Proven identity outranks a garbled clock: CRN + section agreeing means it IS
   the same row, so a start-time mismatch costs that clock its trust — never the
   row its rescue. Without the double proof, the old strictness stands. */
const provenIdentity = fillMissingCellsFromSmartRead(
  [{ sourcePage: 1, SCode: "501", referenceNumber: "18945", fstarttime: "08:00", fendtime: "09:20", AdRoomCode: "012B09", AdRoomHall: "" }],
  [{ sourcePage: 1, SCode: "501", referenceNumber: "18945", fstarttime: "08:30", fendtime: "09:20", AdRoomCode: "012B09", AdRoomHall: "F13", roomId: "room-13" }],
  [1],
);
assert.equal(provenIdentity.rows[0].AdRoomHall, "F13");        // rescued despite the clock
assert.equal(provenIdentity.rows[0].fstarttime, "08:00");      // our clock untouched
assert.ok(provenIdentity.notes.some(note => note.includes("بداية الوقت")));
// Same clock mismatch WITHOUT the reference proof → still voided.
const unproven = fillMissingCellsFromSmartRead(
  [{ sourcePage: 1, SCode: "501", fstarttime: "08:00", fendtime: "09:20", AdRoomCode: "012B09", AdRoomHall: "" }],
  [{ sourcePage: 1, SCode: "501", fstarttime: "08:30", fendtime: "09:20", AdRoomCode: "012B09", AdRoomHall: "F13" }],
  [1],
);
assert.equal(unproven.rows[0].AdRoomHall, "");
assert.equal(unproven.filled, 0);

/* A filled room must carry its verified registry id, or the row stays
   «للمراجعة» forever no matter how many cells are filled. */
const carried = proposeSmartFills(
  [{ sourcePage: 1, SCode: "501", referenceNumber: "18945", fstarttime: "08:00", AdRoomCode: "012B09", AdRoomHall: "" }],
  [{ sourcePage: 1, SCode: "501", referenceNumber: "18945", fstarttime: "08:00", AdRoomCode: "012B09", AdRoomHall: "F13", roomId: "room-77", buildingId: "b-9", locationStatus: "VERIFIED" }],
  [1],
);
const hallFill = carried.fills.find(fill => fill.field === "AdRoomHall");
assert.ok(hallFill && hallFill.carry && hallFill.carry.roomId === "room-77");
const linked = applySmartFills(
  [{ sourcePage: 1, SCode: "501", referenceNumber: "18945", fstarttime: "08:00", AdRoomCode: "012B09", AdRoomHall: "" }],
  carried.fills,
);
assert.equal(linked[0].AdRoomHall, "F13");
assert.equal(linked[0].roomId, "room-77");
assert.equal(linked[0].locationStatus, "VERIFIED");

/* The 7-digit authority code vs the page's short code are dialects of the same
   fact — a suffix match agrees, a different shape is silence, never noise. */
const dialects = fillMissingCellsFromSmartRead(
  [{ sourcePage: 1, SCode: "501", referenceNumber: "18945", fstarttime: "08:00", sourceCourseCode: "1023101", AdRoomHall: "" }],
  [{ sourcePage: 1, SCode: "501", referenceNumber: "18945", fstarttime: "08:00", sourceCourseCode: "101", AdRoomHall: "F13", roomId: "room-13" }],
  [1],
);
assert.equal(dialects.rows[0].AdRoomHall, "F13");
assert.equal(dialects.notes.filter(note => note.includes("رمز المقرر")).length, 0);

/* A proposal must never fill a cell it cannot also link. Filling «12F15» as
   text without a registry id produces a cell that looks answered and still
   counts as missing — red with a value inside it. */
const unlinked = proposeSmartFills(
  [{ sourcePage: 1, SCode: "501", referenceNumber: "18945", fstarttime: "08:00", AdRoomCode: "", AdRoomHall: "" }],
  [{ sourcePage: 1, SCode: "501", referenceNumber: "18945", fstarttime: "08:00", AdRoomCode: "12F15", AdRoomHall: "F15" }],
  [1],
);
for (const fill of unlinked.fills.filter(f => f.field === "AdRoomCode" || f.field === "AdRoomHall")) {
  assert.ok(fill.carry && (fill.carry.buildingId || fill.carry.roomId),
    `location fill «${fill.value}» must carry a registry id`);
}

console.log(JSON.stringify({
  passed: 26,
  checks: [
    "Gemini JSON can be extracted from fenced model output",
    "only deterministic read/simulation function calls survive sanitization",
    "mutation/commit arguments are stripped before execution",
    "Arabic natural-language move falls back to deterministic function calls",
    "multimodal import rows normalize into schedule-shaped draft JSON before validators",
    "civil/national IDs are stripped from the catalogue sent to Gemini",
    "a sharper reading fills blank cells only and never overwrites a read one",
    "a page that was not re-read stays byte-identical to the approved reading",
    "invented placeholders («هيئة تدريسية», «—») are refused, and no page list fills nothing",
    "proposing describes the fills without applying any of them",
    "applying writes exactly the approved cells, and a subset writes only that subset",
    "a row in the same position but a different section is never treated as a match",
    "a row with an unreadable section is still matched by its time and place",
    "a candidate contradicting any read cell contributes nothing at all",
    "one weak identifier is not certainty — two corroborations or nothing",
    "a matching reference number is identity on its own",
    "«هيئة تدريسية» binds to no instructor even when the registry holds that name",
    "a placeholder printed on the page fills nothing but is reported as a note",
    "an approved fill flips its evidence so counters and red cells drain",
    "a garbled reference/course code disqualifies itself, never the whole row",
    "a strong-field contradiction still voids the row entirely",
    "CRN+section proof rescues a row from a garbled clock; without proof it stays void",
    "a filled room carries its verified registry id so the row can actually turn ready",
    "authority 7-digit vs printed short course codes are dialects — suffix agrees, different shapes stay silent",
    "a location fill always carries a registry id — an unlinked code is never offered",
  ],
}, null, 2));
