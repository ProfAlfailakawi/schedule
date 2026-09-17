import assert from "node:assert/strict";
import { matchInstructorIdentity, uniqueExactIdentityMatch, authorityBuildingCellLooksPlausible, authorityCourseCellLooksPlausible, authorityCourseColumnLooksPlausible, authorityDaysCellLooksPlausible, authorityPdfTextGridRows, authorityReferenceCourseCellLooksPlausible, recoverAuthorityCourseCell, authorityScanRequiresLandscape, authorityTimeCellLooksPlausible, graduationSheetFacts, instructorRegistryOutcome, parseAuthorityHeaderText, parseScheduleTable, type OcrPage } from "../src/utils/documentOcr.ts";
import { assignAuthoritySections, authorityDepartmentCode, authorityDepartmentMatches, authorityCourseCodeMatches, authoritySectionCodeLooksPlausible, normalizeAuthoritySectionCode } from "../src/utils/authorityAcademicCodes.ts";
import { officialSiteLabel, recoverOfficialBuildingCodeFromAuthorityCell } from "../src/utils/locationCollegePrefixes.ts";
import { fairShareByOwner } from "../src/utils/hallBarterFairness.ts";
import { resolveBuildingFromUniqueRoom, resolveRoom } from "../src/utils/locationRegistry.ts";
import { branchRootOf, resolveBranchScope, siblingBranchScopes, splitRowsByBranch } from "../src/utils/branchScope.ts";

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
/* Basic Education (01) stays frozen, while the same canonical section exposed
   under another college is rendered with that college's SWRSCHA prefix. This
   is the real Commercial Studies Girls case: catalogue 0101, document 0201. */
assert.equal(authorityDepartmentCode("01", "0201"), "0201");
assert.equal(authorityDepartmentCode("02", "0101"), "0201");
assert.equal(authorityDepartmentCode("02", "0201"), "0201");
assert.equal(authorityDepartmentCode("03", "0101"), "0301");
assert.equal(authorityDepartmentCode("04", "0101"), "0401");
assert.equal(authorityDepartmentCode("05", "0101"), "0501");
/* Real catalogue college codes can be branch/site identities rather than the
   two-digit college authority printed by SWRSCHA. Only the first two digits
   belong to the department key. */
assert.equal(authorityDepartmentCode("011", "0101"), "0101");
assert.equal(authorityDepartmentCode("012", "0101"), "0101");
assert.equal(authorityDepartmentCode("022", "0101"), "0201");
assert.equal(authorityDepartmentCode("022T", "0101"), "0201");
assert.equal(authorityDepartmentCode("0420", "0101"), "0401");
assert.equal(authorityDepartmentCode("0520", "0101"), "0501");
assert.equal(authorityDepartmentMatches("0101", "011", "0101"), true);
assert.equal(authorityDepartmentMatches("0101", "012", "0101"), true);
assert.equal(authorityDepartmentMatches("0201", "022", "0101"), true);
assert.equal(authorityDepartmentMatches("0201", "022T", "0101"), true);
assert.equal(authorityDepartmentMatches("0401", "0420", "0101"), true);
assert.equal(authorityDepartmentMatches("0501", "0520", "0101"), true);
assert.equal(authorityDepartmentMatches("0202", "022", "0101"), false);
assert.equal(authorityDepartmentMatches("0201", "02", "0101"), true);

/* Exact header shape from Commercial Studies — Girls. The document carries
   college 02 / branch 022 / department 0201 while the selected system section
   can still carry the shared 0101 identity. The branch code must never be
   mistaken for the two-digit college authority. */
const commercialGirlsHeader=parseAuthorityHeaderText(`
الفصل : الفصل الدراسي الاول 2027-2026 كلية الدراسات التجارية
القسم : 0201 تربية اسلامية (تربية اساسية) الفرع : 022 كلية الدراسات التجارية بنات
الكلية : 02
`);
assert.equal(commercialGirlsHeader.branch?.code,"022");
assert.equal(commercialGirlsHeader.department?.code,"0201");
assert.equal(authorityDepartmentMatches(commercialGirlsHeader.department?.code,"022","0101"),true);
assert.equal(authorityDepartmentMatches("0401", "04", "0101"), true);
assert.equal(authorityDepartmentMatches("0202", "02", "0101"), false);
assert.equal(authorityDepartmentMatches("0101", "02", "0101"), false);
assert.equal(authorityDepartmentMatches("0101", "01", "01"), true);
assert.equal(authorityDepartmentMatches("0101", "1", "1"), true);
assert.equal(authorityDepartmentMatches("01", "01", "01"), false);
assert.equal(authorityDepartmentMatches("0102", "01", "01"), false);
assert.equal(authorityCourseCodeMatches("0101102", "102", "0101"), true);
/* Full seven-digit catalogue keys can also be shared from another college; the
   proven document department owns the first four digits, while the course's
   three-digit tail remains canonical. */
assert.equal(authorityCourseCodeMatches("0201101", "0101101", "0201"), true);
assert.equal(authorityCourseCodeMatches("0401101", "0101101", "0401"), true);
assert.equal(authorityCourseCodeMatches("0202101", "0101101", "0201"), false);
assert.equal(authorityCourseCodeMatches("0102102", "102", "0101"), false);
assert.equal(normalizeAuthoritySectionCode("٠١"), "01");
assert.equal(normalizeAuthoritySectionCode("01"), "01");
assert.equal(authoritySectionCodeLooksPlausible("1"), true);
assert.equal(authoritySectionCodeLooksPlausible("01"), true);
assert.equal(authoritySectionCodeLooksPlausible("501"), true);
assert.equal(authoritySectionCodeLooksPlausible("510"), true);
assert.equal(authoritySectionCodeLooksPlausible("0"), false);
assert.equal(authoritySectionCodeLooksPlausible("A1"), false);
assert.equal(authorityCourseCellLooksPlausible("0101102","0101"),true);
assert.equal(authorityCourseCellLooksPlausible("5011894","0101"),false);
assert.equal(authorityCourseColumnLooksPlausible("010110","0101"),true);
assert.equal(authorityCourseColumnLooksPlausible("30101102","0101"),true);
assert.equal(authorityCourseColumnLooksPlausible("710101202","0101"),true);
assert.equal(authorityCourseColumnLooksPlausible("1010110","0101"),true);
assert.equal(authorityCourseColumnLooksPlausible("501189","0101"),false);
assert.equal(authorityReferenceCourseCellLooksPlausible("189450101102","0101"),true);
assert.equal(authorityReferenceCourseCellLooksPlausible("5011894","0101"),false);
/* Course keys are digits-only. O↔0 is a measured OCR glyph error at the
   photographed right edge and may be normalized without consulting prose or
   neighbouring cells; canonical catalogue matching still owns identity. */
