/** شعبٌ يُفضَّل زيادتها: حسابٌ حتميّ (طلب الطلبة، تخطيط القسم، كشف المتبقي) + عرضٌ هادئ بلا كتابة. */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { planGaps, studentGaps, type GapCourse, type GapPlan } from "../src/utils/sectionGap";
import { SectionGapPanel } from "../src/components/SectionGapNote";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra)); }
};
const c = (id: number, code: string, capacity: number, existing: number, students: number): GapCourse => ({ id, code, name: `مقرر ${code}`, capacity, existing, students });

/* رغبات الطلبة وحدها (إشارة «مساري»): ⌈الطلبة ÷ السعة⌉. 180÷30 = 6 والموجود 5 ← ناقصة 1؛ 90÷30 = 3 والموجود 3 ← كافية. */
const byStudents = studentGaps([c(1, "101", 30, 5, 180), c(2, "102", 30, 3, 90), c(3, "103", 0, 0, 500), c(4, "104", 40, 0, 0), c(5, "105", 25, 1, 101)]);
check(byStudents.map(g => g.id).join() === "5,1", "الطلب ÷ السعة: ‎101 ينقصه 1، ‎105 ينقصه 4 (⌈101÷25⌉−1 = 4)، والترتيب الأكثر نقصاً أولاً", byStudents);
check(byStudents.every(g => g.basis === "students"), "إشارة الطلبة: الأساس طلب الطلبة");
check(!byStudents.some(g => g.id === 3 || g.id === 4), "سعةٌ مجهولة أو طلبٌ صفر ← لا اقتراح مختلق");

/* «مساري» لا شأن له بالتخطيط: بلا مختارٍ ولا كشف لا اقتراح ولو كان الطلبة آلافاً، ومع التخطيط لا يدخل الطلبة في الحساب. */
check(planGaps([c(1, "101", 30, 1, 5000)], null).length === 0 && planGaps([c(1, "101", 30, 1, 5000)], { remaining: {}, accepted: {}, history: {} }).length === 0, "التخطيط: بلا مختارٍ ولا كشف لا شيء ولو كان طلبة «مساري» كثيرين");
const plan: GapPlan = { remaining: { "1": 100 }, accepted: { "1": 7, "2": 1 }, history: {} };
const planned = planGaps([c(1, "101", 30, 5, 10), c(2, "102", 30, 3, 900)], plan);
check(planned.length === 1 && planned[0].id === 1 && planned[0].required === 7 && planned[0].extra === 2 && planned[0].basis === "plan", "المختار 7 والموجود 5 ← «زِد ٢»؛ (‎102: المختار 1 ≤ الموجود 3 فلا تُقترح ولو طلبه 900 في «مساري»)", planned);

/* كشف المتبقي بلا «مختار»: يقترح حسابُ تخطيط الشعب من التاريخ. فُتحت عادةً 3 شعب بمتبقٍّ 90، والمتبقي الآن 90 ← 3، والموجود 1 ← ينقص 2. */
const history = { "1": [{ termName: "الفصل الأول 2025/2026", sections: 3, remaining: 90, similar: true }] };
const suggested = planGaps([c(1, "101", 30, 1, 0)], { remaining: { "1": 90 }, accepted: {}, history });
check(suggested.length === 1 && suggested[0].basis === "plan" && suggested[0].required === 3 && suggested[0].extra === 2 && suggested[0].demand === 90, "كشفٌ مرفوع بلا مختار ← مقترح تخطيط الشعب من التاريخ", suggested);
/* بلا تاريخ يبدأ التخطيط بشعبة واحدة (قاعدته)، فلا نقول «زِد» لمقررٍ فيه شعبة. */
check(planGaps([c(1, "101", 30, 1, 0)], { remaining: { "1": 90 }, accepted: {}, history: {} }).length === 0, "بلا تاريخ: مقترح التخطيط شعبةٌ واحدة، فلا «زِد» لمقررٍ فيه شعبة");
/* مقررٌ لا ذكر له في التخطيط لا يظهر في نتيجته ولو طلبه الطلبة. */
const mixed = planGaps([c(1, "101", 30, 5, 0), c(2, "102", 30, 1, 120)], { remaining: { "1": 0 }, accepted: { "1": 5 }, history: {} });
check(mixed.length === 0, "مقررٌ خارج التخطيط لا يدخل نتيجته (الطلبة إشارةٌ أخرى)", mixed);
check(studentGaps([]).length === 0 && studentGaps([c(1, "101", 30, 9, 100)]).length === 0, "لا نقص ← قائمةٌ فارغة (لا شارة)");

