import assert from "node:assert/strict";
import { parseAuthorityHeaderText, parseScheduleTable, type OcrPage } from "../src/utils/documentOcr.ts";
import { assignAuthoritySections, authorityDepartmentCode, authorityDepartmentMatches, authorityCourseCodeMatches } from "../src/utils/authorityAcademicCodes.ts";

const generatedPhysical = `
01كليه التربيه الاساسيه الكلية : الفصل الدراسي الاول 2027-2026 الفصل :
012كليه التربيه الاساسيه بنات الفرع : التربيه الاسلاميه 0101 القسم :
`;
const generated = parseAuthorityHeaderText(generatedPhysical);
assert.equal(generated.term?.season, "first");
assert.deepEqual(generated.term?.years, [2026, 2027]);
assert.equal(generated.branch?.code, "012");
assert.match(generated.branch?.name || "", /التربيه الاساسيه بنات/);
assert.equal(generated.department?.code, "0101");
assert.match(generated.department?.name || "", /التربيه الاسلاميه/);
assert.doesNotMatch(generated.department?.label || "", /^012\s+0101|012\s/);

/* Real CamScanner-style OCR from the photographed Authority page. */
const scannedOcr = `
SWRSCHA: التقرير
القصل: الفقصل الدراسي الصيفي 2026-2025 01 كليه التربيه الاساسيه
Cd 0101 _ التربيه الاسلاميه الفرع : 012 كليه التربيه الاساسيه بنات
`;
const scanned = parseAuthorityHeaderText(scannedOcr);
assert.equal(scanned.term?.season, "summer");
assert.deepEqual(scanned.term?.years, [2025, 2026]);
assert.equal(scanned.branch?.code, "012");
assert.match(scanned.branch?.name || "", /بنات/);
assert.equal(scanned.department?.code, "0101");
assert.equal(scanned.department?.name, "التربيه الاسلاميه");

const logical = parseAuthorityHeaderText(`
الفصل: الفصل الدراسي الاول 2027-2026
الكلية: 01 كلية التربية الأساسية
الفرع: 012 كلية التربية الأساسية بنات
القسم: 0101 01
`);
assert.equal(logical.branch?.code, "012");
assert.equal(logical.department?.code, "0101");
assert.equal(logical.department?.name, "");

/* Scientific-department numbering is college + local department, not a direct
   comparison between document 0101 and catalogue-local 01. */
assert.equal(authorityDepartmentCode("01", "01"), "0101");
assert.equal(authorityDepartmentCode("01", "1"), "0101");
assert.equal(authorityDepartmentCode("1", "1"), "0101");
assert.equal(authorityDepartmentCode("01", "0101"), "0101");
assert.equal(authorityDepartmentMatches("0101", "01", "01"), true);
assert.equal(authorityDepartmentMatches("0101", "1", "1"), true);
assert.equal(authorityDepartmentMatches("01", "01", "01"), false);
assert.equal(authorityDepartmentMatches("0102", "01", "01"), false);
assert.equal(authorityCourseCodeMatches("0101102", "102", "0101"), true);
assert.equal(authorityCourseCodeMatches("0102102", "102", "0101"), false);

/* Course NUMBER is canonical; system name wins; sections are generated 501+ per
   course; an abbreviated professor name never receives a real instructor ID. */
