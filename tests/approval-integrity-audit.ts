/**
 * ── حراسةُ ما انكسر مرّة ────────────────────────────────────────────────────
 *
 * كل فحصٍ هنا يقابل خللاً حقيقياً وُجد في هذا العمل بعد كتابته، وأكثرُها لا
 * تُظهره شاشةٌ ولا يوقفه مترجم: يبدو النظام عاملاً، ثم يقف عند أول دورةٍ حقيقية
 * أو يوسّع صلاحيةً بصمت.
 *
 * فهي مكتوبةٌ هنا لا لتثبت أن الكود صحيحٌ اليوم — بل لئلّا يعود إلى ما كان.
 */

import fs from "fs";
import path from "path";
import { roleDefinition } from "../src/utils/academicRoles";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
const repository = fs.readFileSync(path.join(process.cwd(), "src/db/repository.ts"), "utf8");
const adminUsers = fs.readFileSync(path.join(process.cwd(), "src/components/AdminUsers.tsx"), "utf8");
const indexes = JSON.parse(fs.readFileSync(path.join(process.cwd(), "firestore.indexes.json"), "utf8"));

/* ── ١) «الكلية كلها» تُجيز أقسامها ─────────────────────────────────────────
 *
 * كان النطاق يُكتب صفّاً واحداً بقسمٍ صفر، و`isScopeAllowed` تطلب تطابقاً
 * حرفياً على رقم القسم — فلا يُجيز الصفرُ قسماً واحداً. والنتيجة أن العميد
 * والتسجيل لا يستطيعان شيئاً في هذه الميزة كلها: وارِدٌ فارغٌ أبداً، وكل
 * ملاحظةٍ وقرارٍ يُردّ ٤٠٣. */

const scopeAt = server.indexOf("function isScopeAllowed");
const scopeBody = server.slice(scopeAt, scopeAt + 2400);
check(scopeBody.includes('scopeMode === "college" || scopeMode === "allColleges"'),
  "الصفر يعني «الكلية كلها» لصفات الكلية");
check(scopeBody.includes("Number(s.AdSectionId) === 0"), "ويُقرأ من صفّ النطاق نفسه");
check(scopeBody.includes("roleDefinition(req.user.Role).scopeMode"),
  "والتوسيع محكومٌ بالصفة: صفٌّ بصفرٍ في بياناتٍ قديمة لا تتوسّع صلاحيته لأنه صادف الشكل");
check(roleDefinition("dean").scopeMode === "college" && roleDefinition("registrarHead").scopeMode === "allColleges",
  "والصفات التي تحتاجه معرَّفةٌ به");
check(roleDefinition("committeeChair").scopeMode === "section" && roleDefinition("standard").scopeMode === "manual",
  "وصفاتُ القسم لا تناله");

/* الحارسان يجيبان من موضعٍ واحد. وافتراقُهما لا يُرفَض طلباً بل يُفرِغ شاشة:
   العميد يمرّ من الحارس فلا يُردّ، ثم تُصفّى بياناته فتخرج فارغة — شاشةٌ تفتح
   بلا شيءٍ ولا رسالةٍ ولا سببٍ ظاهر، وهو أعسرُ ما يُشخَّص. */
const filterAt = server.indexOf("function filterByScope");
const filterBody = server.slice(filterAt, filterAt + 1600);
check(filterBody.includes("return isScopeAllowed(req, Number(item.AdCollegeId), sectionId);"),
  "تصفيةُ النطاق تسأل الحارس نفسه، فلا تفترق عنه");
check(!filterBody.includes("s.AdSectionId === item.AdSectionId"),
  "ولم يبقَ منطقُ نطاقٍ ثانٍ يُصان وحده");

/* حسابٌ بلا صفةٍ يُقرأ «رئيس لجنة» في كل موضع، فحفظُه بها ليس تغييراً. وقراءةُ
   القيمة الخام كانت تجعله تغييراً فيُعاد كتابة القالب وتُمحى شاشاته — وهو بابٌ
   يُفتح كلّما تعذّر ترحيلُ حسابٍ عند الإقلاع. */
check(server.includes("const previousRole = roleDefinition((before as any)?.Role).id;"),
  "المقارنة على الصفة المحلولة لا على القيمة المخزّنة");
check(server.includes("const roleChanged = isAcademicRole(Role) && Role !== previousRole;"),
  "وتغييرُ الصفة وحده يُعيد كتابة القالب");

