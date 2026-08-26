import assert from "node:assert/strict";
import {
  parseScheduleTable,
  type OcrPage,
  type GridRow
} from "../src/utils/documentOcr.ts";
import { AdCourse, AdInstructor, FSchedule } from "../src/types.ts";

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

console.log("=========================================================================");
console.log(" REAL 4-PAGE TIMETABLE (SWRSCHA) RECONSTRUCTION & PARITY AUDIT");
console.log("=========================================================================\n");

// Department 0101 catalog
const courses: AdCourse[] = [
  { AdCourseId: 101, AdCollegeId: 6, AdSectionId: 9, CourseCode: "102", CourseName: "الثقافة الإسلامية", CourseHours: 3, CourseCredit: 3, MaxStudent: 45 },
  { AdCourseId: 102, AdCollegeId: 6, AdSectionId: 9, CourseCode: "150", CourseName: "علوم القرآن", CourseHours: 3, CourseCredit: 3, MaxStudent: 40 },
  { AdCourseId: 103, AdCollegeId: 6, AdSectionId: 9, CourseCode: "151", CourseName: "السيرة النبوية", CourseHours: 3, CourseCredit: 3, MaxStudent: 40 },
  { AdCourseId: 104, AdCollegeId: 6, AdSectionId: 9, CourseCode: "153", CourseName: "العقيدة الإسلامية", CourseHours: 3, CourseCredit: 3, MaxStudent: 40 },
  { AdCourseId: 105, AdCollegeId: 6, AdSectionId: 9, CourseCode: "201", CourseName: "التفسير التحليلي", CourseHours: 3, CourseCredit: 3, MaxStudent: 35 },
  { AdCourseId: 106, AdCollegeId: 6, AdSectionId: 9, CourseCode: "202", CourseName: "الحديث التحليلي", CourseHours: 3, CourseCredit: 3, MaxStudent: 35 },
  { AdCourseId: 107, AdCollegeId: 6, AdSectionId: 9, CourseCode: "206", CourseName: "فقه العبادات", CourseHours: 3, CourseCredit: 3, MaxStudent: 35 },
  { AdCourseId: 108, AdCollegeId: 6, AdSectionId: 9, CourseCode: "250", CourseName: "أصول الفقه", CourseHours: 3, CourseCredit: 3, MaxStudent: 35 },
];

const instructors: AdInstructor[] = [
  { AdInstructorId: 1, AdInstructorName: "د. علي يوسف أحمد السند" } as any,
  { AdInstructorId: 2, AdInstructorName: "د. عبدالرحمن صالح سالم الجميلي" } as any,
  { AdInstructorId: 3, AdInstructorName: "أ.د. عيسى زكي عيسى شقرة" } as any,
  { AdInstructorId: 4, AdInstructorName: "هيئة تدريسية" } as any,
  { AdInstructorId: 5, AdInstructorName: "أ. عبدالله عبداللطيف عبدالله الهاجري" } as any,
  { AdInstructorId: 6, AdInstructorName: "د. عبد الرحمن نوري أحمد المطيري" } as any,
  { AdInstructorId: 7, AdInstructorName: "د. خالد محمد سالم المطوع" } as any,
  { AdInstructorId: 8, AdInstructorName: "د. مشعل نايف هادي العتيبي" } as any,
];

function makeRow(
  ref: number,
  code: string,
  scode: string,
  cName: string,
  instName: string,
  bld: string,
  hall: string,
  timeStart: string,
  timeEnd: string,
  days: string
): GridRow {
  return {
    code,
    reference: String(ref),
    scode,
    courseText: cName,
    instructorText: instName,
    building: bld,
    hall,
    start: timeStart,
    end: timeEnd,
    days,
    sourceMode: "ocr-grid",
  };
}

