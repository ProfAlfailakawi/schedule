/**
 * اقتراحُ عدد الشعب من «المتبقي» (كشف عمادة التسجيل PDF)، ورمزُ QR لجدول الطلبة (المعتمد، الفصل الجاري).
 */
import fs from "fs";
import { departmentLoadWarning, departmentTypicalTotal, historicalBaseline, NO_HISTORY_MAX, rangeLabel, remainingBacklog, suggestSectionCount } from "../src/utils/sectionCountSuggestion";
import { blankSpots, columnKind, labelLooksRemaining, readRemainingReport, readReportHeader, remainingOf, remainingValues } from "../src/utils/remainingReport";
import { readReportCells } from "../src/utils/documentOcr";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };

/* ── مدىً يرسيه التاريخ، و«المتبقي» يميل به ولا يقوده ── */
const firsts = [
  { termName: "الفصل الأول 2025/2026", sections: 3, similar: true },
  { termName: "الفصل الأول 2024/2025", sections: 3, similar: true },
  { termName: "الفصل الأول 2023/2024", sections: 2, similar: true },
  { termName: "الفصل الصيفي 2025/2026", sections: 1, similar: false },
];
const base = historicalBaseline(firsts)!;
check(base.sections === 3 && base.label.includes("آخر 3 فصول أولى") && base.remaining === null, `الأساس الموزون: 3 شعب (${base.label})`);

/* المتبقي وعاءُ من يحتاج المقرر لا عددُ من سيسجّله: لا يُقسم على السعة. */
let s = suggestSectionCount(15000, 50, firsts);
check(s.min === 3 && s.max === 3 && s.suggested === 3 && s.reason.includes("لا مقارنة بفصلٍ سابق بعد"),
  `متبقٍّ ضخم بلا مقارنة: التاريخ يقود — ${s.headline} · ${s.reason}`);
s = suggestSectionCount(null, 50, firsts);
check(s.min === 3 && s.max === 3 && s.reason.includes("لم يُستورد المتبقي"), "قبل استيراد الكشف: الأساس وحده، ويُقال ذلك");
s = suggestSectionCount(0, 50, firsts);
check(s.min === 3 && s.max === 3 && s.suggested === 3 && s.basis === "history" && s.reason.includes("لا متأخرين"), "لم يسجلوا = 0 بتاريخٍ: لا متأخرين ← المعتاد (3)، لا «لا شعب» ولا زيادة");
s = suggestSectionCount(-40, 50, firsts);
check(s.min === 3 && s.max === 3 && s.suggested === 3 && s.basis === "history" && s.reason.includes("لا متأخرين") && s.reason.includes("40"), "لم يسجلوا سالب (−40) بتاريخٍ: لا متأخرين ← المعتاد (3) ويُذكر الفرق");
s = suggestSectionCount(0, 50, []);
check(s.suggested === 0 && s.min === 0 && s.max === 0 && s.basis === "empty" && s.headline === "لا شعب" && s.reason.includes("لا متأخرين"), "لم يسجلوا = 0 بلا تاريخ ← لا شعب");

/* السقف: المتبقي كلّه لا يملأ أكثر من ⌈المتبقي ÷ السعة⌉. */
const fours = [{ termName: "الفصل الأول 2025/2026", sections: 4, similar: true }, { termName: "الفصل الأول 2024/2025", sections: 4, similar: true }];
s = suggestSectionCount(50, 40, fours);
check(s.min === 2 && s.max === 4 && s.suggested === 4 && s.reason.includes("المتبقي 50 تكفيه شعبتان") && s.reason.includes("قد يخدم المقرر أقساماً أخرى"),
  `متبقٍّ يملأ أقل من التاريخ (مقرر خدمة كـ«الثقافة الإسلامية»: 54 متبقياً و19 شعبة): التاريخ يبقى ويُقال — ${s.reason}`);
s = suggestSectionCount(54, 70, [{ termName: "الفصل الثاني 2023/2024", sections: 19, similar: true }]);
check(s.suggested === 19 && s.min === 1 && s.max === 19 && s.reason.includes("المتبقي 54 تكفيه شعبة"), "102: التاريخ يبقى مقترحاً، والمدى ينزل إلى ما يكفيه المتبقي ويُقال — لا يُهمل");
check(suggestSectionCount(400, 40, fours).max === 4, "متبقٍّ واسع لا يرفع الاقتراح فوق التاريخ بلا مقارنة");
const growing4 = [{ termName: "الفصل الأول 2025/2026", sections: 4, remaining: 100, similar: true }];
s = suggestSectionCount(160, 40, growing4);
check(s.max === 4 && s.suggested === 4, `الميل صعوداً لا يتجاوز ما يملؤه المتبقي كلّه (160 ÷ 40 = 4): ${s.headline}`);