const createAt = server.indexOf('app.post("/api/users"');
const createBody = server.slice(createAt, createAt + 3000);
check(createBody.includes("applyRoleTemplate(newUser.SystemUserId, createdRole"),
  "والحساب الجديد يأخذ قالبه كاملاً: لا حساب يُنشأ بلا شاشة");

/* ── ٢) المحو فعلٌ مقصود ──────────────────────────────────────────────────
 *
 * تمرير `undefined` ليمحو حقلاً كان يُسقَط قبل الكتابة، فيبقى الحقل. وأثرُه:
 * إصرارُ التسجيل على ملاحظةٍ ردّ عليها القسم لا يمحو الردّ، فتبقى الخانة
 * رماديةً إلى الأبد ويُقرأ الإصرارُ قبولاً في كل عدٍّ بعده. */

check(repository.includes("clearFields: Array<keyof ScheduleComment> = []"),
  "المحو يُطلب بقائمة أسماء، لا بقيمةٍ غائبة");
check(repository.includes("for (const key of clearFields) delete updated[key];"), "ويُنفَّذ على النسخة السحابية");
check(repository.includes("for (const key of clearFields) delete merged[key];"), "وعلى النسخة المحلّية");
check(server.includes('rebuttalVerdict: "insisted",') && server.includes('}, ["rebuttal"]);'),
  "والإصرار يمحو الردّ فعلاً");
check(!server.includes("rebuttal: undefined"), "ولم يبقَ نداءٌ يظنّ أن الغياب محو");

/* ── ٣) القفل والموعد على كل بابٍ يكتب ───────────────────────────────────
 *
 * القفل كان على المسارات الثلاثة الظاهرة وحدها، وفي النظام أبوابٌ أخرى تكتب
 * على الجدول نفسه: استيرادٌ بالاعتماد، ونقلٌ جماعي، واستبدالُ أستاذ. وقفلٌ
 * يُلتفّ حوله من ثلاثة أبواب ليس قفلاً. */

for (const [route, span] of [
  ['app.post("/api/schedules/import"', 3000],
  ['app.post("/api/schedules/move-batch"', 2600],
  ['app.post("/api/schedules/replace-instructor"', 2200],
] as Array<[string, number]>) {
  const at = server.indexOf(route);
  const body = server.slice(at, at + span);
  check(at !== -1 && body.includes("scheduleLockRefusal"), `${route} يقرأ القفل`);
}
const importAt = server.indexOf('app.post("/api/schedules/import"');
const importBody = server.slice(importAt, importAt + 10000);
check(importBody.includes('wholesaleRefusal(collegeId, sectionId, termId, { kind: "import" })'),
  "والاستيراد يقرأ الموعد أيضاً: هو التسليم الشامل بعينه");
check(importBody.includes("if (commit)"), "والمعاينة تبقى مفتوحة: قراءةُ ملفٍّ ليست كتابةً على الجدول");
check(importBody.includes("createdRows.push(created)"),
  "وكلُّ صفٍّ يصل من الاستيراد يُسجَّل كأيِّ صفٍّ يُضاف باليد");

const moveAt = server.indexOf('app.post("/api/schedules/move-batch"');
const moveBody = server.slice(moveAt, moveAt + 5400);
check(moveBody.includes("touchedScopes"), "والنقل الجماعي يقرأ قفل كل نطاقٍ يمسّه");
check(moveBody.includes('noteScheduleMutation(req, scope.collegeId, scope.sectionId, scope.termId, { kind: "edit" })'),
  "ويُبلّغ عن تعديله: جدولٌ مقبولٌ يعود جولةً جديدة بعده");

/* ── ٤) القالب لا يمحو ما لم يُطلب محوه ──────────────────────────────────
 *
 * القالب يُعيد كتابة الشاشات والنطاق كاملين، وشاشةُ المستخدمين تُرسل الصفة في
 * كل حفظ. فإيقافُ حسابٍ أو تغييرُ كلمة سرّه كان يمحو كلَّ شاشةٍ مُنحت له
 * يدوياً خارج قالب صفته — بصمت، ودون أن يطلب أحد. */

check(server.includes("const roleChanged = isAcademicRole(Role) && Role !== previousRole;")
   && server.includes("if (roleChanged) {"),
  "القالب يُكتب عند تغيير الصفة لا عند كل حفظ");
