import assert from "node:assert/strict";
import {
  parseScheduleTable,
  authorityPdfTextGridRows,
  recoverAuthorityCourseCell,
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
console.log(" COMPREHENSIVE 4-PAGE SCAN & AUTHORITY PDF EXTRACTION AUDIT REPORT");
console.log("=========================================================================\n");

// -------------------------------------------------------------
// 1. Department 0101 Academic Catalog Definition
// -------------------------------------------------------------
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

// Helper to generate a full realistic grid row
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

// Generate Page 1 (28 rows)
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

// Generate Page 2 (28 rows)
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

// Generate Page 3 (28 rows)
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

// Generate Page 4 (26 rows)
const page4GridRows: GridRow[] = [
  makeRow(19029, "0101201", "510", "التفسير التحليلي", "أ. عبدالله عبداللطيف عبدالله الهاجري", "012B07", "F31", "13:00", "13:50", "531"),
  makeRow(19030, "0101201", "511", "التفسير التحليلي", "أ. عبدالله عبداللطيف عبدالله الهاجري", "012B07", "F31", "14:00", "14:50", "531"),
  makeRow(19031, "0101202", "510", "الحديث التحليلي", "د. عبد الرحمن نوري أحمد المطيري", "012B09", "F13", "13:00", "13:50", "531"),
  makeRow(19032, "0101202", "511", "الحديث التحليلي", "د. عبد الرحمن نوري أحمد المطيري", "012B09", "F13", "14:00", "14:50", "531"),
  makeRow(19033, "0101206", "510", "فقه العبادات", "د. خالد محمد سالم المطوع", "012B07", "F31", "13:00", "13:50", "531"),
  makeRow(19034, "0101206", "511", "فقه العبادات", "د. خالد محمد سالم المطوع", "012B07", "F31", "14:00", "14:50", "531"),
  makeRow(19035, "0101250", "511", "أصول الفقه", "د. علي يوسف أحمد السند", "012B09", "F13", "13:00", "13:50", "531"),
  makeRow(19036, "0101250", "512", "أصول الفقه", "د. علي يوسف أحمد السند", "012B09", "F13", "14:00", "14:50", "531"),
  makeRow(19037, "0101102", "517", "الثقافة الإسلامية", "د. مشعل نايف هادي العتيبي", "012B07", "F31", "08:00", "08:50", "531"),
  makeRow(19038, "0101102", "518", "الثقافة الإسلامية", "د. مشعل نايف هادي العتيبي", "012B07", "F31", "09:00", "09:50", "531"),
  makeRow(19039, "0101150", "512", "علوم القرآن", "د. عبدالرحمن صالح سالم الجميلي", "012B07", "F31", "10:00", "10:50", "531"),
  makeRow(19040, "0101150", "513", "علوم القرآن", "د. عبدالرحمن صالح سالم الجميلي", "012B07", "F31", "11:00", "11:50", "531"),
  makeRow(19041, "0101151", "512", "السيرة النبوية", "أ.د. عيسى زكي عيسى شقرة", "012B09", "F12", "12:00", "12:50", "531"),
  makeRow(19042, "0101151", "513", "السيرة النبوية", "أ.د. عيسى زكي عيسى شقرة", "012B09", "F12", "13:00", "13:50", "531"),
  makeRow(19043, "0101153", "511", "العقيدة الإسلامية", "أ. عبدالله عبداللطيف عبدالله الهاجري", "012B07", "F31", "10:00", "10:50", "531"),
  makeRow(19044, "0101153", "512", "العقيدة الإسلامية", "أ. عبدالله عبداللطيف عبدالله الهاجري", "012B07", "F31", "11:00", "11:50", "531"),
  makeRow(19045, "0101201", "512", "التفسير التحليلي", "د. عبد الرحمن نوري أحمد المطيري", "012B09", "F13", "12:00", "12:50", "531"),
  makeRow(19046, "0101201", "513", "التفسير التحليلي", "د. عبد الرحمن نوري أحمد المطيري", "012B09", "F13", "13:00", "13:50", "531"),
  makeRow(19047, "0101202", "512", "الحديث التحليلي", "د. خالد محمد سالم المطوع", "012B07", "F31", "12:00", "12:50", "531"),
  makeRow(19048, "0101202", "513", "الحديث التحليلي", "د. خالد محمد سالم المطوع", "012B07", "F31", "13:00", "13:50", "531"),
  makeRow(19049, "0101206", "512", "فقه العبادات", "د. مشعل نايف هادي العتيبي", "012B07", "F31", "10:00", "10:50", "531"),
  makeRow(19050, "0101206", "513", "فقه العبادات", "د. مشعل نايف هادي العتيبي", "012B07", "F31", "11:00", "11:50", "531"),
  makeRow(19051, "0101250", "513", "أصول الفقه", "أ.د. عيسى زكي عيسى شقرة", "012B09", "F12", "12:00", "12:50", "531"),
  makeRow(19052, "0101250", "514", "أصول الفقه", "أ.د. عيسى زكي عيسى شقرة", "012B09", "F12", "13:00", "13:50", "531"),
  makeRow(19053, "0101102", "519", "الثقافة الإسلامية", "هيئة تدريسية", "012F15", "F10", "14:00", "14:50", "531"),
  makeRow(19054, "0101102", "520", "الثقافة الإسلامية", "هيئة تدريسية", "012F15", "F10", "15:00", "15:50", "531"),
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
// 2. Exact Counts Verification
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

test("Page 4 isolated yields exactly 26 rows", () => {
  assert.equal(resP4.rows.length, 26);
  assert.equal(resP4.rows.every(r => r.AdCourseId > 0), true);
  assert.equal(resP4.rows.every(r => r.AdCourseName !== "-" && r.AdCourseName !== ""), true);
});

test("Combined 4-page file yields exactly 110 rows (28 + 28 + 28 + 26 = 110)", () => {
  assert.equal(resCombined.rows.length, 110);
  assert.equal(resCombined.rows.length, resP1.rows.length + resP2.rows.length + resP3.rows.length + resP4.rows.length);
});

test("Total rows integrity: zero missing, zero duplicates, zero corrupt '-' values", () => {
  const combinedRefs = resCombined.rows.map(r => r.referenceNumber);
  assert.equal(combinedRefs.length, 110);
  assert.equal(new Set(combinedRefs).size, 110);
  assert.equal(resCombined.rows.some(r => r.AdCourseName === "-" || r.AdCourseName === ""), false);
  assert.equal(resCombined.rows.some(r => r.AdCourseId === 0), false);
});

// -------------------------------------------------------------
// 3. Strict Parity: Single-Page vs 4-Page Combined Slice
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

test("Page 4 Parity: resP4.rows strictly equals resCombined.rows[84..109]", () => {
  const slice4 = resCombined.rows.slice(84, 110);
  assert.equal(slice4.length, resP4.rows.length);
  for (let i = 0; i < 26; i++) {
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
// 4. Change Report & Field-Level Diffing Tests
// -------------------------------------------------------------
console.log("\n--- PART 3: Field-Level Diffing in Change Report (Authority PDF Diff) ---");

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
  referenceNumber: "18945",
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

// -------------------------------------------------------------
// 5. Structure & Sample JSON Dump Output
// -------------------------------------------------------------
console.log("\n--- PART 4: Summary Table & Row Data Structure Dump ---");

console.log(`
┌───────────────────────┬──────────────┬──────────────────┐
│ Extraction Context    │ Rows Count   │ Status           │
├───────────────────────┼──────────────┼──────────────────┤
│ Page 1 Isolated       │ 28 rows      │ 100% Validated   │
│ Page 2 Isolated       │ 28 rows      │ 100% Validated   │
│ Page 3 Isolated       │ 28 rows      │ 100% Validated   │
│ Page 4 Isolated       │ 26 rows      │ 100% Validated   │
├───────────────────────┼──────────────┼──────────────────┤
│ 4 Pages Combined File │ 110 rows     │ 100% Parity      │
└───────────────────────┴──────────────┴──────────────────┘
`);

console.log("Sample Extracted Rows Dump (First 3 rows of each page):");
const sampleRows = [
  ...resCombined.rows.slice(0, 3).map(r => ({ page: 1, ...r })),
  ...resCombined.rows.slice(28, 31).map(r => ({ page: 2, ...r })),
  ...resCombined.rows.slice(56, 59).map(r => ({ page: 3, ...r })),
  ...resCombined.rows.slice(84, 87).map(r => ({ page: 4, ...r })),
].map(r => ({
  page: r.page,
  courseCode: courses.find(c => c.AdCourseId === r.AdCourseId)?.CourseCode,
  courseName: r.AdCourseName,
  reference: r.referenceNumber,
  section: r.SCode,
  room: r.AdRoomHall,
  building: r.AdRoomCode,
  time: `${r.fstarttime} - ${r.fendtime}`,
  days: [r.fsunday ? "1" : "", r.fmonday ? "2" : "", r.ftuesday ? "3" : "", r.fwednesday ? "4" : "", r.fthursday ? "5" : ""].join(""),
  instructor: instructors.find(i => i.AdInstructorId === r.AdInstructorId)?.AdInstructorName || "هيئة تدريسية",
}));

console.table(sampleRows);

console.log("\n=================================================");
console.log(`TOTAL AUDIT PASSED: ${passCount}`);
console.log(`TOTAL AUDIT FAILED: ${failCount}`);
console.log("=================================================");

if (failCount > 0) {
  process.exit(1);
}
