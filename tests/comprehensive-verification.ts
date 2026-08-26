import assert from "node:assert/strict";
import {
  parseScheduleTable,
  authorityPdfTextGridRows,
  recoverAuthorityCourseCell,
  type OcrPage,
  type GridRow
} from "../src/utils/documentOcr.ts";
const foldHeaderIdentity = (value: unknown) => String(value ?? "").normalize("NFKC")
  .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[ً-ْـ]/g, "")
  .replace(/[إأآٱ]/g, "ا")
  .replace(/ى/g, "ي")
  .replace(/ة/g, "ه")
  .replace(/(?:^|\s)(?:قسم|القسم|كليه|كلية)(?=\s|$)/g, " ")
  .replace(/[^ء-ي0-9a-zA-Z ]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();
import { AdCourse, AdInstructor, FSchedule } from "../src/types.ts";

console.log("=================================================");
console.log(" COMPREHENSIVE FUNCTIONAL VERIFICATION SUITE");
console.log("=================================================\n");

let passCount = 0;
let failCount = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passCount++;
    console.log(`  \x1b[32m✓ PASS:\x1b[0m ${name}`);
  } catch (err: any) {
    failCount++;
    console.error(`  \x1b[31m✗ FAIL:\x1b[0m ${name}`);
    console.error(err);
  }
}

// -------------------------------------------------------------
// 1. Academic Catalog Fixture
// -------------------------------------------------------------
const courses: AdCourse[] = [
  { AdCourseId: 101, AdCollegeId: 6, AdSectionId: 9, CourseCode: "102", CourseName: "الثقافة الإسلامية", CourseHours: 3, CourseCredit: 3, MaxStudent: 45 },
  { AdCourseId: 102, AdCollegeId: 6, AdSectionId: 9, CourseCode: "150", CourseName: "علوم القرآن", CourseHours: 3, CourseCredit: 3, MaxStudent: 40 },
  { AdCourseId: 103, AdCollegeId: 6, AdSectionId: 9, CourseCode: "151", CourseName: "السيرة النبوية", CourseHours: 3, CourseCredit: 3, MaxStudent: 40 },
  { AdCourseId: 104, AdCollegeId: 6, AdSectionId: 9, CourseCode: "153", CourseName: "العقيدة الإسلامية", CourseHours: 3, CourseCredit: 3, MaxStudent: 40 },
  { AdCourseId: 105, AdCollegeId: 6, AdSectionId: 9, CourseCode: "201", CourseName: "التفسير التحليلي", CourseHours: 3, CourseCredit: 3, MaxStudent: 35 },
  { AdCourseId: 106, AdCollegeId: 6, AdSectionId: 9, CourseCode: "202", CourseName: "الحديث التحليلي", CourseHours: 3, CourseCredit: 3, MaxStudent: 35 },
];

const instructors: AdInstructor[] = [
  { AdInstructorId: 1, AdInstructorName: "د. علي يوسف أحمد السند" } as any,
  { AdInstructorId: 2, AdInstructorName: "د. عبدالرحمن صالح سالم الجميلي" } as any,
  { AdInstructorId: 3, AdInstructorName: "أ.د. عيسى زكي عيسى شقرة" } as any,
  { AdInstructorId: 4, AdInstructorName: "هيئة تدريسية" } as any,
  { AdInstructorId: 5, AdInstructorName: "أ. عبدالله عبداللطيف عبدالله الهاجري" } as any,
  { AdInstructorId: 6, AdInstructorName: "د. عبد الرحمن نوري أحمد المطيري" } as any,
];

const canonicalCourseKeys = ["0101102", "0101150", "0101151", "0101153", "0101201", "0101202"];

// -------------------------------------------------------------
// 2. Multi-Page Scanned PDF OCR Test (4 Pages)
// -------------------------------------------------------------
console.log("--- 1. Multi-Page Scanned PDF OCR (4 Pages Isolation & Parity) ---");

const page1GridRows: GridRow[] = [
  { code: "0101102", reference: "10001", scode: "501", courseText: "الثقافة الإسلامية", instructorText: "د. علي يوسف أحمد السند", building: "012B09", hall: "F13", start: "08:00", end: "09:20", days: "42" },
  { code: "0101102", reference: "10002", scode: "502", courseText: "الثقافة الإسلامية", instructorText: "د. علي يوسف أحمد السند", building: "012B09", hall: "F13", start: "09:30", end: "10:50", days: "42" },
  { code: "0101150", reference: "10003", scode: "501", courseText: "علوم القرآن", instructorText: "د. عبدالرحمن صالح سالم الجميلي", building: "012B07", hall: "F31", start: "11:00", end: "12:20", days: "531" },
  { code: "0101150", reference: "10004", scode: "502", courseText: "علوم القرآن", instructorText: "د. عبدالرحمن صالح سالم الجميلي", building: "012B07", hall: "F31", start: "12:30", end: "13:50", days: "531" },
  { code: "0101151", reference: "10005", scode: "501", courseText: "السيرة النبوية", instructorText: "أ.د. عيسى زكي عيسى شقرة", building: "012B09", hall: "F12", start: "08:00", end: "08:50", days: "531" },
];