check(server.includes("const before = await Repository.getUserById(id);"), "والصفة السابقة تُقرأ للمقارنة");
check(server.includes("if (requested.collegeIds === undefined) {"),
  "وحفظٌ لم يُذكر فيه نطاق لا يُقرأ «امحُ نطاقه»");
check(server.includes("async function applyRoleScopeOnly"), "وتغييرُ الكليات وحدها لا يمسّ الشاشات");
check(adminUsers.includes('if (mode === "users") setAssigns'),
  "وشاشةُ المستخدمين تقرأ النطاقات: نموذجُ العميد كان يُفتح بكلياتٍ فارغة فيمحوها أول حفظ");
check(adminUsers.includes(".catch(() => [])"),
  "وتقرؤها بتسامح: من يدير الحسابات ولا يملك شاشة النطاقات يبقى قادراً على عمله");
check(server.includes("app.get(\"/api/user-scopes\", requireAnyPermission([11, 15])"),
  "والقراءة متاحةٌ لإدارة الحسابات، والكتابة على صلاحية النطاقات وحدها");

/* ── ٥) أساس المقارنة لا يقع على جولةٍ بلا نسخة ──────────────────────────
 *
 * الجولة التي تُفتح تلقائياً بعد تعديل جدولٍ مقبول تُنشأ بلا نسخة، لأنها لم
 * تبدأ بإرسالٍ من أحد. والأخذُ بالجولة السابقة وحدها يقع عليها فيجد يداً
 * فارغة، فيُقارن الجدولُ بالعدم ويُعرض كاملاً على أنه جديد. */

check(server.includes("item.number < round && item.reviewedVersionId"),
  "المسح إلى الوراء حتى تُوجد نسخة، لا الجولة السابقة وحدها");

/* ── ٦) لا كتابةَ بلا تغيير ─────────────────────────────────────────────── */

check(server.includes("&& next.pendingAdditions.some(item => Number(item.scheduleId) === Number(change.row.id))"),
  "حذفُ موعدٍ لا يُعيد كتابة وثيقة الاعتماد إلا إن كان ينتظر إقراراً");

/* ── ٧) القراءات تحتمل الكثرة ────────────────────────────────────────────
 *
 * صندوق الوارد يُفتح على كليةٍ فيها عشرون قسماً، عشرين مرّةً في اليوم. وكان
 * يقرأ جدول الفصل كاملاً مرّةً لكل قسم. */

const inboxAt = server.indexOf('app.get("/api/approvals/inbox"');
const inboxBody = server.slice(inboxAt, inboxAt + 5200);
check(inboxBody.includes("Repository.getScheduleCommentsForTerm(termId)"), "ملاحظات الفصل تُقرأ مرّةً واحدة");
check(inboxBody.includes("rowsByScope"), "ومواعيدُه تُوزَّع في الذاكرة");
check(!inboxBody.includes("await Promise.all(visible.map"), "ولا قراءةَ لكل قسمٍ على حدة");
check(server.includes("function countBlockingConflicts("), "وعدُّ الموانع مفصولٌ عن قراءته");

check(repository.includes('.orderBy("createdAt", "desc")'),
  "والملاحظات تُرتَّب عند قاعدة البيانات: القصُّ قبل الترتيب يجعل عدّ ما يمنع الإرسال عشوائياً");

const commentIndexes = (indexes.indexes || []).filter((entry: any) => entry.collectionGroup === "scheduleComments");
check(commentIndexes.length === 2, "والفهرسان اللذان يحتاجهما الترتيب معرَّفان");
check(commentIndexes.some((entry: any) => entry.fields.length === 4), "فهرسُ القسم في فصل");
check(commentIndexes.some((entry: any) => entry.fields.length === 2), "وفهرسُ الفصل كله");

/* ── ٨) توحيدُ الحارسين لم يُوسّع شيئاً ──────────────────────────────────
 *
 * لِـ`isScopeAllowed` معنيان للصفر بحسب موضعه: صفرٌ في السؤال يعني «أله شيءٌ
 * في هذه الكلية؟»، وصفرٌ في صفّ النطاق يعني «الكلية كلها» لصفاتها وحدها.
 * ولمّا صارت التصفية تسأل الحارس نفسه، صار صفٌّ ناقصُ القسم يدخل من الباب
 * الأول فيُرى لكل من له أيُّ شيءٍ في تلك الكلية، أيّاً كانت صفته. */

