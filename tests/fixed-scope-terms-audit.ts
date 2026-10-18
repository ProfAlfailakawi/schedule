/**
 * ── نطاقٌ ثابت وفصولٌ بلا فراغ ──────────────────────────────────────────────
 *
 * طلبُ المالك: (1) من ليس له إلا كليةٌ واحدة وقسمٌ واحد تظهر له الكلية والقسم ثابتَين نصّاً في كل الشاشات بلا قوائم؛
 * وهو يبدّل الفصل وحده. (2) فصلٌ لا بيانات لقسمٍ فيه لا يظهر له (خاصةً السابق)، عدا الفصل الحالي ولو كان فارغاً.
 *   F1  soleCollegeOf: كليةٌ واحدة، كليتان، الإدارة، نطاقٌ فارغ.
 *   F2  pinSingleScope: يثبّت الكلية والقسم للقسم الوحيد، ولا يمسّ الإدارة ولا متعدّد الأقسام.
 *   F3  visibleTermIds: ما فيه صفوف + الحالي، ويُسقط الفارغ القديم.
 *   F4  بنيوي: كل شاشةٍ فيها منتقي كليةٍ/فصلٍ تستعمل FixedScopeValue/pinSingleScope وuseScopedTerms، والخادم يقرأ بحارس النطاق.
 */
import fs from "fs";
import path from "path";
import { soleCollegeOf } from "../src/utils/scopeContext";
import { visibleTermIds } from "../src/utils/scopedTerms";
import { pinSingleScope, type ScopeAskSelect } from "../src/components/ScopeAskBar";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

/* F1 */
check(soleCollegeOf([{ AdCollegeId: 3, AdSectionId: 31 }]) === 3, "F1 كليةٌ واحدة → هي");
check(soleCollegeOf([{ AdCollegeId: 3, AdSectionId: 31 }, { AdCollegeId: 3, AdSectionId: 32 }]) === 3, "F1 قسمان في كليةٍ واحدة → الكلية ثابتة والقسم يبقى منتقىً");
check(soleCollegeOf([{ AdCollegeId: 3, AdSectionId: 0 }]) === 3, "F1 كليةٌ كاملة (عميد) → الكلية ثابتة");
check(soleCollegeOf([{ AdCollegeId: 3, AdSectionId: 31 }, { AdCollegeId: 4, AdSectionId: 41 }]) === null, "F1 كليتان → يبقى المنتقي");
check(soleCollegeOf([{ AdCollegeId: 3, AdSectionId: 31 }], true) === null, "F1 الإدارة تُبقي المنتقي");
check(soleCollegeOf([]) === null, "F1 نطاقٌ فارغ → لا قرار");

/* F2 */
const selects = (): ScopeAskSelect[] => [
  { key: "college", label: "الكلية", value: 0, placeholder: "اختر الكلية", options: [{ value: 3, label: "كلية التربية الأساسية" }, { value: 4, label: "كلية أخرى" }] },
  { key: "section", label: "القسم", value: 0, placeholder: "اختر القسم", options: [{ value: 31, label: "تكنولوجيا التعليم" }] },
  { key: "term", label: "الفصل", value: 1, placeholder: "اختر الفصل", options: [{ value: 1, label: "الفصل الأول" }] },
];
const one = [{ AdCollegeId: 3, AdSectionId: 31 }];
const pinned = pinSingleScope(selects(), one, false);
check(pinned[0].fixed === "كلية التربية الأساسية" && pinned[1].fixed === "تكنولوجيا التعليم" && !pinned[2].fixed, "F2 قسمٌ واحد: الكلية والقسم ثابتان والفصل منتقىً");
check(pinned[0].value === 3 && pinned[1].value === 31, "F2 والقيمتان تُضبطان على الوحيدين");
check(pinSingleScope(selects(), one, true).every(select => !select.fixed), "F2 الإدارة: كل المنتقيات كما هي");
const twoSections = pinSingleScope(selects(), [{ AdCollegeId: 3, AdSectionId: 31 }, { AdCollegeId: 3, AdSectionId: 32 }], false);
check(twoSections[0].fixed === "كلية التربية الأساسية" && !twoSections[1].fixed, "F2 قسمان: الكلية ثابتة والقسم يبقى منتقىً");
check(pinSingleScope(selects(), [{ AdCollegeId: 3, AdSectionId: 31 }, { AdCollegeId: 4, AdSectionId: 41 }], false).every(select => !select.fixed), "F2 كليتان: لا شيء يُثبَّت");

/* F3 */
const counts = new Map([[1, 5], [2, 0], [3, 7], [4, 0]]);
check(JSON.stringify(visibleTermIds([4, 3, 2, 1], counts, 1)) === "[3,1]", "F3 الفصل الفارغ القديم يختفي ويبقى ما فيه صفوف");
check(JSON.stringify(visibleTermIds([4, 3, 2, 1], counts, 4)) === "[4,3,1]", "F3 والفصل الحالي يبقى ولو فارغاً");
check(visibleTermIds([1], new Map(), 1).length === 1, "F3 فصلٌ واحد حالي فارغ يبقى");

/* F4 */
for (const file of ["src/components/ScheduleChanges.tsx", "src/components/StudentRegistration.tsx", "src/components/InstructorInbox.tsx"]) {
  const src = read(file);
  check(/pinSingleScope\(selects, scopes, powerAdmin\)/.test(src) && /useScopedTerms<AdTerm>\(/.test(src), `F4 ${file} يثبّت النطاق ويرشّح الفصول`);
}
check(/FixedScopeValue/.test(read("src/components/Schedules.tsx")) && /useScopedTerms<AdTerm>\(/.test(read("src/components/Schedules.tsx")), "F4 الجدول: نطاقٌ ثابت وفصولٌ مرشّحة");
check(/FixedScopeValue/.test(read("src/components/Reports.tsx")) && /useScopedTerms<AdTerm>\(/.test(read("src/components/Reports.tsx")), "F4 الاستعلام: نطاقٌ ثابت وفصولٌ مرشّحة");
check(/lockCollege \? <Field label="الكلية"><FixedScopeValue>/.test(read("src/components/IntelligenceContextBar.tsx")) && /useScopedTerms<AdTerm>\(/.test(read("src/components/IntelligenceContextBar.tsx")), "F4 مركز الذكاء: نطاقٌ ثابت وفصولٌ مرشّحة");
check(/FixedScopeValue/.test(read("src/components/CurriculumPlans.tsx")), "F4 الصحائف: الكلية والقسم الوحيدان ثابتان");
check(/useScopedTerms/.test(read("src/components/RegistrationRehearsal.tsx")), "F4 الرادار يرشّح فصوله");
const server = read("server.ts");
const route = server.slice(server.indexOf('app.get("/api/terms/scoped"'), server.indexOf('app.post("/api/terms"'));
check(/readLiveSchedulesForRequest\(req,/.test(route) && /visibleTermIds\(/.test(route) && /dataContextCacheKey\(/.test(route), "F4 المسار: صفوفُ نطاق القارئ + القاعدة الواحدة + مفتاح السياق");
check(!/getSchedulesByScope\(\{[^}]*\}\)/.test(route.replace(/readLive[^\n]*/g, "")), "F4 ولا مسحَ بلا فصل");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