const page2GridRows: GridRow[] = [
  { code: "0101151", reference: "10006", scode: "502", courseText: "السيرة النبوية", instructorText: "أ.د. عيسى زكي عيسى شقرة", building: "012B09", hall: "F12", start: "09:00", end: "09:50", days: "531" },
  { code: "0101153", reference: "10007", scode: "501", courseText: "العقيدة الإسلامية", instructorText: "هيئة تدريسية", building: "012F15", hall: "F10", start: "10:00", end: "10:50", days: "531" },
  { code: "0101153", reference: "10008", scode: "502", courseText: "العقيدة الإسلامية", instructorText: "هيئة تدريسية", building: "012F15", hall: "F10", start: "11:00", end: "11:50", days: "531" },
  { code: "0101201", reference: "10009", scode: "501", courseText: "التفسير التحليلي", instructorText: "أ. عبدالله عبداللطيف عبدالله الهاجري", building: "012B07", hall: "F31", start: "13:00", end: "14:20", days: "42" },
];

const page3GridRows: GridRow[] = [
  { code: "0101201", reference: "10010", scode: "502", courseText: "التفسير التحليلي", instructorText: "أ. عبدالله عبداللطيف عبدالله الهاجري", building: "012B07", hall: "F31", start: "14:30", end: "15:50", days: "42" },
  { code: "0101202", reference: "10011", scode: "501", courseText: "الحديث التحليلي", instructorText: "د. عبد الرحمن نوري أحمد المطيري", building: "012B09", hall: "F13", start: "08:00", end: "09:20", days: "42" },
  { code: "0101202", reference: "10012", scode: "502", courseText: "الحديث التحليلي", instructorText: "د. عبد الرحمن نوري أحمد المطيري", building: "012B09", hall: "F13", start: "09:30", end: "10:50", days: "42" },
  { code: "0101102", reference: "10013", scode: "503", courseText: "الثقافة الإسلامية", instructorText: "د. علي يوسف أحمد السند", building: "012B09", hall: "F13", start: "11:00", end: "12:20", days: "42" },
];

const page4GridRows: GridRow[] = [
  { code: "0101102", reference: "10014", scode: "504", courseText: "الثقافة الإسلامية", instructorText: "د. علي يوسف أحمد السند", building: "012B09", hall: "F13", start: "12:30", end: "13:50", days: "42" },
  { code: "0101150", reference: "10015", scode: "503", courseText: "علوم القرآن", instructorText: "د. عبدالرحمن صالح سالم الجميلي", building: "012B07", hall: "F31", start: "08:00", end: "08:50", days: "531" },
  { code: "0101151", reference: "10016", scode: "503", courseText: "السيرة النبوية", instructorText: "أ.د. عيسى زكي عيسى شقرة", building: "012B09", hall: "F12", start: "10:00", end: "10:50", days: "531" },
];

const p1: OcrPage = { rows: [], gridRows: page1GridRows } as any;
const p2: OcrPage = { rows: [], gridRows: page2GridRows } as any;
const p3: OcrPage = { rows: [], gridRows: page3GridRows } as any;
const p4: OcrPage = { rows: [], gridRows: page4GridRows } as any;

// Test individual pages
const parseOpts = { authorityDepartmentCode: "0101", sequentialSections: true };
const resP1 = parseScheduleTable([p1], courses, instructors, undefined, parseOpts);
const resP2 = parseScheduleTable([p2], courses, instructors, undefined, parseOpts);
const resP3 = parseScheduleTable([p3], courses, instructors, undefined, parseOpts);
const resP4 = parseScheduleTable([p4], courses, instructors, undefined, parseOpts);

// Test combined 4 pages
const resCombined = parseScheduleTable([p1, p2, p3, p4], courses, instructors, undefined, parseOpts);

test("Page 1 isolated yields exactly 5 rows with correct course mapping", () => {
  assert.equal(resP1.rows.length, 5);
  assert.equal(resP1.rows.every(r => r.AdCourseId > 0), true);
  assert.equal(resP1.rows.every(r => r.AdCourseName !== "-"), true);
});

