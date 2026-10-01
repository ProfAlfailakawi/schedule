/**
 * اقتراحُ عدد الشعب من إحصاء التسجيل، ورمزُ QR لجدول الطلبة (المعتمد، الفصل الجاري).
 */
import fs from "fs";
import { historicalPerSection, suggestSectionCount } from "../src/utils/sectionCountSuggestion";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };

/* ── الحساب ── */
const hist = [
  { termName: "الفصل الأول 2025/2026", sections: 3, headcount: 72 },  // 24/شعبة
  { termName: "الفصل الأول 2024/2025", sections: 2, headcount: 60 },  // 30
  { termName: "الفصل الأول 2023/2024", sections: 2, headcount: 36 },  // 18
];
let s = suggestSectionCount(70, 25, hist);
check(s.suggested === 3 && s.basis === "capacity" && s.reason.includes("الفصل الأول 2025/2026"), `السعة: ⌈70÷25⌉ = 3 ويُذكر آخر فصل مماثل — ${s.reason}`);
check(suggestSectionCount(75, 25, []).suggested === 3 && suggestSectionCount(76, 25, []).suggested === 4, "حدّ السعة: 75 ← 3، 76 ← 4");
check(suggestSectionCount(1, 40, []).suggested === 1, "طالبٌ واحد ← شعبةٌ واحدة");
s = suggestSectionCount(0, 25, hist);
check(s.suggested === 0 && s.basis === "empty", "صفرُ طلبة ← صفرُ شعب");
const per = historicalPerSection(hist)!;
check(Math.abs(per - (3 * 24 + 2 * 30 + 1 * 18) / 6) < 1e-9, `المتوسط الموزون 3/2/1 للأقرب = ${per.toFixed(2)}`);
s = suggestSectionCount(50, 0, hist);
check(s.suggested === Math.ceil(50 / Math.round(per)) && s.basis === "history-capacity", `بلا سعة: السعة من التاريخ (${Math.round(per)}) ← ${s.suggested}`);
s = suggestSectionCount(50, null, [{ termName: "الفصل الثاني 2025/2026", sections: 4 }]);
check(s.suggested === 4 && s.basis === "history-sections", "بلا سعة ولا أعداد: عددُ شعب آخر فصلٍ مماثل");
s = suggestSectionCount(50, undefined, []);
check(s.suggested === null && s.basis === "none", "لا سعة ولا تاريخ ← لا اقتراح ويُقال ذلك");
check(suggestSectionCount(50, 0, [{ termName: "x", sections: 0, headcount: 40 }, { termName: "y", sections: 2, headcount: 40 }]).suggested === 3,
  "فصلٌ بلا شعب لا يدخل المتوسط (40÷2=20 ← ⌈50÷20⌉=3)");

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