const courses:any[]=[
  {AdCourseId:11,AdCollegeId:6,AdSectionId:9,CourseCode:"102",CourseName:"الثقافة الإسلامية",CourseHours:3,CourseCredit:3},
  {AdCourseId:12,AdCollegeId:6,AdSectionId:9,CourseCode:"103",CourseName:"اسم آخر في النظام",CourseHours:3,CourseCredit:3},
];
const instructors:any[]=[
  {AdInstructorId:21,AdInstructorName:"د. علي يوسف أحمد السند"},
  {AdInstructorId:22,AdInstructorName:"علي يوسف أحمد السندي"},
];
const gridRows:any[]=[
  {code:"0101102",reference:"18945",scode:"777",courseText:"اسم OCR خاطئ تماماً",instructorText:"د. علي يوسف أحمد السند",building:"012B09",hall:"F13",start:"15:30",end:"16:50",days:"42"},
  {code:"0101102",reference:"18946",scode:"123",courseText:"اسم آخر خاطئ",instructorText:"علي السند",building:"012B07",hall:"F31",start:"11:00",end:"11:50",days:"531"},
  {code:"0101103",reference:"18947",scode:"999",courseText:"حتى لو اسم OCR لا يطابق",instructorText:"",building:"012B07",hall:"F31",start:"08:00",end:"09:20",days:"42"},
];
const pages:OcrPage[]=[{rows:[],gridRows} as any];
const parsed=parseScheduleTable(pages,courses,instructors,new Set([21,22]),{authorityDepartmentCode:"0101",sequentialSections:true});
assert.equal(parsed.rows.length,3);
assert.equal(parsed.rows[0].AdCourseId,11);
assert.equal(parsed.rows[0].AdCourseName,"الثقافة الإسلامية");
assert.equal(parsed.rows[0].SCode,"501");
assert.equal(parsed.rows[1].SCode,"502");
assert.equal(parsed.rows[2].AdCourseId,12);
assert.equal(parsed.rows[2].SCode,"501");
assert.equal(parsed.rows[0].AdInstructorId,21);
assert.equal(parsed.rows[1].AdInstructorId,0);


/* The same numbering rule is reused after edits/deletes. Unresolved courses do
   not receive a fake canonical section number. */
const renumbered=assignAuthoritySections([
  {AdCourseId:11,SCode:"900",sourceOrder:20},
  {AdCourseId:12,SCode:"888",sourceOrder:30},
  {AdCourseId:11,SCode:"777",sourceOrder:10},
  {AdCourseId:0,SCode:"501",sourceOrder:40},
]);
assert.equal(renumbered[2].SCode,"501");
assert.equal(renumbered[0].SCode,"502");
assert.equal(renumbered[1].SCode,"501");
assert.equal(renumbered[3].SCode,"");


/* In a flattened/fallback row, the seven-digit course key must not be consumed
   as the 4–8 digit reference number when the catalogue stores only `102`. */
const fallbackPage:OcrPage={rows:[{y:1,line:"0101102 18945 501 الثقافة الإسلامية 42 1530-1650 012B09 F13 د. علي يوسف أحمد السند",cells:[
  {text:"0101102",x0:0,x1:1},{text:"18945",x0:1,x1:2},{text:"501",x0:2,x1:3},
  {text:"الثقافة الإسلامية",x0:3,x1:4},{text:"42",x0:4,x1:5},{text:"1530-1650",x0:5,x1:6},
  {text:"012B09",x0:6,x1:7},{text:"F13",x0:7,x1:8},{text:"د. علي يوسف أحمد السند",x0:8,x1:9},
]}]} as any;
const fallbackParsed=parseScheduleTable([fallbackPage],courses,instructors,undefined,{authorityDepartmentCode:"0101",sequentialSections:true});
assert.equal(fallbackParsed.rows[0].sourceCourseCode,"0101102");
assert.equal(fallbackParsed.rows[0].referenceNumber,"18945");

/* A matching Arabic name cannot rescue a wrong/missing course number. */
const wrongCodePages:OcrPage[]=[{rows:[],gridRows:[{...gridRows[0],code:"0101999",courseText:"الثقافة الإسلامية"}]} as any];
const wrong=parseScheduleTable(wrongCodePages,courses,instructors,undefined,{authorityDepartmentCode:"0101",sequentialSections:true});
assert.equal(wrong.rows[0].AdCourseId,0);

console.log(JSON.stringify({ passed: 14, checks: [
  "generated RTL text layer keeps 012 branch and 0101 department separate",
  "CamScanner OCR recovers branch/department independently",
  "numeric college spill is not treated as department name",
  "department document key is college code + local scientific-department code",
  "unpadded live college/department codes are represented as 0101",
  "document local 01 is rejected when composite 0101 is expected",
  "0101 matches catalogue college 01 + department 01",
  "full course number 0101102 maps to catalogue course 102 only in department 0101",
  "catalogue course name overrides OCR text",
  "sections are generated 501, 502... independently for each course",
  "section numbering is reapplied after row edits/deletes and unresolved courses stay blank",
  "full course key is preserved as source evidence and never confused with CRN",
  "instructor requires one exact normalized system name",
  "course name alone can never create a canonical course identity",
] }, null, 2));
