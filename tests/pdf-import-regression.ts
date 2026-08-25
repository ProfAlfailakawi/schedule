import assert from "node:assert/strict";
import { authorityBuildingCellLooksPlausible, authorityTimeCellLooksPlausible, parseAuthorityHeaderText, parseScheduleTable, type OcrPage } from "../src/utils/documentOcr.ts";
import { assignAuthoritySections, authorityDepartmentCode, authorityDepartmentMatches, authorityCourseCodeMatches } from "../src/utils/authorityAcademicCodes.ts";
import { recoverOfficialBuildingCodeFromAuthorityCell } from "../src/utils/locationCollegePrefixes.ts";
import { resolveRoom } from "../src/utils/locationRegistry.ts";

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


/* The clear photographed PDF often appends a grid-rule digit to the second
   clock. It must still claim the TIME column, while a building token must never
   look like a clock pair. */
assert.equal(authorityTimeCellLooksPlausible("1050 - 10040"),true);
assert.equal(authorityTimeCellLooksPlausible("1650 - 15340"),true);
assert.equal(authorityTimeCellLooksPlausible("012B09"),false);

/* Building-column proof is anchored to the owner's official site prefixes.
   Concatenated seat/capacity values must never be allowed to claim BUILDING. */
assert.equal(authorityBuildingCellLooksPlausible("012B09"),true);
assert.equal(authorityBuildingCellLooksPlausible("12B09"),true);
assert.equal(authorityBuildingCellLooksPlausible("052007"),true);
assert.equal(authorityBuildingCellLooksPlausible("345045"),false);
assert.equal(authorityBuildingCellLooksPlausible("520020"),false);

/* Owner-supplied location grammar: branch 012 + site B + building 09 is the
   official code 012B09. Camera loss of the leading zero/grid stroke is repaired
   only against the finite official registry for that branch. */
const officialBuildings=["012B07","012B09","012F15","012J14","011B17"];
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("012B09","012",officialBuildings),"012B09");
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("12B09","012",officialBuildings),"012B09");
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("112B09","012",officialBuildings),"012B09");
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("12B07 F","012",officialBuildings),"012B07");
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("12F15","012",officialBuildings),"012F15");
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("F13","012",officialBuildings),null);
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("011B17","012",officialBuildings),null);

/* A hall is accepted only inside its already-confirmed building. FO7 is a
   measured OCR form of F07; it may recover only because that exact official
   room exists under 012B07. */
const roomRegistry:any={
  buildings:[{id:"building_012B07",officialCode:"012B07",confidence:"CONFIRMED",aliases:[],collegeIds:[6],sectionIds:[9],active:true}],
  rooms:[
    {id:"room_012B07_F07",buildingId:"building_012B07",buildingCode:"012B07",canonicalCode:"F07",confidence:"CONFIRMED",aliases:[],collegeIds:[6],sectionIds:[9],active:true,shared:false,evidence:[]},
    {id:"room_012B07_F31",buildingId:"building_012B07",buildingCode:"012B07",canonicalCode:"F31",confidence:"CONFIRMED",aliases:[],collegeIds:[6],sectionIds:[9],active:true,shared:false,evidence:[]},
  ],
};
assert.equal(resolveRoom(roomRegistry,"FO7","building_012B07",{collegeId:6,sectionId:9}).value?.canonicalCode,"F07");
assert.equal(resolveRoom(roomRegistry,"F31","building_012B07",{collegeId:6,sectionId:9}).value?.canonicalCode,"F31");
assert.equal(resolveRoom(roomRegistry,"F99","building_012B07",{collegeId:6,sectionId:9}).status,"REVIEW_REQUIRED");

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
  {code:"0101102",reference:"18945",scode:"777",courseText:"اسم OCR خاطئ تماماً",instructorText:"د. علي يوسف أحمد السند",building:"",buildingRaw:"12B09",hall:"F13",hallRaw:"F13",start:"15:30",end:"16:50",days:"42"},
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

console.log(JSON.stringify({ passed: 28, checks: [
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
  "time column survives one grid-rule digit without accepting building codes",
  "noisy 1050-10040 remains a plausible time cell",
  "012B09 can never claim the time column",
  "official site prefix is required to claim the building column",
  "dropped leading zero may still identify the correct building column",
  "numeric official site prefixes remain supported",
  "capacity weld 345045 can never claim the building column",
  "capacity weld 520020 can never claim the building column",
  "012B + building 09 reconstructs only official 012B09",
  "dropped/painted leading zero in building cell is registry-recovered",
  "cross-branch official code is never silently rebound",
  "room is resolved only under its confirmed building",
  "FO7 may normalize to official F07 only inside that building",
  "unknown hall stays unresolved instead of being invented",
] }, null, 2));
