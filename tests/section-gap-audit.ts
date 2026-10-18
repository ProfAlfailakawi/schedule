/** شعبٌ يُفضَّل زيادتها: حسابٌ حتميّ (طلب الطلبة، تخطيط القسم، كشف المتبقي) + عرضٌ هادئ بلا كتابة. */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sectionGaps, type GapCourse, type GapPlan } from "../src/utils/sectionGap";
import { SectionGapPanel } from "../src/components/SectionGapNote";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra)); }
};
const c = (id: number, code: string, capacity: number, existing: number, students: number): GapCourse => ({ id, code, name: `مقرر ${code}`, capacity, existing, students });

/* بلا تخطيط: الطلبة مقسومين على السعة. 180÷30 = 6 والموجود 5 ← ناقصة 1؛ 90÷30 = 3 والموجود 3 ← كافية. */
const byStudents = sectionGaps([c(1, "101", 30, 5, 180), c(2, "102", 30, 3, 90), c(3, "103", 0, 0, 500), c(4, "104", 40, 0, 0), c(5, "105", 25, 1, 101)], null);
check(byStudents.map(g => g.id).join() === "5,1", "الطلب ÷ السعة: ‎101 ينقصه 1، ‎105 ينقصه 4 (⌈101÷25⌉−1 = 4)، والترتيب الأكثر نقصاً أولاً", byStudents);
check(byStudents.every(g => g.basis === "students"), "بلا تخطيط: الأساس طلب الطلبة");
check(!byStudents.some(g => g.id === 3 || g.id === 4), "سعةٌ مجهولة أو طلبٌ صفر ← لا اقتراح مختلق");

/* تخطيط القسم: «المختار» يغلب الطلب. المختار 7 والموجود 5 ← 2. */
const plan: GapPlan = { remaining: { "1": 100 }, accepted: { "1": 7, "2": 1 }, history: {} };
const planned = sectionGaps([c(1, "101", 30, 5, 10), c(2, "102", 30, 3, 900)], plan);
check(planned.length === 1 && planned[0].id === 1 && planned[0].required === 7 && planned[0].extra === 2 && planned[0].basis === "plan", "المختار 7 والموجود 5 ← «زِد ٢»، وهو يغلب الطلب (‎102: المختار 1 ≤ الموجود 3 فلا تُقترح)", planned);

/* كشف المتبقي بلا «مختار»: يقترح حسابُ تخطيط الشعب من التاريخ. فُتحت عادةً 3 شعب بمتبقٍّ 90، والمتبقي الآن 90 ← 3، والموجود 1 ← ينقص 2. */
const history = { "1": [{ termName: "الفصل الأول 2025/2026", sections: 3, remaining: 90, similar: true }] };
const suggested = sectionGaps([c(1, "101", 30, 1, 0)], { remaining: { "1": 90 }, accepted: {}, history });
check(suggested.length === 1 && suggested[0].basis === "plan" && suggested[0].required === 3 && suggested[0].extra === 2 && suggested[0].demand === 90, "كشفٌ مرفوع بلا مختار ← مقترح تخطيط الشعب من التاريخ", suggested);
/* بلا تاريخ يبدأ التخطيط بشعبة واحدة (قاعدته)، فلا نقول «زِد» لمقررٍ فيه شعبة. */
check(sectionGaps([c(1, "101", 30, 1, 0)], { remaining: { "1": 90 }, accepted: {}, history: {} }).length === 0, "بلا تاريخ: مقترح التخطيط شعبةٌ واحدة، فلا «زِد» لمقررٍ فيه شعبة");

/* مقررٌ لا ذكر له في التخطيط يعود إلى طلب الطلبة. */
const mixed = sectionGaps([c(1, "101", 30, 5, 0), c(2, "102", 30, 1, 120)], { remaining: { "1": 0 }, accepted: { "1": 5 }, history: {} });
check(mixed.length === 1 && mixed[0].id === 2 && mixed[0].basis === "students" && mixed[0].required === 4, "مقررٌ خارج التخطيط يرجع إلى طلب الطلبة", mixed);

check(sectionGaps([], null).length === 0 && sectionGaps([c(1, "101", 30, 9, 100)], null).length === 0, "لا نقص ← قائمةٌ فارغة (لا شارة)");