assert.equal(authorityCourseCellLooksPlausible("O1O11O2","0101"),true);
assert.equal(authorityCourseColumnLooksPlausible("O1O11O","0101"),true);
assert.equal(authorityReferenceCourseCellLooksPlausible("18945O1O11O2","0101"),true);

/* Dense multi-page photographs may lose or absorb ONE course-key digit. The
   repair is legal only inside the selected department catalogue and only when
   the same cell resolves to one unique canonical key. */
const canonicalCourseKeys=["0101102","0101150","0101151","0101153","0101201","0101202"];
assert.equal(recoverAuthorityCourseCell("0101102","0101",canonicalCourseKeys),"0101102");
assert.equal(recoverAuthorityCourseCell("O1O11O2","0101",canonicalCourseKeys),"0101102");
assert.equal(recoverAuthorityCourseCell("010110","0101",canonicalCourseKeys),"0101102");
assert.equal(recoverAuthorityCourseCell("30101102","0101",canonicalCourseKeys),"0101102");
assert.equal(recoverAuthorityCourseCell("710101202","0101",canonicalCourseKeys),"0101202");
assert.equal(recoverAuthorityCourseCell("110101201","0101",canonicalCourseKeys),"0101201");
assert.equal(recoverAuthorityCourseCell("10101150","0101",canonicalCourseKeys),"0101150");
assert.equal(recoverAuthorityCourseCell("102","0101",canonicalCourseKeys),"0101102");
assert.equal(recoverAuthorityCourseCell("010115","0101",["0101150","0101151","0101153"]),"");
assert.equal(recoverAuthorityCourseCell("010110","0102",canonicalCourseKeys),"");

/* Image-only Authority timetables must arrive already landscape. Native-text
   PDFs are exempt because their cells are reconstructed from PDF coordinates. */
assert.equal(authorityScanRequiresLandscape(768,1024,0,0),true);
assert.equal(authorityScanRequiresLandscape(1024,768,0,0),false);
assert.equal(authorityScanRequiresLandscape(768,1024,800,60),false);


/* The clear photographed PDF often appends a grid-rule digit to the second
   clock. It must still claim the TIME column, while a building token must never
   look like a clock pair. */
assert.equal(authorityTimeCellLooksPlausible("1050 - 10040"),true);
assert.equal(authorityTimeCellLooksPlausible("1650 - 15340"),true);
assert.equal(authorityTimeCellLooksPlausible("012B09"),false);

/* Authority day runs are ordered. A grid stroke may turn 531 into a still-
   numeric 534; that must be treated as damaged same-cell evidence, not valid
   days, so the cell-level recovery lane gets a chance to reread it. */
assert.equal(authorityDaysCellLooksPlausible("5 3 1"),true);
assert.equal(authorityDaysCellLooksPlausible("531"),true);
assert.equal(authorityDaysCellLooksPlausible("1 3 5"),true);
assert.equal(authorityDaysCellLooksPlausible("534"),false);
assert.equal(authorityDaysCellLooksPlausible("5 3 3"),false);


/* Generated SWRSCHA text PDFs are not column-identical across colleges.
   The 011 (Basic Education — Boys) layout places DAYS around x=.17-.21,
   SECTION around x=.85 and the second clock close to x=.31. The old 012B
   ratios therefore produced an all-red DAYS column and could also lose section
   and time. Non-girls generated PDFs must be read by row semantics instead. */
{
  const y0=170,y1=178;
  const word=(text:string,x0:number,x1:number)=>({text,x0,y0,x1,y1});
  const boysNativeWords:any[]=[
    word("شجاع",90.4,108.7),word("غازي",111.4,129.2),
    word("4",148.1,153.5),word("2",158.9,164.3),
    word("محاضرة",180.2,207.1),
    word("1220",212.3,233.9),word("-",236.6,239.9),word("1100",242.5,264.2),
    word("011B18",264.8,301.7),word("G07",306.0,326.2),
    word("الثقافة",654.4,682.5),word("الاسلامية",685.2,702.6),
    word("01",710.5,722.4),word("10643",728.0,757.8),word("0101102",759.4,801.0),
  ];
  const semanticRows=authorityPdfTextGridRows(boysNativeWords,841.8898,"semantic");
  assert.equal(semanticRows.length,1);
  assert.equal(semanticRows[0].scode,"01");
  assert.equal(semanticRows[0].reference,"10643");
  assert.equal(semanticRows[0].days.replace(/\s+/g,""),"24");
  assert.equal(semanticRows[0].start,"11:00");
  assert.equal(semanticRows[0].end,"12:20");
  assert.equal(semanticRows[0].building,"011B18");
  assert.equal(semanticRows[0].hall,"G07");
  assert.match(semanticRows[0].instructorText,/شجاع/);
}

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
/* ── لا يسقط قسمٌ لأن قاعاته جاءت متأخرة في الترتيب ────────────────────────
   ثمانية عشر قسماً وألفا نافذة وسعةٌ لأربعمائة: القصّ من الآخر كان يمحو
   أقساماً بأكملها. التناوب يُبقي الجميع، ويعيد المختار إلى ترتيب القراءة. */
{
  const rows: Array<{ owner: number; n: number }> = [];
  for (let owner = 1; owner <= 18; owner += 1) for (let n = 0; n < 120; n += 1) rows.push({ owner, n });
  rows.sort((a, b) => a.owner - b.owner || a.n - b.n);           // مرتَّبة بالمالك، كترتيب المبنى تماماً
  const cut = rows.slice(0, 400);
  assert.equal(new Set(cut.map(r => r.owner)).size, 4);          // القصّ الأعمى: أربعة أقسام فقط
  const fair = fairShareByOwner(rows, 400, row => row.owner);
  assert.equal(fair.length, 400);
  assert.equal(new Set(fair.map(r => r.owner)).size, 18);        // التناوب: الأقسام كلها حاضرة
  const per = [...new Set(fair.map(r => r.owner))].map(owner => fair.filter(r => r.owner === owner).length);
  assert.ok(Math.max(...per) - Math.min(...per) <= 1);           // والحصص متساوية إلا واحدة
  const order = new Map(rows.map((row, index) => [row, index] as const));
  assert.deepEqual(fair.map(r => order.get(r)), [...fair.map(r => order.get(r)!)].sort((a, b) => a - b));
  assert.equal(fairShareByOwner(rows.slice(0, 10), 400, row => row.owner).length, 10);
}