/* الميل: المتبقي مقارناً بنفسه في الفصول المماثلة. */
const withPool = [
  { termName: "الفصل الأول 2025/2026", sections: 4, remaining: 200, similar: true },
  { termName: "الفصل الأول 2024/2025", sections: 4, remaining: 200, similar: true },
];
s = suggestSectionCount(240, 40, withPool);
check(s.min === 4 && s.max === 5 && s.suggested === 5 && s.reason.includes("أعلى من المعتاد (200) بـ20٪"), `أعلى بـ20٪ ← ${s.headline} · ${s.reason}`);
s = suggestSectionCount(140, 40, withPool);
check(s.min === 3 && s.max === 4 && s.suggested === 3 && s.reason.includes("أقل من المعتاد"), `أقل بـ30٪ ← ${s.headline}`);
s = suggestSectionCount(205, 40, withPool);
check(s.min === 4 && s.max === 4 && s.reason.includes("في حدود المعتاد"), "في حدود المعتاد ← الأساس");
const fifteen = [{ termName: "الفصل الأول 2025/2026", sections: 15, remaining: 600, similar: true }, { termName: "الفصل الأول 2024/2025", sections: 15, remaining: 600, similar: true }];
check(suggestSectionCount(5000, 50, fifteen).max === 17 && suggestSectionCount(100, 0, fifteen).min === 13, "أساس 15: الميل ±2 لا أكثر");
check(suggestSectionCount(5000, 50, fifteen).headline === "يُقترح هذا الفصل 15 إلى 17 شعبة", "صيغة المدى في المثال");

/* مقررٌ لم يُفتح. */
s = suggestSectionCount(200, 40, []);
check(s.min === 1 && s.max === 5 && s.suggested === 1 && s.reason.includes("لا تاريخ لهذا المقرر") && s.reason.includes("يُبدأ بشعبة واحدة"), `بلا تاريخ: ${s.headline} · ${s.reason}`);
check(suggestSectionCount(15000, 50, []).max === NO_HISTORY_MAX, `بلا تاريخ: مسقوفٌ عند ${NO_HISTORY_MAX}`);
const neverOpened = [{ termName: "الفصل الأول 2025/2026", sections: 0, similar: true }, { termName: "الفصل الأول 2024/2025", sections: 0, similar: true }];
check(suggestSectionCount(35, 40, neverOpened).reason.startsWith("لم يُفتح في آخر فصلين"), "للقسم جداول والمقرر لم يُفتح: «لم يُفتح في آخر فصلين» لا «لا تاريخ»");
check(suggestSectionCount(50, 0, []).suggested === null && suggestSectionCount(null, 40, []).suggested === null, "لا تاريخ ولا سعة (أو لا متبقي) ← لا اقتراح");
check(rangeLabel(15, 16) === "يُقترح هذا الفصل 15 إلى 16 شعبة", "صيغة المدى");

/* الطلبة يتراكمون: المتبقي يزيد في الفصول المماثلة فصلاً بعد فصل. */
const growing = [{ termName: "الفصل الأول 2025/2026", sections: 2, remaining: 210, similar: true }, { termName: "الفصل الأول 2024/2025", sections: 2, remaining: 180, similar: true }];
check(remainingBacklog(240, growing).includes("180 ← 210 ← 240") && Boolean(suggestSectionCount(240, 40, growing).backlog), "تراكمٌ للفصل الثالث يُنبَّه عليه");
check(remainingBacklog(200, growing) === "" && remainingBacklog(240, growing.slice(0, 1)) === "", "ولا تنبيه بلا تزايدٍ متصل أو بلا فصلين سابقين");

/* ── القسم كله ── */
const dept = [{ termName: "الفصل الأول 2025/2026", sections: 30, instructors: 12, halls: 8, similar: true }, { termName: "الفصل الثاني 2025/2026", sections: 26, instructors: 11, halls: 7, similar: false }];
check(departmentTypicalTotal(dept) === 30, "المعتاد للقسم من الفصول المماثلة");
check(departmentLoadWarning(30, dept) === "" && departmentLoadWarning(41, dept).includes("يتجاوز أعلى ما شغّله القسم"), "مجموعٌ فوق أعلى ما شغّله القسم يُنبَّه عليه");

