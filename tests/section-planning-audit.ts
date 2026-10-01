/**
 * اقتراحُ عدد الشعب من إحصاء التسجيل، ورمزُ QR لجدول الطلبة (المعتمد، الفصل الجاري).
 */
import fs from "fs";
import { departmentLoadWarning, departmentTypicalTotal, historicalBaseline, NO_HISTORY_MAX, rangeLabel, suggestSectionCount } from "../src/utils/sectionCountSuggestion";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };

/* ── مدىً يرسيه التاريخ ── */
const firsts = [
  { termName: "الفصل الأول 2025/2026", sections: 3, headcount: 140, similar: true },
  { termName: "الفصل الأول 2024/2025", sections: 3, headcount: 130, similar: true },
  { termName: "الفصل الأول 2023/2024", sections: 2, headcount: 100, similar: true },
  { termName: "الفصل الصيفي 2025/2026", sections: 1, similar: false },
];
const base = historicalBaseline(firsts)!;
check(base.sections === 3 && base.label.includes("آخر 3 فصول أولى"), `الأساس الموزون: 3 شعب (${base.label})`);

/* ملاحظة صاحب النظام: 15000 طالب وسعة 50 ← لا 300 شعبة، ولا «غير معقول» */
let s = suggestSectionCount(15000, 50, firsts);
check(s.min === 3 && s.max === 4 && s.suggested === 4 && !("warning" in s) && s.headline === "يُقترح هذا الفصل 3 إلى 4 شعب",
  `15000 طالباً: التاريخ يقود — ${s.headline} · ${s.reason}`);
s = suggestSectionCount(15000, 50, []);
check(s.max === NO_HISTORY_MAX && s.min === NO_HISTORY_MAX && s.reason.includes("لا تاريخ لهذا المقرر"), `15000 بلا تاريخ: مدى السعة مسقوفاً عند ${NO_HISTORY_MAX}`);

const fifteen = [{ termName: "الفصل الأول 2025/2026", sections: 15, similar: true }, { termName: "الفصل الأول 2024/2025", sections: 15, similar: true }];
s = suggestSectionCount(800, 50, fifteen);
check(s.headline === "يُقترح هذا الفصل 15 إلى 16 شعبة", `مثال صاحب النظام: ${s.headline}`);
check(suggestSectionCount(5000, 50, fifteen).max === 17, "أساس 15 وتسجيلٌ ضخم: أقصى +2 ← 15 إلى 17");
check(suggestSectionCount(300, 50, fifteen).min === 13 && suggestSectionCount(300, 50, fifteen).max === 15, "تسجيلٌ قليل: أقصى −2 ← 13 إلى 15");
s = suggestSectionCount(190, 50, firsts);
check(s.min === 3 && s.max === 4 && s.reason.includes("فُتحت عادةً 3 شعب") && s.reason.includes("التسجيل أعلى قليلاً"), `أعلى قليلاً — ${s.reason}`);
s = suggestSectionCount(140, 50, firsts);
check(s.min === 3 && s.max === 3 && s.headline === "يُقترح هذا الفصل 3 شعب" && s.reason.includes("في حدود المعتاد"), "في حدود المعتاد ← 3");
check(suggestSectionCount(120, 0, firsts).max === 3 && suggestSectionCount(180, 0, firsts).max === 4, "بلا سعة: متوسط طلبة الشعبة التاريخي (≈43) يقيس الميل");
check(suggestSectionCount(0, 50, firsts).suggested === 0, "صفرُ طلبة ← صفرُ شعب");
const othersOnly = [{ termName: "الفصل الثاني 2025/2026", sections: 2, similar: false }, { termName: "الفصل الأول 2025/2026", sections: 2, similar: false }];
check(historicalBaseline(othersOnly)?.label.includes("أحدث") === true && suggestSectionCount(90, 50, othersOnly).max === 2, "بلا مماثل: أحدث الفصول");
s = suggestSectionCount(76, 25, []);
check(s.min === 3 && s.max === 4 && s.reason.includes("لا تاريخ لهذا المقرر"), "بلا تاريخ: مدى السعة 3 إلى 4");
check(suggestSectionCount(50, 0, []).suggested === null, "لا تاريخ ولا سعة ← لا اقتراح");
check(rangeLabel(15, 16) === "يُقترح هذا الفصل 15 إلى 16 شعبة", "صيغة المدى");

/* ── القسم كله ── */
const dept = [{ termName: "الفصل الأول 2025/2026", sections: 30, instructors: 12, halls: 8, similar: true }, { termName: "الفصل الثاني 2025/2026", sections: 26, instructors: 11, halls: 7, similar: false }];
check(departmentTypicalTotal(dept) === 30, "المعتاد للقسم من الفصول المماثلة");
check(departmentLoadWarning(30, dept) === "" && departmentLoadWarning(41, dept).includes("يتجاوز أعلى ما شغّله القسم"), "مجموعٌ فوق أعلى ما شغّله القسم يُنبَّه عليه");
const ui = fs.readFileSync("src/components/SectionPlanning.tsx", "utf8");
check(ui.includes("courseNumber(a.code) - courseNumber(b.code)"), "الجدول مرتّب برقم المقرر تصاعدياً");
check(ui.includes("حفظ وعرض التقرير") && ui.includes('dataset.printKind = "section-plan"') && ui.includes("<PrintPortal") && fs.readFileSync("src/styles/08-print.css", "utf8").includes('html[data-print-kind="section-plan"]'),
  "«حفظ» يحفظ ويفتح تقريراً يُطبع بمنفذ الطباعة المعتاد");

/* ── الربط: المستودع والخادم والواجهة ── */
const server = fs.readFileSync("server.ts", "utf8");
const repo = fs.readFileSync("src/db/repository.ts", "utf8");
check(repo.includes("getRegistrationStats: async") && repo.includes("saveRegistrationStats: async") && repo.includes('collection("registrationStats")'), "الإحصاء يُحفظ عبر المستودع (Firestore والمحلي)");
check(server.includes('app.get("/api/registration-stats", requirePermission(7)') && server.includes('app.put("/api/registration-stats", requirePermission(7)'), "بابا الإحصاء محميّان بالصلاحية");
check(server.includes("previousYearSameTermName(name)") && server.includes("sameTermName(row.AdTermName, name)"), "الفصول المماثلة: الموسم نفسه في سنواتٍ سابقة");
check(fs.readFileSync("src/components/SectionPlanning.tsx", "utf8").includes("suggestSectionCount("), "الواجهة تستعمل الحساب نفسه");

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