check(filterBody.includes("if (sectionId <= 0) {"), "الصفُّ ناقصُ القسم يُفحص على حدة");
check(filterBody.includes('Number(s.AdSectionId) === 0'), "ويُطلب له تطابقٌ حرفيّ كما كان قبل التوحيد");

/* ── ٩) سحبُ النطاق ممكنٌ، والغيابُ ليس كالفراغ ─────────────────────────── */

check(server.includes("if (requested.collegeIds === undefined) {"),
  "حفظٌ لم يُذكر فيه نطاق لا يمحوه");
check(server.includes("if (!Array.isArray(collegeIds)) return;   // غيابٌ لا قرار"),
  "وقائمةٌ فارغة أُرسلت صراحةً سحبٌ يُنفَّذ، لا سهوٌ يُتجاوز");
check(server.includes('const previousWide = roleDefinition(previousRole).scopeMode;'),
  "والنزول عن صفةِ كليةٍ يأخذ صفوفَها معه: صفةٌ زالت لا يبقى لها أثرٌ يعمل");

/* ── ١٠) كل بابٍ يكتب على الجدول يقرأ القفل ─────────────────────────────── */

const copyAt = server.indexOf('app.post("/api/schedules/copy"');
const copyBody = server.slice(copyAt, copyAt + 4200);
check(copyBody.includes("scheduleLockRefusal(collegeId, sectionId, targetTermId)"), "ونسخُ الفصل يقرؤه أيضاً");
check(copyBody.includes("noteScheduleMutation"), "ويُبلّغ عمّا كتبه");

/* ── ١١) الاستيراد يُبلّغ دفعةً واحدة ───────────────────────────────────── */

check(importBody.includes('noteScheduleMutation(req, collegeId, sectionId, termId, { kind: "add", rows: createdRows })'),
  "الاستيراد يُبلّغ مرّةً لا مرّةً لكل صفّ");
check(server.includes("slice(0, 60)"),
  "وسجلُّ الإضافات المنتظِرة يبقى مقروءاً: استيرادُ ثلاثمئة صفٍّ ليس «شُعباً أُضيفت»");
check(server.includes("change: { kind: \"add\" | \"edit\" | \"delete\"; row?: any; rows?: any[] }"),
  "والإبلاغ يقبل الدفعة كما يقبل الصفّ");

/* ── ١٢) حالة الملاحظة واحدةٌ في كل شاشة ───────────────────────────────── */

check(inboxBody.includes("rowByIdForScope"),
  "الوارد يقيس حالة الملاحظة بصفوف قسمها، كما تقيسها شاشة القسم وبوّابة الإرسال");
check(!inboxBody.includes("rowById.get(Number(note.scheduleId))"),
  "ولا يقيسها بصفوف الفصل كله: عدّادٌ لا يملك القسمُ أن يُنزله أسوأ من عدّادٍ خاطئ");

/* ── ١٣) الفهرس يُبنى، والعمل لا يقف ───────────────────────────────────── */

check(repository.includes("const readCommentsOrdered"), "قراءةُ الملاحظات تحتمل فهرساً لم يكتمل بناؤه");
check(repository.includes("FAILED_PRECONDITION|requires an index"),
  "وتُميّز خطأ الفهرس من غيره، فلا تبتلع عطلاً حقيقياً");
check(repository.includes("const byNewestComment"), "والترتيب من موضعٍ واحد");
check(repository.includes('String(b.createdAt || "").localeCompare(String(a.createdAt || ""))'),
  "ويحتمل ملاحظةً بلا تاريخ: النسختان السحابية والمحلّية لا تفترقان عند البيانات الناقصة");

/* ── ١٤) الصفة التي تزول لا يبقى لها أثرٌ يعمل ──────────────────────────
 *
 * بابان كانا مفتوحين، وكلاهما من الشكل نفسه: صفةٌ نُزع عنها اسمُها وبقيت
 * قدرتُها. النزولُ إلى «مستخدم عادي» — وهو أشيعُ ما يُفعل حين يُراد تجريد
 * حسابٍ — كان لا يفعل شيئاً البتّة. والتنظيفُ كان يعرف صفاتِ الكلية الواحدة
 * ولا يعرف صفاتِ كل الكليات، وصفوفُ هذه صفٌّ لكل كليةٍ في الجامعة. */

