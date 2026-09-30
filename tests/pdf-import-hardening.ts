/* Regression guard for the 2026-09 import audit.
 *
 * Every case below reproduced a SILENT wrong value (a different person, a
 * different course, a different building, a seat count read as a room) that
 * the preview showed as confirmed and publish accepted. The rule each case
 * enforces is the project's own: never guess — an uncertain field stays blank
 * for review. The positive cases prove the proven golden behaviour survives.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { authorityPdfTextGridRows, authorityOcrWordsToWords, authorityPrintedDayRun, authorityPrintedRoomCell, authorityTimeStripRead, authorityPrintedRowBands, unreadableIdentityRows, unclearRowCount, matchInstructorIdentity, parseAuthorityHeaderText, parseScheduleTable, recoverAuthorityCourseCell, takeScanReadingTurn, ScanReadingBusyError, readScanInTurn, type OcrPage } from "../src/utils/documentOcr.ts";
import { interruptedImportMessage } from "../src/utils/importStreamFailure.ts";
import { authorityCourseCodeMatches, withoutImportEvidence } from "../src/utils/authorityAcademicCodes.ts";
import { sameInstructorIdentity, instructorIdentityTokens, uniqueExactIdentityMatch, readableInstructorName, displayInstructorText } from "../src/utils/instructorIdentity.ts";
import { resolveAuthorityLocation } from "../src/utils/locationRegistry.ts";
import { LOCATION_REGISTRY_SEED } from "../src/generated/locationRegistrySeed.ts";
import { scanLeftCellUnread, pagesWithUnreadCells } from "../src/utils/importPageReview.ts";
import { pairRowsByLine, fillLineCells, pageNumberShape, scanPageTone, greyPhotoVerdict, GREY_PHOTO_REFUSAL, authorityCourseFromFamilyAndName, authorityCourseSiblingByName, fillScheduleCellsFrom, scanPageVerdict, scanRefusalMessage, clearImplausibleScanDays, unresolvedDaysReason, restoredDaysReason, rejudgeEmptyPage, type OcrPageDiagnostic } from "../src/utils/documentOcr.ts";
import { pagesAwaitingReview, pageReviewIssues, pageReviewWaitLine, unconfirmedReviewPages } from "../src/utils/importPageReview.ts";

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

check("a scanned page whose rows lost their course codes is flagged, not imported as fragments",()=>{
  const row=(code:string)=>({code,reference:"18945",scode:"501",days:"3 1",start:"11:00"}) as any;
  assert.equal(unreadableIdentityRows([...Array(12)].map(()=>row("0101102")).concat([row("02011")])),0,"one damaged row is left for review");
  assert.equal(unreadableIdentityRows([...Array(3)].map(()=>row("0101102")).concat([...Array(20)].map(()=>row("0101")))),20);
  const bare=(code:string)=>({code,reference:"18980",scode:"501",days:"",start:""}) as any;
  assert.equal(unreadableIdentityRows([...Array(4)].map(()=>row("0101102")).concat([...Array(26)].map(()=>bare("0101156")))),26,"rows with neither days nor time are unread");
  assert.ok(unclearRowCount([row("0101156"),row("0101156")])<unclearRowCount([bare("0101156"),bare("0101156")]),"a rescue that restores days and time scores as better");
});
check("printed data lines are counted independently of the row reader",()=>{
  const w=(text:string,y:number)=>({text,x0:0,x1:10,y0:y,y1:y+10});
  const header=[w("2026",10),w("2027",10),w("0101",30)];
  const body=[0,1,2].flatMap(i=>[w("0101102",100+i*20),w("18945",100+i*20),w("1100",100+i*20)]);
  assert.equal(authorityPrintedRowBands([...header,...body]),3,"the header's year pair is not a row");
});
check("separator-welded section, reference and code split only in their full shapes",()=>{
  const split=(text:string)=>authorityOcrWordsToWords([{text,x0:0,y0:0,x1:150,y1:10}],842).map(w=>w.text);
  assert.deepEqual(split("503/18947/0101102"),["503","18947","0101102"]);
  assert.deepEqual(split("503(19707.0101150"),["503","19707","0101150"]);
  assert.deepEqual(split("[18945|0101102"),["18945","0101102"]);
  assert.deepEqual(split("12/05"),["12/05"]);
});

/* The page verdict is calibrated on the owner's real scans (2026-09-24):
   clean pages read every printed line; the failures lost 9–24 lines of 12–28. */