/* ── قراءة كشف المتبقي ── */
const catalogue = [{ id: 1, code: "101" }, { id: 2, code: "102" }, { id: 3, code: "210" }, { id: 4, code: "315" }, { id: 5, code: "499" }];
const line = (y: number, code: string, registered: string, left: string) => [
  { text: code, x0: 0.85, x1: 0.95, y }, { text: "اسم المقرر", x0: 0.55, x1: 0.8, y },
  { text: registered, x0: 0.38, x1: 0.42, y }, { text: left, x0: 0.18, x1: 0.22, y },
];
const page = [
  { text: "كشف المتبقي للمقررات الدراسية — الفصل الأول", x0: 0.2, x1: 0.8, y: 0.05 },
  { text: "رقم المقرر", x0: 0.85, x1: 0.95, y: 0.1 }, { text: "المسجلين", x0: 0.36, x1: 0.44, y: 0.1 }, { text: "المتبقي", x0: 0.16, x1: 0.24, y: 0.1 },
  ...line(0.15, "0101101", "40", "120"), ...line(0.18, "0101102", "30", "102"), ...line(0.21, "٠١٠١٢١٠", "10", "٤٥"),
  ...line(0.24, "0101210", "1", "5"), ...line(0.27, "0102101", "9", "99"),
];
let r = readRemainingReport([page], catalogue, "0101");
check(r.column != null && r.columns[r.column].label === "المتبقي", "عمود «المتبقي» يُختار بعنوانه (لا «المسجلين»، ولا عنوان الكشف العريض)");
let values = remainingValues(r, r.column!);
check(values["1"] === 120 && values["2"] === 102 && values["3"] === 50, "الرمز الكامل 0101102 ↔ 102، والأرقام الهندية تُقرأ، والمكرّر يُجمع (45 + 5)");
check(r.rows.find(row => row.courseId === 3)?.occurrences === 2, "والمكرّر يُذكر عدد مرّاته");
check(r.foreign.includes("0102101") && !("5" in values) && r.missing.includes(4) && r.missing.includes(5), "رمز قسمٍ آخر لا يُستورد ويُذكر، ومقررات القسم الغائبة تُذكر");
const shortCodes = [...line(0.15, "101", "3", "102"), ...line(0.18, "102", "4", "210"), ...line(0.21, "210", "2", "7")];
r = readRemainingReport([shortCodes], catalogue, "0101");
values = remainingValues(r, r.columns.find(column => column.samples.includes(102))!.id);
check(r.column === null && values["1"] === 102 && values["2"] === 210 && values["3"] === 7, "كشفٌ بثلاث خانات وبلا عنوان: عمود الرمز حيث تتجمّع المطابقات، فلا يُحسب «102» المتبقي مقرراً — والقسم يختار العمود");
check(labelLooksRemaining("يقبتملا") && labelLooksRemaining("ا ل م ت ب ق ي") && !labelLooksRemaining("المسجلين"), "العنوان يُعرف معكوساً ومقطّعاً حرفاً حرفاً");
const gap = [...line(0.15, "0101101", "40", "120"), ...line(0.18, "0101102", "30", "102"), { text: "0101315", x0: 0.85, x1: 0.95, y: 0.21 }, { text: "0", x0: 0.39, x1: 0.41, y: 0.21 }];
const spots = blankSpots([gap], catalogue, "0101");
check(spots.length === 1 && Math.abs(spots[0].y - 0.21) < 0.001 && Math.abs(spots[0].x - 0.2) < 0.01, "الخانة الفارغة تحت عمود الأرقام تُسمّى لتُعاد قراءتها (العدد المنفرد في المسح)");

/* ── كشف العمادة الحقيقي SWRS136 (التربية الإسلامية، صورتا هاتف) ──
   الأعمدة من اليمين: المقرر · اسم المقرر · لم يجتازوا في بداية التسجيل · سعة الشعب
   · عدد المسجلين · المقاعد المتبقية · عدد الشعب · اعداد الذين لم يسجلوا. */
