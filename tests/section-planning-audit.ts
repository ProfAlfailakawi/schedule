/**
 * اقتراحُ عدد الشعب من «المتبقي» (كشف عمادة التسجيل PDF)، ورمزُ QR لجدول الطلبة (المعتمد، الفصل الجاري).
 */
import fs from "fs";
import { departmentLoadWarning, departmentTypicalTotal, historicalBaseline, NO_HISTORY_MAX, rangeLabel, remainingBacklog, suggestSectionCount } from "../src/utils/sectionCountSuggestion";
import { blankSpots, labelLooksRemaining, readRemainingReport, remainingValues } from "../src/utils/remainingReport";
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
check(s.suggested === 0 && s.reason.includes("لا متبقي"), "لا متبقي ← لا شعب");

/* السقف: المتبقي كلّه لا يملأ أكثر من ⌈المتبقي ÷ السعة⌉. */
const fours = [{ termName: "الفصل الأول 2025/2026", sections: 4, similar: true }, { termName: "الفصل الأول 2024/2025", sections: 4, similar: true }];
s = suggestSectionCount(50, 40, fours);
check(s.min === 2 && s.max === 2 && s.suggested === 2 && s.reason.includes("يملأ شعبتين على الأكثر"), `سقف المتبقي: ${s.headline} · ${s.reason}`);
check(suggestSectionCount(400, 40, fours).max === 4, "متبقٍّ واسع لا يرفع السقف فوق التاريخ");

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

/* ── كشفٌ حقيقي PDF (نصّي، RTL، كما يطبعه المتصفح حرفاً حرفاً) ── */
const cells = await readReportCells(fs.readFileSync("tests/fixtures/remaining-report.pdf"));
r = readRemainingReport(cells.pages, catalogue, "0101");
values = r.column == null ? {} : remainingValues(r, r.column);
check(cells.source === "text" && r.columns[r.column ?? -1]?.label === "المتبقي", `كشف PDF: طبقة النص، وعمود «${r.columns[r.column ?? -1]?.label}» بعنوانه`);
check(values["1"] === 120 && values["2"] === 102 && values["3"] === 50 && values["4"] === 8 && r.foreign.includes("0102101"), "كشف PDF: المتبقي لكل مقرر، والمكرّر يُجمع، ورمز القسم الآخر يُترك");

/* ── الواجهة ── */
const ui = fs.readFileSync("src/components/SectionPlanning.tsx", "utf8");
check(ui.includes("courseNumber(a.code) - courseNumber(b.code)"), "الجدول مرتّب برقم المقرر تصاعدياً");
check(ui.includes("استيراد كشف المتبقي (PDF)") && ui.includes("/api/registration-stats/remaining-pdf") && ui.includes("تعبئة المتبقي") && ui.includes("remainingValues(preview, column)"),
  "المتبقي يُستورد من PDF ويُعاين قبل التعبئة");
check(!ui.includes("عدد الطلبة المسجّلين") && !ui.includes("counts:"), "لا خانة «المسجّلين» تُكتب يدوياً");
check(ui.includes("keepalive: true") && ui.includes('addEventListener("pagehide"') && ui.includes("window.setTimeout(() => { void persistRef.current(); }, 900)"),
  "يُحفظ وحده، وما بقي معلّقاً يُرسل والشاشة تُغلق — لا أرقام تضيع");
check(ui.includes('value={chosen[key] ?? ""}') && ui.includes("placeholder={suggestion.suggested == null") && ui.includes("const pick = explicit ? Number(chosen[key]) : suggestion.suggested"),
  "خانة المختار الفارغة تُظهر المقترح وتُحسب به — لا خانة فارغة محسوبة خفيةً");
check(ui.includes("خارج المدى") && ui.includes("is-outside"), "اختيارٌ خارج المدى بعد تغيّر المتبقي يُعلَّم، وفي التقرير");
check(ui.includes('replace(/[أإآٱ]/g, "ا")') && ui.includes(".toLowerCase()"), "البحث لا يتعثّر بالهمزات وحالة الأحرف");
check(ui.includes("عرض التقرير") && ui.includes('dataset.printKind = "section-plan"') && ui.includes("<PrintPortal") && fs.readFileSync("src/styles/08-print.css", "utf8").includes('html[data-print-kind="section-plan"]'),
  "التقرير يُطبع بمنفذ الطباعة المعتاد، ومعه مصدر المتبقي");

/* ── الربط: المستودع والخادم والواجهة ── */
const server = fs.readFileSync("server.ts", "utf8");
const repo = fs.readFileSync("src/db/repository.ts", "utf8");
check(repo.includes("getRegistrationStats: async") && repo.includes("saveRegistrationStats: async") && repo.includes('collection("registrationStats")'), "الإحصاء يُحفظ عبر المستودع (Firestore والمحلي)");
check(repo.includes("input.counts ?? previous?.counts") && repo.includes("remaining: clean(input.remaining, 100000)"), "المتبقي يُحفظ، و«المسجّلين» القديم يبقى كما هو");
check(server.includes('app.get("/api/registration-stats", requirePermission(7)') && server.includes('app.put("/api/registration-stats", requirePermission(7)')
  && server.includes('app.post("/api/registration-stats/remaining-pdf", rateLimitDocumentRead, requirePermission(7), express.raw(') && server.includes("documentReadingGate, async (req: AuthenticatedRequest, res: Response) => {\n  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);\n  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: \"حدد الكلية والقسم والفصل\" }); return; }\n  if (!isScopeAllowed(req, collegeId, sectionId))"),
  "أبواب الإحصاء والكشف محميّة بالصلاحية والنطاق، والكشف محدودُ المعدّل وفي طابور قراءة المستندات");
check(server.includes("termSeasonOf(row.AdTermName) === season") && server.includes("if (!rows.length) continue;"), "الفصول المماثلة: الموسم نفسه، ويُتخطّى الفصل الذي لا جدول فيه للقسم");
check(server.includes("Repository.getCourseTransitions(sectionId)") && server.includes("ancestorsOf(id)") && server.includes("remaining: known.reduce("), "المقرر المعاد ترقيمه يرث شعب سلفه ومتبقّيه");
check(ui.includes("suggestSectionCount("), "الواجهة تستعمل الحساب نفسه");
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