check("a scanned page that lost most of its printed lines stops the file; a small loss stays a warning",()=>{
  const page=(rows:number,printed:number,broken=0)=>scanPageVerdict({rows,filled:rows,printed,broken});
  assert.equal(page(28,28).suspicious,false);
  assert.equal(page(28,28).warning,undefined,"a complete page carries no note");
  assert.equal(page(4,28).suspicious,true,"28 printed, 4 read: the second page of the 2026 scan");
  assert.equal(page(1,22).suspicious,true);
  assert.equal(page(3,12).suspicious,true);
  assert.equal(page(4,13).suspicious,true);
  assert.equal(page(0,5).suspicious,true,"a page with printed lines and no row at all");
  assert.match(page(4,28).reason||"",/طُبع فيها 28 سطراً ولم يُقرأ منها إلا 4 صفوف/);
  assert.match(page(0,5).reason||"",/ولم يُقرأ منها أي صف/);
  /* The last page of a file: three printed lines, one read. Refusing the whole
     file for it is what made every scan unreadable before #115. */
  const tail=page(1,3);
  assert.equal(tail.suspicious,false,"a two-line loss stays a warning");
  assert.match(tail.warning||"",/طُبع فيها 3 أسطر وقُرئ منها صف واحد/);
  assert.equal(page(23,28).suspicious,false,"five of 28 is within the tolerance (15%, rounded up)");
  assert.equal(page(22,28).suspicious,true,"six of 28 is not");
});
check("a page read without its schedule side (no time, no building on most rows) stops the file",()=>{
  /* Page 2 of the 2026 scan after its deep pass: all 28 rows kept their course
     and days, none kept a time or a building, and one row read «3 1» where the
     sheet prints «5 3 1». Rows the preview could only block are not a reading. */
  const blind=scanPageVerdict({rows:28,filled:28,printed:28,broken:0,unscheduled:28});
  assert.equal(blind.suspicious,true);
  assert.match(blind.reason||"",/28 صفاً من 28 بلا وقت ولا مبنى/);
  assert.equal(scanPageVerdict({rows:28,filled:28,printed:28,broken:0,unscheduled:14}).suspicious,false,"half is not most");
  assert.equal(scanPageVerdict({rows:28,filled:28,printed:28,broken:0,unscheduled:15}).suspicious,true);
  assert.equal(scanPageVerdict({rows:3,filled:3,printed:3,broken:0,unscheduled:2}).suspicious,false,"a last page of three rows is not refused for two");
  assert.equal(scanPageVerdict({rows:28,filled:28,printed:28,broken:0}).suspicious,false,"the count is optional and defaults to none");
});
check("a scanned day cell the Authority could never print is left blank for review, its raw text kept",()=>{
  /* Measured: «3 2 4» on a clean 200-dpi render of sample B where the sheet
     prints «4 2»; «1 53» and «2 4 3» on the 2026 scan; «10» on the CamScanner copy. */
  const rows=["3 2 4","2 4 3","10","8","5 3 1","4 2","2 4","531","5 4 3 2 1","3",""].map(days=>({code:"0101102",reference:"18945",scode:"501",days,daysRaw:days,start:"08:00"})) as any[];
  clearImplausibleScanDays(rows);
  assert.deepEqual(rows.map(row=>row.days),["","","","","5 3 1","4 2","2 4","531","5 4 3 2 1","3",""]);
  assert.equal(rows[0].daysRaw,"3 2 4","the raw reading stays as evidence for the reviewer");
  /* A Latin run inside an Arabic page can come out with its words in reverse
     order: «5 3 1» read as «31 5» (three clean sample-B renders) or «1 53» (2026
     scan). Reversing the word order alone — no digit added or dropped — restores it. */
  const mirrored=["31 5","1 53","2 4 3 1"].map(days=>({days,daysRaw:days})) as any[];
  clearImplausibleScanDays(mirrored);
  assert.deepEqual(mirrored.map(row=>row.days),["5 3 1","5 3 1",""],"only a word-order mirror is repaired, never a digit set");
  /* The emptied cell tells the reviewer what the scanner read, left-to-right as on the sheet. */
  assert.equal(unresolvedDaysReason("3 2 4"),"لم تثبت أيام المحاضرة؛ قُرئت الخلية «\u20663 2 4\u2069»");
  assert.equal(unresolvedDaysReason(""),"لم تثبت أيام المحاضرة");
  assert.equal(unresolvedDaysReason("fsunday ftuesday"),"لم تثبت أيام المحاضرة","a fallback row's flag names are not a reading");
  /* The repair reads the digits the check read: Arabic-Indic digits are normalized first, never dropped. */
  const indic=[{days:"٣1 5"},{days:"٣١ ٥"}] as any[];
  clearImplausibleScanDays(indic);
  assert.deepEqual(indic.map(row=>row.days),["5 3 1","5 3 1"]);
  /* A cell filled from history says what was refused, instead of claiming it was empty. */
  assert.equal(restoredDaysReason("3 2 4"),"قُرئت خلية الأيام «\u20663 2 4\u2069» ولم تُقبل؛ استعيدت الأيام من تطابق تاريخي فريد");
  assert.equal(restoredDaysReason(""),"خلية الأيام كانت فارغة؛ استعيدت من تطابق تاريخي فريد دون تغيير أي قيمة OCR موجودة");
});
check("a page accepted with printed lines that have no row waits for «راجعت الصفحة» before publishing",()=>{
  /* The last page of file 1 as the server read it: 3 printed, 1 read. */
  const tail=scanPageVerdict({rows:1,filled:1,printed:3,broken:0});
  assert.equal(tail.suspicious,false);
  assert.equal(tail.missedLines,2,"the verdict carries the count, not only a sentence");
  assert.equal(scanPageVerdict({rows:4,filled:4,printed:28,broken:0}).missedLines,undefined,"a refused page does not ask for review");
  assert.equal(scanPageVerdict({rows:28,filled:28,printed:28,broken:3}).missedLines,undefined,"unclear rows are visible and block their own row");
  const pages=[{page:1,missedLines:0},{page:2},{page:5,missedLines:2},{page:3,missedLines:1}];
  assert.deepEqual(pagesAwaitingReview(pages,[]),[3,5]);
  assert.deepEqual(pagesAwaitingReview(pages,[5]),[3],"a confirmed page no longer waits");
  assert.deepEqual(pageReviewIssues(pages,[3]),["الصفحة 5: سطران بلا صف في المعاينة — قارنها بالورقة ثم اضغط «راجعت الصفحة»، وأضف الناقص في الجدول بعد الاستيراد."]);
  assert.deepEqual(pageReviewIssues(undefined,[]),[],"a file without page diagnostics (Excel, native PDF) waits for nothing");
  /* The preview edits rows but cannot add one: no sentence may claim the reviewer already added them. */
  assert.equal(pageReviewWaitLine([3,5]),"بانتظار مراجعة الصفحات 3، 5: قارن أسطرها بالورقة ثم اضغط «راجعت الصفحة». الأسطر الناقصة تُضاف في الجدول بعد الاستيراد.");
  assert.equal(pageReviewWaitLine([]),"");
  for(const line of [...pageReviewIssues(pages,[]),pageReviewWaitLine([3])])assert.doesNotMatch(line,/أضفت|أضف الناقص يدوياً ثم/);
  /* A short page that produced no row at all (2 printed, 0 read) is accepted with its note; it must still get the button. */
  const empty=scanPageVerdict({rows:0,filled:0,printed:2,broken:0});
  assert.equal(empty.suspicious,false);
  assert.equal(empty.missedLines,2);
  /* The page's own note says where the missing lines go; the preview cannot add a row. */
  assert.match(tail.warning||"",/أضف الناقص في الجدول بعد الاستيراد/);
  assert.doesNotMatch(tail.warning||"",/يدوياً/);
});
check("one printed line read by both lanes is one row: paired by its height on the page, empty cells filled, read cells kept",()=>{
  /* 1.pdf page 1 (2026-09-27): «0101102 — 89541» from the word lane and «0101102 510 1895» from the grid sat on
     the same printed line (y 292.0 vs 292.6) and reached the preview as two rows. */
  const blank={code:"",reference:"",scode:"",courseText:"",instructorText:"",days:"",start:"",end:"",building:"",hall:""};
  const word=[
    {...blank,code:"0101102",reference:"18949",scode:"505",days:"531",start:"08:00",end:"08:50",building:"012F15",y:245.4},
    {...blank,code:"0101102",reference:"89541",scode:"",days:"1",start:"10:00",end:"10:50",hall:"F11",instructorText:"عبد الله خالد محمد",y:292.0},
    {...blank,code:"0101150",reference:"18956",scode:"502",hall:"F12",y:355.2},
  ] as any[];
  const grid=[
    {...blank,code:"0101102",reference:"1895",scode:"510",building:"012B09",y:292.6},
    {...blank,code:"0101153",reference:"1895",scode:"502",days:"54321",start:"11:00",end:"11:50",building:"012B07",y:353.6},
    {...blank,code:"0101102",reference:"1894",scode:"501",y:194.6},
  ] as any[];
  const pairs=pairRowsByLine(word,grid,{referenceLength:5,sectionLength:3});
  assert.equal(pairs.get(1),grid[0],"the same line pairs");
  assert.equal(pairs.get(2),grid[1],"1.6 of a 12-point pitch is the same line");
  assert.equal(pairs.has(0),false,"a line the other lane did not read stays alone");
  assert.equal([...pairs.values()].includes(grid[2]),false,"a row 50 points away is another line");
  const shape={referenceLength:5,sectionLength:3};
  for(const [at,other] of pairs)fillLineCells(word[at],other,"0101",shape);
  assert.equal(word[1].scode,"510","the missing section comes from the other reading");
  assert.equal(word[1].building,"012B09","and the missing building");
  assert.equal(word[1].reference,"89541","a cell already read is never overwritten");
  assert.equal(word[2].code,"0101150","a proven course key is kept even when the other lane read another key");
  assert.equal(word[2].start,"11:00");assert.equal(word[2].hall,"F12");
  /* Days never travel between the two readings by line: a wrong day is worse than a blank one. */
  assert.equal(word[2].days,"","days stay with their own reading");
  /* An unproven key or section gives way to a proven one. */
  const weak={...blank,code:"010115",scode:"50",y:100} as any;
  fillLineCells(weak,{...blank,code:"0101151",scode:"503",y:100.5} as any,"0101",shape);
  assert.equal(weak.code,"0101151");assert.equal(weak.scode,"503","«50» is «503» cut at its cell edge");
  const cut={...blank,code:"0101151",reference:"1895",scode:"502",y:100} as any;
  fillLineCells(cut,{...blank,code:"0101151",reference:"18959",scode:"50",y:100.4} as any,"0101",shape);
  assert.equal(cut.reference,"18959","a reference cut at its edge is completed");assert.equal(cut.scode,"502","a full section is never replaced by its own truncation");
  /* Independent review: a longer misread (a cell border read as a trailing «1») is not a completion. */
  const sound={...blank,code:"0101150",reference:"18956",scode:"501",y:100} as any;
  fillLineCells(sound,{...blank,code:"0101150",reference:"189561",scode:"5011",y:100.3} as any,"0101",shape);
  assert.equal(sound.reference,"18956");assert.equal(sound.scode,"501");
  /* Without the page's own lengths, nothing is «completed». */
  const unknown={...blank,code:"0101151",reference:"1895",scode:"50",y:100} as any;
  fillLineCells(unknown,{...blank,code:"0101151",reference:"18959",scode:"503",y:100.2} as any,"0101");
  assert.equal(unknown.reference,"1895");assert.equal(unknown.scode,"50");
  assert.deepEqual(pageNumberShape([{reference:"18945",scode:"501"},{reference:"18946",scode:"502"},{reference:"1894",scode:"50"},{reference:"18948",scode:"504"}]),{referenceLength:5,sectionLength:3});
  /* A page whose two readings sit 3 points apart still pairs line by line (the offset is measured first)… */
  const shifted=pairRowsByLine(word,grid.map(row=>({...row,y:row.y+3})) as any[],{referenceLength:5,sectionLength:3});
  assert.equal(shifted.get(1)?.scode,"510");assert.equal(shifted.get(2)?.code,"0101153");
  /* …and readings that do not line up for most rows pair nothing — the identity rules decide as before. */
  const scattered=pairRowsByLine([{...blank,y:100},{...blank,y:140},{...blank,y:180},{...blank,y:220}] as any[],
    [{...blank,y:118},{...blank,y:163},{...blank,y:201},{...blank,y:236}] as any[]);
  assert.equal(scattered.size,0);
  /* A whole line off (a slanted page whose two readings drift a row apart): complete, different references and
     sections are two lines — no row borrows the next line's cells. */
  const lines=[0,1,2,3,4].map(i=>({...blank,code:"0101151",reference:String(18958+i),scode:String(501+i),y:100+i*12.3,start:"10:00"})) as any[];
  const nextLine=lines.map((row,i)=>({...row,reference:String(18959+i),scode:String(502+i),y:row.y+0.8,start:""}));
  assert.equal(pairRowsByLine(nextLine,lines,{referenceLength:5,sectionLength:3}).size,0,"no pair across two different complete sections");
  /* A reference garbled at full length («89541» for 18954) is not another line (1.pdf p1). */
  const garbled=pairRowsByLine([{...blank,code:"0101102",reference:"89541",scode:"",y:292.0}] as any[],[{...blank,code:"0101102",reference:"18954",scode:"510",y:292.6}] as any[],{referenceLength:5,sectionLength:3});
  assert.equal(garbled.size,1);
  /* Course keys of different families are two lines. */
  assert.equal(pairRowsByLine([{...blank,code:"0101102",y:100}] as any[],[{...blank,code:"0101150",y:100.5}] as any[]).size,0);
  /* One-to-one: two rows cannot claim the same line of the other lane. */
  const twin=pairRowsByLine([{...blank,y:300},{...blank,y:301.5}] as any[],[{...blank,y:300.8}] as any[]);
  assert.equal(twin.size,1);
});
check("a deeper reading that takes a page over blanks the days it disagrees on, and keeps the rest",()=>{
  /* 1.pdf p1 (2026-09-27): the straightened grid won the page by its course keys and read «1» where the first
     reading had the printed «2 4». Neither is trusted: the day goes to review (the day-cell rule, a1f2693). */
  const blank={code:"",reference:"",scode:"",courseText:"",instructorText:"",days:"",start:"",end:"",building:"",hall:""};
  const winner=[{...blank,code:"0101151",reference:"18962",scode:"505",days:"1",daysRaw:"1"},
    {...blank,code:"0101151",reference:"18963",scode:"506",days:"5 3 1",daysRaw:"5 3 1"},
    {...blank,code:"0101151",reference:"18964",scode:"507",days:"",start:""}] as any[];
  const earlier=[{...blank,code:"0101151",reference:"18962",scode:"505",days:"2 4"},
    {...blank,code:"0101151",reference:"18963",scode:"506",days:"1 3 5"},
    {...blank,code:"0101151",reference:"18964",scode:"507",days:"5 3 1",start:"09:00",end:"09:50"}] as any[];
  fillScheduleCellsFrom(winner,earlier,{blankDisagreeingDays:true});
  assert.equal(winner[0].days,"","«1» against «2 4»: to review");
  assert.equal(winner[0].daysRaw,"1","the raw reading stays for the tooltip");
  assert.equal(winner[1].days,"5 3 1","the same days in another order agree");
  assert.equal(winner[2].days,"5 3 1");assert.equal(winner[2].start,"09:00","empty cells are still filled");
  /* Without the option (the first pass) nothing is blanked — behaviour there is unchanged. */
  const first=[{...blank,reference:"1",days:"1"}] as any[];
  fillScheduleCellsFrom(first,[{...blank,reference:"1",days:"2 4"}] as any[]);
  assert.equal(first[0].days,"1");
});
check("a grey phone photo is refused in seconds at preflight, a white scan never is",()=>{
  /* Measured 2026-09-26 at 60 dpi: 6.pdf pages bg≈160, mid-grey 79–86% (refused after 4 minutes, or the server died of memory first);
     the worst file that reads (1.pdf, a phone photo) bg≈200, 13–23%; the clean file and 20 degraded variants ≤ 11%. */
  const page=(background:number,midShare:number,n=10000)=>{
    const out=new Uint8Array(n),mid=Math.round(n*midShare);
    for(let i=0;i<n;i++)out[i]=i<mid?145:(i<mid+Math.round(n*.03)?40:background);
    return out;
  };
  const camscanner=scanPageTone(page(160,.82));
  assert.equal(camscanner.greyPhoto,true);
  assert.equal(scanPageTone(page(200,.23)).greyPhoto,false,"1.pdf reads: never refused");
  assert.equal(scanPageTone(page(255,.08)).greyPhoto,false);
  assert.equal(scanPageTone(page(237,.11)).greyPhoto,false,"the phone variant");
  assert.equal(scanPageTone(page(200,.45)).greyPhoto,false,"a light background with under 55% grey is not a grey photo");
  assert.equal(scanPageTone(new Uint8Array(0)).greyPhoto,false);
  /* Half the pages or more decide the file; one grey page among white ones does not. */
  assert.deepEqual(greyPhotoVerdict([camscanner,camscanner,camscanner,camscanner]),[1,2,3,4]);
  assert.deepEqual(greyPhotoVerdict([camscanner,camscanner]),[1,2]);
  assert.deepEqual(greyPhotoVerdict([camscanner,scanPageTone(page(255,.05)),scanPageTone(page(255,.05))]),[]);
  assert.deepEqual(greyPhotoVerdict([]),[]);
  assert.match(GREY_PHOTO_REFUSAL,/لم يُستورد أي صف/);
  /* Wired: the import route refuses before any reading; the probe reuses page 1's render and a failed probe never refuses. */
  const server=readFileSync(new URL("../server.ts",import.meta.url),"utf8");
  assert.match(server,/if\(Array\.isArray\(headerPreflight\.greyPhotoPages\)&&headerPreflight\.greyPhotoPages\.length\)\{\s*res\.status\(422\)\.json\(\{error:GREY_PHOTO_REFUSAL,code:"PDF_SCAN_GREY_PHOTO"/);
  assert.match(server,/if\(Array\.isArray\(header\.greyPhotoPages\)&&header\.greyPhotoPages\.length\)\{res\.status\(422\)\.json\(\{error:GREY_PHOTO_REFUSAL/,"the department-bootstrap route refuses the same way, not «header unresolved»");
  const ocr=readFileSync(new URL("../src/utils/documentOcr.ts",import.meta.url),"utf8");
  assert.match(ocr,/const first=canvasTone\(ground,surface\.width,surface\.height\);\s*if\(first\.greyPhoto\)/);
  assert.match(ocr,/catch\{\/\* a tone probe that fails never refuses: the reading decides \*\/\}/);
});
check("a scanned course number that lost its last digit is settled by its family and printed name, never by the name alone",()=>{
  /* 3.pdf page 1 (owner's screen 2026-09-26): the crop drift reads 3010115 / 9010115 — a rule digit in front,
     the final digit lost. The six digits prove the 010115x family; the printed name picks one inside it. */
  const cat=[
    {key:"0101150",name:"تجويد القران الكريم وحفظه"},{key:"0101151",name:"تجويد القران الكريم وحفظه )1("},
    {key:"0101153",name:"علوم القران الكريم"},{key:"0101155",name:"سيره الرسول عليه السلام"},
    {key:"0101156",name:"مدخل الى الفقه الا سلا مى"},{key:"0101201",name:"تجويد القران الكريم )2("},
    {key:"0101206",name:"العبادات فى الاسلام"},{key:"0101357",name:"العقيده فى الاسلام"},
  ];
  assert.equal(authorityCourseFromFamilyAndName("3010115","جويد القران الكريم وحفظه (1)","0101",cat),"0101151");
  assert.equal(authorityCourseFromFamilyAndName("9010115","ويد القران الكريم وحفظه (1)(الذ","0101",cat),"0101151");
  assert.equal(authorityCourseFromFamilyAndName("3010115","جويد القران الكريم وحفظه","0101",cat),"0101150","no part number: the unnumbered course");
  assert.equal(authorityCourseFromFamilyAndName("1010120","تجويد القران الكريم (2)","0101",cat),"0101201");
  assert.equal(authorityCourseFromFamilyAndName("5010120","لعبادات فى الاسلام","0101",cat),"0101206");
  /* The name never reaches outside the family the digits allow. */
  assert.equal(authorityCourseFromFamilyAndName("3010115","العبادات فى الاسلام","0101",cat),"","العبادات is 0101206, outside 010115x");
  assert.equal(authorityCourseFromFamilyAndName("5010118","تجويد القران الكريم وحفظه (1)","0101",cat),"","no catalogue family 010118x");
  assert.equal(authorityCourseFromFamilyAndName("","تجويد القران الكريم وحفظه (1)","0101",cat),"","no digits, no identity");
  /* A name that fits two members about equally stays unresolved. */
  assert.equal(authorityCourseFromFamilyAndName("3010115","بويد القران الكريم فحيحيل","0101",cat),"");
  assert.equal(authorityCourseFromFamilyAndName("3010115","","0101",cat),"");
  /* A complete number whose printed name is plainly its family sibling takes the sibling; a number whose name agrees stays. */
  assert.equal(authorityCourseSiblingByName("0101155","جويد القران الكريم وحفظه",cat),"0101150");
  assert.equal(authorityCourseSiblingByName("0101201","لعبادات فى الاسلام",cat),"0101206");
  /* Two shared words («القران الكريم») do not make «علوم» the printed «تجويد … (1)» (3.pdf row read 0101153). */
  assert.equal(authorityCourseSiblingByName("0101153","بويد القران الكريم وحفظه (1)",cat),"0101151");
  assert.equal(authorityCourseSiblingByName("0101155","سيره الرسول عليه السلام (الفحيحيل",cat),"");
  assert.equal(authorityCourseSiblingByName("0101153","علوم القران الكريم",cat),"");
  assert.equal(authorityCourseSiblingByName("0101357","العقيده فى الاسلام",cat),"");
  /* A stray digit is not a part number; only «(n)» or «n جهراء» is (review of this change). */
  assert.equal(authorityCourseSiblingByName("0101150","جويد القران الكريم وحفظه سس 1",cat),"");
  assert.equal(authorityCourseFromFamilyAndName("3010115","جويد القران الكريم وحفظه سس 1","0101",cat),"0101150");
  assert.equal(authorityCourseFromFamilyAndName("3010115","ويد القران الكريم 1 فحيحيل","0101",cat),"0101151");
  /* Family digits must sit at an edge of a 7-digit course cell inside a proven department — never inside a weld. */
  assert.equal(authorityCourseFromFamilyAndName("18101206","العبادات فى الاسلام","0101",cat),"");
  assert.equal(authorityCourseFromFamilyAndName("5031101206501","العبادات فى الاسلام","0101",cat),"");
  assert.equal(authorityCourseFromFamilyAndName("503110115318955","علوم القران الكريم","0101",cat),"");
  assert.equal(authorityCourseFromFamilyAndName("3010120","العبادات فى الاسلام","",cat),"","no proven department, no family");
  /* A part number clipped off the printed name does not contradict a complete number (1.pdf rows read 0101151). */
  assert.equal(authorityCourseSiblingByName("0101151","القران الكريم وحفظه",cat),"");
  /* Wired end to end: the scan row gets the course and says how; a text-layer row never does. */
  const courses=cat.map((c,i)=>({AdCourseId:i+1,CourseCode:c.key.slice(-3),CourseName:c.name,CourseHours:3,CourseCredit:3})) as any;
  const row=(code:string,courseText:string,sourceMode:any)=>({code,reference:"18955",scode:"50",courseText,instructorText:"",building:"012B07",hall:"F31",start:"08:00",end:"08:50",days:"531",sourceMode});
  const scan=parseScheduleTable([{rows:[],gridRows:[row("3010115","جويد القران الكريم وحفظه (1)","ocr-grid")]} as any],courses,[],undefined,{authorityDepartmentCode:"0101"});
  assert.equal(scan.rows[0].AdCourseId,2);assert.equal((scan.rows[0] as any).courseMatchMethod,"COURSE_FAMILY_AND_PRINTED_NAME");assert.equal(scan.rows[0].SCode,"501");
  /* A settled number whose printed name shares nothing with its system name is shown for review, never swapped:
     «الاسلام و قضايا العصر» (0101257, not in the catalogue) reached the preview as 0101251 «كتب السنه ورجالها». */
  const catalogueWithHadith=[...courses,{AdCourseId:40,CourseCode:"251",CourseName:"كتب السنه ورجالها",CourseHours:3,CourseCredit:3}] as any;
  const disagrees=parseScheduleTable([{rows:[],gridRows:[row("0101251","الاسلام و قضايا العصر","ocr-grid")]} as any],catalogueWithHadith,[],undefined,{authorityDepartmentCode:"0101"});
  assert.equal(disagrees.rows[0].AdCourseId,40,"the number still settles the course");
  assert.equal((disagrees.rows[0] as any).courseMatchMethod,"PRINTED_NAME_DISAGREES","and the contradiction is for review");
  const agrees=parseScheduleTable([{rows:[],gridRows:[row("0101251","كتب السته ورجالها","ocr-grid")]} as any],catalogueWithHadith,[],undefined,{authorityDepartmentCode:"0101"});
  assert.equal((agrees.rows[0] as any).courseMatchMethod,undefined,"a name that matches (one glyph off) raises nothing");
  const text=parseScheduleTable([{rows:[],gridRows:[row("3010115","تجويد القران الكريم وحفظه (1)","pdf-text")]} as any],courses,[],undefined,{authorityDepartmentCode:"0101"});
  assert.equal(text.rows[0].AdCourseId,0,"the text layer prints what it prints; its numbers are never repaired");
  const server=readFileSync(new URL("../server.ts",import.meta.url),"utf8");
  assert.match(server,/if\(row\.courseMatchMethod&&Number\(row\.AdCourseId\)\)Object\.assign\(row\.importEvidence\.course,\{confidence:"REVIEW_REQUIRED"/);
  const table=readFileSync(new URL("../src/components/ImportPreviewTable.tsx",import.meta.url),"utf8");
  assert.match(table,/<small>رقم المقرر غير واضح<\/small>/);
  /* The course cell never shows what the scan printed («بويد القران الكريم وحفظه (1)»); a course the number did not
     settle is chosen from the department's courses by their system names (owner, 2026-09-27). */
  assert.doesNotMatch(table,/row\.sourceCourseText/);
  assert.match(table,/departmentCourseOptions\.map\(item => <option key=\{item\.AdCourseId\} value=\{item\.AdCourseId\}>\{item\.CourseCode\} — \{item\.CourseName\}<\/option>\)/);
  assert.match(table,/patchManual\(index, "course", \{ AdCourseId: Number\(picked\.AdCourseId\), AdCourseName: String\(picked\.CourseName \|\| ""\) \}\)/);
});
check("a scanned instructor name garbled by noise is shown as its clean words and called unclear, never «غير مسجّل»",()=>{
  /* The owner's screen on 2026-09-25: noise from the cell border and a neighbouring column read into the name. */
  assert.deepEqual(readableInstructorName("«وفى»ف0[ف[]»أ88 در محمد عبدالكريم راشد الد"),{text:"محمد عبدالكريم راشد الد",garbled:true});
  assert.deepEqual(readableInstructorName("حمد ail سعود المحيلبي ١"),{text:"حمد سعود المحيلبي",garbled:true});
  /* A cell that is mostly noise shows no words at all — its fragments are not a name (owner's screen, 2026-09-26). */
  assert.deepEqual(readableInstructorName("ا © - .دجا اما © مسي تسافا سي ‎es‏ ‎I\" 1"),{text:"",garbled:true});
  assert.equal(readableInstructorName("‎Saran‏ ل فق ا ا سس ددحي الس اا ‎e_ Ba t").text,"");
  assert.equal(readableInstructorName("ا 000 سآ الل ‎hema‏ ‏لس ‎TE *<‏ -_ .ل !1").text,"");
  /* Titles and particles are part of a real name; one noise glyph never blanks it. */
  assert.equal(readableInstructorName("د. علي بن محمد 1").text,"علي بن محمد");
  assert.equal(readableInstructorName("أ.د. علي بن سعد x").text,"علي بن سعد");
  assert.equal(readableInstructorName("ا.د. خالد ال علي e").text,"خالد ال علي");
  /* A word with noise inside is dropped whole: its leftover letters are not a word. */
  assert.equal(readableInstructorName("0[]«»").text,"");
  /* A clean name is not garbled, whatever titles it carries, and is displayed exactly as printed. */
  assert.deepEqual(readableInstructorName("أ.د. فاطمة علي"),{text:"فاطمة علي",garbled:false});
  assert.deepEqual(readableInstructorName("د.محمد العتيبي"),{text:"محمد العتيبي",garbled:false});
  assert.equal(readableInstructorName("هيئة تدريسية").garbled,false);
  assert.equal(displayInstructorText("د. إقبال عبدالعزيز المطوع"),"د. إقبال عبدالعزيز المطوع");
  assert.equal(displayInstructorText("حمد ail سعود المحيلبي ١"),"حمد سعود المحيلبي");
  /* Wired: the server calls such a name unclear and searches candidates with its clean words; every screen shows the same text. */
  const server=readFileSync(new URL("../server.ts",import.meta.url),"utf8");
  assert.match(server,/registryCandidatesFor\(readable\.garbled&&readable\.text\?readable\.text:written,/);
  /* الوسم «اسم غير واضح» يقول الحال؛ السبب تحته سطر واحد بالخطوة لا فقرة تتكرر في كل صف. */
  assert.match(server,/if\(readable\.garbled\)return\{method:"UNREADABLE_NAME",reason:"اختر الأستاذ من القائمة\."\}/);
  assert.match(server,/instructorAmbiguousShortName=`«\$\{displayInstructorText\(row\.sourceInstructorText\)\}»/);
  const table=readFileSync(new URL("../src/components/ImportPreviewTable.tsx",import.meta.url),"utf8");
  assert.match(table,/method === "UNREADABLE_NAME"\) return "اسم غير واضح"/);
  assert.match(table,/const readInstructorText = \(row: ImportRow\) => displayInstructorText\(/);
  const report=readFileSync(new URL("../src/components/AuthorityPdfReport.tsx",import.meta.url),"utf8");
  assert.match(report,/displayInstructorText\(row\.sourceInstructorText\)/);
  assert.doesNotMatch(report,/\|\| row\.sourceInstructorText \|\|/);
});
check("the server refuses a scanned draft whose waiting pages were not confirmed, whatever the client",()=>{
  /* The rule: pages the signed receipt requires, minus the pages the request confirms. */
  assert.deepEqual(unconfirmedReviewPages([5,2],[]),[2,5]);
  assert.deepEqual(unconfirmedReviewPages([2,5],[5]),[2]);
  assert.deepEqual(unconfirmedReviewPages([2,5],[2,5,9]),[],"confirming more pages than required is harmless");
  assert.deepEqual(unconfirmedReviewPages(undefined,undefined),[],"a receipt signed before this field asks for nothing");
  assert.deepEqual(unconfirmedReviewPages([2],["2"]),[],"a page number sent as text still counts");
  assert.deepEqual(unconfirmedReviewPages([2],"2"),[2],"a request that is not a list confirms nothing");
  assert.deepEqual(unconfirmedReviewPages([2,"x",-1,1.5],[]),[2],"only whole positive page numbers are pages");
  /* Wired end to end: signed at preview, checked at draft, sent by every scanned-draft request. */
  const server=readFileSync(new URL("../server.ts",import.meta.url),"utf8");
  assert.match(server,/const reviewPages=pagesAwaitingReview\(recognized\.pageDiagnostics,\[\]\);[\s\S]{0,400}\.\.\.\(reviewPages\.length\?\{reviewPages\}:\{\}\)/,"the preview signs the waiting pages into its receipt");
  const draftRoute=server.slice(server.indexOf('app.post("/api/intelligence/drafts", '),server.indexOf('\napp.',server.indexOf('app.post("/api/intelligence/drafts", ')+10));
  assert.match(draftRoute,/unconfirmedReviewPages\(receipt\?\.reviewPages,req\.body\?\.reviewedPages\)/);
  assert.match(draftRoute,/code:"PDF_PAGE_REVIEW_REQUIRED"/);
  /* A window from the previous release sends no list at all: it is told so, never told to "refresh". */
  assert.match(draftRoute,/const outdated=!Array\.isArray\(req\.body\?\.reviewedPages\);/);
  assert.match(draftRoute,/هذه النافذة من إصدار سابق للنظام\. أغلقها ثم أعد رفع الملف؛ لم يُحفظ شيء\./);
  assert.doesNotMatch(draftRoute,/حدّث الصفحة/);
  assert.ok(draftRoute.indexOf("PDF_PAGE_REVIEW_REQUIRED")<draftRoute.indexOf("createScheduleDraft"),"the refusal comes before anything is saved");
  for(const file of ["ScheduleTransfer.tsx","IntelligenceWorkspace.tsx"]){
    const source=readFileSync(new URL(`../src/components/${file}`,import.meta.url),"utf8");
    const receipts=source.match(/importReceipt\s*:\s*[^,\n]*importReceipt/g)||[];
    const confirmations=source.match(/reviewedPages\s*:\s*[^,\n]*reviewedImportPages/g)||[];
    assert.ok(receipts.length>0,`${file} sends a receipt`);
    assert.equal(confirmations.length,receipts.length,`${file}: every request that sends a scanned-draft receipt also sends the confirmed pages`);
  }
});
check("a page the deep pass still leaves with no row is judged again by the lines its enhanced read counted",()=>{
  const first:OcrPageDiagnostic={page:3,visualRows:2,extractedRows:0,gridDetected:true,orientation:0,...scanPageVerdict({rows:0,filled:0,printed:2,broken:0})};
  assert.equal(first.suspicious,false,"2 printed, 0 read: accepted with a note on the first count");
  const again=rejudgeEmptyPage(first,5);
  assert.equal(again.suspicious,true,"the enhanced read counted 5: the whole page is lost, so the file stops");
  assert.equal(again.missedLines,undefined,"a refused page asks for no review");
  assert.equal(again.visualRows,5);
  assert.equal(again.reason,"طُبع فيها 5 أسطر ولم يُقرأ منها أي صف");
  assert.equal(again.warning,undefined,"the first count's note does not survive");
  assert.equal(rejudgeEmptyPage(first,2),first,"the same count: the first verdict stands");
  assert.equal(rejudgeEmptyPage(first,1),first,"a count never shrinks a verdict");
  const refused={...first,suspicious:true,reason:"x"};
  assert.equal(rejudgeEmptyPage(refused,9),refused,"an already refused page keeps its reason");
  const gridless={...first,gridDetected:false};
  assert.equal(rejudgeEmptyPage(gridless,9),gridless,"a page with no grid keeps its own diagnostic");
});
check("a page's two notes are said together, not one hiding the other",()=>{
  const both=scanPageVerdict({rows:26,filled:26,printed:28,broken:3});
  assert.equal(both.suspicious,false);
  assert.match(both.warning||"",/3 صفوف بلا رقم مقرر واضح/);
  assert.match(both.warning||"",/طُبع فيها 28 سطراً وقُرئ منها 26 صفاً/);
  assert.equal(scanPageVerdict({rows:12,filled:4,printed:0,broken:0}).suspicious,true,"a thinly filled page still stops the file");
});
check("the refusal names each confirmed page, says nothing was imported, and names the files that read fully",()=>{
  const diag=(page:number,extra:any)=>({page,visualRows:0,extractedRows:0,gridDetected:true,orientation:0 as const,suspicious:false,...extra});
  const message=scanRefusalMessage([
    diag(1,{}),
    diag(2,{suspicious:true,reason:"طُبع فيها 28 سطراً ولم يُقرأ منها إلا 4 صفوف"}),
    diag(3,{suspicious:true,unverified:true,reason:"عدد الصفوف المقروءة أقل بكثير من حدود الجدول المرئية"}),
  ]);
  assert.match(message,/الصفحة 2: طُبع فيها 28 سطراً ولم يُقرأ منها إلا 4 صفوف/);
  assert.doesNotMatch(message,/الصفحة 3/,"a page never given its deep pass is not named as confirmed");
  assert.match(message,/لم يُستورد أي صف/);
  assert.match(message,/Excel أو PDF مُصدَّراً من النظام/);
});


check("a broken import stream says what broke instead of the one generic sentence",()=>{
  assert.match(interruptedImportMessage(200),/توقّف الخادم في منتصف قراءة الملف — غالباً لنفاد ذاكرته، لا لعيب في ملفك/,"a stream cut mid-read (the instance killed for memory) is not blamed on the file");
  assert.match(interruptedImportMessage(429),/مشغول أو يُعاد تشغيله/,"the platform's «Rate exceeded» while the instance restarts");
  assert.match(interruptedImportMessage(503),/مشغول أو يُعاد تشغيله/);
  assert.match(interruptedImportMessage(413),/24 ميغابايت/);
  assert.match(interruptedImportMessage(0),/لم يصل الملف/,"no response at all");
  for(const status of [200,413,429,500,503])assert.match(interruptedImportMessage(status),/لم يُستورد أي صف/);
});

/* The reading turn is asynchronous; these cases run after the synchronous ones. */
const settle=()=>new Promise(resolve=>setImmediate(resolve));
{
  const first=(await takeScanReadingTurn())!;
  let told=0,entered=false;
  const next=takeScanReadingTurn(Number.POSITIVE_INFINITY,()=>{told++;}).then(turn=>{entered=true;return turn!;});
  await settle();
  assert.equal(entered,false,"a second scanned reading must not drive the workers while the first holds them");
  assert.equal(told,1,"the waiting upload is told it is queued");
  await first.release(false);
  await first.release(false);
  const second=await next;
  assert.equal(entered,true,"the next reading starts as soon as the first releases");
  let thirdEntered=false;
  const third=takeScanReadingTurn().then(turn=>{thirdEntered=true;return turn!;});
  await settle();
  assert.equal(thirdEntered,false,"a double release of the first turn did not open the queue for a third");
  await second.release(true);
  await (await third).release(false);
  let toldIdle=0;
  const idle=(await takeScanReadingTurn(Number.POSITIVE_INFINITY,()=>{toldIdle++;}))!;
  assert.equal(toldIdle,0,"an idle instance starts a reading at once, without a queue message");
  /* A request is cut by the platform at 300 s: waiting behind another scan's
     full reading must end in a refusal, not in the queue. */
  const gaveUp=await takeScanReadingTurn(20);
  assert.equal(gaveUp,null,"a bounded wait that runs out returns no turn");
  let afterTimeout=false;
  const later=takeScanReadingTurn(Number.POSITIVE_INFINITY).then(turn=>{afterTimeout=true;return turn!;});
  await idle.release(true);
  const handed=await later;
  assert.equal(afterTimeout,true,"a waiter that gave up leaves the queue; the next one still gets the turn");
  await handed.release(false);
  passed.push("one scanned reading drives the table workers at a time; the next waits a bounded time, is told so, and gets the turn in order");
}
assert.match(new ScanReadingBusyError().message,/يقرأ الآن ملفاً ممسوحاً آخر.*لم يُستورد أي صف/,"a busy refusal says why and that nothing was imported");
passed.push("a scan refused as busy says so in words");

/* The same file sent twice at the same moment is ONE reading. Registered only
   after the turn was taken, the second request missed the entry, waited behind
   the first and was refused as busy (review of #117). */
{
  let reads=0;
  const slowRead=async()=>{reads++;await settle();await settle();return{rows:[1,2,3]};};
  const [a,b]=await Promise.all([readScanInTurn("same-file",slowRead),readScanInTurn("same-file",slowRead)]);
  assert.equal(reads,1,"the file is read once for both requests");
  assert.deepEqual(a,b);
  assert.notEqual(a,b,"each request gets its own copy of the result");

  const holder=(await takeScanReadingTurn())!;
  reads=0;let shared=0;
  const first=readScanInTurn("queued-file",slowRead,{},Number.POSITIVE_INFINITY);
  const second=readScanInTurn("queued-file",slowRead,{sharing:()=>{shared++;}},Number.POSITIVE_INFINITY);
  await settle();
  assert.equal(shared,1,"a same-file request arriving while the first still waits for its turn shares it");
  await holder.release(false);
  await Promise.all([first,second]);
  assert.equal(reads,1,"one reading after the turn came");

  const busy=(await takeScanReadingTurn())!;
  await assert.rejects(readScanInTurn("other-file",slowRead,{},20),ScanReadingBusyError,"a different file that waits out its turn is refused as busy");
  await busy.release(false);
  assert.deepEqual(await readScanInTurn("other-file",slowRead),{rows:[1,2,3]},"a refused file leaves no stale entry behind: it reads normally afterwards");
  passed.push("the same file sent twice is one reading, shared even while it waits for its turn; a different file waits a bounded time");
}

/* فوز طريق الكلمات بالهوية لا يُفقد جدولة الشبكة: الصفحة 1 من جدول 2026 كانت
   28 هوية بلا وقت ولا مبنى بعد الاستبدال الكامل، فأوقفها scanPageVerdict مع
   أن الشبكة قرأت الأوقات. الدمج يملأ الخانة الفارغة وحدها ولا يمسّ قيمة قرأها
   الأساس. */
{
  const word=(reference:string,code:string,scode:string):any=>({code,reference,scode,courseText:"",instructorText:"",days:"",start:"",end:"",building:"",hall:""});
  const base=[word("12345","1622101","01"),word("12346","1622102","01"),{...word("","1622103","02"),start:"09:00"}];
  const donor:any=[
    {code:"1622101",reference:"12345",scode:"01",courseText:"",instructorText:"د. فلان",days:"5 3 1",start:"08:00",end:"08:50",building:"012",hall:"101",timeRaw:"0800-0850",daysRaw:"5 3 1"},
    {code:"1622103",reference:"",scode:"02",courseText:"",instructorText:"",days:"4 2",start:"11:00",end:"11:50",building:"013",hall:"",daysRaw:"4 2"},
  ];
  fillScheduleCellsFrom(base as any,donor);
  assert.equal(base[0].start,"08:00","المرجعي المتطابق يملأ الوقت الفارغ");
  assert.equal(base[0].building,"012");
  assert.equal(base[0].days,"5 3 1");
  assert.equal(base[0].instructorText,"د. فلان");
  assert.equal(base[1].start,"","صف بلا نظير في الشبكة يبقى فارغاً للمراجعة");
  assert.equal(base[2].start,"09:00","قيمة قرأها الأساس لا تُستبدل");
  assert.equal(base[2].building,"013","المطابقة بالمقرر والشعبة تعمل حين لا مرجعي");
  passed.push("دمج الجدولة: هوية الكلمات + أوقات الشبكة، الفارغ وحده يُملأ، والمطابقة بالمرجعي أو بالمقرر والشعبة");
}

/* لحامات صفحة 1 من مسح 2026: أثر خط الجدول داخل الرمز («[1350-1230042B09[F11]»)،
   الوقتان والمبنى والقاعة في كلمة واحدة، وذيل الشعبة والمرجعي والمقرر خلف صدرٍ
   من الخردة — تُفكّ كلها إلى قطعها، ولا تُمسّ كلمة سليمة. */
{
  const weld=(text:string)=>authorityOcrWordsToWords([{text,x0:100,y0:10,x1:400,y1:24}],842).map(word=>word.text).join("⁞");
  assert.equal(weld("[1350-1230042B09[F11]"),"1350⁞-⁞1230⁞042B09⁞F11");
  assert.equal(weld("0920-0800012807/F31]"),"0920⁞-⁞0800⁞012807⁞F31");
  assert.equal(weld("1100012807]"),"1100⁞012807");
  assert.equal(weld("[189510101102"),"18951⁞0101102");
  assert.equal(weld("%ouyiam|503/189470101102"),"%ouyiam⁞503⁞18947⁞0101102");
  assert.equal(weld("5505189490101102"),"5⁞505⁞18949⁞0101102");
  assert.equal(weld("0101102"),"0101102");
  assert.equal(weld("012J14"),"012J14");
  passed.push("لحامات المسح تُفكّ: وقتان ومبنى وقاعة، وذيل شعبة ومرجعي ومقرر، وخردة الأطراف تُنزع");
}

/* القراءة الأدق مدفوعة: لا تُعرض لصفٍّ قُرئ كاملاً وإن بقي مبناه بانتظار
   السجل أو أستاذه خارج السجل؛ تُعرض لخانةٍ لم يقرأها المسح فقط. */
{
  const clean={importEvidence:{course:{confidence:"CONFIRMED",raw:"0101102"},days:{confidence:"REVIEW_REQUIRED",raw:""},building:{confidence:"UNRESOLVED",raw:"012B09"},instructor:{confidence:"UNRESOLVED",raw:"د. فلان"}},sourcePage:1};
  const unreadTime={importEvidence:{course:{confidence:"CONFIRMED",raw:"0101102"},time:{confidence:"UNRESOLVED",raw:""}},sourcePage:2};
  const unreadBuilding={importEvidence:{building:{confidence:"UNRESOLVED",raw:""}},sourcePage:3};
  assert.equal(scanLeftCellUnread(clean),false,"مبنى بانتظار السجل وأستاذ خارج السجل ليسا فشل قراءة");
  assert.equal(scanLeftCellUnread(unreadTime),true);
  assert.equal(scanLeftCellUnread(unreadBuilding),true,"مبنى بلا نص خام لم يُقرأ");
  assert.deepEqual(pagesWithUnreadCells([clean,unreadTime,unreadBuilding,clean]),[2,3]);
  passed.push("عرض القراءة الأدق المدفوعة يُحصر في الصفحات التي لم يقرأ المسح خانةً منها");
}

/* 2026-09-30: مسحٌ من 117 صفاً رُفض نشره بـ«تعذّر إتمام العملية الآن» — الطلب
   1,055,956 بايت، والحد 1 MiB. كل صف يُرسل مرتين (المراجَع وخط الأساس)، وبرهان
   القراءة نحو ثلاثة أرباع وزنه، وخط الأساس لا يقرؤه. */
{
  const reason="رقم الشعبة مولد حسب ترتيب شعب المقرر (501 ثم 502…) ويطابق ما طُبع في المستند";
  const proof=(raw:string)=>({raw,normalized:raw,canonical:raw,confidence:"CONFIRMED",score:100,source:"OCR_GRID_CELL",method:"COURSE_NUMBER_TO_SYSTEM_CATALOGUE",derived:false,reason,evidence:["خلية رقم المقرر في المستند","كتالوج القسم الحالي","خانات رقم المقرر المقروءة"]});
  const row=(order:number)=>({id:-order,AdCourseId:9000+order%12,AdCourseName:"تكنولوجيا الأجهزة التعليمية",SCode:"501",AdInstructorId:40+order%9,
    fsunday:true,fmonday:false,ftuesday:true,fwednesday:false,fthursday:false,fstarttime:"08:00",fendtime:"09:50",AdRoomCode:"012",AdRoomHall:"B09",
    referenceNumber:String(55000+order),sourceInstructorText:"د. عبدالله خالد محمد المطر",sourceCourseCode:"0101114",sourceCourseText:"تكنولوجيا الأجهزة التعليمية",
    sourceSectionText:"501",sourceOrder:order,sourcePage:1+Math.floor(order/28),
    importEvidence:Object.fromEntries(["course","section","days","time","instructor","building","room"].map(key=>[key,proof("0101114 · تكنولوجيا الأجهزة التعليمية")]))});
  const rows=Array.from({length:117},(_,index)=>row(index));
  const bytes=(value:unknown)=>Buffer.byteLength(JSON.stringify(value),"utf8");
  const before=bytes({rows,baselineRows:rows});
  const baseline=withoutImportEvidence(rows);
  const after=bytes({rows,baselineRows:baseline});
  assert.ok(before>1_048_576,`the reproduced request is over the old 1 MiB limit (${before})`);
  assert.ok(after<960_000,`without the baseline's evidence it fits one Firestore document (${after})`);
  assert.ok(baseline.every(item=>!("importEvidence" in item)));
  assert.ok(rows.every(item=>"importEvidence" in item),"the reviewed rows keep their evidence; the input is not mutated");
  assert.deepEqual(Object.assign({},baseline[3],{importEvidence:rows[3].importEvidence}),rows[3],"nothing but the evidence leaves the baseline");

  const server=readFileSync(new URL("../server.ts",import.meta.url),"utf8");
  const draftRoute=server.slice(server.indexOf('app.post("/api/intelligence/drafts", '),server.indexOf('\napp.',server.indexOf('app.post("/api/intelligence/drafts", ')+10));
  assert.match(draftRoute,/withoutImportEvidence\(assignAuthoritySections\(safeDraftRows\(req\.body\?\.baselineRows/,"a baseline from an older window is stripped on the server too");
  assert.match(draftRoute,/suppliedBaseline:withoutImportEvidence\(rows\)/,"the fallback baseline is stripped as well");
  assert.ok(draftRoute.indexOf("DRAFT_DOCUMENT_MAX_BYTES")<draftRoute.indexOf("createScheduleDraft"),"an oversize draft is refused by name before anything is written");
  const draftParser=server.indexOf('app.use("/api/intelligence/drafts", express.json({ limit: "4mb" }));');
  assert.ok(draftParser>0&&draftParser<server.indexOf('app.use(express.json({ limit: "1mb" }));'),"the draft parser runs before the global 1 MB parser");
  assert.match(server,/error\?\.type === "entity\.too\.large"[\s\S]{0,120}status\(413\)/,"an oversize request is never told «حاول مرة أخرى»");
  const transfer=readFileSync(new URL("../src/components/ScheduleTransfer.tsx",import.meta.url),"utf8");
  assert.match(transfer,/baselineRows:importKind==="authority-pdf"&&Array\.isArray\(xlsxPreview\.baselineRows\)\?withoutImportEvidence\(xlsxPreview\.baselineRows\)/);
  passed.push("نشر مسح كبير: خط الأساس يُرسل ويُحفظ بلا برهان القراءة، والطلب الأكبر من الحد يقول ذلك بدل «حاول مرة أخرى»");
}

console.log(JSON.stringify({passed:passed.length,cases:passed},null,2));