check(columnKind("اعداد الذين لم يسجلوا") === "unregistered" && columnKind("اعدد انين أم يسجلرا") === "unregistered",
  "«الذين لم يسجلوا» يُعرف ولو شوّهته القراءة الضوئية");
check(columnKind("اعداد الطلبة لم يجتازوا في بداية التسجيل") === "notPassed" && columnKind("اعداد الطلبة لم يجتاروآ في بدلية التسجيل") === "notPassed",
  "«لم يجتازوا في بداية التسجيل» يُعرف ولو شوّهته القراءة");
check(columnKind("المقاعد المتبقية") === "seats" && labelLooksRemaining("اعداد الذين لم يسجلوا") && labelLooksRemaining("اعدد انين أم يسجلرا")
  && !labelLooksRemaining("المقاعد المتبقية") && !labelLooksRemaining("لم يجتازوا")
  && columnKind("عدد المسجلين") === "registered" && columnKind("سعة الشعب") === "capacity" && columnKind("عدد الشعب") === "sections",
  "«اعداد الذين لم يسجلوا» هو مدخل التخطيط، و«المقاعد المتبقية»/«لم يجتازوا» ليستا بديلاً");
const X = { code: 0.84, name: 0.7, notPassed: 0.6, capacity: 0.53, registered: 0.47, seats: 0.4, sections: 0.34, unregistered: 0.27 };
type Cell = { text: string; x0: number; x1: number; y: number; confidence?: number };
const at = (text: string, x: number, y: number, confidence?: number, width = 0.05): Cell => ({ text, x0: x - width / 2, x1: x + width / 2, y, ...(confidence != null ? { confidence } : {}) });
const swrsPage = (shift: number, rows: Array<[string, Array<number | null>, number?, number?]>): Cell[] => [
  at("احصائية بعدد الطلبة الذين لم يجتازوا المقرر ومسجلين بقوائم الانتظار في الفصل 202420", 0.5, 0.05, undefined, 0.6),
  at("المقرر", X.code + shift, 0.2), at("اسم المقرر", X.name + shift, 0.2, undefined, 0.16),
  at("اعداد الطلبة لم يجتازوا", X.notPassed + shift, 0.195), at("في بداية التسجيل", X.notPassed + shift, 0.212),
  at("سعة الشعب", X.capacity + shift, 0.2), at("عدد المسجلين", X.registered + shift, 0.2), at("المقاعد المتبقية", X.seats + shift, 0.2),
  at("عدد الشعب", X.sections + shift, 0.2), at("اعداد الذين لم يسجلوا", X.unregistered + shift, 0.2),
  ...rows.flatMap(([code, values, low, lowAt], index) => {
    const y = 0.25 + index * 0.03;
    const xs = [X.notPassed, X.capacity, X.registered, X.seats, X.sections, X.unregistered];
    return [at(code, X.code + shift, y), at("اسم", X.name + shift, y, undefined, 0.16),
      ...values.flatMap((value, column) => value == null ? [] : [at(String(value), xs[column] + shift, y, column === lowAt ? low : 92)])];
  }),
];
const islCatalogue = ["102", "120", "201", "254", "255"].map((code, index) => ({ id: index + 1, code: `0101${code}` }));
const swrs = [
  swrsPage(0, [["102", [1390, 1336, 0, 1336, 19, 1390]], ["120", [297, null, null, null, 0, null]], ["201", [370, 256, 0, 256, 9, 370], 55, 5]]),
  swrsPage(0.035, [["254", [48, 210, 0, 210, 3, 48]], ["255", [35, null, null, null, 0, null]]]),
];
r = readRemainingReport(swrs, islCatalogue, "0101");
check(r.column != null && r.columns[r.column].kind === "unregistered" && r.fallback === null,
  "SWRS136: مدخل التخطيط = «اعداد الذين لم يسجلوا» — لا «المقاعد المتبقية» ولا «لم يجتازوا»، ولا بديل");
check(r.columns.length === 6 && r.rows.length === 5, "صورتا صفحتين بتأطيرٍ مختلف تتطابق أعمدتهما بترتيبها");
values = remainingValues(r, r.column!);
check(values["1"] === 1390 && values["3"] === 370 && values["4"] === 48, "القيم من «اعداد الذين لم يسجلوا» نفسه (1390، 370 بثقة 55 على الحدّ، 48) — لا من «المقاعد المتبقية» (1336، 256، 210)");
check(!("2" in values) && !("5" in values) && remainingOf(r.rows.find(row => row.courseId === 2)!, r.column!).state === "noSections",
  "مقررٌ بلا شعب في الكشف (120، 255): لا قيمة — لا يؤخذ «لم يجتازوا» بدلها");
