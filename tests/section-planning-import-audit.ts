/**
 * استيراد كشف «المقاعد المتبقية» (PDF/صور) — اختبارٌ سلوكي للقراءة والحكم عليها قبل التطبيق:
 * كشفٌ واضح، وقراءةٌ رديئة/ناقصة، وصورةٌ طوليّة، وكشف قسمٍ آخر، وصفحاتٌ متعددة، وأرقامٌ هندية/فارسية.
 */
import fs from "fs";
import {
  assessRemainingImport, detectReportDepartment, imageOrientationRefusal, imageSize,
  manualRemainingValue, planRemainingApply, readRemainingReport, remainingOf, remainingValues, type ReportCell,
} from "../src/utils/remainingReport";
import { readReportCells } from "../src/utils/documentOcr";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };

/* كشف SWRS136 مركّباً: الأعمدة من اليمين كما تطبعها العمادة. */
const X = { code: 0.84, name: 0.7, notPassed: 0.6, capacity: 0.53, registered: 0.47, seats: 0.4, sections: 0.34, unregistered: 0.27 };
const at = (text: string, x: number, y: number, confidence?: number, width = 0.05): ReportCell => ({ text, x0: x - width / 2, x1: x + width / 2, y, ...(confidence != null ? { confidence } : {}) });
type Row = [code: string, values: Array<number | string | null>, confidence?: number];
const page = (shift: number, rows: Row[]): ReportCell[] => [
  at("المقرر", X.code + shift, 0.2), at("اسم المقرر", X.name + shift, 0.2, undefined, 0.16),
  at("لم يجتازوا في بداية التسجيل", X.notPassed + shift, 0.2), at("سعة الشعب", X.capacity + shift, 0.2),
  at("عدد المسجلين", X.registered + shift, 0.2), at("المقاعد المتبقية", X.seats + shift, 0.2),
  at("عدد الشعب", X.sections + shift, 0.2), at("اعداد الذين لم يسجلوا", X.unregistered + shift, 0.2),
  ...rows.flatMap(([code, values, confidence], index) => {
    const y = 0.25 + index * 0.03;
    const xs = [X.notPassed, X.capacity, X.registered, X.seats, X.sections, X.unregistered];
    return [at(code, X.code + shift, y), at("اسم", X.name + shift, y, undefined, 0.16),
      ...values.flatMap((value, column) => value == null ? [] : [at(String(value), xs[column] + shift, y, column === 3 ? confidence : 92)])];
  }),
];
const catalogue = ["102", "120", "201", "254", "255", "310"].map((code, index) => ({ id: index + 1, code: `0101${code}` }));
const header = "الفصل الدراسي : 202420\nرمز القسم العلمي 0101 التربيه الاسلاميه";
const context = { departmentCode: "0101", departmentName: "التربية الإسلامية", headerText: header };

/* ── كشفٌ واضح بصفحتين ── */
const clear = [
  page(0, [["0101102", [54, 1336, 0, 1336, 19, 54]], ["0101120", [297, null, null, null, 0, null]], ["0101201", [570, 256, 6, 250, 9, 370]]]),
  page(0.035, [["0101254", [48, 210, 10, 200, 3, 48]], ["0101310", [12, 70, 70, 0, 1, 12]]]),
];
let r = readRemainingReport(clear, catalogue, "0101");
let a = assessRemainingImport(r, context);
let v = remainingValues(r, r.column!);
check(a.reject === null && a.notes.length === 0 && !a.needsDepartmentConfirmation && a.read === 4, "كشفٌ واضح: يُقبل بلا ملاحظات ولا تأكيد قسم");
check(v["1"] === 1336 && v["3"] === 250 && v["4"] === 200 && v["6"] === 0, "القيم من «المقاعد المتبقية» (1336، 250، 200، 0) — لا من «لم يسجلوا» (54، 370، 48، 12)");
check(!("2" in v) && a.noSections.includes(2), "مقررٌ بلا شعب في الكشف: لا قيمة تُستورد، ولا يؤخذ «لم يجتازوا» (297)");
check(r.missing.includes(5) && r.rows.length === 5, "الصفحتان تُقرآن معاً، ومقرر القسم الغائب (255) يُذكر");
check(r.columns.length === 6 && r.columns.map(c => c.kind).join() === "notPassed,capacity,registered,seats,sections,unregistered",
  "صفحتان بتأطيرٍ مختلف: الأعمدة بترتيبها من اليمين ومحاذاتها واحدة");

