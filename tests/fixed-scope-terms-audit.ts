/**
 * ── إخفاء الكلية والقسم لحساب القسم، وفصولٌ بلا فراغ ─────────────────────────
 *
 * طلبُ المالك: (1) قسمٌ واحد في كليةٍ واحدة: لا كلية ولا قسم في أي شاشة (افتراضيان في الخلفية) ويبقى الفصل وحده.
 * (2) قسمٌ واحدٌ في عدّة مواقع: يُخفى القسم ويُختار الموقع (الكلية). (3) من يملك أكثر من قسم (عميد، مدير…): كل الاختيارات.
 * (4) فصلٌ لا بيانات لقسمٍ فيه لا يظهر له، عدا الفصل الحالي ولو كان فارغاً.
 *   F1  scopeShape: single / multiSite / many.
 *   F2  trimScopeSelects: يُخفي الكلية والقسم أو القسم وحده، ولا يمسّ الإدارة ولا من له أقساماً عدّة.
 *   F3  visibleTermIds: ما فيه صفوف + الحالي، ويُسقط الفارغ القديم.
 *   F4  بنيوي: كل شاشةٍ تستعمل القرار الواحد وuseScopedTerms، والخادم يقرأ بحارس النطاق.
 */
import fs from "fs";
import path from "path";
import { scopeShape, hidesCollege, hidesSection } from "../src/utils/scopeShape";
import { soleCollegeOf } from "../src/utils/scopeContext";
import { visibleTermIds } from "../src/utils/scopedTerms";
import { trimScopeSelects, type ScopeAskSelect } from "../src/components/ScopeAskBar";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

/* F1 */
const row = (college: number, section: number, name = "قسم") => ({ AdCollegeId: college, AdSectionId: section, AdSectionName: name });
check(scopeShape([row(3, 31)]) === "single", "F1 قسمٌ واحد في كلية → single");
check(scopeShape([row(3, 31, "الدراسات الإسلامية"), row(4, 41, "الدراسات الإسلامية"), row(5, 51, "الدراسات الإسلامية")]) === "multiSite", "F1 قسمٌ بالاسم نفسه في عدّة كليات → multiSite");
check(scopeShape([row(3, 31, "أ"), row(3, 32, "ب")]) === "many", "F1 قسمان في كلية → many");
check(scopeShape([row(3, 31, "أ"), row(4, 41, "ب")]) === "many", "F1 قسمان مختلفان في كليتين → many");
check(scopeShape([{ AdCollegeId: 3, AdSectionId: 0 }]) === "many", "F1 كليةٌ كاملة (عميد) → many");
check(scopeShape([row(3, 31)], true) === "many", "F1 الإدارة → many");
check(scopeShape([]) === "many", "F1 نطاقٌ فارغ → many");
check(hidesCollege("single") && !hidesCollege("multiSite") && !hidesCollege("many"), "F1 الكلية تُخفى لـsingle وحده");
check(hidesSection("single") && hidesSection("multiSite") && !hidesSection("many"), "F1 القسم يُخفى لـsingle وmultiSite");
check(soleCollegeOf([row(3, 31), row(3, 32)]) === 3 && soleCollegeOf([row(3, 31), row(4, 41)]) === null && soleCollegeOf([row(3, 31)], true) === null, "F1 soleCollegeOf");