/* مراجعة Codex على #184 — بمعنى «اعداد الذين لم يسجلوا» */
const missedCell = [swrsPage(0, [["102", [1390, 1336, 0, 1336, 19, null]], ["201", [570, 256, 0, 256, 9, 570]]])];
r = readRemainingReport(missedCell, islCatalogue, "0101");
values = remainingValues(r, r.column!);
check(!("1" in values) && values["3"] === 570 && remainingOf(r.rows.find(row => row.courseId === 1)!, r.column!).state === "unread",
  "خانة «الذين لم يسجلوا» لم تُقرأ في صفٍّ مكتمل: لا تُخمَّن من عمودٍ مجاور ولا من «لم يجتازوا − المسجلين» — تبقى «لم تُقرأ»");
const mismatch = [swrsPage(0, [["102", [1390, 1336, 0, 1336, 19, 1440]], ["201", [570, 256, 0, 256, 9, 570]]])];
r = readRemainingReport(mismatch, islCatalogue, "0101");
check(r.rows.find(row => row.courseId === 1)?.doubt?.derived === 1390 && r.rows.find(row => row.courseId === 1)?.doubt?.read === 1440 && !("1" in remainingValues(r, r.column!))
  && remainingValues(r, r.column!)["3"] === 570,
  "حساب الكشف يفحص القراءة: 1440 ≠ 1390 − 0 (لم يجتازوا − المسجلين) ← لا تُعتمد (ولا يؤخذ الحساب بدلها)");
const seatsDisagree = [swrsPage(0, [["102", [1390, 1336, 0, 1300, 19, 1390]]])];
r = readRemainingReport(seatsDisagree, islCatalogue, "0101");
check(!r.rows.some(row => row.doubt) && remainingValues(r, r.column!)["1"] === 1390,
  "«المقاعد المتبقية» المخالفة للسعة − المسجلين لا تمسّ مدخل التخطيط (عمودٌ لا يُبنى عليه)");
const shapes = [
  swrsPage(0, [["102", [1390, 1336, 0, 1336, 19, 1390]], ["201", [570, 256, 0, 256, 9, 570]]]),
  swrsPage(0.035, [["254", [48, 210, 0, null, 3, 48]], ["255", [35, 70, 0, null, 1, 35]]]),
];
r = readRemainingReport(shapes, islCatalogue, "0101");
const notPassedColumn = r.columns.find(item => item.kind === "notPassed")!;
check(r.columns.filter(item => item.kind === "notPassed").length === 1 && r.columns.filter(item => item.kind === "unregistered").length === 1
  && r.rows.find(row => row.courseId === 4)?.values[notPassedColumn.id] === 48
  && remainingValues(r, r.column!)["5"] === 35 && remainingValues(r, r.column!)["1"] === 1390,
  "صفحةٌ خلا فيها عمودٌ من الأرقام («المقاعد المتبقية») وتأطيرها مختلف: أعمدتها تُعرف بعناوينها ولا تتفرّق");
const noRegistered = [swrsPage(0, [["201", [570, 256, null, 256, 9, 370]], ["102", [1390, 1336, null, 1336, 19, 54]]])
  .filter(cell => cell.text !== "عدد المسجلين")];
r = readRemainingReport(noRegistered, islCatalogue, "0101");
check(!r.rows.some(row => row.doubt), "لا يُفحص الحساب بلا «عدد المسجلين» مقروءاً — لا يُفترض صفراً");
const noNotPassed = [swrsPage(0, [["201", [null, 256, 6, 250, 9, 370]], ["102", [null, 1336, 0, 1336, 19, 54]]])
  .filter(cell => !/لم يجتازوا|في بداية التسجيل/.test(cell.text))];
r = readRemainingReport(noNotPassed, islCatalogue, "0101");
check(r.column != null && !r.rows.some(row => row.doubt) && remainingValues(r, r.column)["3"] === 370,
  "ولا بلا «لم يجتازوا» مقروءاً — ولا تُستبدل به السعة");