/* ترتيب الصفحات لا يغيّر شيئاً. */
const swapped = readRemainingReport([clear[1], clear[0]], catalogue, "0101");
const sv = remainingValues(swapped, swapped.column!);
check(JSON.stringify(Object.entries(sv).sort()) === JSON.stringify(Object.entries(v).sort()), "ترتيب الصفحات معكوساً: القيم نفسها لكل مقرر");

/* ── أرقامٌ هندية وفارسية وأصفارٌ بادئة، ورمزٌ قصير في الكتالوج ── */
const mixedCatalogue = [{ id: 1, code: "102" }, { id: 3, code: "0101201" }];
const mixed = [page(0, [["٠١٠١١٠٢", ["٥٤", "١٣٣٦", "٠", "١٣٣٦", "١٩", "٥٤"]], ["۰۱۰۱۲۰۱", ["۵۷۰", "۲۵۶", "۶", "۲۵۰", "۹", "۳۷۰"]]])];
r = readRemainingReport(mixed, mixedCatalogue, "0101");
v = remainingValues(r, r.column!);
check(v["1"] === 1336 && v["3"] === 250, "رموزٌ وأرقامٌ هندية (٠١٠١١٠٢) وفارسية (۰۱۰۱۲۰۱) تطابق 102 و0101201");

/* ── قراءةٌ ناقصة: خانةٌ واحدة لم تُقرأ ← يُقبل الكشف، والخانة صفراء فارغة، ولا تُملأ إلا بيد المستخدم ── */
const partial = [page(0, [["0101102", [54, 1336, 0, 1336, 19, 54]], ["0101201", [570, 256, 6, null, 9, 370]], ["0101254", [48, 210, 10, 200, 3, 48]], ["0101310", [12, 70, 70, 0, 1, 12]]])];
r = readRemainingReport(partial, catalogue, "0101");
a = assessRemainingImport(r, context);
check(a.reject === null && a.read === 3 && a.unread.length === 1 && a.unread[0] === 3, "قراءةٌ ناقصة: الكشف يُقبل ويُعرض، والخانة غير المقروءة تُعدّ للمراجعة (لا رفض كلي)");
check(!("3" in remainingValues(r, r.column!)) && remainingOf(r.rows.find(row => row.courseId === 3)!, r.column!).state === "unread",
  "الخانة الفارغة لا تُخمَّن من عمودٍ مجاور (256 السعة، 9 الشعب، 370 لم يسجلوا)");
let plan = planRemainingApply(r, r.column!);
check(plan.total === 3 && plan.fromSheet === 3 && plan.manual === 0 && !("3" in plan.next) && plan.untouched.join() === "3"
  && plan.next["1"] === 1336 && plan.next["4"] === 200 && plan.next["6"] === 0,
  "التطبيق: المقروء وحده (1336، 200، والصفر المقروء فعلاً)؛ غير المقروء لا يُكتب — لا صفر ولا تخمين");
plan = planRemainingApply(r, r.column!, { "3": "75" });
check(plan.total === 4 && plan.manual === 1 && plan.next["3"] === 75 && plan.fromSheet === 3, "قيمةٌ كتبها المستخدم لخانةٍ غير مقروءة: تُقبل وتُحسب يدوية");
plan = planRemainingApply(r, r.column!, { "3": "abc" });
check(plan.manual === 0 && !("3" in plan.next) && plan.untouched.includes(3), "قيمةٌ يدوية غير عددية لا تُقبل");
plan = planRemainingApply(r, r.column!, { "3": "" }, { "3": "40", "5": "9", "1": "7" });
check(plan.next["3"] === 40 && plan.next["5"] === 9 && plan.next["1"] === 1336 && plan.untouched.includes(3),
  "القيمة المحفوظة سابقاً لخانةٍ لم تُقرأ تبقى كما هي، والمقرر الغائب من الكشف لا يُمسّ، والمقروء يحلّ محل القديم");
check(manualRemainingValue("٣٥") === 35 && manualRemainingValue("-2") === undefined && manualRemainingValue("1.5") === undefined && manualRemainingValue("") === undefined,
  "قيمة المستخدم: أرقامٌ هندية تُقبل، والسالب والكسر والفراغ لا");