// Page 1: 28 rows
const page1GridRows: GridRow[] = [
  makeRow(18945, "0101102", "501", "الثقافة الإسلامية", "د. علي يوسف أحمد السند", "012B09", "F13", "08:00", "09:20", "42"),
  makeRow(18946, "0101102", "502", "الثقافة الإسلامية", "د. علي يوسف أحمد السند", "012B09", "F13", "09:30", "10:50", "42"),
  makeRow(18947, "0101102", "503", "الثقافة الإسلامية", "د. علي يوسف أحمد السند", "012B09", "F13", "11:00", "12:20", "42"),
  makeRow(18948, "0101102", "504", "الثقافة الإسلامية", "د. علي يوسف أحمد السند", "012B09", "F13", "12:30", "13:50", "42"),
  makeRow(18949, "0101102", "505", "الثقافة الإسلامية", "د. خالد محمد سالم المطوع", "012B07", "F31", "08:00", "08:50", "531"),
  makeRow(18950, "0101102", "506", "الثقافة الإسلامية", "د. خالد محمد سالم المطوع", "012B07", "F31", "09:00", "09:50", "531"),
  makeRow(18951, "0101102", "507", "الثقافة الإسلامية", "د. خالد محمد سالم المطوع", "012B07", "F31", "10:00", "10:50", "531"),
  makeRow(18952, "0101102", "508", "الثقافة الإسلامية", "د. خالد محمد سالم المطوع", "012B07", "F31", "11:00", "11:50", "531"),
  makeRow(18953, "0101102", "510", "الثقافة الإسلامية", "هيئة تدريسية", "012F15", "F10", "12:00", "12:50", "531"),
  makeRow(18954, "0101150", "501", "علوم القرآن", "د. عبدالرحمن صالح سالم الجميلي", "012B07", "F31", "08:00", "09:20", "42"),
  makeRow(18955, "0101150", "502", "علوم القرآن", "د. عبدالرحمن صالح سالم الجميلي", "012B07", "F31", "09:30", "10:50", "42"),
  makeRow(18956, "0101150", "503", "علوم القرآن", "د. عبدالرحمن صالح سالم الجميلي", "012B07", "F31", "11:00", "12:20", "42"),
  makeRow(18957, "0101150", "504", "علوم القرآن", "د. عبدالرحمن صالح سالم الجميلي", "012B07", "F31", "12:30", "13:50", "42"),
  makeRow(18958, "0101150", "505", "علوم القرآن", "هيئة تدريسية", "012B09", "F12", "14:00", "15:20", "42"),
  makeRow(18959, "0101151", "501", "السيرة النبوية", "أ.د. عيسى زكي عيسى شقرة", "012B09", "F12", "08:00", "08:50", "531"),
  makeRow(18960, "0101151", "502", "السيرة النبوية", "أ.د. عيسى زكي عيسى شقرة", "012B09", "F12", "09:00", "09:50", "531"),
  makeRow(18961, "0101151", "503", "السيرة النبوية", "أ.د. عيسى زكي عيسى شقرة", "012B09", "F12", "10:00", "10:50", "531"),
  makeRow(18962, "0101151", "504", "السيرة النبوية", "أ.د. عيسى زكي عيسى شقرة", "012B09", "F12", "11:00", "11:50", "531"),
  makeRow(18963, "0101151", "505", "السيرة النبوية", "د. مشعل نايف هادي العتيبي", "012J14", "F11", "12:00", "12:50", "531"),
  makeRow(18964, "0101153", "501", "العقيدة الإسلامية", "د. مشعل نايف هادي العتيبي", "012B07", "F31", "08:00", "09:20", "42"),
  makeRow(18965, "0101153", "502", "العقيدة الإسلامية", "د. مشعل نايف هادي العتيبي", "012B07", "F31", "09:30", "10:50", "42"),
  makeRow(18966, "0101153", "503", "العقيدة الإسلامية", "د. مشعل نايف هادي العتيبي", "012B07", "F31", "11:00", "12:20", "42"),
  makeRow(18967, "0101153", "504", "العقيدة الإسلامية", "هيئة تدريسية", "012F15", "F10", "12:30", "13:50", "42"),
  makeRow(18968, "0101201", "501", "التفسير التحليلي", "أ. عبدالله عبداللطيف عبدالله الهاجري", "012B07", "F31", "08:00", "08:50", "531"),
  makeRow(18969, "0101201", "502", "التفسير التحليلي", "أ. عبدالله عبداللطيف عبدالله الهاجري", "012B07", "F31", "09:00", "09:50", "531"),
  makeRow(18970, "0101201", "503", "التفسير التحليلي", "أ. عبدالله عبداللطيف عبدالله الهاجري", "012B07", "F31", "10:00", "10:50", "531"),
  makeRow(18971, "0101201", "504", "التفسير التحليلي", "أ. عبدالله عبداللطيف عبدالله الهاجري", "012B07", "F31", "11:00", "11:50", "531"),
  makeRow(18972, "0101201", "505", "التفسير التحليلي", "هيئة تدريسية", "012B09", "F13", "12:00", "12:50", "531"),
];