const officialBuildings=["012B07","012B09","012F15","012J14","011B17"];
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("012B09","012",officialBuildings),"012B09");
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("12B09","012",officialBuildings),"012B09");
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("112B09","012",officialBuildings),"012B09");
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("12B07 F","012",officialBuildings),"012B07");
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("12F15","012",officialBuildings),"012F15");
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("012809","012",officialBuildings),"012B09");
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("012114","012",officialBuildings),"012J14");
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("345045","012",officialBuildings),null);
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("F13","012",officialBuildings),null);
assert.equal(officialSiteLabel("012J"),"التربية الأساسية - الجهراء");
assert.equal(officialSiteLabel("012F"),"التربية الأساسية - الفحيحيل");
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("011B17","012",officialBuildings),null);

/* الحرف المتضرر يسقط من المعادلة ولا يُخمَّن: أرقام الفرع ورقم المبنى تحدد
   كوداً واحداً في الفرع، فيُقبل مهما قرأ الماسح الحرف — والفحيحيل كالجهراء.
   وإن نازع الرقمَ كودٌ آخر في الفرع نفسه رُفض الصف كما كان. */
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("012E15","012",officialBuildings),"012F15");
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("12P15","012",officialBuildings),"012F15");
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("012715","012",officialBuildings),"012F15");
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("012E15","012",[...officialBuildings,"012J15"]),null);
assert.equal(recoverOfficialBuildingCodeFromAuthorityCell("012E15","011",officialBuildings),null);

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
const roomFingerprintRegistry:any={
  buildings:[
    {id:"building_012B07",officialCode:"012B07",sitePrefix:"012B",confidence:"CONFIRMED",aliases:[],collegeIds:[6],sectionIds:[9],active:true},
    {id:"building_012B09",officialCode:"012B09",sitePrefix:"012B",confidence:"CONFIRMED",aliases:[],collegeIds:[6],sectionIds:[9],active:true},
  ],
  rooms:[
    {id:"room_012B07_F31",buildingId:"building_012B07",buildingCode:"012B07",canonicalCode:"F31",confidence:"CONFIRMED",aliases:[],collegeIds:[6],sectionIds:[9],active:true,shared:false,evidence:[]},
    {id:"room_012B07_F12",buildingId:"building_012B07",buildingCode:"012B07",canonicalCode:"F12",confidence:"CONFIRMED",aliases:[],collegeIds:[6],sectionIds:[9],active:true,shared:false,evidence:[]},
    {id:"room_012B09_F12",buildingId:"building_012B09",buildingCode:"012B09",canonicalCode:"F12",confidence:"CONFIRMED",aliases:[],collegeIds:[6],sectionIds:[9],active:true,shared:false,evidence:[]},
  ],
};
assert.equal(resolveBuildingFromUniqueRoom(roomFingerprintRegistry,"F31",{branchRoot:"012"}).value?.officialCode,"012B07");
assert.equal(resolveBuildingFromUniqueRoom(roomFingerprintRegistry,"F12",{branchRoot:"012"}).status,"REVIEW_REQUIRED");

/* Course NUMBER is canonical; system name wins; the section printed by the
   Authority PDF is source identity and must survive unchanged. An abbreviated
   professor name never receives a real instructor ID. */
const courses:any[]=[
  {AdCourseId:11,AdCollegeId:6,AdSectionId:9,CourseCode:"102",CourseName:"الثقافة الإسلامية",CourseHours:3,CourseCredit:3},
  {AdCourseId:12,AdCollegeId:6,AdSectionId:9,CourseCode:"103",CourseName:"اسم آخر في النظام",CourseHours:3,CourseCredit:3},
];
const instructors:any[]=[
  {AdInstructorId:21,AdInstructorName:"د. علي يوسف أحمد السند"},
  {AdInstructorId:22,AdInstructorName:"علي يوسف أحمد السندي"},
  {AdInstructorId:23,AdInstructorName:"د. عبدالرحمن صالح سالم الجميلي"},
  {AdInstructorId:24,AdInstructorName:"أ.د. عيسى زكي عيسى شقرة"},
  {AdInstructorId:25,AdInstructorName:"هيئة تدريسية"},
  {AdInstructorId:26,AdInstructorName:"أ. عبدالله عبداللطيف عبدالله الهاجري"},
  {AdInstructorId:27,AdInstructorName:"د. عبد الرحمن نوري أحمد المطيري"},
];
const gridRows:any[]=[
  {code:"0101102",reference:"18945",scode:"01",courseText:"اسم OCR خاطئ تماماً",instructorText:"د. علي يوسف أحمد السند",building:"",buildingRaw:"12B09",hall:"F13",hallRaw:"F13",start:"15:30",end:"16:50",days:"42"},
  {code:"0101102",reference:"18946",scode:"02",courseText:"اسم آخر خاطئ",instructorText:"علي السند",building:"012B07",hall:"F31",start:"11:00",end:"11:50",days:"531"},
  {code:"0101103",reference:"18947",scode:"01",courseText:"حتى لو اسم OCR لا يطابق",instructorText:"",building:"012B07",hall:"F31",start:"08:00",end:"09:20",days:"42"},
];
const pages:OcrPage[]=[{rows:[],gridRows} as any];
const parsed=parseScheduleTable(pages,courses,instructors,new Set([21,22]),{authorityDepartmentCode:"0101",sequentialSections:true});
assert.equal(parsed.rows.length,3);
assert.equal(parsed.rows[0].AdCourseId,11);
assert.equal(parsed.rows[0].AdCourseName,"الثقافة الإسلامية");
assert.equal(parsed.rows[0].SCode,"01");
assert.equal(parsed.rows[1].SCode,"02");
assert.equal(parsed.rows[2].AdCourseId,12);
assert.equal(parsed.rows[2].SCode,"01");
assert.equal(parsed.rows[0].AdInstructorId,21);
assert.equal(parsed.rows[1].AdInstructorId,21);



