/**
 * الصحائف الجديدة الحقيقية للكلية (٢٠٢٦، ١٤ قسماً من SWRCAPP): كلُّ صحيفة تُقرأ ثم تقبلها بوابةُ النطاق
 * لقسمها وحده وبعدد مقرراته المعروف، وتُرفض لأي قسمٍ آخر. المجاميع المطبوعة التي لا تتطابق في الصحيفة نفسها
 * (الكهرباء والموسيقية والعربية) تظهر ملاحظةً ولا تمنع.
 */
import fs from "fs";
import { extractPlanItems } from "../src/server/planPdfExtract";
import { parsePlanItems } from "../src/utils/planPdfParser";
import { blockingWarnings, checkSheetScope, isNewSheet, sheetKey, sheetOwnKey, correctedNames, dominantDepartment, ownCourses, printedTotalsNotes } from "../src/utils/planSheetImport";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
/* ملف ← [رمز القسم، عدد مقررات القسم] */
const EXPECTED: Record<string, [string, number]> = {
  "ba-0101": ["01", 29], "ba-0102": ["02", 31], "ba-0105": ["05", 31], "ba-0106": ["07", 26], "ba-0109": ["13", 33],
  "ba-0111": ["11", 24], "ba-0112": ["12", 27], "ba-0113": ["72", 23], "ba-0114": ["10", 34], "ba-0115": ["09", 27],
  "ba-0116": ["18", 27], "ba-0119-mid": ["18", 27], "ba-0136": ["24", 23], "ba-0140": ["40", 24],
};

(async () => {
  for (const [file, [dept, count]] of Object.entries(EXPECTED)) {
    const plan = parsePlanItems(await extractPlanItems(fs.readFileSync(`tests/fixtures/plans/graduation-2026/${file}.pdf`)));
    const key = `01${dept}`;
    const scope = { collegeName: "كلية التربية الأساسية - بنات", sectionName: plan.department, departmentKey: key };
    check(dominantDepartment(plan) === dept, `${file}: رمز القسم ${dept}`);
    check(checkSheetScope(plan, scope) === null && blockingWarnings(plan).length === 0, `${file}: تُقبل لقسمها`);
    check(ownCourses(plan, key).length === count, `${file}: ${count} مقرراً للقسم`);
    check(checkSheetScope(plan, { ...scope, sectionName: "قسم أصول التربية", departmentKey: "0199" })?.kind === "department", `${file}: تُرفض لقسمٍ آخر (اسماً ورمزاً)`);
    check(checkSheetScope(plan, { ...scope, collegeName: "كلية العلوم الإدارية", departmentKey: `02${dept}` })?.kind === "college", `${file}: تُرفض لكليةٍ أخرى`);
    check(correctedNames(ownCourses(plan, key)).fixes.every(fix => fix.after !== fix.before), `${file}: كل تصحيح اسمٍ يغيّر الاسم فعلاً`);
  }
  /* قديمتان بصيغٍ مختلفة: متطلبٌ بقوسٍ و«أو» ملتصقتين (الرياضيات)، وبرنامجٌ بلا ترويسة قسمٍ مألوفة */
  for (const [file, dept, count] of [["ba-0105-2017", "05", 19], ["ba-0110-2024", "21", 11]] as const) {
    const plan = parsePlanItems(await extractPlanItems(fs.readFileSync(`tests/fixtures/plans/graduation-old/${file}.pdf`)));
    check(!isNewSheet(plan) && blockingWarnings(plan).length === 0 && dominantDepartment(plan) === dept && ownCourses(plan, sheetKey(plan)).length === count, `${file}: صحيفة قديمة تُقرأ بلا مانع (${count} مقرراً)`);
  }
  /* التربية الخاصة ورياض الأطفال: صحائفها باسم القسم الإداري، فيُقبل القسم المختص برمزه ولا يُقبل «أصول التربية» */
  const special = parsePlanItems(await extractPlanItems(fs.readFileSync("tests/fixtures/plans/graduation-old/ba-012102-2010.pdf")));
  const specialScope = { collegeName: "كلية التربية الأساسية - بنات", collegeCode: "01", sectionName: "قسم التربية الخاصة", departmentKey: "0119" };
  check(checkSheetScope(special, specialScope) === null && ownCourses(special, sheetOwnKey(special, specialScope).key).length === 17, "التربية الخاصة: تُقبل في قسمها (17 مقرراً برمز 19)");
  check(checkSheetScope(special, { ...specialScope, sectionName: "قسم أصول التربية", departmentKey: "0120" })?.kind === "department", "التربية الخاصة: لا تُقبل في «أصول التربية»");
  check(special.program === "BA-012102" && special.programName.includes("اعاقة سمعية"), "اسم البرنامج يُقرأ بجانب رمزه (مسار التربية الخاصة)");
  const kinder = parsePlanItems(await extractPlanItems(fs.readFileSync("tests/fixtures/plans/graduation-old/ba-0110-2024.pdf")));
  check(checkSheetScope(kinder, { ...specialScope, sectionName: "قسم رياض الأطفال", departmentKey: "0121" }) === null, "رياض الأطفال: تُقبل في قسمها");
  check(checkSheetScope(kinder, { ...specialScope, sectionName: "قسم أصول التربية", departmentKey: "0120" })?.kind === "department", "رياض الأطفال: لا تُقبل في «أصول التربية»");
  const notes = await Promise.all(["ba-0113", "ba-0109", "ba-0102"].map(async file => printedTotalsNotes(parsePlanItems(await extractPlanItems(fs.readFileSync(`tests/fixtures/plans/graduation-2026/${file}.pdf`)))).length));
  check(notes.every(n => n > 0), "المجاميع المطبوعة الخاطئة في الصحيفة تظهر ملاحظات");
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