// Page 2: 28 rows
const page2GridRows: GridRow[] = [
  makeRow(18973, "0101202", "501", "الحديث التحليلي", "د. عبد الرحمن نوري أحمد المطيري", "012B09", "F13", "08:00", "09:20", "42"),
  makeRow(18974, "0101202", "502", "الحديث التحليلي", "د. عبد الرحمن نوري أحمد المطيري", "012B09", "F13", "09:30", "10:50", "42"),
  makeRow(18975, "0101202", "503", "الحديث التحليلي", "د. عبد الرحمن نوري أحمد المطيري", "012B09", "F13", "11:00", "12:20", "42"),
  makeRow(18976, "0101202", "504", "الحديث التحليلي", "د. عبد الرحمن نوري أحمد المطيري", "012B09", "F13", "12:30", "13:50", "42"),
  makeRow(18977, "0101202", "505", "الحديث التحليلي", "هيئة تدريسية", "012B09", "F13", "14:00", "15:20", "42"),
  makeRow(18978, "0101206", "501", "فقه العبادات", "د. خالد محمد سالم المطوع", "012B07", "F31", "08:00", "08:50", "531"),
  makeRow(18979, "0101206", "502", "فقه العبادات", "د. خالد محمد سالم المطوع", "012B07", "F31", "09:00", "09:50", "531"),
  makeRow(18980, "0101206", "503", "فقه العبادات", "د. خالد محمد سالم المطوع", "012B07", "F31", "10:00", "10:50", "531"),
  makeRow(18981, "0101206", "504", "فقه العبادات", "د. خالد محمد سالم المطوع", "012B07", "F31", "11:00", "11:50", "531"),
  makeRow(18982, "0101206", "505", "فقه العبادات", "هيئة تدريسية", "012F15", "F10", "12:00", "12:50", "531"),
  makeRow(18983, "0101250", "501", "أصول الفقه", "د. علي يوسف أحمد السند", "012B09", "F13", "08:00", "09:20", "42"),
  makeRow(18984, "0101250", "502", "أصول الفقه", "د. علي يوسف أحمد السند", "012B09", "F13", "09:30", "10:50", "42"),
  makeRow(18985, "0101250", "503", "أصول الفقه", "د. علي يوسف أحمد السند", "012B09", "F13", "11:00", "12:20", "42"),
  makeRow(18986, "0101250", "504", "أصول الفقه", "هيئة تدريسية", "012B09", "F13", "12:30", "13:50", "42"),
  makeRow(18987, "0101102", "511", "الثقافة الإسلامية", "د. مشعل نايف هادي العتيبي", "012B07", "F31", "13:00", "14:20", "42"),
  makeRow(18988, "0101102", "512", "الثقافة الإسلامية", "د. مشعل نايف هادي العتيبي", "012B07", "F31", "14:30", "15:50", "42"),
  makeRow(18989, "0101150", "506", "علوم القرآن", "أ.د. عيسى زكي عيسى شقرة", "012B09", "F12", "13:00", "14:20", "42"),
  makeRow(18990, "0101150", "507", "علوم القرآن", "أ.د. عيسى زكي عيسى شقرة", "012B09", "F12", "14:30", "15:50", "42"),
  makeRow(18991, "0101151", "506", "السيرة النبوية", "د. عبدالرحمن صالح سالم الجميلي", "012B07", "F31", "13:00", "14:20", "42"),
  makeRow(18992, "0101151", "507", "السيرة النبوية", "د. عبدالرحمن صالح سالم الجميلي", "012B07", "F31", "14:30", "15:50", "42"),
  makeRow(18993, "0101153", "505", "العقيدة الإسلامية", "أ. عبدالله عبداللطيف عبدالله الهاجري", "012B07", "F31", "13:00", "14:20", "42"),
  makeRow(18994, "0101153", "506", "العقيدة الإسلامية", "أ. عبدالله عبداللطيف عبدالله الهاجري", "012B07", "F31", "14:30", "15:50", "42"),
  makeRow(18995, "0101201", "506", "التفسير التحليلي", "د. عبد الرحمن نوري أحمد المطيري", "012B09", "F13", "13:00", "14:20", "42"),
  makeRow(18996, "0101201", "507", "التفسير التحليلي", "د. عبد الرحمن نوري أحمد المطيري", "012B09", "F13", "14:30", "15:50", "42"),
  makeRow(18997, "0101202", "506", "الحديث التحليلي", "د. خالد محمد سالم المطوع", "012B07", "F31", "13:00", "14:20", "42"),
  makeRow(18998, "0101202", "507", "الحديث التحليلي", "د. خالد محمد سالم المطوع", "012B07", "F31", "14:30", "15:50", "42"),
  makeRow(18999, "0101206", "506", "فقه العبادات", "د. مشعل نايف هادي العتيبي", "012B07", "F31", "13:00", "14:20", "42"),
  makeRow(19000, "0101206", "507", "فقه العبادات", "د. مشعل نايف هادي العتيبي", "012B07", "F31", "14:30", "15:50", "42"),
];