const roleChangeAt = server.indexOf("const roleChanged = isAcademicRole(Role) && Role !== previousRole;");
const roleChangeBody = server.slice(roleChangeAt, roleChangeAt + 3000);
check(roleChangeBody.includes("if (roleChanged) {") && !roleChangeBody.includes('if (roleChanged && Role !== "standard")'),
  "النزول إلى «مستخدم عادي» يُعيد كتابة القالب كغيره");
/* «كليةٌ واحدة» و«كلُّ الكليات» ليستا شيئاً واحداً: الثانية صفٌّ لكل كليةٍ في
   الجامعة. فرئيسُ تسجيلٍ يُنزَّل عميداً لكليةٍ واحدة كان يحتفظ بالجامعة كلها —
   وهو نفسُ البابِ الذي أُغلق في الأضيق وبقي في الأوسع. */
check(roleChangeBody.includes("derivesWideRows(previousWide) && previousWide !== nextWide"),
  "تبدّلُ نوعِ الاشتقاق يُسقط ما اشتُقّ، ولو كان الاثنان واسعين");
check(roleChangeBody.includes("const derivesWideRows ="),
  "ويُبقي الصفوف حين لا يتبدّل النوع: العميد يصير مساعداً دون أن يفقد كليته");

const adminUsersSrc = fs.readFileSync(path.join(process.cwd(), "src/components/AdminUsers.tsx"), "utf8");
check(adminUsersSrc.includes('roleDefinition(storedRole).scopeMode === "college"'),
  "والشاشة لا تملأ حقل الكليات من صفةٍ تكتب صفّاً لكل كليةٍ في الجامعة");
check(adminUsersSrc.includes('item.readOnly ? " — للاطّلاع" : " — يعدّل"'),
  "وقائمةُ الصفات تسمّي الكاتبين كما تسمّي القارئين: الكتابةُ ليست الحالَ الصامتة");
check(roleChangeBody.includes("roleLabel(previousRole)"), "والسجلّ يقول من أيّ صفةٍ إلى أيّها");
/* والصفةُ المختارة تحمل قالبها، والصفةُ التي لم تُذكر لا تفرضه: حسابٌ يُنشأ
   بنداءٍ برمجيٍّ بلا صفة يبقى على العقد القديم — شاشةٌ واحدة — ولا يُمنح سبعاً
   لم يطلبها أحد. */
check(server.includes("if (isAcademicRole(Role)) {\n    await applyRoleTemplate(newUser.SystemUserId, createdRole,"),
  "الصفة المختارة تحمل قالبها عند الإنشاء");
check(server.includes("await Repository.createSecurity(newUser.SystemUserId, DECISION_CENTRE_FORM_ID);"),
  "ومن لم يذكر صفةً يبقى على العقد القديم: شاشةٌ واحدة وما بعدها قرارٌ صريح");

/* ── ١٥) كتابةُ سجلّ الاعتماد على طابورٍ واحد ──────────────────────────── */

const noteMutAt = server.indexOf("async function noteScheduleMutation");
const noteMutBody = server.slice(noteMutAt, noteMutAt + 4200);
check(noteMutBody.includes("withSerialLock(`approval:${collegeId}:${sectionId}:${termId}`"),
  "تحديثُ السجلّ بعد تعديل الجدول على الطابور نفسه الذي تقف عليه قراراتُ الدورة");
