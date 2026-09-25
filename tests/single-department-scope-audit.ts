/**
 * ── قسمٌ واحد: «الكلية + الفصل» في كل شاشة ─────────────────────────────────
 *
 * طلب المالك: حسابُ القسم العلمي (رئيس القسم، رئيس اللجنة) لا يُسأل عن القسم
 * لأنه قسمٌ واحد — كما في لوحة الجدول. فالقرار في دالةٍ واحدة
 * (`singleDepartmentOf` في src/utils/scopeContext.ts) وكل شاشةٍ ترسم منتقي قسمٍ
 * مربوطاً بنطاق القارئ تسألها. هذا التدقيق يمسك:
 *   S1  الدالة: قسمٌ واحد، قسمان، صفُّ الكلية كلها (صفرٌ أو وسمٌ بعد البسط)،
 *       كليتان، الإدارة، كليةٌ خارج النطاق.
 *   S2  الخادم يَسِم الصفوف المبسوطة من «الكلية كلها» — للعرض وحده.
 *   S3  حسابات البيئة التجريبية: اللجنة ورئيس القسم قسمٌ واحد؛ العميد لا.
 *   S4  بنيوي: كل منتقي قسمٍ في ملفٍّ يقرأ `scopes` محروسٌ بالدالة، ولا نسخةَ
 *       ثانية من القاعدة (scopes.length === 1، lockSection محسوبٌ محلياً).
 */
import fs from "fs";
import path from "path";
import { resolveScopeSelection, singleDepartmentOf } from "../src/utils/scopeContext";
import { createDemoSandboxState, DEMO_ROLE_ACCOUNTS } from "../src/db/demoSandbox";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

/* ── S1: الدالة ─────────────────────────────────────────────────────────── */

const one = [{ AdCollegeId: 3, AdSectionId: 31 }];
check(singleDepartmentOf(one) === 31, "S1 قسمٌ واحد بلا كليةٍ مطلوبة → القسم نفسه");
check(singleDepartmentOf(one, 3) === 31, "S1 قسمٌ واحد في الكلية المطلوبة → القسم نفسه");
check(singleDepartmentOf([...one, { AdCollegeId: 3, AdSectionId: 31 }], 3) === 31, "S1 صفٌّ مكرّر لا يصنع قسمين");
check(singleDepartmentOf(one, 9) === null, "S1 كليةٌ خارج النطاق → لا قرار (يبقى المنتقي)");
check(singleDepartmentOf(one, 3, true) === null, "S1 الإدارة تُبقي منتقي القسم دائماً");
check(singleDepartmentOf([]) === null, "S1 نطاقٌ فارغ → لا قرار");

const two = [{ AdCollegeId: 3, AdSectionId: 31 }, { AdCollegeId: 3, AdSectionId: 32 }];
check(singleDepartmentOf(two, 3) === null, "S1 قسمان في الكلية → يبقى المنتقي");
check(singleDepartmentOf(two) === null, "S1 قسمان بلا كليةٍ مطلوبة → يبقى المنتقي");

check(singleDepartmentOf([{ AdCollegeId: 3, AdSectionId: 0 }], 3) === null, "S1 صفُّ الكلية كلها (قسم صفر) ليس قسماً واحداً");
check(singleDepartmentOf([{ AdCollegeId: 3, AdSectionId: 31, AdCollegeWide: true }], 3) === null,
  "S1 صفٌّ مبسوطٌ من الكلية كلها ليس قسماً واحداً ولو كانت الكلية بقسمٍ واحد");
check(singleDepartmentOf([{ AdCollegeId: 3, AdSectionId: 0 }, { AdCollegeId: 3, AdSectionId: 31 }], 3) === null,
  "S1 صفُّ الكلية كلها يغلب صفَّ القسم في الكلية نفسها");

const twoColleges = [{ AdCollegeId: 3, AdSectionId: 31 }, { AdCollegeId: 4, AdSectionId: 41 }];
check(singleDepartmentOf(twoColleges) === null, "S1 كليتان بلا كليةٍ مختارة → يبقى المنتقي");
check(singleDepartmentOf(twoColleges, 4) === 41, "S1 كليتان، والمختارة بقسمٍ واحد → قسمها");
check(singleDepartmentOf([...twoColleges, { AdCollegeId: 4, AdSectionId: 0 }], 4) === null,
  "S1 كليتان، والمختارة كلها في النطاق → يبقى المنتقي");
check(singleDepartmentOf([...twoColleges, { AdCollegeId: 4, AdSectionId: 0 }], 3) === 31,
  "S1 صفُّ الكلية كلها لا يمسّ كليةً أخرى");
check(singleDepartmentOf([{ AdCollegeId: "3", AdSectionId: "31" }], "3") === 31, "S1 المعرّفات نصّاً تُقرأ أرقاماً");

// القيمة المختارة تلقائياً هي نفسها القسم الذي يُخفى منتقيه.
check(resolveScopeSelection(one, 3).defaultSectionId === 31, "S1 القيمة الافتراضية للقسم المخفيّ هي القسم الوحيد");
check(!("lockSection" in resolveScopeSelection(one, 3)), "S1 لا «lockSection» ثانٍ يُحسب بجانب الدالة");

/* ── S2: وسم الخادم ─────────────────────────────────────────────────────── */

