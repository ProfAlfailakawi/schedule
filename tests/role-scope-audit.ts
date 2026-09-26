/**
 * ── «فقط بيانات القسم، وحسب المستخدم» ──────────────────────────────────────
 *
 * فتح المالكُ حسابَ قسم «الدراسات الإسلامية» (رئيس لجنة، ثلاثة عشر صفَّ نطاقٍ:
 * القسمُ نفسه في ثلاث عشرة كليةً وفرعاً) فرأى في «تغييرات الجدول» لوحةَ رئيس
 * التسجيل: «لم يُحدَّد آخر موعد…» و«سلّم 0 من 13 قسماً». هذا التدقيق يمسك:
 *
 *   A   لوحةُ «مواعيد التسليم» لمن يملك الموعد أو يراقبه وحده، بقرارٍ واحد
 *       (inboxAudience) تسأله الشاشتان اللتان تركّبانها.
 *   B   القسمُ المتعدّد المواقع يُقرأ «قسمك في 13 موقعاً»: سطورٌ بأسماء الكليات،
 *       بلا أزرار التسجيل ولا إشاراته.
 */
import fs from "fs";
import path from "path";
import { departmentNameKey, inboxAudience, multiSiteDepartment, multiSiteHeadline } from "../src/utils/inboxAudience";
import { ACADEMIC_ROLES } from "../src/utils/academicRoles";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