// Page 3: 28 rows
const page3GridRows: GridRow[] = [
  makeRow(19001, "0101250", "505", "أصول الفقه", "أ.د. عيسى زكي عيسى شقرة", "012B09", "F12", "08:00", "08:50", "531"),
  makeRow(19002, "0101250", "506", "أصول الفقه", "أ.د. عيسى زكي عيسى شقرة", "012B09", "F12", "09:00", "09:50", "531"),
  makeRow(19003, "0101250", "507", "أصول الفقه", "أ.د. عيسى زكي عيسى شقرة", "012B09", "F12", "10:00", "10:50", "531"),
  makeRow(19004, "0101250", "508", "أصول الفقه", "أ.د. عيسى زكي عيسى شقرة", "012B09", "F12", "11:00", "11:50", "531"),
  makeRow(19005, "0101102", "513", "الثقافة الإسلامية", "د. علي يوسف أحمد السند", "012B09", "F13", "15:30", "16:50", "42"),
  makeRow(19006, "0101102", "514", "الثقافة الإسلامية", "د. علي يوسف أحمد السند", "012B09", "F13", "17:00", "18:20", "42"),
  makeRow(19007, "0101150", "508", "علوم القرآن", "د. عبدالرحمن صالح سالم الجميلي", "012B07", "F31", "15:30", "16:50", "42"),
  makeRow(19008, "0101150", "509", "علوم القرآن", "د. عبدالرحمن صالح سالم الجميلي", "012B07", "F31", "17:00", "18:20", "42"),
  makeRow(19009, "0101151", "508", "السيرة النبوية", "د. خالد محمد سالم المطوع", "012B07", "F31", "15:30", "16:50", "42"),
  makeRow(19010, "0101151", "509", "السيرة النبوية", "د. خالد محمد سالم المطوع", "012B07", "F31", "17:00", "18:20", "42"),
  makeRow(19011, "0101153", "507", "العقيدة الإسلامية", "د. مشعل نايف هادي العتيبي", "012B07", "F31", "15:30", "16:50", "42"),
  makeRow(19012, "0101153", "508", "العقيدة الإسلامية", "د. مشعل نايف هادي العتيبي", "012B07", "F31", "17:00", "18:20", "42"),
  makeRow(19013, "0101201", "508", "التفسير التحليلي", "أ. عبدالله عبداللطيف عبدالله الهاجري", "012B07", "F31", "15:30", "16:50", "42"),
  makeRow(19014, "0101201", "509", "التفسير التحليلي", "أ. عبدالله عبداللطيف عبدالله الهاجري", "012B07", "F31", "17:00", "18:20", "42"),
  makeRow(19015, "0101202", "508", "الحديث التحليلي", "د. عبد الرحمن نوري أحمد المطيري", "012B09", "F13", "15:30", "16:50", "42"),
  makeRow(19016, "0101202", "509", "الحديث التحليلي", "د. عبد الرحمن نوري أحمد المطيري", "012B09", "F13", "17:00", "18:20", "42"),
  makeRow(19017, "0101206", "508", "فقه العبادات", "د. خالد محمد سالم المطوع", "012B07", "F31", "15:30", "16:50", "42"),
  makeRow(19018, "0101206", "509", "فقه العبادات", "د. خالد محمد سالم المطوع", "012B07", "F31", "17:00", "18:20", "42"),
  makeRow(19019, "0101250", "509", "أصول الفقه", "أ.د. عيسى زكي عيسى شقرة", "012B09", "F12", "15:30", "16:50", "42"),
  makeRow(19020, "0101250", "510", "أصول الفقه", "أ.د. عيسى زكي عيسى شقرة", "012B09", "F12", "17:00", "18:20", "42"),
  makeRow(19021, "0101102", "515", "الثقافة الإسلامية", "هيئة تدريسية", "012F15", "F10", "08:00", "09:20", "42"),
  makeRow(19022, "0101102", "516", "الثقافة الإسلامية", "هيئة تدريسية", "012F15", "F10", "09:30", "10:50", "42"),
  makeRow(19023, "0101150", "510", "علوم القرآن", "هيئة تدريسية", "012J14", "F11", "08:00", "09:20", "42"),
  makeRow(19024, "0101150", "511", "علوم القرآن", "هيئة تدريسية", "012J14", "F11", "09:30", "10:50", "42"),
  makeRow(19025, "0101151", "510", "السيرة النبوية", "هيئة تدريسية", "012J14", "F11", "11:00", "12:20", "42"),
  makeRow(19026, "0101151", "511", "السيرة النبوية", "هيئة تدريسية", "012J14", "F11", "12:30", "13:50", "42"),
  makeRow(19027, "0101153", "509", "العقيدة الإسلامية", "هيئة تدريسية", "012F15", "F10", "08:00", "08:50", "531"),
  makeRow(19028, "0101153", "510", "العقيدة الإسلامية", "هيئة تدريسية", "012F15", "F10", "09:00", "09:50", "531"),
];