/* Smart-but-safe instructor recovery: titles are presentation only; two/three
   exact name tokens may select only ONE existing system row; «هيئة» maps only
   to the system's generic faculty identity. */
const instructorPages:OcrPage[]=[{rows:[],gridRows:[
  {...gridRows[0],reference:"20001",instructorText:"د. عبدالرحمن صالح سالم الجي"},
  {...gridRows[0],reference:"20002",instructorText:"ا. د. عيسى زكي عيسى شقرة"},
  {...gridRows[0],reference:"20003",instructorText:"هيئة"},
  {...gridRows[0],reference:"20004",instructorText:"ا.عبد الله عبد اللطيف عبد الله ال"},
  {...gridRows[0],reference:"20005",instructorText:"عبدالرحمن نوري احمد الم"},
]} as any];
const instructorParsed=parseScheduleTable(instructorPages,courses,instructors,new Set([21,23,24,25,26,27]),{authorityDepartmentCode:"0101",sequentialSections:true});
assert.equal(instructorParsed.rows[0].AdInstructorId,23);
assert.equal(instructorParsed.rows[1].AdInstructorId,24);
assert.equal(instructorParsed.rows[2].AdInstructorId,25);
assert.equal(instructorParsed.rows[3].AdInstructorId,26);
assert.equal(instructorParsed.rows[4].AdInstructorId,27);

/* ── أسماء الجدول المعتمد كما تُطبع فعلاً ──────────────────────────────────────
   ثلاث حالات كانت تُفرغ خانة الأستاذ بلا سبب حقيقي، فيظهر جدول القسم أحمر
   كاملاً رغم أن كل أسمائه مسجّلة في النظام:
   1) «بدالله حسن» — العين وحدها ضاعت من الاسم الأول؛
   2) «إقبال» — اسم أول وحده، وكل البراهين كانت تبدأ من اسمين؛
   3) «فهد عامر» — اسمان في قسم بلا تاريخ سابق، فنطاق التفضيل يولد فارغاً.
   وفي كل حالة يبقى الشرط واحداً: نتيجة وحيدة لا ثاني لها، وإلا فالخانة فارغة. */
const namedStaff:any[]=[
  {AdInstructorId:31,AdInstructorName:"د. فهد عامر المطيري"},
  {AdInstructorId:32,AdInstructorName:"د. عبدالله حسن الرشيدي"},
  {AdInstructorId:33,AdInstructorName:"د. إقبال محمد الصباح"},
];
const namedPage=(text:string,reference:string):OcrPage=>
  ({rows:[],gridRows:[{...gridRows[0],reference,instructorText:text}]} as any);
const readName=(text:string,preferred?:Set<number>,catalogue:any[]=namedStaff)=>
  parseScheduleTable([namedPage(text,"30001")],courses,catalogue,preferred,
    {authorityDepartmentCode:"0101",sequentialSections:true}).rows[0].AdInstructorId;

// 1) حرف مفقود من الاسم الأول لا يُسقط الهوية داخل القسم، لأن «حسن» طابق حرفياً.
assert.equal(readName("د. بدالله حسن",new Set([32])),32);
// وخارج القسم لا يكفي هذا الجذع وحده لصناعة هوية.
assert.equal(readName("د. بدالله حسن",new Set()),0);

// 2) اسم أول وحده يُقبل داخل القسم حين لا يحمله سواه.
assert.equal(readName("د. إقبال",new Set([33])),33);
// ويبقى فارغاً إذا حمله اثنان، ولو كانا كلاهما من القسم.
assert.equal(readName("د. إقبال",new Set([33,34]),
  [...namedStaff,{AdInstructorId:34,AdInstructorName:"د. إقبال يوسف العنزي"}]),0);
// ولا يُقبل خارج نطاق القسم أبداً.
assert.equal(readName("د. إقبال",new Set()),0);

// 3) اسمان في قسم بلا تاريخ: يُقبلان فقط حين لا ينطبقان إلا على شخص واحد.
assert.equal(readName("د. فهد عامر",new Set()),31);
assert.equal(readName("د. فهد عامر",new Set(),
  [...namedStaff,{AdInstructorId:35,AdInstructorName:"د. فهد عامر العجمي"}]),0);
// وخارج القسم لا يُقبل جذع ولا حرف ناقص: «فهد المط» لا تثبّت «فهد عامر المطيري».
assert.equal(readName("د. فهد المط",new Set()),0);
// بينما تبقى مقبولة داخل نطاق القسم، حيث «فهد» مطابق حرفياً والقائمة قصيرة.
assert.equal(readName("د. فهد المط",new Set([31])),31);

// «هيئة تدريسية» تُحسم من نطاق القسم حين تتعدد سجلات الجامعة.
const facultyStaff:any[]=[
  {AdInstructorId:41,AdInstructorName:"هيئة تدريسية"},
  {AdInstructorId:42,AdInstructorName:"هيئة تدريسية"},
];
assert.equal(readName("هيئة تدريسية",new Set([42]),facultyStaff),42);
/* وخارج نطاق القسم لا تبقى الخانة فارغة: «هيئة تدريسية» معنى واحد يتشاركه
   الجميع — تُكتب حين لا يكون للشعبة اسم دكتور ثابت — وتقارير القسم تبقى قسمه
   لأن الصف يحمل قسمه لا الشخص. فتعدّد السجلات تكرارُ معنى لا التباسُ شخصين،
   ويُؤخذ أقدمها قاعدةً ثابتة بين القراءات. */
assert.equal(readName("هيئة تدريسية",new Set(),facultyStaff),41);

/* ── لماذا لم تُربط الخانة؟ ───────────────────────────────────────────────────
   للفشل سببان علاجهما مختلف: شخص لا وجود له في سجل الأساتذة (علاجه تسجيله)،
   أو سجل يحتمل أكثر من مرشّح (علاجه اختيار واحد). الرسالة الواحدة كانت تخفي
   الفرق، فيبحث المراجع عن خطأ قراءة لا وجود له. */
