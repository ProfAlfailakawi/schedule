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
import { createDemoSandboxState, DEMO_MULTI_SITE, DEMO_SWITCH_ACCOUNTS, demoActiveRoleKey } from "../src/db/demoSandbox";

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

/* ── C: الخادم — ما يصل كلَّ صفةٍ من كل مسار ──────────────────────────────────
 *
 * التدقيقُ الحيّ (scripts/role-scope-live-audit.mjs) يطرق كل مسار قراءةٍ بكل
 * صفة على خادمٍ تجريبيٍّ معزول. وهذه الفحوصُ البنيوية تُمسك ما أصلحه فلا يعود:
 */
{
  const server = read("server.ts");
  const route = (head: string) => {
    const at = server.indexOf(head);
    if (at < 0) return "";
    const next = server.indexOf("\napp.", at + head.length);
    return server.slice(at, next < 0 ? undefined : next);
  };

  const rules = route('app.get("/api/degree-rules"');
  check(/const sections=filterByScope\(req,allSections as any\[\]\);/.test(rules), "C قواعد التخرّج: أقسام النطاق وحدها (كان يُعاد كلُّ قسمٍ في الجامعة)");
  const rulesPut = route('app.put("/api/degree-rules/:sectionId"');
  check(/isScopeAllowed\(req,Number\(\(target as any\)\.AdCollegeId\),sectionId\)/.test(rulesPut), "C تعديل قاعدة قسمٍ خارج النطاق مرفوض");

  const affiliation = route('app.get("/api/instructors/:id/affiliation"');
  check(affiliation.includes("scopes.filter(scope => inScope(scope.collegeId, scope.sectionId))")
    && affiliation.includes(".filter(entry => inScope(entry.collegeId, entry.sectionId))"), "C أين يدرّس الأستاذ: داخل نطاق القارئ وحده");
  const affiliations = route('app.get("/api/instructor-affiliations"');
  check(/if \(!req\.user\?\.IsAdminUser && !isScopeAllowed\(req, collegeId, sectionId\)\) return;/.test(affiliations), "C خريطة انتساب الأساتذة: الجامعة للإدارة، والنطاق لغيرها");
  const delegates = route('app.get("/api/delegates"');
  check(delegates.includes("isScopeAllowed(req, Number(row.collegeId), Number(row.sectionId))"), "C منتدبو أدلّة أقسام النطاق وحدها");

  const changes = route('app.get("/api/reports/schedule-changes"');
  check(/readsFinalSchedulesOnly\(req\) && approval\.status !== "accepted"/.test(changes), "C العميدان لا يقرآن تقرير تغييرات جدولٍ لم يُعتمد");
  const balance = route('app.get("/api/reports/department-balance"');
  check(/if \(readsFinalSchedulesOnly\(req\)\) \{[\s\S]*?finalRowsOnly\(rows, termId\)/.test(balance), "C ميزان الأقسام للعميدين من النهائي وحده");

  const instructors = route('app.get("/api/instructors"');
  check(instructors.includes("instructorsForScope(req, list, civilQuery)") && !/\bsend\(sortArabicNamed/.test(instructors.replace(/await send\(/g, "")),
    "C دليل الأساتذة يمرّ كلُّه بقاعدة الرقم المدني الواحدة");
  const circle = server.slice(server.indexOf("async function instructorCircleFor"), server.indexOf("function maskCivilTail"));
  check(circle.includes("getInstructorsByScope(Number(row.AdSectionId), 0)") && circle.includes("getDepartmentDelegates("),
    "C حلقةُ القسم: من درّس فيه (كل الفصول) ومن ضمّه دليله");
  check(/if \(granted\.map\(Number\)\.includes\(3\)\) return null;/.test(circle) && circle.includes("isReadOnlyRole(req.user.Role)"),
    "C الإدارة وصاحب شاشة الأساتذة يرونه كاملاً، وصفات الاطّلاع لا ترى الرقم أصلاً");
  check(server.includes('return `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;'), "C من سوى الحلقة: آخر أربعة أرقام وحدها، وبلا هاتف");

  const owner = route('app.get("/api/rooms/owner"');
  check(owner.includes("isScopeAllowed(req, askCollege, askSection)"), "C «لمن هذه القاعة؟» يُسأل من قسمٍ في النطاق");
  const nature = route('app.get("/api/courses/nature"');
  check(nature.includes("isScopeAllowed(req, Number(natureSection.AdCollegeId), sectionId)") && !nature.includes("req.scopes?.some"),
    "C طبيعة المقررات بالحَكَم الواحد لا بمطابقةٍ ثانية");
  const lookups = route('app.get("/api/intelligence/lookups"');
  check(lookups.includes("scopeSectionIdsFor(req)") && !lookups.includes("(req.scopes||[]).map"), "C قوائم مركز الذكاء من أقسام الحَكَم الواحد");

  /* ── C-inventory: كل مسارٍ تحت /api إمّا يسأل حارسَ النطاق، أو مراجَعٌ باسمه ──
     مسارٌ جديد بلا حارسٍ ولا سطرٍ هنا يُسقط هذا الفحص: يُراجَع قبل أن يُدمج. */
  const GUARDS = ["isScopeAllowed", "filterByScope", "readScopedTermRows", "readSchedulesForRequest", "readLiveSchedulesForRequest",
    "scopeSectionIdsFor", "expandScopeSections", "approvalScopeFromBody", "scheduleConflicts", "readScheduleForException",
    "notificationItemsForTerm", "approvalBadgeForTerm", "owningSectionsInScopeFor", "requirePowerAdmin", "requireRootAdmin",
    "requirePermission(11)", "requirePermission(12)", "requirePermission(15)", "requireAnyPermission([11, 15])", "isPowerUser"];
  const REVIEWED: Record<string, string> = {
    "GET /api/version": "رقم الإصدار — لا بيانات",
    "GET /api/journey": "أعدادٌ مجمّعة عامّة عمداً (تُعرض قبل الدخول)، بلا أسماء",
    "GET /api/colleges": "أسماء كليات النطاق (تصفية بصفوف النطاق)",
    "POST /api/colleges": "دليلٌ جامعي، شاشة الكليات (٢)",
    "GET /api/terms": "الفصول جامعية",
    "POST /api/terms": "دليلٌ جامعي، شاشة الفصول (٥)",
    "PUT /api/terms/:id": "دليلٌ جامعي، شاشة الفصول (٥)",
    "PUT /api/instructors/:id": "دليل الأساتذة جامعي، شاشة الأساتذة (٣)",
    "DELETE /api/instructors/:id": "دليل الأساتذة جامعي، شاشة الأساتذة (٣)",
    "POST /api/department-rooms": "مرفوضٌ دائماً (٤٠٣)",
    "POST /api/schedules/meeting-slots": "نوافذ فراغٍ لأساتذةٍ يختارهم القارئ — بلا مقرّرٍ ولا قاعة",
    "POST /api/guide/intent": "دليل الاستخدام — لا بيانات",
    "GET /api/roles": "تعريفات الصفات — لا بيانات",
  };
  const routeHead = /\napp\.(get|post|put|delete|patch)\("([^"]+)"/g;
  const heads = [...server.matchAll(routeHead)];
  const unguarded: string[] = [];
  heads.forEach((match, i) => {
    const path_ = match[2];
    if (!path_.startsWith("/api/") || path_.startsWith("/api/public/") || path_.startsWith("/api/auth/") || path_.startsWith("/api/demo/")) return;
    const body = server.slice(match.index!, heads[i + 1]?.index ?? server.length);
    const key = `${match[1].toUpperCase()} ${path_}`;
    if (GUARDS.some(guard => body.includes(guard)) || REVIEWED[key]) return;
    unguarded.push(key);
  });
  check(unguarded.length === 0, `C-inventory كل مسارٍ يسأل حارس النطاق أو مراجَعٌ باسمه${unguarded.length ? ` — بلا حارس: ${unguarded.join("، ")}` : ""}`);
  const stale = Object.keys(REVIEWED).filter(key => !heads.some(match => `${match[1].toUpperCase()} ${match[2]}` === key));
  check(stale.length === 0, `C-inventory لا سطرَ مراجعةٍ لمسارٍ لم يعد موجوداً${stale.length ? ` (${stale.join("، ")})` : ""}`);
}

/* ── B-demo: الحسابُ المتعدّد المواقع في البيئة التجريبية ────────────────────── */
{
  const state = createDemoSandboxState();
  const assigns = state.collegeUserAssign.filter(row => row.SystemUserId === DEMO_MULTI_SITE.id);
  const scopes = assigns.map(row => ({ ...row, AdSectionName: state.sections.find(s => s.AdSectionId === row.AdSectionId)?.AdSectionName }));
  check(assigns.length === 3 && new Set(assigns.map(row => row.AdCollegeId)).size === 3, "B-demo حسابٌ بقسمٍ واحد في الكليات الثلاث");
  check(multiSiteDepartment(scopes)?.sites === 3, "B-demo يُقرأ «قسمك في 3 مواقع»");
  check(DEMO_SWITCH_ACCOUNTS.some(account => account.role === DEMO_MULTI_SITE.key && account.SystemUserId === DEMO_MULTI_SITE.id),
    "B-demo شريطُ الديمو يبدّل إليه بمفتاحه");
  check(demoActiveRoleKey(DEMO_MULTI_SITE.id, "committeeChair") === DEMO_MULTI_SITE.key && demoActiveRoleKey(16, "committeeChair") === "committeeChair",
    "B-demo الشريط يعرفه بمفتاحه لا بصفته، ولا يخلطه برئيس اللجنة الآخر");
  const rows = state.schedules.filter(row => assigns.some(a => a.AdSectionId === Number(row.AdSectionId)) && Number(row.AdTermId) === 1);
  check(rows.length === 6 && rows.every(row => row.fthursday && !row.fsunday && !row.fmonday), "B-demo موعدان لكل موقع يومَ الخميس");
  check(state.locationRooms.some(room => room.sectionIds.includes(6)) && state.locationRooms.some(room => room.sectionIds.includes(8)), "B-demo لكل موقعٍ قاعته");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
