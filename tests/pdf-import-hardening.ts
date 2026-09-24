/* Regression guard for the 2026-09 import audit.
 *
 * Every case below reproduced a SILENT wrong value (a different person, a
 * different course, a different building, a seat count read as a room) that
 * the preview showed as confirmed and publish accepted. The rule each case
 * enforces is the project's own: never guess — an uncertain field stays blank
 * for review. The positive cases prove the proven golden behaviour survives.
 */
import assert from "node:assert/strict";
import { authorityPdfTextGridRows, authorityOcrWordsToWords, authorityPrintedDayRun, authorityPrintedRoomCell, authorityTimeStripRead, matchInstructorIdentity, parseAuthorityHeaderText, parseScheduleTable, recoverAuthorityCourseCell, type OcrPage } from "../src/utils/documentOcr.ts";
import { authorityCourseCodeMatches } from "../src/utils/authorityAcademicCodes.ts";
import { sameInstructorIdentity, instructorIdentityTokens, uniqueExactIdentityMatch } from "../src/utils/instructorIdentity.ts";
import { resolveAuthorityLocation } from "../src/utils/locationRegistry.ts";
import { LOCATION_REGISTRY_SEED } from "../src/generated/locationRegistrySeed.ts";

const passed:string[]=[];
const check=(name:string,fn:()=>void)=>{fn();passed.push(name);};
const person=(id:number,name:string,extra:any={})=>({AdInstructorId:id,AdInstructorName:name,AdInstructorCivil:"",AdInstructorMobile:"",...extra});
const match=(printed:string,registry:any[],preferred:number[]=[],course:number[]=[])=>
  matchInstructorIdentity(printed,registry as any,new Set(preferred),new Set(course))?.person.AdInstructorId;