assert.equal(instructorRegistryOutcome("عبدالله رجب الأنصاري",namedStaff),"UNREGISTERED");
// الاسم المفرد لا يبلغ عتبة الاسمين أبداً، فكان يُقال لصاحبه «اختر من القائمة»
// ولا أحد في القائمة يحمله. عتبته اسم واحد لأنه كل ما طُبع.
assert.equal(instructorRegistryOutcome("إقبال",
  [{AdInstructorId:60,AdInstructorName:"سالم محمد العتيبي"}] as any),"UNREGISTERED");
assert.equal(instructorRegistryOutcome("إقبال",
  [{AdInstructorId:61,AdInstructorName:"إقبال محمد الصباح"}] as any),"AMBIGUOUS");
// اشتراك في اسم شائع واحد ليس شبه هوية: يبقى «غير مسجّل».
assert.equal(instructorRegistryOutcome("خالد سعد الهاجري",
  [{AdInstructorId:50,AdInstructorName:"خالد يوسف العنزي"}] as any),"UNREGISTERED");
// اسمان صريحان مشتركان يجعلان السجل محتملاً، فالعلاج اختيار لا تسجيل.
assert.equal(instructorRegistryOutcome("طلال فهيد ماطر",
  [{AdInstructorId:51,AdInstructorName:"طلال فهيد العجمي"}] as any),"AMBIGUOUS");
// والتطبيع نفسه على الجانبين: «عبد العزيز» و«عبدالعزيز» اسم واحد.
assert.equal(instructorRegistryOutcome("اقبال عبد العزيز المطوع",
  [{AdInstructorId:52,AdInstructorName:"د. اقبال عبدالعزيز المطوع"}] as any),"AMBIGUOUS");

/* ── المطابقة الحرفية الوحيدة داخل نطاق القسم ────────────────────────────────
   قانون الهوية نفسه الذي تحكم به المطابقة على الخادم، مصدَّر للمعاينة كي تشفي
   خاناتها بعد تسجيل الأعضاء دون إعادة رفع الملف. سجلان مكرران لنفس الشخص ليسا
   التباساً؛ شخصان مختلفان التباسٌ لا يُختار فيه. */
const enrolled:any[]=[
  {AdInstructorId:71,AdInstructorName:"د. عبدالله حسن الرشيدي"},
  {AdInstructorId:72,AdInstructorName:"هيئة تدريسية"},
];
assert.equal(uniqueExactIdentityMatch("عبدالله حسن الرشيدي",enrolled)?.AdInstructorId,71);
// اسم عائلة مقصوص عند حافة الخانة: اسم السجل وارد كاملاً داخل المطبوع؟ لا —
// المطبوع أقصر؛ يبقى بلا ربط تلقائي، فالحسم للمراجع.
assert.equal(uniqueExactIdentityMatch("عبدالله حسن",enrolled),undefined);
// الألقاب و«عبد الله»/«عبدالله» لا تحجب المطابقة.
assert.equal(uniqueExactIdentityMatch("أ.د. عبد الله حسن الرشيدي",enrolled)?.AdInstructorId,71);
assert.equal(uniqueExactIdentityMatch("هيئة تدريسية",enrolled)?.AdInstructorId,72);
// سجلان مكرران لنفس الشخص (نفس المعرف) ليسا التباساً.
assert.equal(uniqueExactIdentityMatch("هيئة تدريسية",[...enrolled,{AdInstructorId:72,AdInstructorName:"هيئة تدريسية"}] as any)?.AdInstructorId,72);
// شخصان مختلفان بنفس الاسم: لا اختيار.
assert.equal(uniqueExactIdentityMatch("هيئة تدريسية",[...enrolled,{AdInstructorId:73,AdInstructorName:"هيئة تدريسية"}] as any),undefined);

/* ── كل ما يتقلب به رسم الاسم العربي، حالةً حالة ─────────────────────────────
   «إقبال» في السجل و«اقبال» في الورقة أوقفت قسماً كاملاً. القانون يطوي كل
   هذه الفروق — وحتى المسافات — على الجانبين، والمحرك الحقيقي هو المُختبَر. */
const spellingRegistry:any[]=[
  {AdInstructorId:81,AdInstructorName:"د. إقبال عبد العزيز المطوع"},
  {AdInstructorId:82,AdInstructorName:"ألاء خالد البصيلى"},
  {AdInstructorId:83,AdInstructorName:"د. مؤمن رئيف يحيى"},
];
const spelled_flipped=()=>parseScheduleTable(
  [namedPage("المطوع اقبال عبدالعزيز","50002")],courses,spellingRegistry,new Set(),
  {authorityDepartmentCode:"0101",sequentialSections:true}).rows[0].AdInstructorId;
const spelled=(printed:string)=>parseScheduleTable(
  [namedPage(printed,"50001")],courses,spellingRegistry,new Set(),
  {authorityDepartmentCode:"0101",sequentialSections:true}).rows[0].AdInstructorId;
// همزة الألف الساقطة + «عبد العزيز» الملتصقة.
assert.equal(spelled("اقبال عبدالعزيز المطوع"),81);
// المسافة الساقطة في غير موضعها لا تصنع شخصاً جديداً.
assert.equal(spelled("اقبال عبدالعزيزالمطوع"),81);
assert.equal(spelled("اقبالعبدالعزيز المطوع"),81);
// «ال» المشطورة عن العائلة، والألف المقصورة، والهمزة المفردة الساقطة.
assert.equal(spelled("الاء خالد ال بصيلي"),82);
assert.equal(spelled("آلاء خالد البصيلي"),82);
// ؤ=و، ئ=ي، و«يحيى»/«يحي».
assert.equal(spelled("مومن رييف يحي"),83);
// وكل شظايا الاسم الملتصقة، لا «عبد» وحدها: «عبد الاله» بهمزتيها، و«بو»/«ابو».
{
  const compound:any[]=[
    {AdInstructorId:85,AdInstructorName:"د. عبد الإله سعد المطيري"},
    {AdInstructorId:86,AdInstructorName:"محمد بوحمد"},
    {AdInstructorId:87,AdInstructorName:"خالد ابوالعلا"},
  ];
  assert.equal(uniqueExactIdentityMatch("عبدالاله سعد المطيري",compound)?.AdInstructorId,85);
  assert.equal(uniqueExactIdentityMatch("محمد بو حمد",compound)?.AdInstructorId,86);
  assert.equal(uniqueExactIdentityMatch("خالد ابو العلا",compound)?.AdInstructorId,87);
}
// والاسم المقلوب الترتيب — سجل قديم يُدخل العائلة أولاً — هو الشخص نفسه:
// مساواة المجموعة الكاملة، لا الاحتواء.
assert.equal(uniqueExactIdentityMatch("عبدالله رجب الأنصاري",
  [{AdInstructorId:88,AdInstructorName:"الأنصاري عبدالله رجب"}] as any)?.AdInstructorId,88);
