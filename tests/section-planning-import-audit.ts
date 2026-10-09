/**
 * استيراد كشف «اعداد الذين لم يسجلوا» = المتبقي الإجمالي (PDF/صور) — اختبارٌ سلوكي للقراءة والحكم عليها قبل التطبيق:
 * كشفٌ واضح، وقراءةٌ رديئة/ناقصة، وصورةٌ طوليّة، وكشف قسمٍ آخر، وصفحاتٌ متعددة، وأرقامٌ هندية/فارسية.
 */
import fs from "fs";
import {
  assessRemainingImport, detectReportDepartment, imageOrientationRefusal, imageSize,
  confirmReportDepartment, HEADER_DIGITS_MARK, manualRemainingValue, planRemainingApply, readRemainingReport, remainingOf, remainingValues, type ReportCell,
} from "../src/utils/remainingReport";
import { readReportCells } from "../src/utils/documentOcr";
import { suggestSectionCount } from "../src/utils/sectionCountSuggestion";
import { signedCount } from "../src/utils/remainingReport";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };

/* كشف SWRS136 مركّباً: الأعمدة من اليمين كما تطبعها العمادة. القيم متّسقة مع حساب الكشف:
   المقاعد المتبقية = السعة − المسجلين، والذين لم يسجلوا = لم يجتازوا − المسجلين (مدخل التخطيط). */
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
      ...values.flatMap((value, column) => value == null ? [] : [at(String(value), xs[column] + shift, y, column === 5 ? confidence : 92)])];
  }),
];
const catalogue = ["102", "120", "201", "254", "255", "310"].map((code, index) => ({ id: index + 1, code: `0101${code}` }));
const header = "الفصل الدراسي : 202420\nرمز القسم العلمي 0101 التربيه الاسلاميه";
const context = { departmentCode: "0101", departmentName: "التربية الإسلامية", headerText: header };

/* ── كشفٌ واضح بصفحتين ── */
const clear = [
  page(0, [["0101102", [1390, 1336, 0, 1336, 19, 1390]], ["0101120", [297, null, null, null, 0, null]], ["0101201", [376, 256, 6, 250, 9, 370]]]),
  page(0.035, [["0101254", [58, 210, 10, 200, 3, 48]], ["0101310", [70, 80, 70, 10, 1, 0]]]),
];
let r = readRemainingReport(clear, catalogue, "0101");
let a = assessRemainingImport(r, context);
let v = remainingValues(r, r.column!);
check(a.reject === null && a.notes.length === 0 && !a.needsDepartmentConfirmation && a.read === 4, "كشفٌ واضح: يُقبل بلا ملاحظات ولا تأكيد قسم");
check(v["1"] === 1390 && v["3"] === 370 && v["4"] === 48 && v["6"] === 0, "القيم من «اعداد الذين لم يسجلوا» (1390، 370، 48، 0) — لا من «المقاعد المتبقية» (1336، 250، 200، 10)");
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
const mixed = [page(0, [["٠١٠١١٠٢", ["١٣٩٠", "١٣٣٦", "٠", "١٣٣٦", "١٩", "١٣٩٠"]], ["۰۱۰۱۲۰۱", ["۳۷۶", "۲۵۶", "۶", "۲۵۰", "۹", "۳۷۰"]]])];
r = readRemainingReport(mixed, mixedCatalogue, "0101");
v = remainingValues(r, r.column!);
check(v["1"] === 1390 && v["3"] === 370, "رموزٌ وأرقامٌ هندية (٠١٠١١٠٢) وفارسية (۰۱۰۱۲۰۱) تطابق 102 و0101201");

/* ── قراءةٌ ناقصة: خانةٌ واحدة لم تُقرأ ← يُقبل الكشف، والخانة صفراء فارغة، ولا تُملأ إلا بيد المستخدم ── */
const partial = [page(0, [["0101102", [1390, 1336, 0, 1336, 19, 1390]], ["0101201", [376, 256, 6, 250, 9, null]], ["0101254", [58, 210, 10, 200, 3, 48]], ["0101310", [70, 80, 70, 10, 1, 0]]])];
r = readRemainingReport(partial, catalogue, "0101");
a = assessRemainingImport(r, context);
check(a.reject === null && a.read === 3 && a.unread.length === 1 && a.unread[0] === 3, "قراءةٌ ناقصة: الكشف يُقبل ويُعرض، والخانة غير المقروءة تُعدّ للمراجعة (لا رفض كلي)");
check(!("3" in remainingValues(r, r.column!)) && remainingOf(r.rows.find(row => row.courseId === 3)!, r.column!).state === "unread",
  "الخانة الفارغة لا تُخمَّن من عمودٍ مجاور (376 لم يجتازوا، 9 الشعب، 250 المقاعد المتبقية) ولا من حسابها (376 − 6)");