check("a contradicting family name is another person, never a match",()=>{
  assert.equal(match("احمد يوسف النصف",[person(1,"أحمد يوسف الكندري")]),undefined);
  assert.equal(match("احمد يوسف النصف",[person(1,"أحمد يوسف الكندري")],[1]),undefined);
  assert.equal(match("سالم حمدان سعود العدوانى",[person(1,"سالم حمدان سعود المطيري")],[1]),undefined);
  assert.equal(match("شجاع غازي شجاع العتيبي",[person(1,"شجاع غازي شجاع الهاجري")],[1]),undefined);
});
check("a contradicting father/grandfather name is another person",()=>{
  assert.equal(match("طلال فهيد ماطر",[person(1,"طلال فهد ماطر العازمي")],[1]),undefined);
  assert.equal(match("د.عبدالله محمد حسن",[person(1,"عبدالله محمد حسين")],[1]),undefined);
});
check("names are compared position by position, not as a bag of words",()=>{
  assert.equal(match("شجاع غازي شجاع العتيبي",[person(1,"غازي شجاع المطيري")]),undefined);
  assert.equal(match("علي يوسف أحمد السند",[person(1,"علياء يوسف الكندري")],[1]),undefined);
});
check("a registry name inside the printed name (the father) is not the printed person",()=>{
  const registry=[person(1,"حسين درويش مطر حمد الشمري"),person(2,"درويش مطر الشمري")];
  assert.equal(match("حسين درويش مطر الشمرى",registry,[1],[1]),1);
  assert.equal(match("حسين درويش مطر الشمرى",[person(2,"درويش مطر الشمري")]),undefined);
});
check("a permuted name is not an exact identity; the department person wins",()=>{
  const registry=[person(1,"د. عبدالله محمد حسن الكندري"),person(2,"محمد حسن عبدالله")];
  assert.equal(match("د.عبدالله محمد حسن",registry,[1],[1]),1);
});
check("proven forms still resolve: truncated family, first+family, family-first registry",()=>{
  assert.equal(match("يوسف عبد الرحيم محمد المهي",[person(1,"يوسف عبدالرحيم محمد المهيني")],[1]),1);
  assert.equal(match("علي السند",[person(1,"د. علي يوسف أحمد السند")],[1]),1);
  assert.equal(match("عبدالله رجب الأنصاري",[person(1,"الأنصاري عبدالله رجب")]),1);
  assert.equal(match("د.عبدالله محمد حسن",[person(1,"د. عبدالله محمد حسن")]),1);
  assert.equal(match("يحيى سالم",[person(1,"يحيى سالم محمد العنزي")],[1]),1);
});
check("a short registry name (first + family) resolves the full printed name",()=>{
  const registry=[person(5,"د. سعد الحيص",{AdInstructorCivil:"100000000005"}),person(6,"د. غازي عوض العتيبي",{AdInstructorCivil:"100000000006"}),
    person(7,"د. شجاع العتيبي",{AdInstructorCivil:"100000000007"}),person(8,"د. شجاع العتيبي",{AdInstructorCivil:"100000000007"}),
    person(9,"د جمال يوسف أحمد الحجي",{AdInstructorCivil:"100000000009"}),person(10,"أحمد النصف",{AdInstructorCivil:"100000000010"})];
  assert.equal(match("سعد خالد بريجان الحيص",registry),5);
  assert.equal(match("شجاع غازي شجاع العتيبي",registry),7,"two records with one civil ID are one person");
  assert.equal(match("احمد يوسف النصف",registry),10);
  assert.equal(match("احمد يوسف النصف",[person(1,"أحمد الكندري")]),undefined,"the family name must still agree");
  assert.equal(sameInstructorIdentity(instructorIdentityTokens("شجاع العتيبي"),instructorIdentityTokens("شجاع غازي شجاع العتيبي")),true);
  for(const name of ["يوسف عبدالرحيم المهيني","د. يوسف عبد الرحيم المهيني","يوسف المهيني"])
    assert.equal(match("يوسف عبد الرحيم محمد المهي",[person(20,name)]),20,`truncated family «المهي» for ${name}`);
});
check("a lone printed name is a first name, not any name in any position",()=>{
  assert.equal(match("سالم",[person(1,"يحيى سالم محمد")],[1]),undefined);
});
check("retired and sabbatical records are never auto-assigned to a new term",()=>{
  assert.equal(match("عبدالعزيز هادي مناحي",[person(1,"عبدالعزيز هادي مناحي",{AdInstructorStatus:"retired"})]),undefined);
  assert.equal(match("عبدالعزيز هادي مناحي",[person(1,"عبدالعزيز هادي مناحي",{AdInstructorStatus:"retired"}),person(2,"عبدالعزيز هادي مناحي")]),2);
});
check("the shared identity law rejects mid-name containment and free permutation",()=>{
  const t=instructorIdentityTokens;
  assert.equal(sameInstructorIdentity(t("درويش مطر الشمري"),t("حسين درويش مطر الشمري")),false);
  assert.equal(sameInstructorIdentity(t("محمد حسن عبدالله"),t("عبدالله محمد حسن")),true,"a three-name rotation is still the documented family-first form");
  assert.equal(sameInstructorIdentity(t("حسن عبدالله محمد"),t("عبدالله حسن محمد")),false);
  assert.equal(uniqueExactIdentityMatch("حسين درويش مطر الشمرى",[person(2,"درويش مطر الشمري")] as any),undefined);
});

/* ── Course identity ──────────────────────────────────────────────────────── */
const course=(id:number,code:string,name=`مقرر ${code}`)=>({AdCourseId:id,AdCollegeId:1,AdSectionId:1,CourseCode:code,CourseName:name,CourseCredit:3,CourseHours:3,MaxStudent:60});
const gridRow=(code:string,extra:any={})=>({code,reference:"10670",scode:"01",courseText:"مقرر",instructorText:"",days:"4 2",daysRaw:"4 2",timeRaw:"1350 - 1230",
  start:"12:30",end:"13:50",building:"011B18",hall:"F07",buildingRaw:"011B18",hallRaw:"F07",sourceMode:"pdf-text",...extra});
const parseRows=(rows:any[],courses:any[],department="0101")=>parseScheduleTable([{rows:[],gridRows:rows} as OcrPage],courses as any,[] as any,new Set(),
  {authorityDepartmentCode:department,sequentialSections:true,courseInstructorIds:new Map()}).rows;