assert.equal(spelled_flipped(),81);
/* ── المساواة لا تُزاحَم بالاحتواء على مستوى الجامعة ─────────────────────────
   سجل الجامعة يحوي آلاف الأسماء، وفيه حتماً اسمٌ أقصر يقع داخل اسم أطول
   («رجب الأنصاري» داخل «عبدالله رجب الأنصاري»). كان ذلك يجعل للمطبوع مرشحين
   فيسقط أقوى برهان — المساواة التامة — إلى برهان عالمي أضعف يشترط تفرّداً بين
   الآلاف. المساواة تُقرأ أولاً وحدها. */
{
  const big:any[]=[
    {AdInstructorId:95,AdInstructorName:"عبد الله رجب الأنصاري"},
    {AdInstructorId:96,AdInstructorName:"رجب الأنصاري"},
    {AdInstructorId:97,AdInstructorName:"عبدالله رجب"},
  ];
  const read=parseScheduleTable(
    [namedPage("عبدالله رجب الأنصاري","50003")],courses,big,new Set(),
    {authorityDepartmentCode:"0101",sequentialSections:true}).rows[0];
  assert.equal(read.AdInstructorId,95);
  assert.equal(read.instructorMatchMethod,"EXACT_FULL");
  // والاحتواء يبقى عاملاً حين لا مساواة: عائلة مقصوصة عند حافة الخانة.
  assert.equal(parseScheduleTable(
    [namedPage("رجب الأنصاري الكندري","50004")],courses,[big[1]],new Set(),
    {authorityDepartmentCode:"0101",sequentialSections:true}).rows[0].AdInstructorId,96);
}

// وبحث القائمة يجد ما تجده المطابقة: الحكم واحد.
assert.equal(uniqueExactIdentityMatch("اقبال عبدالعزيز المطوع",spellingRegistry)?.AdInstructorId,81);
assert.equal(uniqueExactIdentityMatch("الاء خالد ال بصيلي",spellingRegistry)?.AdInstructorId,82);
// والالتباس الحقيقي يبقى التباساً: شخصان مختلفان بنفس الاسم المطويّ لا يُختار بينهما.
assert.equal(uniqueExactIdentityMatch("اقبال عبدالعزيز المطوع",
  [...spellingRegistry,{AdInstructorId:84,AdInstructorName:"إقبال عبدالعزيز المطوع"}] as any),undefined);

/* Native generated PDF geometry: location comes only from its real x-range, so
   seat/capacity welds can never become Building. Instructor is taken from the
   leftmost identity cell as one complete phrase. */
const word=(text:string,x0:number,x1:number,y=200)=>({text,x0,y0:y-5,x1,y1:y+1});
const nativeWords:any[]=[
  word("0101102",744,787),word("18945",712,742),word("01",691,709),
  word("الثقافة",668,686),word("الاسلامية",636,665),
  word("45",435,447),word("45",388,400),word("0",343,350),
  word("F13",279,297),word("012B09",236,273),
  word("1530",213,235),word("-",206,210),word("1650",182,204),
  word("4",116,122),word("2",127,133),
  word("د.عبدالرحمن",55,96),word("صالح",35,53),word("سالم",19,32),word("الجي",1,16),
];
const native=authorityPdfTextGridRows(nativeWords,792);
assert.equal(native.length,1);
assert.equal(native[0].building,"012B09");
assert.equal(native[0].hall,"F13");
assert.equal(native[0].scode,"01");
assert.doesNotMatch(native[0].building,/345045|520020/);
assert.match(native[0].instructorText,/عبدالرحمن/);

/* Section identity is preserved from the printed cell. Legitimate gaps such as
   510 stay gaps; missing values stay missing. Older generated-501 drafts are
   repaired from immutable sourceSectionText, while source-less legacy values
   remain untouched instead of being guessed from row order. */
const preservedSections=assignAuthoritySections([
  {AdCourseId:11,SCode:"501",sourceSectionText:"01",sourceOrder:20},
  {AdCourseId:11,SCode:"509",sourceSectionText:"510",sourceOrder:30},
  {AdCourseId:0,SCode:"",sourceSectionText:"02",sourceOrder:40},
  {AdCourseId:11,SCode:"",sourceSectionText:"",sourceOrder:50},
  // A draft saved by the old 501 generator must be repaired from the immutable
  // source cell on reopen. This is the exact boys-report regression.
  {AdCourseId:11,SCode:"501",sourceSectionText:"01",sourceOrder:60,importEvidence:{section:{method:"COURSE_LOCAL_501_SEQUENCE"}}},
  // Girls reports already print 5xx values; source priority therefore leaves
  // the known-good flow byte-for-byte identical at the section level.
  {AdCourseId:12,SCode:"501",sourceSectionText:"501",sourceOrder:70},
]);
assert.equal(preservedSections[0].SCode,"01");
assert.equal(preservedSections[1].SCode,"510");
assert.equal(preservedSections[2].SCode,"02");
assert.equal(preservedSections[3].SCode,"");
assert.equal(preservedSections[4].SCode,"01");
assert.equal(preservedSections[5].SCode,"501");


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
assert.equal(wrong.rows[0].AdCourseName,"");

/* Regression from the photographed four-page PDF: SECTION + CRN welded into
   5011894/5021894. It is raw evidence, never a canonical course title. */
const weldedCoursePages:OcrPage[]=[{rows:[],gridRows:[{
  ...gridRows[0],code:"5011894",reference:"",scode:"",courseText:"5011894",
}]} as any];
const weldedCourse=parseScheduleTable(weldedCoursePages,courses,instructors,undefined,{authorityDepartmentCode:"0101",sequentialSections:true});
assert.equal(weldedCourse.rows.length,1);
assert.equal(weldedCourse.rows[0].AdCourseId,0);
assert.equal(weldedCourse.rows[0].AdCourseName,"");
assert.equal(weldedCourse.rows[0].sourceCourseText,"5011894");
assert.equal(weldedCourse.rows[0].SCode,"");