// Page 4: EXACTLY 2 rows (Tail of the document)
const page4GridRows: GridRow[] = [
  makeRow(19029, "0101250", "511", "أصول الفقه", "د. علي يوسف أحمد السند", "012B09", "F13", "13:00", "13:50", "531"),
  makeRow(19030, "0101250", "512", "أصول الفقه", "د. علي يوسف أحمد السند", "012B09", "F13", "14:00", "14:50", "531"),
];

const p1: OcrPage = { rows: [], gridRows: page1GridRows } as any;
const p2: OcrPage = { rows: [], gridRows: page2GridRows } as any;
const p3: OcrPage = { rows: [], gridRows: page3GridRows } as any;
const p4: OcrPage = { rows: [], gridRows: page4GridRows } as any;

const parseOpts = { authorityDepartmentCode: "0101", sequentialSections: true };

// Execute individual page extractions
const resP1 = parseScheduleTable([p1], courses, instructors, undefined, parseOpts);
const resP2 = parseScheduleTable([p2], courses, instructors, undefined, parseOpts);
const resP3 = parseScheduleTable([p3], courses, instructors, undefined, parseOpts);
const resP4 = parseScheduleTable([p4], courses, instructors, undefined, parseOpts);

// Execute 4-page combined extraction
const resCombined = parseScheduleTable([p1, p2, p3, p4], courses, instructors, undefined, parseOpts);

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
// 1. Exact Counts Verification
// -------------------------------------------------------------
console.log("--- PART 1: Real Per-Page & Total Row Count Verification ---");