/* ── A: من يرى لوحة «مواعيد التسليم» ──────────────────────────────────────── */
{
  const panel = (role: string, powerAdmin = false) => inboxAudience(role, { powerAdmin }).deadlinesPanel;
  check(panel("registrarHead") === "edit", "A رئيس التسجيل يحرّر المواعيد");
  check(panel("committeeChair", true) === "edit", "A الإدارة الرئيسية تحرّر المواعيد");
  check(panel("registrarStaff") === "read" && panel("registrarDean") === "read", "A موظف التسجيل وعميده يقرآن اللوحة");
  check(panel("dean") === "read" && panel("viceDean") === "read", "A العميدان يقرآن الشريط في ميزان الأقسام");
  check(panel("committeeChair") === null, "A رئيس اللجنة لا يرى لوحة التسجيل");
  check(panel("departmentHead") === null, "A رئيس القسم لا يرى لوحة التسجيل");
  check(panel("standard") === null, "A المستخدم العادي لا يرى لوحة التسجيل");
  check(panel(undefined as any) === null, "A حسابٌ بلا صفةٍ مكتوبة (يسقط إلى رئيس لجنة) لا يرى اللوحة");
  // كل صفةٍ معرّفة لها جواب — لا صفةَ جديدة تمرّ بلا قرار.
  for (const role of ACADEMIC_ROLES) {
    const audience = inboxAudience(role.id);
    check(["edit", "read", null].includes(audience.deadlinesPanel as any), `A «${role.label}» لها قرارٌ صريح في اللوحة`);
    check(audience.extendActions === (audience.deadlinesPanel === "edit"), `A «${role.label}»: أزرار التمديد مع التحرير وحده`);
  }

  const changes = read("src/components/ScheduleChanges.tsx");
  const mount = changes.slice(changes.indexOf("<SubmissionDeadlines") - 400, changes.indexOf("<SubmissionDeadlines"));
  check(/audience\.deadlinesPanel\s*\?\s*\(\s*$/.test(mount.trim().split("\n").slice(-1)[0] + "") || /&& audience\.deadlinesPanel \? \(/.test(mount),
    "A «تغييرات الجدول» تركّب اللوحة بشرط inboxAudience");
  check(!/canEdit=\{role\.canManageDeadline\}/.test(changes) && !/canExtend=\{role\.canManageDeadline\}/.test(changes),
    "A لا شرطَ ثانٍ للتحرير يُقرأ من الصفة مباشرةً في «تغييرات الجدول»");
  check(/audience\.extendActions && onExtend/.test(changes), "A أزرار «تمديد/استثناء/نظر الطلب» من القرار الواحد");

  const reports = read("src/components/Reports.tsx");
  const at = reports.indexOf("<SubmissionDeadlines");
  check(at > 0 && /inboxAudience\(roleId, \{ powerAdmin: isPowerAdmin \}\)\.deadlinesPanel/.test(reports.slice(at - 500, at)),
    "A ميزان الأقسام يركّب الشريط بشرط inboxAudience");

  // لا موضعَ ثالث يركّب اللوحة.
  const mounts = fs.readdirSync(path.join(process.cwd(), "src/components"))
    .filter(file => file.endsWith(".tsx") && file !== "SubmissionDeadlines.tsx")
    .filter(file => read(`src/components/${file}`).includes("<SubmissionDeadlines"));
  check(JSON.stringify(mounts.sort()) === JSON.stringify(["Reports.tsx", "ScheduleChanges.tsx"]),
    `A اللوحة تُركَّب في موضعين معروفين فقط (${mounts.join("، ")})`);
}

/* ── B: قسمٌ واحد في مواقع عدّة ───────────────────────────────────────────── */
{
  const islamic = Array.from({ length: 13 }, (_, i) => ({
    AdCollegeId: i + 1, AdSectionId: 100 + i,
    AdSectionName: i % 3 === 0 ? "قسم الدراسات الإسلامية" : i % 3 === 1 ? "الدراسات الاسلامية" : "الدراسات الإسلاميّة",
    AdCollegeName: `كلية ${i + 1}`,
  }));
  const dept = multiSiteDepartment(islamic);
  check(Boolean(dept) && dept!.sites === 13, "B ثلاثة عشر صفّاً بالقسم نفسه (بكتاباتٍ مختلفة) = قسمٌ واحد في 13 موقعاً");
  check(dept ? multiSiteHeadline(dept) === "قسمك في 13 موقعاً" : false, "B العنوان «قسمك في 13 موقعاً»");
  check(multiSiteHeadline({ name: "x", sites: 2 }) === "قسمك في موقعين", "B المثنّى مجروراً: «قسمك في موقعين»");
  check(departmentNameKey("قسم الدراسات الإسلامية") === departmentNameKey("الدراسات الاسلاميه"), "B الاسم يُطبَّع (قسم، همزة، تاء مربوطة)");
  check(multiSiteDepartment([islamic[0]]) === null, "B موقعٌ واحد ليس «مواقع»");
  check(multiSiteDepartment([islamic[0], { ...islamic[1], AdCollegeId: 1 }]) === null, "B صفّان في كليةٍ واحدة ليسا مواقع");
  check(multiSiteDepartment([islamic[0], { ...islamic[1], AdSectionName: "اللغة العربية" }]) === null, "B قسمان مختلفان ليسا قسماً متعدّد المواقع");
  check(multiSiteDepartment([islamic[0], { AdCollegeId: 2, AdSectionId: 0 }]) === null, "B صفُّ «الكلية كلها» ليس قسماً");
  check(multiSiteDepartment([islamic[0], { ...islamic[1], AdCollegeWide: true }]) === null, "B صفٌّ مبسوطٌ من الكلية كلها ليس قسماً");

  const chair = inboxAudience("committeeChair", { scopes: islamic });
  check(chair.rowLabel === "college" && chair.multiSite?.sites === 13, "B رئيس اللجنة المتعدّد المواقع: السطور بأسماء الكليات");
  check(!chair.registrarSignals && !chair.extendActions && chair.deadlinesPanel === null && chair.department,
    "B ولا إشاراتِ تسجيل ولا أزرار تمديد ولا لوحة مواعيد");
  const head = inboxAudience("departmentHead", { scopes: islamic });
  check(head.rowLabel === "college" && head.deadlinesPanel === null, "B رئيس القسم المتعدّد المواقع كذلك");
  const reg = inboxAudience("registrarStaff", { scopes: islamic });
  check(reg.rowLabel === "section" && reg.multiSite === null, "B موظف التسجيل بالنطاق نفسه يبقى وارداً بأسماء الأقسام");

  const changes = read("src/components/ScheduleChanges.tsx");
  check(/audience\.rowLabel === "college"/.test(changes), "B سطر الوارد يُسمّى بالكلية حين يقول القرار ذلك");
  check(/audience\.registrarSignals && row\.answeredNotes/.test(changes), "B «ردودٌ تنتظر قرارك» للتسجيل وحده");
  check(/audience\.extendActions && row\.extensionRequest/.test(changes), "B طلب التمديد يُعرض في السطر لمن يقرّر فيه وحده");
  check(/!audience\.multiSite \? \[\{/.test(changes), "B لا منتقيَ قسمٍ يكرّر الاسم نفسه ثلاث عشرة مرّة");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