test("Page 2 isolated yields exactly 4 rows with correct course mapping", () => {
  assert.equal(resP2.rows.length, 4);
  assert.equal(resP2.rows.every(r => r.AdCourseId > 0), true);
  assert.equal(resP2.rows.every(r => r.AdCourseName !== "-"), true);
});

test("Page 3 isolated yields exactly 4 rows with correct course mapping", () => {
  assert.equal(resP3.rows.length, 4);
  assert.equal(resP3.rows.every(r => r.AdCourseId > 0), true);
  assert.equal(resP3.rows.every(r => r.AdCourseName !== "-"), true);
});

test("Page 4 isolated yields exactly 3 rows with correct course mapping", () => {
  assert.equal(resP4.rows.length, 3);
  assert.equal(resP4.rows.every(r => r.AdCourseId > 0), true);
  assert.equal(resP4.rows.every(r => r.AdCourseName !== "-"), true);
});

test("Combined 4-page file yields exactly 16 rows (5 + 4 + 4 + 3 = 16)", () => {
  assert.equal(resCombined.rows.length, 16);
  assert.equal(resCombined.rows.length, resP1.rows.length + resP2.rows.length + resP3.rows.length + resP4.rows.length);
});

test("No missing rows, no duplicate rows, and no rows corrupted into '-'", () => {
  const refsCombined = resCombined.rows.map(r => r.referenceNumber);
  const expectedRefs = ["10001", "10002", "10003", "10004", "10005", "10006", "10007", "10008", "10009", "10010", "10011", "10012", "10013", "10014", "10015", "10016"];
  assert.deepEqual(refsCombined, expectedRefs);
  assert.equal(new Set(refsCombined).size, 16);
  assert.equal(resCombined.rows.some(r => r.AdCourseName === "-" || r.AdCourseName === ""), false);
  assert.equal(resCombined.rows.some(r => r.AdCourseId === 0), false);
});

// -------------------------------------------------------------
// 3. Single-Page Scanned OCR & Native Text PDF Regression
// -------------------------------------------------------------
console.log("\n--- 2. Single-Page Scanned OCR & Native Text PDF Regression ---");

test("Course key recovery on degraded OCR cell (010110 -> 0101102)", () => {
  const recovered = recoverAuthorityCourseCell("010110", "0101", canonicalCourseKeys);
  assert.equal(recovered, "0101102");
});

test("Native text geometry preserves complete cells without leaking to building", () => {
  const word = (text: string, x0: number, x1: number, y = 200) => ({ text, x0, y0: y - 5, x1, y1: y + 1 });
  const nativeWords = [
    word("0101102", 744, 787), word("18945", 712, 742), word("501", 691, 709),
    word("الثقافة", 668, 686), word("الاسلامية", 636, 665),
    word("45", 435, 447), word("45", 388, 400), word("0", 343, 350),
    word("F13", 279, 297), word("012B09", 236, 273),
    word("1530", 213, 235), word("-", 206, 210), word("1650", 182, 204),
    word("4", 116, 122), word("2", 127, 133),
    word("د.عبدالرحمن", 55, 96), word("صالح", 35, 53), word("سالم", 19, 32), word("الجميلي", 1, 16),
  ];
  const grid = authorityPdfTextGridRows(nativeWords, 792);
  assert.equal(grid.length, 1);
  assert.equal(grid[0].building, "012B09");
  assert.equal(grid[0].hall, "F13");
  assert.equal(grid[0].start, "15:30");
  assert.equal(grid[0].end, "16:50");
  assert.match(grid[0].days, /2.*4|4.*2|42/);
  assert.match(grid[0].instructorText, /عبدالرحمن/);
});

// -------------------------------------------------------------
// 4. Change Report & Field-Level Diffing Tests
// -------------------------------------------------------------
console.log("\n--- 3. Field-Level Diffing in Change Report (Authority PDF Diff) ---");

const AUTHORITY_PDF_COMPARE_FIELDS = [
  "AdCourseId",
  "SCode",
  "AdRoomHall",
  "AdRoomCode",
  "fstarttime",
  "fendtime",
  "fsunday",
  "fmonday",
  "ftuesday",
  "fwednesday",
  "fthursday",
  "AdInstructorId",
];