/* العرض: سطرٌ لكل مقرر «الموجود ← المطلوب». لا رابط يذهب بالمستخدم إلى شاشةٍ أخرى ولا حقل إدخال. */
const many = Array.from({ length: 7 }, (_, i) => ({ id: 100 + i, code: `9${i}`, name: `مقرر ${i}`, existing: 1, required: 2 + i, extra: 1 + i, basis: "students" as const, demand: 50 }));
const html = renderToStaticMarkup(React.createElement(SectionGapPanel, { items: byStudents.concat(many), kind: "students", onClose: () => {} }));
check(html.includes("شعبٌ يطلبها الطلبة في «مساري»") && html.includes("اختياري") && html.includes("طالب"), "قائمة «مساري»: عنوانها ومصدرها (طلبة)");
const planHtml = renderToStaticMarkup(React.createElement(SectionGapPanel, { items: planned, kind: "plan", onClose: () => {} }));
check(planHtml.includes("بحسب تخطيطك") && !planHtml.includes("مساري") && planHtml.includes("المتبقي"), "قائمة التخطيط: عنوانٌ مستقل ولا ذكر لـ«مساري» فيها");
check(!html.includes("<a ") && !html.includes("<input") && !html.includes("<form") && !html.includes("قارن") && !html.includes("كشف المتبقي"), "العرض: بلا رابطٍ ولا حقلٍ ولا دعوةٍ إلى شاشة التخطيط");
const shownRows = (html.match(/<li/g) || []).length;
check(shownRows === 5 && html.includes("الكل ("), "العرض: خمسة أسطر ثم «الكل»", { shownRows });
check(!renderToStaticMarkup(React.createElement(SectionGapPanel, { items: byStudents, kind: "students", onClose: () => {} })).includes("الكل ("), "قائمةٌ قصيرة بلا «الكل»");

