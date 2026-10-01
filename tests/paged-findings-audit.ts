/**
 * قوائم الملاحظات في مراجعة الاعتماد تُعرض كاملةً صفحةً صفحة، والورقة المطبوعة
 * تحمل كلَّ موعد: لا «و20 غيرها…» في الشاشة ولا «+ 20 موعداً آخر» على الورق.
 */
import fs from "fs";
import { pageWindow } from "../src/components/PagedFindingList";
import { packPrintFindings, PRINT_FINDING_GEOMETRY as G } from "../src/utils/printFindingPages";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};

/* ── أرقام الصفحات ── */
check(JSON.stringify(pageWindow(1, 5)) === "[1,2,3,4,5]", "سبع صفحات فأقل تُعرض كلها");
check(JSON.stringify(pageWindow(1, 12)) === '[1,2,3,4,"gap",12]', "البداية: 1 2 3 4 … 12");
check(JSON.stringify(pageWindow(6, 12)) === '[1,"gap",5,6,7,"gap",12]', "الوسط: 1 … 5 6 7 … 12");
check(JSON.stringify(pageWindow(12, 12)) === '[1,"gap",9,10,11,12]', "النهاية: 1 … 9 10 11 12");

/* ── رصّ الورقة ── */
type F = { id: string; rows: number[] };
const ids = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i);
const findings: F[] = [
  { id: "a", rows: ids(1, 3) },
  { id: "b", rows: ids(100, 60) },
  { id: "c", rows: [] },
  { id: "d", rows: ids(300, 8) },
  { id: "e", rows: ids(400, 140) },
];
const pages = packPrintFindings(findings, f => f.rows);
const printed = pages.flat().flatMap(piece => piece.rowIds);
const expected = findings.flatMap(f => f.rows);
check(printed.length === expected.length && new Set(printed).size === expected.length, "كل موعد يُطبع مرة واحدة، لا ناقص ولا مكرر");
check(findings.every(f => pages.flat().some(piece => piece.finding === f)), "كل ملاحظة لها موضع على الورق، ولو بلا مواعيد");
const cost = (rows: number) => G.header + G.gap + Math.ceil(rows / 2) * G.pair;
check(pages.every((page, index) => page.reduce((sum, piece) => sum + cost(piece.rowIds.length), 0) <= (index === 0 ? G.firstCapacity : G.nextCapacity)), "لا صفحة تتجاوز سعتها");
const last = pages[pages.length - 1];
check(last.reduce((sum, piece) => sum + cost(piece.rowIds.length), 0) + G.signatures <= G.nextCapacity || last.length === 1, "خانات التوقيع تتّسع في الصفحة الأخيرة");
const bParts = pages.flat().filter(piece => piece.finding === findings[1]);
check(bParts.length > 1 && bParts.every((piece, i) => piece.part === i + 1 && piece.parts === bParts.length), "الملاحظة الطويلة تُقسم بترقيم «تتمة» متّسق");
check(packPrintFindings<F>([], f => f.rows).length === 1, "بلا ملاحظات: صفحة أولى واحدة");
check(packPrintFindings([{ id: "x", rows: ids(1, 5) }], f => f.rows).length === 1, "ملاحظةٌ قصيرة واحدة ورقةٌ واحدة مع التواقيع");
const empties = packPrintFindings(Array.from({ length: 12 }, (_, i) => ({ id: `z${i}`, rows: [] as number[] })), f => f.rows);
check(empties.flat().length === 12, "الملاحظات بلا مواعيد لا تسقط حين تمتلئ الصفحة");
const tail = packPrintFindings([{ id: "p", rows: ids(1, 6) }, { id: "q", rows: ids(50, 20) }], f => f.rows);
check(tail.flat().every(piece => piece.rowIds.length === 0 || piece.rowIds.length >= 2), "لا قطعة بموعدٍ يتيم");

/* ── لا اقتطاع في الشاشة ── */
const review = fs.readFileSync("src/components/ScheduleReview.tsx", "utf8");
const changes = fs.readFileSync("src/components/ScheduleChanges.tsx", "utf8");
check(/import PagedFindingList from "\.\/PagedFindingList"/.test(review) && /import PagedFindingList from "\.\/PagedFindingList"/.test(changes), "المراجعة والتغييرات تستعملان المكوّن نفسه");
check(!/slice\(0,\s*12\)/.test(review) && !/slice\(0,\s*12\)/.test(changes), "لا اقتطاع باثني عشر");
check(!/غيرها…|غيرهم…/.test(review) && !/غيرهم…/.test(changes), "لا «و… غيرها» في قوائم الملاحظات");
check(!/printRowPreviewLimit/.test(review), "الورقة لا تقتطع المواعيد");
check(/أظهرها على الجدول/.test(review), "«أظهرها على الجدول» باقٍ");
const css = fs.readFileSync("src/styles/09-details.css", "utf8");
check(/@media print\{[^}]*\.pfl-item\[hidden\]\{display:contents!important\}/.test(css), "الطباعة تُظهر كل الصفحات");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