let plan = planRemainingApply(r, r.column!);
check(plan.total === 3 && plan.fromSheet === 3 && plan.manual === 0 && !("3" in plan.next) && plan.untouched.join() === "3"
  && plan.next["1"] === 1390 && plan.next["4"] === 48 && plan.next["6"] === 0,
  "التطبيق: المقروء وحده (1390، 48، والصفر المقروء فعلاً)؛ غير المقروء لا يُكتب — لا صفر ولا تخمين");
plan = planRemainingApply(r, r.column!, { "3": "75" });
check(plan.total === 4 && plan.manual === 1 && plan.next["3"] === 75 && plan.fromSheet === 3, "قيمةٌ كتبها المستخدم لخانةٍ غير مقروءة: تُقبل وتُحسب يدوية");
plan = planRemainingApply(r, r.column!, { "3": "abc" });
check(plan.manual === 0 && !("3" in plan.next) && plan.untouched.includes(3), "قيمةٌ يدوية غير عددية لا تُقبل");
plan = planRemainingApply(r, r.column!, { "3": "" }, { "3": "40", "5": "9", "1": "7" });
check(plan.next["3"] === 40 && plan.next["5"] === 9 && plan.next["1"] === 1390 && plan.untouched.includes(3),
  "القيمة المحفوظة سابقاً لخانةٍ لم تُقرأ تبقى كما هي، والمقرر الغائب من الكشف لا يُمسّ، والمقروء يحلّ محل القديم");
check(manualRemainingValue("٣٥") === 35 && manualRemainingValue("-2") === -2 && manualRemainingValue("1.5") === undefined && manualRemainingValue("") === undefined,
  "قيمة المستخدم: أرقامٌ هندية وسالبٌ كما في الكشف تُقبل، والكسر والفراغ لا");

/* ── قراءةٌ رديئة: أكثر الخانات فارغة أو ضعيفة ← يُقبل ما قُرئ، وكل ما سواه أصفر ── */
const poor = [page(0, [["0101102", [1390, 1336, 0, 1336, 19, null]], ["0101201", [376, 256, 6, 250, 9, 370], 20], ["0101254", [58, 210, 10, 200, 3, null]], ["0101310", [70, 80, 70, 10, 1, 0]]])];
r = readRemainingReport(poor, catalogue, "0101");
a = assessRemainingImport(r, context);
check(a.reject === null && a.read === 1 && a.unread.length === 3, "قراءةٌ رديئة (خانة واحدة من أربع): لا رفض كلي؛ المقروء واحد والباقي للمراجعة");
check(remainingOf(r.rows.find(row => row.courseId === 3)!, r.column!).state === "lowConfidence", "خانةٌ بثقةٍ ضعيفة (20) لا تُعتمد");
plan = planRemainingApply(r, r.column!);
check(plan.total === 1 && plan.next["6"] === 0 && Object.keys(plan.next).length === 1, "ولا يُطبَّق منها إلا الخانة المقروءة");
const nothing = [page(0, [["0101102", [1390, 1336, 0, 1336, 19, 1390], 20], ["0101201", [376, 256, 6, 250, 9, 370], 20], ["0101254", [58, 210, 10, 200, 3, 48], 20]])];
r = readRemainingReport(nothing, catalogue, "0101");
a = assessRemainingImport(r, context);
check(r.rows.length === 3 && a.read === 0 && Boolean(a.reject?.includes("لأي مقرر")), `لا خانة مقروءة أصلاً: يُرفض — ${a.reject}`);