/* Graduate proof is not a generic transcript upload. It must be the official
   study-plan / graduation-sheet summary and expose both unit totals. */
const graduationSheet=graduationSheetFacts(`
الخطة الدراسية
الاسم: نوره غازي عبيد الرميحاني 904102301536
عرض الخطة الدراسية بناءً على
البرنامج: اسلامية - تربية خاصة - تفوق عقلي
الوحدات المطلوبة: 134
الوحدات المجتازة: 114
المقررات المطلوبة: 39
المقررات المجتازة: 24
`);
assert.equal(graduationSheet.isGraduationSheet,true);
assert.equal(graduationSheet.civil,"904102301536");
assert.equal(graduationSheet.requiredUnits,134);
assert.equal(graduationSheet.passedUnits,114);
const genericTranscript=graduationSheetFacts(`كشف درجات\n904102301536\nالوحدات المجتازة: 114`);
assert.equal(genericTranscript.isGraduationSheet,false);

console.log(JSON.stringify({ passed: 70, checks: [
  "generated RTL text layer keeps 012 branch and 0101 department separate",
  "CamScanner OCR recovers branch/department independently",
  "numeric college spill is not treated as department name",
  "department document key is college code + local scientific-department code",
  "unpadded live college/department codes are represented as 0101",
  "document local 01 is rejected when composite 0101 is expected",
  "0101 matches catalogue college 01 + department 01",
  "full course number 0101102 maps to catalogue course 102 only in department 0101",
  "catalogue course name overrides OCR text",
  "course-column claiming uses the proven scientific-department prefix",
  "course-key OCR normalizes Latin O to numeric 0 only inside digit-only course identity",
  "course-column discovery tolerates the same O-to-0 glyph correction",
  "course-column discovery tolerates at most two leading grid-rule glyphs before an exact department-shaped tail",
  "catalogue-constrained recovery may strip two leading rule glyphs only when the remaining full key is exact",
  "older CamScanner 110101201 evidence resolves only to canonical 0101201 from the same course cell",
  "merged reference+course validation tolerates O-to-0 without weakening department proof",
  "catalogue-constrained same-cell recovery accepts the O-to-0 course glyph correction",
  "welded section+CRN values such as 5011894 are rejected as course keys",
  "unresolved OCR course evidence never becomes the canonical display title",
  "Authority section values are preserved exactly from their source cells",
  "legacy generated 501 values are repaired from immutable sourceSectionText while girls 5xx stays unchanged",
  "legitimate section gaps stay intact and unresolved source sections remain blank",
  "full course key is preserved as source evidence and never confused with CRN",
  "instructor full-name match remains exact when available",
  "two/three exact Arabic name tokens may select only one system instructor",
  "د./ا./ا.د. academic titles are ignored as presentation",
  "هيئة maps only to the system هيئة تدريسية identity",
  "native PDF text geometry reads building only from the physical building cell",
  "native PDF text geometry reads room only from the physical room cell",
  "native PDF text geometry preserves the complete instructor cell",
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
  "B↔8 and J↔1 building glyph recovery is registry-and-branch constrained",
  "Jahra/Fahaheel site labels are restored for course-side location badges",
  "a unique confirmed room may rescue only one building in the same Authority branch",
  "an ambiguous room can never invent a building",
  "عبد الله/عبدالله compound-name spelling is canonicalized before instructor matching",
  "two/three department name tokens still return only a system instructor identity",
  "a single missing letter in the first name still resolves inside the department only",
  "a lone printed first name resolves only when one department person carries it",
  "two printed names resolve university-wide only when exactly one person qualifies",
  "outside the department a university-wide pair must be two exact tokens",
  "an unlinked instructor cell says whether the person is unregistered or merely undecided",
  "the shared identity law resolves a unique exact department member and refuses everything else",
  "hamza seats, ؤ/ئ, dropped lone hamza, ى/ة, يحيى/يحي, split ال, and stray spaces never hide an identity",
  "full equality outranks containment, so a shorter registry name cannot demote an exact university-scale match",
  "«هيئة تدريسية» is settled by the department when the university holds several",
  "graduation proof requires the official study-plan/graduation-sheet signature",
  "graduation proof reads the civil ID from the official sheet",
  "graduation proof reads required units only from the labelled sheet summary",
  "graduation proof reads passed units only from the labelled sheet summary",
  "a generic transcript is never accepted as the graduation sheet",
] }, null, 2));

/* The official graduation screenshot can contain a 12-digit timestamp-like OCR
   token before the civil number, while the civil itself may be spaced by OCR.
   Facts must preserve every complete one-line 12-digit candidate so the server
   can checksum-filter them and require the exact typed civil ID. */
const spacedCivilProof = graduationSheetFacts(`
الهيئة العامة للتعليم التطبيقي والتدريب
الخطة الدراسية
240820260808
نوره غازي عبيد الرحماني 3041 0230 1536
البرنامج اسلامية تربية خاصة
الوحدات المطلوبة 134
الوحدات المجتازة 114
`);
assert.ok(spacedCivilProof.civilCandidates.includes("304102301536"));
assert.ok(spacedCivilProof.civilCandidates.includes("240820260808"));

/* ── الفرع: القسم الواحد في ثلاثة مواقع ────────────────────────────────────
   الجامعة تصدر للقسم ملفاً واحداً يحوي الرئيسي والجهراء والفحيحيل، وكل موقع
   مسجل عندنا ككلية مستقلة لها القسم نفسه بالرمز نفسه. هذه الفحوص تثبت أن كل
   صف يُنسب إلى قسمه في موقعه، وأن فرعاً آخر لا يتسلل بحجة أنه «موقع». */