check("a clean printed course number missing from the catalogue stays unresolved",()=>{
  assert.equal(parseRows([gridRow("0101357")],[course(1,"0101157")])[0].AdCourseId,0);
  assert.equal(parseRows([gridRow("0201101")],[course(1,"0201102")],"0201")[0].AdCourseId,0);
  assert.equal(parseRows([gridRow("0201101")],[course(1,"104")],"0201")[0].AdCourseId,0);
  /* An OCR-grid cell is still repaired exactly as the golden multi-page rescue allows. */
  assert.equal(recoverAuthorityCourseCell("010110","0101",["0101102","0101150","0101151"]),"0101102");
});
check("a seven-digit catalogue key must carry the same local department",()=>{
  assert.equal(authorityCourseCodeMatches("0101102","0102102","0101"),false);
  assert.equal(authorityCourseCodeMatches("0101102","9999102","0101"),false);
  assert.equal(authorityCourseCodeMatches("0201101","0101101","0201"),true,"a shared key created under another college stays valid");
  assert.equal(authorityCourseCodeMatches("0101102","102","0101"),true);
  assert.equal(authorityCourseCodeMatches("0101102","0101102","0101"),true);
});
check("a course name that looks like a header word never drops a row with a proven code",()=>{
  for(const title of ["التقرير الفني","الفصل الميداني","مناهج التربية الأساسية","جدولة المشروعات"]){
    const rows=parseRows([gridRow("0101102",{courseText:title})],[course(1,"0101102")]);
    assert.equal(rows.length,1,title);
    assert.equal(rows[0].AdCourseId,1,title);
  }
});

/* ── Header names ─────────────────────────────────────────────────────────── */
check("the department name is the department, not the branch printed after it",()=>{
  const header=parseAuthorityHeaderText(`
الفصل : الفصل الدراسي الاول 2027-2026 | الكلية : 02 كليه الدراسات التجاريه
القسم : 0201 تربيه اسلاميه )تربيه اساسيه( | الفرع : 022 كليه الدراسات التجاريه بنات
`);
  assert.equal(header.department?.code,"0201");
  assert.equal(header.department?.name,"تربيه اسلاميه (تربيه اساسيه)");
  assert.equal(header.branch?.code,"022");
  assert.match(header.branch?.name||"",/الدراسات التجاريه بنات/);
  const reversed=parseAuthorityHeaderText("012كلية التربية الأساسية بنات الفرع : التربية الاسلامية 0101 القسم");
  assert.equal(reversed.department?.code,"0101");
  assert.equal(reversed.department?.name,"التربية الاسلامية");
});

/* ── Native room column ───────────────────────────────────────────────────── */
check("an empty room cell never borrows the seats-in-packages number",()=>{
  const w=(text:string,x0:number,x1:number,y:number)=>({text,x0,y0:y-9,x1,y1:y+1});
  const width=842;
  const header=[w("المبنى",274,291,158),w("القاعة",307,323,158),w("الرزم",332,347,158),w("الرزم",365,381,158)];
  const body=(y:number,room:string|null,packs:string)=>[
    w("0101102",788,824,y),w("10643",760,786,y),w("01",741,752,y),w("الثقافة",680,712,y),w("الاسلامية",640,678,y),
    ...(room?[w(room,306,326,y)]:[]),w(packs,338,350,y),w("1",370,376,y),w("011B18",265,302,y),
    w("1220",200,222,y),w("-",222,226,y),w("1100",226,248,y),w("محاضرة",160,190,y),w("4",148,154,y),w("2",138,144,y),w("شجاع",112,130,y),w("العتيبي",46,68,y),
  ];
  const rows=authorityPdfTextGridRows([...header,...body(180,"G07","20"),...body(200,null,"12")],width,"semantic");
  assert.equal(rows.length,2);
  assert.equal(rows[0].hallRaw,"G07");
  assert.equal(rows[1].hallRaw,"","the packages column must not become room 12");
});

/* ── Location ─────────────────────────────────────────────────────────────── */
check("a well-formed but unregistered building code is never rebound through a room",()=>{
  const registry:any={buildings:LOCATION_REGISTRY_SEED.buildings,rooms:LOCATION_REGISTRY_SEED.rooms};
  const known=registry.buildings.filter((b:any)=>b.confidence==="CONFIRMED").map((b:any)=>b.officialCode);
  const at=(rawBuilding:string,rawRoom:string)=>resolveAuthorityLocation(registry,{rawBuilding,rawRoom,collegeId:0,sectionId:0,branchRoot:"011",sitePrefix:"011B",knownOfficialCodes:known});
  assert.equal(at("011B23","G25").building.value?.officialCode??null,null);
  assert.equal(at("011B99","G25").building.value?.officialCode??null,null);
  assert.equal(at("011B30","G25").building.value?.officialCode,"011B30");
  assert.equal(at("11B30","G25").building.value?.officialCode,"011B30","a damaged code is still recovered");
});