const server = read("server.ts");
const detailsStart = server.indexOf("async function clientScopeDetails(");
const details = server.slice(detailsStart, server.indexOf("\n}\n", detailsStart));
check(detailsStart > 0 && /AdCollegeWide:\s*true/.test(details), "S2 الصفوف المبسوطة من «الكلية كلها» تحمل AdCollegeWide");
check(/Number\(scope\.AdSectionId\) === 0\) wideColleges\.add/.test(details), "S2 الوسم من الصفر الخام نفسه لا من عدد الأقسام");

/* ── S3: البيئة التجريبية ──────────────────────────────────────────────── */

const state = createDemoSandboxState();
const assigns = (role: string) => {
  const account = DEMO_ROLE_ACCOUNTS.find(a => a.role === role);
  return account ? state.collegeUserAssign.filter(a => a.SystemUserId === account.SystemUserId) : [];
};
check(singleDepartmentOf(assigns("committeeChair")) !== null, "S3 رئيس اللجنة التجريبي قسمٌ واحد → «الكلية + الفصل»");
check(singleDepartmentOf(assigns("departmentHead")) !== null, "S3 رئيس القسم التجريبي قسمٌ واحد → «الكلية + الفصل»");
check(assigns("dean").length > 0 && singleDepartmentOf(assigns("dean")) === null, "S3 العميد التجريبي يُبقي منتقي القسم");

/* ── S4: بنيوي ─────────────────────────────────────────────────────────── */

const componentsDir = path.join(process.cwd(), "src/components");
const files = [
  ...fs.readdirSync(componentsDir).filter(f => f.endsWith(".tsx")).map(f => `src/components/${f}`),
  "src/App.tsx",
];
/* منتقي قسمٍ مرسوم: حقلُ «القسم»/«القسم العلمي» في Field، أو خانة section في
   شريط النطاق (ScopeAskBar). */
const SELECTOR = /<Field label="القسم(?: العلمي)?"|key: "section",\s*label: "القسم"/g;
const GUARD = /singleDepartmentOf\(|soleDepartment\b/;
let scopedSelectors = 0;
for (const file of files) {
  const src = read(file);
  if (!/\bscopes\b/.test(src)) continue;
  for (const match of src.matchAll(SELECTOR)) {
    scopedSelectors++;
    const before = src.slice(Math.max(0, (match.index || 0) - 320), match.index);
    const line = src.slice(0, match.index).split("\n").length;
    check(GUARD.test(before), `S4 ${file}:${line} منتقي القسم محروسٌ بـ singleDepartmentOf`);
  }
  check(!/scopes\.length\s*===?\s*1/.test(src), `S4 ${file} لا يعدّ صفوف النطاق بنفسه (scopes.length === 1)`);
  check(!/\.lockSection\b/.test(src) || file.endsWith("IntelligenceContextBar.tsx"), `S4 ${file} لا يقرأ lockSection محلياً`);
}
check(scopedSelectors >= 7, `S4 وُجدت منتقيات الأقسام المربوطة بالنطاق كلها (${scopedSelectors})`);

// الشاشات التي سمّاها المالك، كلٌّ منها تستورد الدالة وتسألها.
for (const file of [
  "src/components/Schedules.tsx", "src/components/Reports.tsx", "src/components/ScheduleChanges.tsx",
  "src/components/StudentRegistration.tsx", "src/components/InstructorInbox.tsx", "src/components/IntelligenceWorkspace.tsx",
  "src/App.tsx",
]) {
  check(/import \{[^}]*\bsingleDepartmentOf\b[^}]*\} from "\.\.?\/utils\/scopeContext"/.test(read(file)), `S4 ${file} يستورد singleDepartmentOf`);
}
check(/lockSection=\{singleDepartmentOf\(/.test(read("src/components/IntelligenceWorkspace.tsx")),
  "S4 مركز الذكاء يمرّر قرار الدالة إلى شريط السياق");
check(/singleDepartmentOf\(scopes, 0, isPowerAdmin\)/.test(read("src/App.tsx")),
  "S4 تغييرات الجدول تفتح تقرير القسم الواحد بالقاعدة نفسها");

// ولا نسخةَ ثانية من القاعدة في مكتبة النطاق نفسها.
const scopeLib = read("src/utils/scopeContext.ts");
check(!/lockSection/.test(scopeLib.replace(/\/\*[\s\S]*?\*\//g, "")), "S4 scopeContext لا يحسب lockSection بجانب الدالة");

// والمنتقي المخفيّ لا يترك القيمة فارغة.
for (const file of ["src/components/StudentRegistration.tsx", "src/components/InstructorInbox.tsx"]) {
  check(/const only = singleDepartmentOf\(scopes, collegeId, powerAdmin\);\s*if \(only && sectionId !== only\) setSectionId\(only\);/.test(read(file)),
    `S4 ${file} يُبقي القسم الوحيد في الحالة حين يُخفى منتقيه`);
}

// والتخطيط يتّسع حين يغيب المنتقي.
check(/\.query-scope\[data-count="2"\]/.test(read("src/styles/06-intelligence.css")), "S4 صفّ المرشّحات له تخطيطٌ لحقلين");
check(/data-count=\{selects\.length\}/.test(read("src/components/ScopeAskBar.tsx")), "S4 شريط النطاق يعلن عدد حقوله");
check(/data-count=\{soleDepartment === null \? 3 : 2\}/.test(read("src/components/Reports.tsx")), "S4 مركز الاستعلام يعلن عدد حقوله");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