/* العرض: سطرٌ لكل مقرر «الموجود ← المطلوب» ومصدره (طلبة أم تخطيطك). لا رابط يذهب بالمستخدم إلى شاشةٍ أخرى ولا حقل إدخال. */
const many = Array.from({ length: 7 }, (_, i) => ({ id: 100 + i, code: `9${i}`, name: `مقرر ${i}`, existing: 1, required: 2 + i, extra: 1 + i, basis: "students" as const, demand: 50 }));
const gap = { items: byStudents.concat(planned, many), planImported: false, loaded: true };
const html = renderToStaticMarkup(React.createElement(SectionGapPanel, { gap, onClose: () => {} }));
check(html.includes("شعبٌ يُفضَّل زيادتها") && html.includes("اختياري") && html.includes("في «مساري»") && html.includes("تخطيطك"), "العرض: عنوانٌ واختياري، ومصدر كل سطر (طلبة أو تخطيطك)");
check(!html.includes("<a ") && !html.includes("<input") && !html.includes("<form") && !html.includes("قارن") && !html.includes("كشف المتبقي"), "العرض: بلا رابطٍ ولا حقلٍ ولا دعوةٍ إلى شاشة التخطيط");
const shownRows = (html.match(/<li/g) || []).length;
check(shownRows === 5 && html.includes("الكل ("), "العرض: خمسة أسطر ثم «الكل»", { shownRows });
const short = renderToStaticMarkup(React.createElement(SectionGapPanel, { gap: { ...gap, items: gap.items.slice(0, 2), planImported: true }, onClose: () => {} }));
check(!short.includes("الكل ("), "قائمةٌ قصيرة بلا «الكل»");

/* شاشة الرفع المختصرة: تُفتح من الأيقونة وتعيد استعمال استيراد «تخطيط الشعب» نفسه (وضع importOnly) فلا مسارَ ثانياً ولا جدولَ تخطيط. */
import fs from "fs";
const bar = fs.readFileSync("src/components/ApprovalBar.tsx", "utf8"), sheet = fs.readFileSync("src/components/QuickPlanSheet.tsx", "utf8"), planning = fs.readFileSync("src/components/SectionPlanning.tsx", "utf8");
check(bar.includes("setPlanSheet(true)") && bar.includes("<QuickPlanSheet") && !bar.includes("onOpenPlanning") && !bar.includes("initialTab"), "الأيقونة تفتح شاشة الرفع المختصرة ولا تنقل إلى تخطيط الشعب");
check(sheet.includes("<SectionPlanning") && sheet.includes("importOnly") && sheet.includes("gap.reload()") && sheet.includes("<Result"), "الشاشة: استيرادٌ بالمسار نفسه ثم عرض المقترح بعد الحفظ");
check(planning.includes("importOnly ? null : buildReady") && (planning.match(/importOnly \? null : \(<>/g) || []).length === 2 && planning.includes("{!importOnly && legacy"), "وضع importOnly يُخفي الجدول والتقرير والبناء ويُبقي الرفع والمراجعة");
/* الكشف النصّيّ المقروء كله يُعبَّأ مباشرةً في الشاشة المختصرة؛ وكل ما يحتاج نظراً (ممسوح، خانة غير واضحة، ملاحظة) يُعرض له الاستعراض الكامل نفسه. */
check(planning.includes("const autoApply = importOnly") && planning.includes('preview!.source !== "scan"') && planning.includes("nReview === 0") && planning.includes("{preview && !autoApply ? createPortal("), "التعبئة المباشرة للمقروء كله فقط، وغيره يمرّ بالمراجعة");
check(planning.includes('importOnly && saveState === "error"') && planning.includes("أعد المحاولة"), "الشاشة المختصرة: تعذّر الحفظ يظهر معه زر إعادة المحاولة");
check(sheet.includes("useDialogDismiss(!reviewing, onClose)") && sheet.includes("onPreviewChange={setReviewing}") && planning.includes("onPreviewChange?.(Boolean(preview))"), "الـEscape لنافذة المراجعة الداخلية وحدها ما دامت مفتوحة");
import { Result } from "../src/components/QuickPlanSheet";
const sample = { items: gap.items.slice(0, 6), planImported: true, loaded: true, ready: true, source: "المتبقي.pdf", reload: () => {} } as any;
const rendered = renderToStaticMarkup(React.createElement(Result, { gap: sample, onClose: () => {} }));
check(rendered.includes("تحتاج شعباً") && (rendered.match(/<li/g) || []).length === 4 && rendered.includes("أخرى") && rendered.includes("المتبقي.pdf") && rendered.includes("gap-cells"), "النتيجة: سطرٌ يعدّ المقررات، وأربعة أسطر، و«و… أخرى»، واسم الملف، ومربعاتٌ للموجود والمطلوب");
check(renderToStaticMarkup(React.createElement(Result, { gap: { ...sample, items: [] }, onClose: () => {} })).includes("شعبك تكفي المتبقي"), "النتيجة: بلا نقص ← «شعبك تكفي المتبقي»");
check(renderToStaticMarkup(React.createElement(Result, { gap: { ...sample, ready: false }, onClose: () => {} })).includes("يُحسب المقترح"), "النتيجة: قبل اكتمال الحسبة لا اقتراح مضلِّل");

console.log(`\nSection gap audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