/* F2 */
const selects = (): ScopeAskSelect[] => [
  { key: "college", label: "الكلية", value: 0, placeholder: "اختر الكلية", options: [] },
  { key: "section", label: "القسم", value: 0, placeholder: "اختر القسم", options: [] },
  { key: "term", label: "الفصل", value: 1, placeholder: "اختر الفصل", options: [] },
];
const keys = (list: ScopeAskSelect[]) => list.map(item => item.key).join(",");
check(keys(trimScopeSelects(selects(), [row(3, 31)], false)) === "term", "F2 قسمٌ واحد: يبقى الفصل وحده");
check(keys(trimScopeSelects(selects(), [row(3, 31, "س"), row(4, 41, "س")], false)) === "college,term", "F2 قسمٌ في مواقع: الكلية والفصل");
check(keys(trimScopeSelects(selects(), [row(3, 31)], true)) === "college,section,term", "F2 الإدارة: كل المنتقيات");
check(keys(trimScopeSelects(selects(), [row(3, 31, "أ"), row(3, 32, "ب")], false)) === "college,section,term", "F2 أقسامٌ عدّة: كل المنتقيات");
check(keys(trimScopeSelects(selects(), [{ AdCollegeId: 3, AdSectionId: 0 }], false)) === "college,section,term", "F2 العميد: كل المنتقيات");

/* F3 */
const counts = new Map([[1, 5], [2, 0], [3, 7], [4, 0]]);
check(JSON.stringify(visibleTermIds([4, 3, 2, 1], counts, 4)) === "[4,3,1]", "F3 أحدثُ فصلٍ يبقى ولو فارغاً، وما فيه صفوف يبقى، والفارغ القديم (2) يختفي");
check(JSON.stringify(visibleTermIds([5, 4, 3, 2, 1], new Map([...counts, [5, 0]]), 5)) === "[5,3,1]", "F3 فصلٌ أحدث أُنشئ بعد الفارغ 4: يصير 4 قديماً فيختفي ويبقى الجديد 5");
check(visibleTermIds([1], new Map(), 1).length === 1, "F3 فصلٌ واحد حالي فارغ يبقى");

/* F4 */
for (const file of ["src/components/ScheduleChanges.tsx", "src/components/StudentRegistration.tsx", "src/components/InstructorInbox.tsx"]) {
  const src = read(file);
  check(/trimScopeSelects\(selects, scopes, powerAdmin\)/.test(src) && /useScopedTerms<AdTerm>\(/.test(src), `F4 ${file} يُخفي النطاق ويرشّح الفصول`);
}
check(/hidesCollege\(scopeShape\(/.test(read("src/components/Schedules.tsx")) && /useScopedTerms<AdTerm>\(/.test(read("src/components/Schedules.tsx")), "F4 الجدول: إخفاءُ النطاق وفصولٌ مرشّحة");
check(/hidesCollege\(scopeShape\(/.test(read("src/components/Reports.tsx")) && /useScopedTerms<AdTerm>\(/.test(read("src/components/Reports.tsx")), "F4 الاستعلام: إخفاءُ النطاق وفصولٌ مرشّحة");
check(/hideCollege \? null/.test(read("src/components/IntelligenceContextBar.tsx")) && /hideCollege=\{hidesCollege\(scopeShape\(/.test(read("src/components/IntelligenceWorkspace.tsx")) && /useScopedTerms<AdTerm>\(/.test(read("src/components/IntelligenceContextBar.tsx")), "F4 مركز الذكاء: إخفاءُ الكلية وفصولٌ مرشّحة");
check(/pickerSections\.length === 1 \? null/.test(read("src/components/CurriculumPlans.tsx")), "F4 الصحائف: القسم الوحيد لا يُسأل عنه");
check(/useScopedTerms/.test(read("src/components/RegistrationRehearsal.tsx")), "F4 الرادار يرشّح فصوله");
const server = read("server.ts");
const route = server.slice(server.indexOf('app.get("/api/terms/scoped"'), server.indexOf('app.post("/api/terms"'));
check(/readLiveSchedulesForRequest\(req,/.test(route) && /visibleTermIds\(/.test(route) && /dataContextCacheKey\(/.test(route), "F4 المسار: صفوفُ نطاق القارئ + القاعدة الواحدة + مفتاح السياق");
check(!/getSchedulesByScope\(\{[^}]*\}\)/.test(route.replace(/readLive[^\n]*/g, "")), "F4 ولا مسحَ بلا فصل");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