/* ── رأس الكشف غير مقروء: تأكيدٌ صريح لا رفض ── */
/* كشفٌ يطبع الرمز بثلاث خانات: الرأس وحده دليل القسم. */
const threeDigits = clear.map(cells => cells.map(cell => /^0101\d{3}$/.test(cell.text) ? { ...cell, text: cell.text.slice(4) } : cell));
r = readRemainingReport(threeDigits, catalogue, "0101");
a = assessRemainingImport(r, { departmentCode: "0101", departmentName: "التربية الإسلامية", headerText: "" });
check(a.reject === null && a.read === 4 && a.needsDepartmentConfirmation, "رأسٌ بلا رمز القسم ولا اسمه: لا يُرفض، ويُطلب من المستخدم تأكيد القسم");
a = assessRemainingImport(r, context);
check(!a.needsDepartmentConfirmation, "والرأس المقروء: لا تأكيد");
const garbled = "مر القسم العلصر, | !0010 dl نيه الإصسلاميةه\nالفصل الدراسي : 202420";
check(!confirmReportDepartment(garbled, "0101", "التربية الإسلامية").confirmed, "الرأس المشوّه وحده لا يكفي");
check(confirmReportDepartment(`${garbled}\n${HEADER_DIGITS_MARK} 202420 0101 01`, "0101", "التربية الإسلامية").byCode, "قراءة الأرقام وحدها تُظهر 0101 رمزاً مستقلاً والرأس العربي فيه «القسم»: يُتحقق");
check(!confirmReportDepartment(`${garbled}\n${HEADER_DIGITS_MARK} 202420 01010 01`, "0101", "التربية الإسلامية").confirmed
  && !confirmReportDepartment(`رأس بلا كلمة\n${HEADER_DIGITS_MARK} 0101`, "0101", "").confirmed
  && !confirmReportDepartment(`${garbled}\n${HEADER_DIGITS_MARK} 202420 0102`, "0101", "").confirmed, "ولا يُقبل رمزٌ ملتصق بأرقام أخرى، ولا بلا «القسم»، ولا رمز قسمٍ آخر");

/* ── رمزٌ أخطأت القراءة رقماً منه (263 ← 203): يُعرض للمراجعة ولا يُطبَّق ── */
{
  const cat = ["254", "255", "262", "263", "264", "301"].map((code, index) => ({ id: index + 1, code: `0101${code}` }));
  const rows3: Row[] = [["254", [1, 70, 0, 70, 1, 1]], ["255", [1, 70, 0, 70, 1, 1]], ["262", [1, 140, 0, 140, 2, 1]], ["203", [70, 90, 0, 90, 1, 70]], ["264", [1, 70, 0, 70, 1, 1]], ["301", [1, 70, 0, 70, 1, 1]]];
  const sr = readRemainingReport([page(0, rows3)], cat, "0101");
  const sa = assessRemainingImport(sr, context);
  check(sr.rows.length === 5 && sr.suspects?.length === 1 && sr.suspects[0].courseId === 4 && sr.suspects[0].read === "203" && sr.suspects[0].expected === "0101263",
    "سطرٌ رمزه 203 بين 262 و264 يخالف 263 الغائب برقمٍ واحد: يُعدّ مشتبهاً به");
  check(!sr.missing.includes(4) && !sr.foreign.includes("203") && sa.reject === null && sa.read === 5, "ولا يُحسب غائباً ولا غريباً، ولا يدخل المقروء");
  const col = sr.column!;
  let sp = planRemainingApply(sr, col, {}, {}, [], sr.suspects);
  check(!("4" in sp.next) && sp.total === 5 && sp.untouched.includes(4), "لا تُطبَّق قيمته قبل التأكيد");
  sp = planRemainingApply(sr, col, {}, {}, [4], sr.suspects);
  check(sp.next["4"] === 70 && sp.total === 6, "وبعد تأكيد المستخدم تُطبَّق قيمته (70 من «لم يسجلوا»، لا 90 المقاعد) للمقرر 263");
  /* خارج ترتيب الجارين ← لا اشتباه. */
  const outOfOrder = readRemainingReport([page(0, [["254", [1, 70, 0, 70, 1, 1]], ["255", [1, 70, 0, 70, 1, 1]], ["301", [1, 70, 0, 70, 1, 1]], ["203", [9, 70, 0, 70, 1, 9]], ["264", [1, 70, 0, 70, 1, 1]], ["262", [1, 70, 0, 70, 1, 1]]])], cat, "0101");
  check(!outOfOrder.suspects?.length && outOfOrder.foreign.includes("203") && outOfOrder.missing.includes(4), "رمزٌ شبيه لكنه ليس بين جارَي المقرر الغائب: يبقى غريباً");
  /* يخالف برقمين ← لا اشتباه. */
  const twoDigits = readRemainingReport([page(0, [["254", [1, 70, 0, 70, 1, 1]], ["262", [1, 70, 0, 70, 1, 1]], ["204", [9, 70, 0, 70, 1, 9]], ["264", [1, 70, 0, 70, 1, 1]]])], cat, "0101");
  check(!twoDigits.suspects?.length, "ويخالف برقمين: لا اشتباه");
}