/* ── قراءةٌ رديئة: أكثر الخانات فارغة أو ضعيفة ← يُقبل ما قُرئ، وكل ما سواه أصفر ── */
const poor = [page(0, [["0101102", [54, 1336, 0, null, 19, 54]], ["0101201", [570, 256, 6, 250, 9, 370], 20], ["0101254", [48, 210, 10, null, 3, 48]], ["0101310", [12, 70, 70, 0, 1, 12]]])];
r = readRemainingReport(poor, catalogue, "0101");
a = assessRemainingImport(r, context);
check(a.reject === null && a.read === 1 && a.unread.length === 3, "قراءةٌ رديئة (خانة واحدة من أربع): لا رفض كلي؛ المقروء واحد والباقي للمراجعة");
check(remainingOf(r.rows.find(row => row.courseId === 3)!, r.column!).state === "lowConfidence", "خانةٌ بثقةٍ ضعيفة (20) لا تُعتمد");
plan = planRemainingApply(r, r.column!);
check(plan.total === 1 && plan.next["6"] === 0 && Object.keys(plan.next).length === 1, "ولا يُطبَّق منها إلا الخانة المقروءة");
const nothing = [page(0, [["0101102", [54, 1336, 0, null, 19, 54]], ["0101201", [570, 256, 6, null, 9, 370]], ["0101254", [48, 210, 10, null, 3, 48]]])];
r = readRemainingReport(nothing, catalogue, "0101");
a = assessRemainingImport(r, context);
check(r.rows.length === 3 && a.read === 0 && Boolean(a.reject?.includes("لأي مقرر")), `لا خانة مقروءة أصلاً: يُرفض — ${a.reject}`);

/* ── رأس الكشف غير مقروء: تأكيدٌ صريح لا رفض ── */
r = readRemainingReport(clear, catalogue, "0101");
a = assessRemainingImport(r, { departmentCode: "0101", departmentName: "التربية الإسلامية", headerText: "" });
check(a.reject === null && a.needsDepartmentConfirmation, "رأسٌ بلا رمز القسم ولا اسمه: لا يُرفض، ويُطلب من المستخدم تأكيد القسم");
a = assessRemainingImport(r, context);
check(!a.needsDepartmentConfirmation, "والرأس المقروء: لا تأكيد");

/* ── قسمٌ آخر ── */
r = readRemainingReport(clear, catalogue, "0101");
a = assessRemainingImport(r, { ...context, headerText: "رمز القسم العلمي 0102 اللغة العربية" });
check(Boolean(a.reject?.includes("لقسمٍ آخر") && a.reject.includes("0102") && a.reject.includes("التربية الإسلامية") && a.reject.includes("0101")) && a.detectedDepartment === "0102",
  `ترويسة قسمٍ آخر: يُرفض قبل التطبيق ويُسمّى القسمان — ${a.reject}`);
const otherDept = [page(0, [["0102102", [54, 1336, 0, 1336, 19, 54]], ["0102201", [570, 256, 6, 250, 9, 370]], ["0102254", [1, 2, 0, 2, 1, 1]]])];
r = readRemainingReport(otherDept, catalogue, "0101");
a = assessRemainingImport(r, { departmentCode: "0101", departmentName: "التربية الإسلامية" });
check(Boolean(a.reject?.includes("0102")) && a.detectedDepartment === "0102" && r.rows.length === 0, "بلا ترويسة: القسم يُعرف من بادئة الرموز (0102) فيُرفض");
check(detectReportDepartment("", ["0101102", "0101201"]) === "0101" && detectReportDepartment("", ["102"]) === undefined, "استنتاج القسم من الرموز الكاملة فقط");

/* ── كشفٌ بلا عمود «المقاعد المتبقية» ← رفض، لا بديل ── */
const noSeats = [page(0, [["0101102", [54, 1336, 0, 1336, 19, 54]], ["0101201", [570, 256, 6, 250, 9, 370]]]).filter(cell => cell.text !== "المقاعد المتبقية" && !(Math.abs((cell.x0 + cell.x1) / 2 - X.seats) < 0.01))];
r = readRemainingReport(noSeats, catalogue, "0101");
a = assessRemainingImport(r, context);
check(r.column === null && Boolean(a.reject?.includes("«المقاعد المتبقية»")), "لا عمود «المقاعد المتبقية»: يُرفض ولا يؤخذ «لم يسجلوا» بدله");