/* مراجعة Codex على #185 */
const wholeColumnMissed = [
  swrsPage(0, [["102", [1390, 1336, 0, 1336, 19, 1390]], ["201", [570, 256, 0, 256, 9, 570]]]),
  swrsPage(0.035, [["254", [48, 210, 0, 210, 3, null]], ["255", [35, 70, 0, 70, 1, null]]]),
];
const rescue = blankSpots(wholeColumnMissed, islCatalogue, "0101").filter(spot => spot.page === 1);
check(rescue.length === 2 && rescue.every(spot => Math.abs(spot.x - (X.unregistered + 0.035)) < 0.01),
  "عمودٌ فاتت القراءةَ خاناتُه كلها في صفحة: موضعه يُعرف بإطار الصفحة فتُعاد قراءة خاناته");

const header = readReportHeader("الفصل الدراسي : 202420 الفصل الدراسي الثاني 2025-2024\nالكلية : 01 كليه التربيه الاساسيه\nرمز القسم العلمي 0101 التربيه الاسلاميه");
check(header.department === "0101" && header.season === "second" && header.years?.[0] === 2024 && header.years?.[1] === 2025, "ترويسة الكشف: القسم 0101 والفصل الثاني 2024/2025");
check(readReportHeader("الفصل الدراسي : 202410").season === "first", "رمز الفصل وحده (202410) يكفي");

/* ── كشفٌ حقيقي PDF (نصّي، RTL، كما يطبعه المتصفح حرفاً حرفاً) ── */
const cells = await readReportCells(fs.readFileSync("tests/fixtures/remaining-report.pdf"));
r = readRemainingReport(cells.pages, catalogue, "0101");
values = r.column == null ? {} : remainingValues(r, r.column);
check(cells.source === "text" && r.columns[r.column ?? -1]?.label === "المتبقي", `كشف PDF: طبقة النص، وعمود «${r.columns[r.column ?? -1]?.label}» بعنوانه`);
check(values["1"] === 120 && values["2"] === 102 && values["3"] === 50 && values["4"] === 8 && r.foreign.includes("0102101"), "كشف PDF: المتبقي لكل مقرر، والمكرّر يُجمع، ورمز القسم الآخر يُترك");

/* ── الواجهة ── */
const ui = fs.readFileSync("src/components/SectionPlanning.tsx", "utf8");
check(ui.includes("courseNumber(a.code) - courseNumber(b.code)"), "الجدول مرتّب برقم المقرر تصاعدياً");
check(ui.includes("استيراد كشف المتبقي (لم يسجلوا)") && ui.includes("/api/registration-stats/remaining-pdf") && ui.includes("planRemainingApply(preview, preview.column, manual, remaining, confirmedSuspects") && ui.includes("تعبئة ${countOf(plan.total, AR.course)}"),
  "«الذين لم يسجلوا» يُستورد ويُراجع قبل التعبئة");
check(ui.includes('accept="application/pdf,.pdf,image/*,.heic,.heif" multiple') && ui.includes("/api/registration-stats/remaining-cells") && ui.includes('"x-report-template"'),
  "PDF أو صور صفحاته (الهاتف): تُقرأ صورةً صورة وتُجمع صفحاتها");
check(ui.includes("الخطة تُبنى على عمود «اعداد الذين لم يسجلوا» من كشف العمادة — المتبقي الإجمالي") && ui.includes("<th>المتبقي (لم يسجلوا)</th>")
  && !ui.includes("<th>المقاعد المتبقية</th>") && ui.includes("تخالف حساب الكشف (لم يجتازوا − المسجلين)"),
  "الواجهة تقول إن الخطة تُبنى على «اعداد الذين لم يسجلوا» المستورد، وحساب الكشف لم يجتازوا − المسجلين");
check(ui.includes('setSource({ fileName: preview.fileName, importedAt: new Date().toISOString(), column: "unregistered" })')
  && ui.includes('if (!source) setSource({ fileName: "إدخال يدوي", importedAt: new Date().toISOString(), column: "unregistered" })') && !ui.includes('column: "seats" })'),
  "التطبيق والإدخال اليدوي بلا كشف يوسمان المصدر «unregistered» — فيُعاد بعد التحميل");
check(!ui.includes("عدد الطلبة المسجّلين") && !ui.includes("counts:"), "لا خانة «المسجّلين» تُكتب يدوياً");
check(ui.includes("keepalive: true") && ui.includes('addEventListener("pagehide"') && ui.includes("window.setTimeout(() => { void persistRef.current(); }, 900)"),
  "يُحفظ وحده، وما بقي معلّقاً يُرسل والشاشة تُغلق — لا أرقام تضيع");