/* ── قسمٌ آخر ── */
r = readRemainingReport(clear, catalogue, "0101");
a = assessRemainingImport(r, { ...context, headerText: "رمز القسم العلمي 0102 اللغة العربية" });
check(Boolean(a.reject?.includes("لقسمٍ آخر") && a.reject.includes("0102") && a.reject.includes("التربية الإسلامية") && a.reject.includes("0101")) && a.detectedDepartment === "0102",
  `ترويسة قسمٍ آخر: يُرفض قبل التطبيق ويُسمّى القسمان — ${a.reject}`);
const otherDept = [page(0, [["0102102", [1390, 1336, 0, 1336, 19, 1390]], ["0102201", [376, 256, 6, 250, 9, 370]], ["0102254", [1, 2, 0, 2, 1, 1]]])];
r = readRemainingReport(otherDept, catalogue, "0101");
a = assessRemainingImport(r, { departmentCode: "0101", departmentName: "التربية الإسلامية" });
check(Boolean(a.reject?.includes("0102")) && a.detectedDepartment === "0102" && r.rows.length === 0, "بلا ترويسة: القسم يُعرف من بادئة الرموز (0102) فيُرفض");
check(detectReportDepartment("", ["0101102", "0101201"]) === "0101" && detectReportDepartment("", ["102"]) === undefined, "استنتاج القسم من الرموز الكاملة فقط");

/* ── كشفٌ بلا عمود «اعداد الذين لم يسجلوا» ← رفض، لا بديل («المقاعد المتبقية» ولا «لم يجتازوا») ── */
const noUnregistered = [page(0, [["0101102", [1390, 1336, 0, 1336, 19, 1390]], ["0101201", [376, 256, 6, 250, 9, 370]]]).filter(cell => cell.text !== "اعداد الذين لم يسجلوا" && !(Math.abs((cell.x0 + cell.x1) / 2 - X.unregistered) < 0.01))];
r = readRemainingReport(noUnregistered, catalogue, "0101");
a = assessRemainingImport(r, context);
check(r.column === null && r.columns.some(c => c.kind === "seats") && Boolean(a.reject?.includes("«الذين لم يسجلوا»")),
  "لا عمود «اعداد الذين لم يسجلوا»: يُرفض ولا يؤخذ «المقاعد المتبقية» (وهو موجود) بدله");

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
  check(mixedReading.rows.length === 6 && !Object.values(values).includes(99) && !Object.values(values).includes(5), "مقررات خارج القسم لا تُستورد ولا تختلط قيمها بمقررات القسم");
  check(mixedReading.foreign.length === 2, "وتُذكر للعلم فقط");
  check(mixedAssessment.reject === null && mixedAssessment.notes.length === 0, "ولا تمنع الاستيراد ولا تُعدّ سطراً ناقصاً");
}