test("Page 1 isolated yields exactly 28 rows", () => {
  assert.equal(resP1.rows.length, 28);
  assert.equal(resP1.rows.every(r => r.AdCourseId > 0), true);
  assert.equal(resP1.rows.every(r => r.AdCourseName !== "-" && r.AdCourseName !== ""), true);
});

test("Page 2 isolated yields exactly 28 rows", () => {
  assert.equal(resP2.rows.length, 28);
  assert.equal(resP2.rows.every(r => r.AdCourseId > 0), true);
  assert.equal(resP2.rows.every(r => r.AdCourseName !== "-" && r.AdCourseName !== ""), true);
});

test("Page 3 isolated yields exactly 28 rows", () => {
  assert.equal(resP3.rows.length, 28);
  assert.equal(resP3.rows.every(r => r.AdCourseId > 0), true);
  assert.equal(resP3.rows.every(r => r.AdCourseName !== "-" && r.AdCourseName !== ""), true);
});

test("Page 4 isolated yields EXACTLY 2 rows (Tail of document)", () => {
  assert.equal(resP4.rows.length, 2);
  assert.equal(resP4.rows.every(r => r.AdCourseId > 0), true);
  assert.equal(resP4.rows.every(r => r.AdCourseName !== "-" && r.AdCourseName !== ""), true);
});

test("Combined 4-page file yields exactly 86 rows (28 + 28 + 28 + 2 = 86)", () => {
  assert.equal(resCombined.rows.length, 86);
  assert.equal(resCombined.rows.length, resP1.rows.length + resP2.rows.length + resP3.rows.length + resP4.rows.length);
});

test("Total rows integrity: zero missing, zero duplicates, zero corrupt '-' values", () => {
  const combinedRefs = resCombined.rows.map(r => r.referenceNumber);
  assert.equal(combinedRefs.length, 86);
  assert.equal(new Set(combinedRefs).size, 86);
  assert.equal(resCombined.rows.some(r => r.AdCourseName === "-" || r.AdCourseName === ""), false);
  assert.equal(resCombined.rows.some(r => r.AdCourseId === 0), false);
});

// -------------------------------------------------------------
// 2. Strict Parity: Single-Page vs 4-Page Combined Slice
// -------------------------------------------------------------
console.log("\n--- PART 2: Strict Mathematical Parity (Single vs Multi-Page Slices) ---");

test("Page 1 Parity: resP1.rows strictly equals resCombined.rows[0..27]", () => {
  const slice1 = resCombined.rows.slice(0, 28);
  assert.equal(slice1.length, resP1.rows.length);
  for (let i = 0; i < 28; i++) {
    assert.equal(slice1[i].referenceNumber, resP1.rows[i].referenceNumber);
    assert.equal(slice1[i].AdCourseId, resP1.rows[i].AdCourseId);
    assert.equal(slice1[i].SCode, resP1.rows[i].SCode);
    assert.equal(slice1[i].AdRoomHall, resP1.rows[i].AdRoomHall);
    assert.equal(slice1[i].AdRoomCode, resP1.rows[i].AdRoomCode);
    assert.equal(slice1[i].fstarttime, resP1.rows[i].fstarttime);
    assert.equal(slice1[i].fendtime, resP1.rows[i].fendtime);
    assert.equal(slice1[i].AdInstructorId, resP1.rows[i].AdInstructorId);
  }
});

test("Page 2 Parity: resP2.rows strictly equals resCombined.rows[28..55]", () => {
  const slice2 = resCombined.rows.slice(28, 56);
  assert.equal(slice2.length, resP2.rows.length);
  for (let i = 0; i < 28; i++) {
    assert.equal(slice2[i].referenceNumber, resP2.rows[i].referenceNumber);
    assert.equal(slice2[i].AdCourseId, resP2.rows[i].AdCourseId);
    assert.equal(slice2[i].AdRoomHall, resP2.rows[i].AdRoomHall);
    assert.equal(slice2[i].AdRoomCode, resP2.rows[i].AdRoomCode);
    assert.equal(slice2[i].fstarttime, resP2.rows[i].fstarttime);
    assert.equal(slice2[i].fendtime, resP2.rows[i].fendtime);
    assert.equal(slice2[i].AdInstructorId, resP2.rows[i].AdInstructorId);
  }
});

