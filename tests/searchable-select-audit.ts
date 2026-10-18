/**
 * ── قوائم المقررات قابلة للبحث، والرمزُ الوحيد يُعرض مباشرةً ───────────────────────────────
 * البحث يسامح كتابة العربية والأرقام، وكل شاشةٍ تختار مقرراً تستعمل المكوّن نفسه (لا <select> عادياً).
 */
import fs from "fs";
import { filterOptions } from "../src/components/SearchableSelect";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};

const options = [
  { value: 1, label: "الذكاء الاصطناعي في التعليم", hint: "CS330", keywords: "CS330" },
  { value: 2, label: "مقدمة في تكنولوجيا التعلم", hint: "0109112", keywords: "0109112" },
  { value: 3, label: "مقدمة في تكنولوجيا التعليم", hint: "0109113", keywords: "0109113" },
  { value: 4, label: "أسس تكنولوجيا التعلم", hint: "0109105", keywords: "0109105" },
];
const names = (query: string) => filterOptions(options, query).map(option => option.value);

check(names("").length === 4, "بلا كتابة: كل الخيارات");
check(JSON.stringify(names("ذكاء")) === "[1]", "كلمةٌ من الاسم", names("ذكاء"));
check(JSON.stringify(names("اصطناعى")) === "[1]", "الألف المقصورة كالياء (اصطناعى = اصطناعي)", names("اصطناعى"));
check(JSON.stringify(names("اسس")) === "[4]", "الهمزة لا تحجب البحث (اسس = أسس)", names("اسس"));
check(names("112").includes(2) && !names("112").includes(3), "الرمز يجد المقرر", names("112"));
check(JSON.stringify(names("١١٣")) === "[3]", "الأرقام الهندية تعمل كالعربية", names("١١٣"));
check(names("cs330").length === 1 && names("CS 330").length === 1, "الرمز لا يهمّ حالُ حروفه ولا المسافة", [names("cs330"), names("CS 330")]);
check(JSON.stringify(names("تعلم مقدمة")) === "[2]" || names("تعلم مقدمة").includes(2), "كلماتٌ متفرقة بأي ترتيب", names("تعلم مقدمة"));
check(names("ZZZ").length === 0, "ما لا يطابق يختفي");
check(names("مقدمة")[0] === 2 && names("مقدمة").length === 2, "من يبدأ بالكلمة قبل من يحويها", names("مقدمة"));

const read = (file: string) => fs.readFileSync(`src/components/${file}`, "utf8");
const sel = read("SearchableSelect.tsx");
check(sel.includes("autoSingle") && sel.includes("ss-static") && sel.includes("onChange(single.value)"), "الخيار الوحيد يُختار تلقائياً ويُعرض ثابتاً بلا قائمة");
check(sel.includes('stopPropagation') && sel.includes('"Escape"'), "Escape يغلق القائمة وحدها لا النافذة");
check(sel.includes("onClick={event => event.preventDefault()}"), "نقرةٌ داخل القائمة لا تُعاد إلى الزر عبر <label>");

const schedules = read("Schedules.tsx");
const nameAt = schedules.indexOf('guideField="course-name"');
check(nameAt > 0 && schedules.slice(nameAt - 60, nameAt).includes("<SearchableSelect"), "موعد جديد: اسم المقرر قابل للبحث");
check(/<SearchableSelect\s+value=\{form\.AdCourseId \|\| ""\}[\s\S]{0,200}autoSingle/.test(schedules), "موعد جديد: رمزُ المقرر الواحد يُعرض مباشرةً");
check(!/<select[^>]*data-guide-editor-field="course-name"/.test(schedules), "لا <select> قديم لاسم المقرر");
for (const file of ["QuickCreatePopover.tsx", "IntelligenceWorkspace.tsx", "CurriculumPlans.tsx", "ImportPreviewTable.tsx", "PlanReview.tsx", "Reports.tsx"]) {
  const text = read(file);
  check(text.includes("<SearchableSelect") && text.includes('import SearchableSelect from "./SearchableSelect"'), `${file}: اختيار المقرر بالمكوّن القابل للبحث`);
}
check(!/<select[^>]*aria-label="إضافة مقرر"/.test(read("PlanReview.tsx")) && !/<select[^>]*import-course-picker/.test(read("ImportPreviewTable.tsx")), "لا <select> عادي بقي لاختيار مقررٍ في هذه الشاشات");
check(/ariaLabel="المقرر الدراسي"/.test(schedules) && /ariaLabel="رمز المقرر الدراسي"/.test(schedules) && /ariaLabel="المقرر"/.test(read("IntelligenceWorkspace.tsx")) && /ariaLabel="المقرر"/.test(read("QuickCreatePopover.tsx")), "الزر يحمل اسم الحقل لقارئ الشاشة (Field لا يربطه بمكوّنٍ مخصص)");
check(sel.includes("box.current?.contains(event.target)"), "القائمة الثابتة لا تُغلق بتمرير قائمتها نفسها");
check(read("QuickCreatePopover.tsx").includes('querySelector(".ss-pop")'), "Escape داخل قائمة المقرر لا يُلغي بطاقة الإنشاء السريع");

console.log(`\nSearchable select audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