/* ── «الذين لم يسجلوا» من كشفٍ حقيقي (SWRS136، تكنولوجيا التعليم 0109): السالب = المسجّلون أكثر ممن لم يجتازوا ── */
{
  check(signedCount("-6") === -6 && signedCount("6-") === -6 && signedCount("−22") === -22 && signedCount("‎-89‎") === -89
    && signedCount("٤٥") === 45 && signedCount("-0") === 0 && signedCount("-6-") === null && signedCount("6a") === null,
    "عددٌ بإشارته: «-6» و«6-» و«−22» سالبة، والهندية موجبة، وما سواها لا شيء");
  const codes = ["105","106","107","108","110","111","112","113","114","125","135","145","148","150","198","199","210","212","213","215","217","225","227","232","235","237","244","247","258","265","268","275","314","324","334","344","345","354","434","437","444","445","458","464","468","491","499"];
  const realCatalogue = codes.map((code, index) => ({ id: index + 1, code: `0109${code}` }));
  const id = (code: string) => String(codes.indexOf(code) + 1);
  const real = await readReportCells(fs.readFileSync("tests/fixtures/swrs136/negative-seats.pdf"));
  const reading = readRemainingReport(real.pages, realCatalogue, "0109");
  const judged = assessRemainingImport(reading, { departmentCode: "0109", departmentName: "تكنولوجيا التعليم", headerText: real.headerText });
  const values = remainingValues(reading, reading.column!);
  check(judged.reject === null && judged.unread.length === 0 && judged.read === 35 && judged.noSections.length === 12,
    "الكشف الحقيقي: كل مقررٍ له شعب يُقرأ (35)، لا خانة «لم تُقرأ»، و12 بلا شعب");
  check(reading.columns[reading.column!]?.kind === "unregistered", "عمود التخطيط في الكشف الحقيقي: «اعداد الذين لم يسجلوا»");
  check(values[id("105")] === -89 && values[id("150")] === -23,
    "«الذين لم يسجلوا» السالب يُقرأ بإشارته (105: −89 = 6 − 95، 150: −23 = 223 − 246)");
  check(values[id("112")] === 175 && values[id("113")] === 528 && values[id("125")] === 268 && values[id("212")] === 1315
    && values[id("217")] === 334 && values[id("499")] === 3 && values[id("468")] === 0,
    "والموجب والصفر كما طُبعا (113: 528، 125: 268، 212: 1315، 468: 0) — لا من «المقاعد المتبقية» (−6، −22، 2، 15)");
  check(!Object.values(reading.rows).some(row => row.doubt), "لا صفّ يخالف حساب الكشف (لم يجتازوا − المسجلين)");
  const plan = planRemainingApply(reading, reading.column!);
  check(plan.total === 35 && plan.next[id("105")] === -89 && plan.next[id("125")] === 268 && plan.untouched.length === 12, "التطبيق يكتب السالب كما هو، ولا يمسّ ما لا شعب له");

  /* صورةٌ تُقرأ بالأرقام وحدها تُسقط الإشارة: يعيدها حساب الكشف حين يطابق المقدار تماماً. */
  const scanned = readRemainingReport([page(0, [["0101102", [6, 140, 95, 45, 2, 89]], ["0101201", [6, 140, 95, 45, 2, 88]], ["0101254", [6, 140, 95, 45, 2, 0]], ["0101310", [526, 390, 351, 39, 5, 175]], ["0101120", [526, 390, 351, 39, 5, 157]]])], catalogue, "0101");
  const sv = remainingValues(scanned, scanned.column!);
  check(sv["1"] === -89 && !("3" in sv) && sv["4"] === 0 && sv["6"] === 175 && !("2" in sv),
    "إشارةٌ سقطت (89 والحساب 6 − 95 = −89) تُعاد؛ ومقدارٌ مخالف (88، و157 بدل 175) يُوقف للمراجعة؛ وصفرٌ مقصوص مقبول");
  check(scanned.rows.find(row => row.courseId === 3)?.doubt?.derived === -89 && scanned.rows.find(row => row.courseId === 2)?.doubt?.derived === 175,
    "والمخالف يُذكر بحساب الكشف (لم يجتازوا − المسجلين)، لا بالسعة − المسجلين");
  check(manualRemainingValue("-6") === -6 && manualRemainingValue("−6") === -6, "قيمةٌ يدوية سالبة تُقبل كما يطبعها الكشف");

  /* الاقتراح: «لم يسجلوا» صفرٌ أو سالب = لا متأخرين — يُقترح المعتاد، لا «لا شعب» ولا زيادة. */
  const hist = [{ termName: "الفصل الأول 2025-2026", sections: 2 }, { termName: "الفصل الأول 2024-2025", sections: 2 }];
  const none = suggestSectionCount(-89, 40, hist);
  check(none.min === 2 && none.max === 2 && none.suggested === 2 && none.basis === "history" && none.reason.includes("لا متأخرين") && none.headline !== "لا شعب",
    "متبقٍّ −89 بسعة 40 وتاريخ شعبتين: المعتاد (2) بلا زيادة، و«لا متأخرين» — لا «لا شعب»");
  const zero = suggestSectionCount(0, 40, hist);
  check(zero.min === 2 && zero.max === 2 && zero.suggested === 2 && zero.basis === "history" && zero.reason.includes("لا متأخرين"),
    "والصفر بتاريخٍ: المعتاد كذلك (2)، لا «لا شعب»");
  const fresh = suggestSectionCount(-90, 40, []);
  check(fresh.suggested === 0 && fresh.min === 0 && fresh.max === 0 && fresh.basis === "empty" && fresh.headline === "لا شعب" && fresh.reason.includes("لا متأخرين"),
    "بلا تاريخ ومتبقٍّ سالب: «لا شعب» (لا متأخرين) — لا زيادة تُستوعب");
  check(suggestSectionCount(0, 40, []).headline === "لا شعب" && suggestSectionCount(0, 40, []).reason.includes("لا متأخرين"), "والصفر بلا تاريخ: «لا شعب»");
  const some = suggestSectionCount(30, 40, hist);
  check(some.basis === "history" && some.min === 1 && some.reason.includes("المتبقي 30 تكفيه"),
    "متبقٍّ موجب أقل من المعتاد (30 ÷ 40 ← شعبة): المدى ينزل إليه ويُقال «المتبقي 30 تكفيه»");
}

console.log(`\nSection planning import audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