check(ui.includes('value={chosen[key] ?? ""}') && ui.includes("placeholder={suggestion.suggested == null") && ui.includes("const pick = explicit ? Number(chosen[key]) : suggestion.suggested"),
  "خانة المختار الفارغة تُظهر المقترح وتُحسب به — لا خانة فارغة محسوبة خفيةً");
check(ui.includes("خارج المدى") && ui.includes("is-outside"), "اختيارٌ خارج المدى بعد تغيّر المتبقي يُعلَّم، وفي التقرير");
check(ui.includes('replace(/[أإآٱ]/g, "ا")') && ui.includes(".toLowerCase()"), "البحث لا يتعثّر بالهمزات وحالة الأحرف");
check(ui.includes("التقرير والطباعة") && ui.includes('dataset.printKind = "section-plan"') && ui.includes("<PrintPortal") && fs.readFileSync("src/styles/08-print.css", "utf8").includes('html[data-print-kind="section-plan"]'),
  "التقرير يُطبع بمنفذ الطباعة المعتاد، ومعه مصدر المتبقي");

/* ── الربط: المستودع والخادم والواجهة ── */
const server = fs.readFileSync("server.ts", "utf8");
const repo = fs.readFileSync("src/db/repository.ts", "utf8");
check(repo.includes("getRegistrationStats: async") && repo.includes("saveRegistrationStats: async") && repo.includes('collection("registrationStats")'), "الإحصاء يُحفظ عبر المستودع (Firestore والمحلي)");
check(repo.includes("input.counts ?? previous?.counts") && repo.includes("remaining: Object.fromEntries(Object.entries(clean(input.remaining, 100000, -100000)).map(([key, value]) => [key, Math.max(0, value)]))")
  && server.includes("Math.max(0, Number(value) || 0)"), "لا متبقٍّ سالب: يُحفظ صفراً، وما حُفظ سالباً قبلُ يُعرض صفراً؛ و«المسجّلين» القديم يبقى كما هو");
check(repo.includes('input.remainingSource.column === "unregistered" || input.remainingSource.column === "seats"'), "وسم العمود يُحفظ كما أُرسل («unregistered»، و«seats» القديم يبقى قديماً)");
check((server.match(/remainingSource\?\.column === "unregistered"/g) || []).length === 6 && !server.includes('remainingSource?.column === "seats"')
  && server.includes('legacyRemaining: stats?.remainingSource?.column !== "unregistered"'),
  "الخادم: «unregistered» وحده مدخل الاقتراح والمقارنة والتوقّع (والشاغر معه)، وما سواه (seats أو بلا وسم) «قديم» لا يُحسب");
check(server.includes("vacant: req.body?.vacant || {}") && repo.includes("vacant: clean(input.vacant, 100000, -100000)"),
  "شاغر الشعب («المقاعد المتبقية») يُحفظ مع الاستيراد بإشارته، للإنذار المبكر وحده");
check(server.includes('app.get("/api/registration-stats", requirePermission(7)') && server.includes('app.put("/api/registration-stats", requirePermission(7)')
  && server.includes('app.post("/api/registration-stats/remaining-pdf", rateLimitDocumentRead, requirePermission(7), express.raw(') && server.includes("documentReadingGate, async (req: AuthenticatedRequest, res: Response) => {\n  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);\n  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: \"حدد الكلية والقسم والفصل\" }); return; }\n  if (!isScopeAllowed(req, collegeId, sectionId))"),
  "أبواب الإحصاء والكشف محميّة بالصلاحية والنطاق، والكشف محدودُ المعدّل وفي طابور قراءة المستندات");
check(server.includes('app.post("/api/registration-stats/remaining-cells", rateLimitDocumentRead, requirePermission(7)') && server.includes("if (!isScopeAllowed(req, collegeId, sectionId))")
  && server.includes('"image/*"], limit: "24mb" })') && server.includes("remainingWarnings(cells.headerText, departmentCode, termName)") && server.includes("imageOrientationRefusal(") && server.includes("assessment.reject"),
  "صفحات الصور تُقرأ معاً بالباب نفسه وحدوده، والصور مقبولة، وترويسة الكشف تُفحص");