/* ── اتجاه الصورة (صورٌ حقيقية PNG/JPEG) ── */
const { createCanvas } = await import("@napi-rs/canvas");
const image = (w: number, h: number, type: "png" | "jpeg") => { const c = createCanvas(w, h); c.getContext("2d").fillRect(0, 0, 10, 10); return type === "png" ? c.toBuffer("image/png") : c.toBuffer("image/jpeg"); };
const portrait = image(600, 1000, "png"), landscape = image(1000, 600, "jpeg");
check(imageSize(portrait)?.height === 1000 && imageSize(landscape)?.width === 1000, "أبعاد PNG وJPEG تُقرأ من البايتات");
const refusal = imageOrientationRefusal(portrait, "page1.png");
check(refusal.includes("طوليّة") && refusal.includes("أفقياً") && refusal.includes("page1.png"), `صورةٌ طوليّة تُرفض قبل القراءة: ${refusal}`);
check(imageOrientationRefusal(landscape) === "" && imageOrientationRefusal(fs.readFileSync("tests/fixtures/remaining-report.pdf")) === "", "صورةٌ أفقية أو PDF: لا رفض");
/* JPEG عرضُه أكبر لكن EXIF يقول «أُدير 90°» ← يُعرض طولياً فيُرفض. */
const exifJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
  0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0xe8, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);
check(imageSize(exifJpeg)?.width === 600 && imageOrientationRefusal(exifJpeg) !== "", "JPEG بدوران EXIF (6): يُعامل بأبعاده المعروضة فيُرفض الطولي");

/* ── قراءةٌ حقيقية لملف PDF (طبقة النص) ── */
const cells = await readReportCells(fs.readFileSync("tests/fixtures/remaining-report.pdf"));
const pdfCatalogue = [{ id: 1, code: "101" }, { id: 2, code: "102" }, { id: 3, code: "210" }, { id: 4, code: "315" }];
r = readRemainingReport(cells.pages, pdfCatalogue, "0101");
a = assessRemainingImport(r, { departmentCode: "0101", headerText: cells.headerText });
check(cells.source === "text" && a.reject === null && a.notes.length === 0 && !a.needsDepartmentConfirmation && remainingValues(r, r.column!)["2"] === 102, "ملف PDF حقيقي: يُقرأ ويُقبل، والقيم من عمود المتبقي");
a = assessRemainingImport(r, { departmentCode: "0202", headerText: "رمز القسم العلمي 0101" });
check(Boolean(a.reject?.includes("0202") && a.reject.includes("0101")), "والملف نفسه لقسمٍ مختار آخر: يُرفض قبل التطبيق");


/* ── سطرٌ ضاع رقم مقرره: لا يُسكت عنه ── */
{
  const many: Row[] = ["102", "120", "201", "254", "255", "310"].map(code => [`0101${code}`, [10, 70, 0, 70, 1, 10]] as Row);
  const full = page(0, many);
  const lost = full.filter(cell => cell.text !== "0101254");
  const gapReading = readRemainingReport([lost], catalogue, "0101");
  const gapAssessment = assessRemainingImport(gapReading, context);
  check((gapReading.gaps || []).some(gap => gap.after === "0101201" && gap.before === "0101255"), "سطرٌ بلا رقم مقرر يُكشف بفجوته بين جارَيه");
  check(gapAssessment.reject === null && gapAssessment.notes.some(text => /لم يُقرأ رقم مقرره/.test(text)), "ويُعرض ملاحظةً صفراء ولا يمنع التعبئة");
  check((readRemainingReport([full], catalogue, "0101").gaps || []).length === 0, "والكشف الكامل بلا فجوات");
}

/* ── مقرراتٌ من خارج القسم بين مقرراته: تُتجاهل، ولا تُعدّ سطراً ناقصاً ── */
{
  const mixedRows: Row[] = [["0101102", [10, 70, 0, 70, 1, 10]], ["0101120", [10, 70, 0, 70, 1, 10]], ["0202777", [99, 140, 0, 140, 2, 99]],
    ["0101201", [10, 70, 0, 70, 1, 10]], ["0303888", [5, 70, 0, 70, 1, 5]], ["0101254", [10, 70, 0, 70, 1, 10]], ["0101255", [10, 70, 0, 70, 1, 10]], ["0101310", [10, 70, 0, 70, 1, 10]]];
  const mixedReading = readRemainingReport([page(0, mixedRows)], catalogue, "0101");
  const mixedAssessment = assessRemainingImport(mixedReading, context);
  const values = remainingValues(mixedReading, mixedReading.column!);
  check(mixedReading.rows.length === 6 && !Object.values(values).includes(140), "مقررات خارج القسم لا تُستورد ولا تختلط قيمها بمقررات القسم");
  check(mixedReading.foreign.length === 2, "وتُذكر للعلم فقط");
  check(mixedAssessment.reject === null && mixedAssessment.notes.length === 0, "ولا تمنع الاستيراد ولا تُعدّ سطراً ناقصاً");
}

console.log(`\nSection planning import audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