test("Page 3 Parity: resP3.rows strictly equals resCombined.rows[56..83]", () => {
  const slice3 = resCombined.rows.slice(56, 84);
  assert.equal(slice3.length, resP3.rows.length);
  for (let i = 0; i < 28; i++) {
    assert.equal(slice3[i].referenceNumber, resP3.rows[i].referenceNumber);
    assert.equal(slice3[i].AdCourseId, resP3.rows[i].AdCourseId);
    assert.equal(slice3[i].AdRoomHall, resP3.rows[i].AdRoomHall);
    assert.equal(slice3[i].AdRoomCode, resP3.rows[i].AdRoomCode);
    assert.equal(slice3[i].fstarttime, resP3.rows[i].fstarttime);
    assert.equal(slice3[i].fendtime, resP3.rows[i].fendtime);
    assert.equal(slice3[i].AdInstructorId, resP3.rows[i].AdInstructorId);
  }
});

test("Page 4 Parity: resP4.rows strictly equals resCombined.rows[84..85] (2 rows)", () => {
  const slice4 = resCombined.rows.slice(84, 86);
  assert.equal(slice4.length, resP4.rows.length);
  assert.equal(slice4.length, 2);
  for (let i = 0; i < 2; i++) {
    assert.equal(slice4[i].referenceNumber, resP4.rows[i].referenceNumber);
    assert.equal(slice4[i].AdCourseId, resP4.rows[i].AdCourseId);
    assert.equal(slice4[i].AdRoomHall, resP4.rows[i].AdRoomHall);
    assert.equal(slice4[i].AdRoomCode, resP4.rows[i].AdRoomCode);
    assert.equal(slice4[i].fstarttime, resP4.rows[i].fstarttime);
    assert.equal(slice4[i].fendtime, resP4.rows[i].fendtime);
    assert.equal(slice4[i].AdInstructorId, resP4.rows[i].AdInstructorId);
  }
});

// -------------------------------------------------------------
// 3. First and Last Row of Each Page Dump
// -------------------------------------------------------------
console.log("\n--- PART 3: First and Last Extracted Row of Every Page ---");

function formatRow(pageNo: number, position: "FIRST" | "LAST", r: any) {
  const course = courses.find(c => c.AdCourseId === r.AdCourseId);
  const instructor = instructors.find(i => i.AdInstructorId === r.AdInstructorId);
  const daysStr = [
    r.fsunday ? "1" : "",
    r.fmonday ? "2" : "",
    r.ftuesday ? "3" : "",
    r.fwednesday ? "4" : "",
    r.fthursday ? "5" : ""
  ].join("");

  return {
    page: pageNo,
    position,
    courseCode: course?.CourseCode || "0101102",
    courseName: r.AdCourseName,
    referenceNumber: r.referenceNumber,
    section: r.SCode,
    room: r.AdRoomHall,
    building: r.AdRoomCode,
    time: `${r.fstarttime}-${r.fendtime}`,
    days: daysStr,
    instructor: instructor?.AdInstructorName || r.sourceInstructorText || "هيئة تدريسية",
  };
}

const pageFirstLastSummary = [
  formatRow(1, "FIRST", resP1.rows[0]),
  formatRow(1, "LAST", resP1.rows[resP1.rows.length - 1]),
  formatRow(2, "FIRST", resP2.rows[0]),
  formatRow(2, "LAST", resP2.rows[resP2.rows.length - 1]),
  formatRow(3, "FIRST", resP3.rows[0]),
  formatRow(3, "LAST", resP3.rows[resP3.rows.length - 1]),
  formatRow(4, "FIRST", resP4.rows[0]),
  formatRow(4, "LAST", resP4.rows[resP4.rows.length - 1]),
];

console.table(pageFirstLastSummary);

console.log("\n=================================================");
console.log(`TOTAL AUDIT PASSED: ${passCount}`);
console.log(`TOTAL AUDIT FAILED: ${failCount}`);
console.log("=================================================");

if (failCount > 0) {
  process.exit(1);
}
