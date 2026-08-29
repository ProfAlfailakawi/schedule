import assert from "node:assert/strict";
import {
  buildSmartImportCatalogue,
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

console.log(JSON.stringify({
  passed: 6,
  checks: [
    "Gemini JSON can be extracted from fenced model output",
    "only deterministic read/simulation function calls survive sanitization",
    "mutation/commit arguments are stripped before execution",
    "Arabic natural-language move falls back to deterministic function calls",
    "multimodal import rows normalize into schedule-shaped draft JSON before validators",
    "civil/national IDs are stripped from the catalogue sent to Gemini",
  ],
}, null, 2));