const ocr = fs.readFileSync("src/utils/documentOcr.ts", "utf8");
check(ocr.includes("async function ruledReportCells(") && ocr.includes("await deskew(image)") && ocr.includes("straightenTable(lib,surface,geometry)") && ocr.includes('const skipped=new Set<string>([])'),
  "الصورة المسطّرة: تُعدَّل وتُستقام وتُقرأ خانةً خانة، وكل الأعمدة تُقرأ («لم يسجلوا» للتخطيط، «لم يجتازوا» والمسجّلون لفحصه، «المقاعد المتبقية» شاغرٌ للإنذار)");
check(server.includes("termSeasonOf(row.AdTermName) === season") && server.includes("if (!rows.length) continue;"), "الفصول المماثلة: الموسم نفسه، ويُتخطّى الفصل الذي لا جدول فيه للقسم");
check(server.includes("Repository.getCourseTransitions(sectionId)") && server.includes("ancestorsOf(id)") && server.includes("remaining: known.reduce("), "المقرر المعاد ترقيمه يرث شعب سلفه ومتبقّيه");
check(ui.includes("suggestSectionCount("), "الواجهة تستعمل الحساب نفسه");
check(ui.includes('"x-page-sizes": files.map(file => file.size).join(",")') && ui.includes("files.length <= 4 && files.every(isImage)")
  && server.includes('String(req.get("x-page-sizes") || "")') && server.includes("sizes.reduce((sum, size) => sum + size, 0) !== bodyBytes")
  && fs.readFileSync("src/utils/documentOcr.ts", "utf8").includes("return readReportScan(input.map(part=>({buffer:part,mime:reportImageMime(part,\"\")})),false,blanks,firstTemplate);"),
  "صور صفحات الكشف (حتى أربع) تُقرأ في طلبٍ واحد: أعمدتها معاً، وإنقاذ العمود الفائت في كل صورة");
const transfer = fs.readFileSync("src/components/ScheduleTransfer.tsx", "utf8");
check(transfer.includes("const termEnded = termIsArchive(") && (transfer.match(/\{termEnded \? null : \(/g) || []).length === 4 && transfer.includes('if (termEnded && tab !== "export" && tab !== "publish") setTab("export")'),
  "الفصل المنتهي: لا استيراد ولا تخطيط شعب ولا استبدال ولا منتدبون — تصدير ونشر فقط");
check(fs.readFileSync("src/styles/09-details.css", "utf8").includes(".section-plan-row>[data-label]::before{content:attr(data-label)"), "الهاتف: كل مقرر بطاقة بخاناتٍ معنونة");

/* ── رمز QR للطلبة ── */
const studentsApi = server.slice(server.indexOf('app.get("/api/public/students/:token"'), server.indexOf('app.get("/t/:token"'));
check(studentsApi.includes("currentTermId(terms)") && studentsApi.includes("finalOnly: true"), "جدول الطلبة: الفصل الجاري، والمعتمد أولاً");
check(studentsApi.includes("provisional:") && server.includes('id="provisional"'), "جدول الطلبة قبل الاعتماد: يُعرض موسوماً «مبدئي»");
check(server.includes("const rows = options.finalOnly ? await finalRowsOnly(liveRows, termId) : liveRows;"), "finalOnly يمرّ بـ finalRowsOnly");
const publicSchedule = server.slice(server.indexOf('app.get("/api/public/schedule/:token"'), server.indexOf("const TERM_WEEKS"));
check(publicSchedule.includes('resolved.link.kind === "students"'), "رابط الطلبة لا يفتح جدول القسم الحيّ (مسودّة)");
check(server.includes('resolved.link.kind === "survey" || resolved.link.kind === "students"'), "ولا تقويم ICS منه");
check(server.includes('if (resolved.link.kind === "students") {\n    res.redirect(302, `/t/'), "/s/ يحوّل رابط الطلبة إلى /t/");
check(fs.readFileSync("tests/public-pages-syntax-audit.ts", "utf8").includes('"studentSchedulePage"'), "صفحة الطلبة في تدقيق صياغة الصفحات العامة");
const qr = fs.readFileSync("src/components/StudentQrButton.tsx", "utf8");
check(qr.includes('import("../utils/qrcodeGenerator")') && qr.includes('kind: "students"') && qr.includes("print") && qr.includes("toDataURL"), "زرّ QR: توليدٌ في المتصفح، طباعة وتنزيل");

console.log(`\nSection planning & student QR audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