const branchColleges = [
  { AdCollegeId: 6, AdCollegeName: "كلية التربية الأساسية - بنات" },
  { AdCollegeId: 10, AdCollegeName: "كلية التربية الأساسية - بنات - الجهراء" },
  { AdCollegeId: 11, AdCollegeName: "كلية التربية الأساسية - بنات - الفحيحيل" },
  { AdCollegeId: 5, AdCollegeName: "كلية التربية الأساسية - بنين" },
];
const branchSections = [
  { AdCollegeId: 6, AdSectionId: 90, AdSectionCode: "07", AdSectionName: "تكنولوجيا التعليم" },
  { AdCollegeId: 10, AdSectionId: 190, AdSectionCode: "07", AdSectionName: "تكنولوجيا التعليم" },
  { AdCollegeId: 11, AdSectionId: 290, AdSectionCode: "07", AdSectionName: "تكنولوجيا التعليم" },
  { AdCollegeId: 5, AdSectionId: 390, AdSectionCode: "07", AdSectionName: "تكنولوجيا التعليم" },
  { AdCollegeId: 6, AdSectionId: 91, AdSectionCode: "08", AdSectionName: "الرياضيات" },
];
const branchContext = { colleges: branchColleges, sections: branchSections, baseCollegeId: 6, baseSectionId: 90 };

assert.equal(branchRootOf("012J"), "012");
assert.equal(branchRootOf("011B"), "011");

/* الموقع الآخر داخل الفرع يجد قسمه الشقيق بالرمز نفسه. */
assert.equal(resolveBranchScope("012J", branchContext)?.sectionId, 190);
assert.equal(resolveBranchScope("012F", branchContext)?.collegeId, 11);
assert.equal(resolveBranchScope("012B", branchContext)?.isBase, true);
/* بنين فرع آخر لا موقع: يبقى خارج هذا الاستيراد مهما تشابه اسم القسم. */
assert.equal(resolveBranchScope("011B", branchContext), undefined);
/* مواقع الفرع الثلاثة فقط، والأساس أولاً. */
assert.deepEqual(siblingBranchScopes(branchContext).map(scope => scope.sitePrefix), ["012B", "012F", "012J"]);
assert.equal(siblingBranchScopes(branchContext)[0].isBase, true);

const branchRows = [
  { id: 1, sourceSitePrefix: "012B" },
  { id: 2, sourceSitePrefix: "012J" },
  { id: 3, sourceSitePrefix: "012F" },
  { id: 4, sourceSitePrefix: "012J" },
  { id: 5 },
  { id: 6, sourceSitePrefix: "011B" },
];
const branchSplit = splitRowsByBranch(branchRows, branchContext);
const bySite = new Map(branchSplit.groups.map(group => [group.scope.sitePrefix, group.rows.map(row => row.id)]));
/* الصف بلا بادئة موقع يبقى حيث فُتح الاستيراد — لا يُخمَّن له مكان. */
assert.deepEqual(bySite.get("012B"), [1, 5]);
assert.deepEqual(bySite.get("012J"), [2, 4]);
assert.deepEqual(bySite.get("012F"), [3]);
/* الفرع الآخر لا يُنشر ولا يُحذف بصمت: يُعاد باسم موقعه ليُبلَّغ به المستخدم. */
assert.deepEqual(branchSplit.unplaced.map(entry => entry.rows.map(row => row.id)), [[6]]);
assert.match(branchSplit.unplaced[0].siteLabel, /بنين/);

/* قسم لا نظير له في الموقع الآخر لا يُلحق بقسم آخر لمجرد التقارب. */
assert.equal(resolveBranchScope("012J", { ...branchContext, baseSectionId: 91 }), undefined);


/* ── «هيئة تدريسية» تُكتب بألف صورة، وهويتها واحدة ─────────────────────────
   التطبيع يحوّل الهمزة على نبرة إلى ياء، فصار المكتوب حرفياً في الشرط
   («هيئه تدريسيه») لا يساوي ما ينتجه التطبيع («هييه تدريسيه») أبداً: مسار
   الهوية كله كان ميتاً مهما كتب المستند. تُشتقّ الصيغة الآن من الاسم نفسه. */
const facultyRegistry = [
  { AdInstructorId: 900, AdInstructorCivil: "", AdInstructorName: "هيئة تدريسية", AdInstructorMobile: "" },
  { AdInstructorId: 901, AdInstructorCivil: "", AdInstructorName: "إقبال عبدالعزيز المطوع", AdInstructorMobile: "" },
] as any;
for (const spelling of ["هيئة تدريسية", "هيئه تدريسيه", "هيئة تدريسيه", "هيئه تدريسية", "د. هيئة تدريسية"]) {
  const hit = matchInstructorIdentity(spelling, facultyRegistry);
  assert.equal(hit?.person.AdInstructorId, 900, `faculty placeholder: ${spelling}`);
  assert.equal(hit?.method, "FACULTY_IDENTITY");
}
/* واسمان مرتبان لا يطابقان إلا شخصاً واحداً في السجل كله هوية، لا تخمين. */
const twoName = matchInstructorIdentity("إقبال المطوع", facultyRegistry);
assert.equal(twoName?.person.AdInstructorId, 901);
assert.equal(twoName?.method, "GLOBAL_SOLE_TWO_NAME");
/* والاسم الكامل بأي رسم يبقى مساواة تامة. */
assert.equal(matchInstructorIdentity("اقبال عبد العزيز المطوع", facultyRegistry)?.method, "EXACT_FULL");


/* ── تعدّد سجلات «هيئة تدريسية» تكرارُ معنى لا التباسُ أشخاص ────────────────
   الخانة تُملأ بأقدم سجل قاعدةً ثابتة، ويبقى نطاق القسم مقدَّماً عليه. */
const duplicatedPlaceholders = [
  { AdInstructorId: 940, AdInstructorCivil: "", AdInstructorName: "هيئة تدريسية", AdInstructorMobile: "" },
  { AdInstructorId: 905, AdInstructorCivil: "", AdInstructorName: "هيئه تدريسيه", AdInstructorMobile: "" },
  { AdInstructorId: 970, AdInstructorCivil: "", AdInstructorName: "هيئة تدريسية", AdInstructorMobile: "" },
] as any;
assert.equal(matchInstructorIdentity("هيئة تدريسية", duplicatedPlaceholders)?.person.AdInstructorId, 905);
assert.equal(matchInstructorIdentity("هيئة تدريسية", duplicatedPlaceholders)?.method, "FACULTY_IDENTITY");
/* وسجلّ القسم يسبق الأقدم دائماً. */
assert.equal(
  matchInstructorIdentity("هيئه تدريسيه", duplicatedPlaceholders, new Set([970]))?.person.AdInstructorId,
  970,
);