/* ── Scanned day cell ─────────────────────────────────────────────────────── */
check("the lost final ta of the activity word is never read as a day",()=>{
  const w=(text:string,x0:number,x1:number,y:number)=>({text,x0,y0:y-9,x1,y1:y+1});
  const row=(y:number,taGlyph:string,days:string[])=>[
    w("0101102",788,824,y),w("10643",760,786,y),w("01",741,752,y),w("الثقافة",680,712,y),
    w("011B18",265,302,y),w("1220",200,222,y),w("-",222,226,y),w("1100",226,248,y),
    w("محاضر",184,206,y),...(taGlyph?[w(taGlyph,178,185,y)]:[]),
    ...days.map((d,i)=>w(d,150-i*8,156-i*8,y)),w("شجاع",112,130,y),
  ];
  assert.equal(authorityPdfTextGridRows(row(180,"5",[]),842,"semantic")[0].days,"","«5» touching «محاضر» is its ta, not Thursday");
  assert.equal(authorityPdfTextGridRows(row(180,"J)",["42"]),842,"semantic")[0].days.replace(/\s+/g,""),"42");
  assert.equal(authorityPdfTextGridRows(row(180,"5",["42"]),842,"semantic")[0].days.replace(/\s+/g,""),"42");
});
check("OCR direction marks never hide the activity word",()=>{
  const words=authorityOcrWordsToWords([{text:"\u200fمحاضر\u200e",x0:0,y0:0,x1:10,y1:10}],842);
  assert.equal(words[0].text,"محاضر");
});
check("a re-read day cell is accepted only as the printed descending run",()=>{
  assert.equal(authorityPrintedDayRun("4 2"),"4 2");
  assert.equal(authorityPrintedDayRun("5 31"),"5 3 1");
  assert.equal(authorityPrintedDayRun("54321"),"5 4 3 2 1");
  assert.equal(authorityPrintedDayRun("2 531"),"","a neighbouring row's digit breaks the order");
  assert.equal(authorityPrintedDayRun("1 4 2"),"");
  assert.equal(authorityPrintedDayRun("4 4"),"");
  assert.equal(authorityPrintedDayRun(""),"");
});

check("a re-read room cell is accepted only as a full floor-letter room",()=>{
  assert.equal(authorityPrintedRoomCell("G07"),"G07");
  assert.equal(authorityPrintedRoomCell(" f10 "),"F10");
  assert.equal(authorityPrintedRoomCell("F7"),"","a lost digit is not a room");
  assert.equal(authorityPrintedRoomCell("25"),"","a lost floor letter is not a room");
  assert.equal(authorityPrintedRoomCell("G0T"),"");
  assert.equal(authorityPrintedRoomCell("S07"),"S07","an S-floor room is a full room, so a conflicting crop blanks it");
});

check("a scanned clock welded to its building splits with table-rule marks removed",()=>{
  const split=(text:string)=>authorityOcrWordsToWords([{text,x0:0,y0:0,x1:100,y1:10}],842).map(w=>w.text);
  assert.deepEqual(split("-1230011B16/"),["-","1230","011B16"]);
  assert.deepEqual(split("1400011B18)"),["1400","011B18"]);
  assert.deepEqual(split("1350-1230011B18"),["1350","-","1230","011B18"]);
  assert.deepEqual(split("FO7"),["F07"]);
  assert.deepEqual(split("1100"),["1100"]);
  assert.deepEqual(split("0118518"),["0118518"],"an unknown weld is left for review");
});
check("a re-read time strip is accepted only as a dashed, plausible clock pair",()=>{
  const read=authorityTimeStripRead("1350 - 1300022701 1");
  assert.equal(read?.start,"13:00");assert.equal(read?.end,"13:50");assert.equal(read?.buildingRaw,"022701");
  assert.equal(authorityTimeStripRead("0920 -0800011B18 F0")?.start,"08:00");
  assert.equal(authorityTimeStripRead("1350 1300"),null,"no dash, no pair");
  assert.equal(authorityTimeStripRead("135 - 1300"),null);
  assert.equal(authorityTimeStripRead(""),null);
});

console.log(JSON.stringify({passed:passed.length,cases:passed},null,2));