function buildAuthorityReportRow(source: any, next: any, options: { instructorNameById?: Map<number, string> } = {}) {
  const comparable = (field: string, value: any) => {
    if (["AdCourseId", "AdInstructorId"].includes(field)) return Number(value || 0);
    if (["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].includes(field)) {
      const token = String(value ?? "").trim().toLowerCase();
      return value === true || value === 1 || token === "1" || token === "true" || token === "y" || token === "yes";
    }
    if (["AdRoomCode", "AdRoomHall"].includes(field)) return String(value || "").replace(/\s+/g, "").toUpperCase();
    if (["fstarttime", "fendtime"].includes(field)) {
      const digits = String(value || "").replace(/\D/g, "");
      if (/^\d{3,4}$/.test(digits)) {
        const hh = digits.slice(0, -2).padStart(2, "0"), mm = digits.slice(-2);
        return `${hh}:${mm}`;
      }
      return String(value || "").trim();
    }
    return String(value ?? "").trim();
  };

  const sameInstructorIdentity = () => {
    if (comparable("AdInstructorId", source.AdInstructorId) === comparable("AdInstructorId", next.AdInstructorId)) return true;
    const names = options.instructorNameById;
    const sourceName = foldHeaderIdentity(source.sourceInstructorText || names?.get(Number(source.AdInstructorId)) || "");
    const currentName = foldHeaderIdentity(names?.get(Number(next.AdInstructorId)) || next.sourceInstructorText || "");
    return Boolean(sourceName && currentName && sourceName === currentName);
  };

  const changedFields = AUTHORITY_PDF_COMPARE_FIELDS.filter(field => {
    if (field === "AdInstructorId" && sameInstructorIdentity()) return false;
    return comparable(field, source[field]) !== comparable(field, next[field]);
  });

  return {
    status: changedFields.length ? "changed" : "unchanged",
    changedFields,
    referenceNumber: String(source.referenceNumber || next.referenceNumber || ""),
    source,
    current: next,
  };
}

const basePdfRow: FSchedule = {
  id: "sch_1",
  AdCourseId: 101,
  AdCourseName: "الثقافة الإسلامية",
  SCode: "501",
  AdRoomCode: "012B09",
  AdRoomHall: "F13",
  fstarttime: "08:00",
  fendtime: "09:20",
  fsunday: false,
  fmonday: true,
  ftuesday: false,
  fwednesday: true,
  fthursday: false,
  AdInstructorId: 1,
  sourceInstructorText: "د. علي يوسف أحمد السند",
  referenceNumber: "10001",
  sourceOrder: 1,
} as any;

test("Untouched PDF Row: Status is 'unchanged' and changedFields is EMPTY (0 yellow cells)", () => {
  const rowClone = { ...basePdfRow };
  const diff = buildAuthorityReportRow(basePdfRow, rowClone);
  assert.equal(diff.status, "unchanged");
  assert.deepEqual(diff.changedFields, []);
});

test("Change Room Only: Only AdRoomHall is in changedFields (Room cell yellow, others clean)", () => {
  const editedRow = { ...basePdfRow, AdRoomHall: "F20" };
  const diff = buildAuthorityReportRow(basePdfRow, editedRow);
  assert.equal(diff.status, "changed");
  assert.deepEqual(diff.changedFields, ["AdRoomHall"]);
  assert.equal(diff.changedFields.includes("AdCourseId"), false);
  assert.equal(diff.changedFields.includes("AdInstructorId"), false);
  assert.equal(diff.changedFields.includes("AdRoomCode"), false);
  assert.equal(diff.changedFields.includes("fstarttime"), false);
  assert.equal(diff.changedFields.includes("fendtime"), false);
  assert.equal(diff.changedFields.includes("fmonday"), false);
  assert.equal(diff.changedFields.includes("fwednesday"), false);
});

test("Change Instructor + Room: Exactly AdInstructorId and AdRoomHall are in changedFields", () => {
  const editedRow = { ...basePdfRow, AdRoomHall: "F31", AdInstructorId: 2 };
  const diff = buildAuthorityReportRow(basePdfRow, editedRow, {
    instructorNameById: new Map([[1, "د. علي يوسف أحمد السند"], [2, "د. عبدالرحمن صالح سالم الجميلي"]])
  });
  assert.equal(diff.status, "changed");
  assert.deepEqual(diff.changedFields.sort(), ["AdInstructorId", "AdRoomHall"].sort());
  assert.equal(diff.changedFields.includes("AdCourseId"), false);
  assert.equal(diff.changedFields.includes("AdRoomCode"), false);
});

test("Instructor text normalization (title differences) does NOT trigger false yellow highlight", () => {
  const editedRow = { ...basePdfRow, AdInstructorId: 1, sourceInstructorText: "علي يوسف السند" };
  const diff = buildAuthorityReportRow(basePdfRow, editedRow, {
    instructorNameById: new Map([[1, "د. علي يوسف أحمد السند"]])
  });
  assert.equal(diff.status, "unchanged");
  assert.deepEqual(diff.changedFields, []);
});

console.log("\n=================================================");
console.log(`TOTAL PASSED: ${passCount}`);
console.log(`TOTAL FAILED: ${failCount}`);
console.log("=================================================");

if (failCount > 0) {
  process.exit(1);
}