/* القفل غيرُ قابلٍ لإعادة الدخول، فتداخلُ مفتاحين متطابقين توقّفٌ تام. */
const approvalLockSites = [...server.matchAll(/withSerialLock\(`approval:/g)].map(m => m.index || 0);
const nested = approvalLockSites.filter(at => server.slice(at, at + 2600).includes("noteScheduleMutation("));
check(nested.length === 0, "ولا قفلَ داخل قفلٍ بالمفتاح نفسه: التداخل توقّفٌ تام لا بطء");

/* ── ١٦) الموعد المنتقل إضافةٌ عند وجهته ───────────────────────────────── */

check(server.includes('movedScope ? { kind: "add", row: updated } : { kind: "edit", row: updated }'),
  "شعبةٌ انتقلت إلى قسمٍ بعد توقيع رئيسه تُسجَّل في انتظار إقراره");
check(server.includes("const movedScope = existing.AdCollegeId !== collegeId"),
  "والقسمُ الذي غادرته يُبلَّغ أيضاً: يتغيّر ولو بالنقصان");

/* ══════════════════════════════════════════════════════════════════════════
   ما كشفته مراجعةٌ آلية على الطلب
   ══════════════════════════════════════════════════════════════════════════ */

/* ── النشرُ يكتب على ثلاثة أقسام، والقفل كان يُقرأ على واحد ───────────────
 * وثيقةُ الاعتماد الواحدة تحمل مواقع الفرع الثلاثة. فقسمٌ شقيقٌ جدولُه بين
 * يدي التسجيل كان يُستبدل جدولُه كاملاً وهو يُقرأ. */
const publishAt = server.indexOf('app.post("/api/intelligence/drafts/:id/publish"');
const publishBody = server.slice(publishAt, publishAt + 22000);
check(publishBody.includes("const groupLock = await scheduleLockRefusal(group.scope.collegeId,group.scope.sectionId,draft.AdTermId);")
   || publishBody.includes("const groupLock=await scheduleLockRefusal(group.scope.collegeId,group.scope.sectionId,draft.AdTermId);"),
  "النشر يقرأ قفل كل موقعٍ يكتب فيه");
check(publishBody.includes("const groupDeadline=await wholesaleRefusal(group.scope.collegeId"),
  "وموعدَ كل موقعٍ كذلك");
const groupsAt = publishBody.indexOf("const groups=split.groups.map");
const lockAt = publishBody.indexOf("const groupLock");
const writeAt = publishBody.indexOf("Repository.replaceScheduleScope(group.scope");
check(groupsAt !== -1 && lockAt > groupsAt && lockAt < writeAt,
  "والفحص بعد بناء المجموعات وقبل أول كتابة: النشر يقع كلُّه أو لا يقع");
check(publishBody.includes('noteScheduleMutation(req,group.scope.collegeId,group.scope.sectionId,draft.AdTermId,{kind:"add"'),
  "وكلُّ موقعٍ يُبلّغ سجلَّ اعتماده هو، لا سجلَّ موقع المسودة");

/* ── الاسترجاع يستبدل الجدول كله ولا يُعلم أحداً ─────────────────────────── */
check((server.match(/noteScheduleMutation\(req,version\.AdCollegeId/g) || []).length === 2,
  "الاسترجاع والتراجع يُبلّغان سجلَّ الاعتماد: جدولٌ مقبولٌ استُبدل يعود جولةً جديدة");

/* ── الملاحظةُ المحسومة ليست ملاحظةً تنتظر ───────────────────────────────
 * قبولُ التبرير يُغلق الملاحظة ويُبقي نصَّ الردّ للحجّة. وقراءةُ الردّ وحدها
 * كانت تُبقيها «أُجيب عنها» أبداً: يعدّها الوارد ردّاً ينتظر قراراً، وتُعرض
 * أزرارُ القرار على قرارٍ اتُّخذ. */
const noteStateAt = server.indexOf("function noteState");
const noteStateBody = server.slice(noteStateAt, noteStateAt + 1400);
check(noteStateBody.indexOf('note.resolved || note.rebuttalVerdict === "accepted"') < noteStateBody.indexOf("if (note.rebuttal) return"),
  "الحسمُ يُقرأ قبل الردّ");
check(noteStateBody.includes('return "resolved"'), "وللمحسومة حالٌ تخصّها");

/* ── «كل الكليات» إذنٌ لا لقطة ───────────────────────────────────────────
 * كان يُكتب صفّاً لكل كليةٍ موجودة يوم الحفظ، فكليةٌ أُنشئت بعده لا صفَّ لها —
 * ويُردّ عنها رئيسُ التسجيل بصمت، وشاشتُه تعده بأن اللاحق مشمول. */
check(scopeBody.includes('roleDefinition(req.user.Role).scopeMode === "allColleges") return true;'),
  "صفةُ كلِّ الكليات إذنٌ بنفسها، فلا يشيخ حكمُها بشيخوخة صفوفها");
const wildcardAt = scopeBody.indexOf('scopeMode === "allColleges") return true');
check(wildcardAt !== -1 && wildcardAt < scopeBody.indexOf("if (!req.scopes) return false;"),
  "ويُقرأ قبل الصفوف، فلا يقف عند غيابها");

console.log(`\n${passed} نجحت · ${failed} أخفقت`);
if (failed > 0) process.exit(1);