/* شاشة الرفع المختصرة: تُفتح من الأيقونة وتعيد استعمال استيراد «تخطيط الشعب» نفسه (وضع importOnly) فلا مسارَ ثانياً ولا جدولَ تخطيط. */
import fs from "fs";
const bar = fs.readFileSync("src/components/ApprovalBar.tsx", "utf8"), sheet = fs.readFileSync("src/components/QuickPlanSheet.tsx", "utf8"), planning = fs.readFileSync("src/components/SectionPlanning.tsx", "utf8");
check(bar.includes("setPlanSheet(true)") && bar.includes("<QuickPlanSheet") && !bar.includes("onOpenPlanning") && !bar.includes("initialTab"), "الأيقونة تفتح شاشة الرفع المختصرة ولا تنقل إلى تخطيط الشعب");
check(sheet.includes("<SectionPlanning") && sheet.includes("importOnly") && sheet.includes("gap.reload()") && sheet.includes("<Result"), "الشاشة: استيرادٌ بالمسار نفسه ثم عرض المقترح بعد الحفظ");
check(planning.includes("importOnly ? null : buildReady") && (planning.match(/importOnly \? null : \(<>/g) || []).length === 2 && planning.includes("{!importOnly && legacy"), "وضع importOnly يُخفي الجدول والتقرير والبناء ويُبقي الرفع والمراجعة");
/* الكشف النصّيّ المقروء كله يُعبَّأ مباشرةً في الشاشة المختصرة؛ وكل ما يحتاج نظراً (ممسوح، خانة غير واضحة، ملاحظة) يُعرض له الاستعراض الكامل نفسه. */
check(planning.includes("const autoApply = importOnly") && planning.includes('preview!.source !== "scan"') && !/const autoApply[^;]*nReview/.test(planning) && planning.includes("{preview && !autoApply ? createPortal("), "التعبئة المباشرة بما قُرئ بوضوح بلا نافذة مراجعة، والممسوح أو الفصل المخالف يمرّ بالمراجعة");
check(planning.includes('importOnly && saveState === "error"') && planning.includes("أعد المحاولة"), "الشاشة المختصرة: تعذّر الحفظ يظهر معه زر إعادة المحاولة");
check(sheet.includes("useDialogDismiss(!reviewing, onClose)") && sheet.includes("onPreviewChange={setReviewing}") && planning.includes("onPreviewChange?.(Boolean(preview))"), "الـEscape لنافذة المراجعة الداخلية وحدها ما دامت مفتوحة");
import { Result } from "../src/components/QuickPlanSheet";
const sample = { planItems: many.slice(0, 6).map(item => ({ ...item, basis: "plan" as const })), studentItems: [], planImported: true, loaded: true, ready: true, source: "المتبقي.pdf", reload: () => {} } as any;
const rendered = renderToStaticMarkup(React.createElement(Result, { gap: sample, onClose: () => {} }));
check(rendered.includes("تحتاج شعباً") && (rendered.match(/<li/g) || []).length === 4 && rendered.includes("أخرى") && rendered.includes("المتبقي.pdf") && rendered.includes("gap-cells"), "النتيجة: سطرٌ يعدّ المقررات، وأربعة أسطر، و«و… أخرى»، واسم الملف، ومربعاتٌ للموجود والمطلوب");
check(renderToStaticMarkup(React.createElement(Result, { gap: { ...sample, planItems: [] }, onClose: () => {} })).includes("شعبك تكفي المتبقي"), "النتيجة: بلا نقص ← «شعبك تكفي المتبقي»");
check(renderToStaticMarkup(React.createElement(Result, { gap: { ...sample, ready: false }, onClose: () => {} })).includes("يُحسب المقترح"), "النتيجة: قبل اكتمال الحسبة لا اقتراح مضلِّل");


/* مسحُ الكشف من تخطيط الشعب يُحدِّث الأيقونة والشارات؛ والأيقونة لا تظهر لمن رفع. */
const gapSrc = fs.readFileSync("src/components/SectionGapNote.tsx", "utf8");
check(planning.includes("PLAN_SAVED_EVENT") && planning.includes("dispatchEvent") && gapSrc.includes("addEventListener(PLAN_SAVED_EVENT"), "حفظ تخطيط الشعب (ومنه المسح) يُحدِّث الشارات والأيقونة");
check(bar.includes("gap.loaded && !gap.planImported"), "أيقونة الرفع تختفي متى رُفع كشف");
check(planning.includes("skipped.current = nReview") && sheet.includes("لم تتّضح في الكشف فلم تُحسب") && sheet.includes("لا زيادة فيما قُرئ"), "قراءةٌ جزئية لا تُعرض نتيجةً كاملة");
check(/keepalive[\s\S]{0,200}PLAN_SAVED_EVENT/.test(planning), "الحفظ عند الإغلاق يُحدِّث الأيقونة أيضاً");
/* ── علامةُ المقرر في مفتاح الألوان، وجرسُ «مساري»، وتلميحُ الأيقونة ── */
import { buildMasariGapNotifications } from "../src/utils/featureNotifications";
const bell = buildMasariGapNotifications([{ collegeId: 1, sectionId: 6, sectionName: "الدراسات الإسلامية", courses: 1 }, { collegeId: 1, sectionId: 2, sectionName: "علم البيانات", courses: 3 }, { collegeId: 1, sectionId: 9, sectionName: "الرياضيات", courses: 0 }], 2, "الفصل الثاني");
check(bell.length === 2 && bell[0].title === "طلبة «مساري» يحتاجون شعباً في مقرر واحد" && bell[1].title === "طلبة «مساري» يحتاجون شعباً في 3 مقررات" && bell.every(item => item.view === "schedules" && item.tone === "action" && item.termId === 2), "جرس «مساري»: سطرٌ لكل قسمٍ له نقص، بعدّ عربيّ سليم، ولا سطر لقسمٍ بلا نقص", bell.map(item => item.title));
check(bell[0].id !== buildMasariGapNotifications([{ collegeId: 1, sectionId: 6, sectionName: "x", courses: 2 }])[0].id, "تغيّر العدد يصير إشعاراً جديداً");
const server = fs.readFileSync("server.ts", "utf8"), schedules = fs.readFileSync("src/components/Schedules.tsx", "utf8");
check(server.includes("cachedSectionGap") && server.includes("buildMasariGapNotifications(found") && /\["standard", "committeeChair", "departmentHead"\]\.includes\(role\) && !isPowerUser\(req\)/.test(server), "الجرس لعاملي القسم وحدهم، وبقراءةٍ مخبّأةٍ دقيقة");
check(schedules.includes("onStudentGaps={setStudentGaps}") && schedules.includes("week-legend-need") && schedules.includes('hueBy === "course"'), "علامة «+N» على شارة المقرر في مفتاح الألوان، للمقررات فقط");
check(bar.includes('title="قارن شعبك بكشف المتبقي"'), "تلميح الأيقونة كلمتان لا فقرة");
check((schedules.match(/\{needMark\(item\.key\)\}/g) || []).length === 3, "العلامة في مفاتيح الألوان الثلاثة: القائمة والأسبوع والقاعات");
check(bar.includes("() => onStudentGaps?.([])"), "زوال الشريط يمحو علاماته");
check(/slice\(0, 30\);\s*const found/.test(server) && !/slice\(0, 4\);\s*const found/.test(server), "يُفحص كل أقسام العامل ثم يُقتصر الناتج على أربعة");
/* كشفُ فصلٍ آخر يُرفض كله بالبابين (الملف والصفحات)، لا يُنبَّه إليه فقط: القاعدةُ نفسها في شاشة المقارنة وتخطيط الشعب. */
check((server.match(/const termRefusal = remainingTermRefusal\(/g) || []).length === 2 && (server.match(/rejectKind: "wrongTerm"/g) || []).length === 2 && server.includes("function remainingTermRefusal("), "كشفُ فصلٍ آخر يُرفض بالبابين");
check(planning.includes('importError.kind === "wrongTerm"') && fs.readFileSync("src/utils/remainingReport.ts", "utf8").includes('"wrongTerm"'), "رفضُ الفصل يُعرض في الواجهة بمقارنة «في الكشف / المختار»");
check(server.includes("(season && header.season !== season)") && server.includes("فصلٌ بلا موسمٍ يُقرأ من اسمه"), "اسمُ فصلٍ غير معتاد لا يُرفض به كشف: لا خلافَ يمكن إثباته");

console.log(`\nSection gap audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
