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
check(filterBody.includes("isScopeAllowed(req, Number(item.AdCollegeId), Number(item.AdSectionId))"),
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
check(server.includes('{ rebuttalVerdict: "insisted" }, ["rebuttal"]'), "والإصرار يمحو الردّ فعلاً");
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
check(importBody.includes('noteScheduleMutation(req, collegeId, sectionId, termId, { kind: "add", row: created })'),
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

check(server.includes("if (roleChanged && Role !== \"standard\") {"),
  "القالب يُكتب عند تغيير الصفة لا عند كل حفظ");
check(server.includes("const before = await Repository.getUserById(id);"), "والصفة السابقة تُقرأ للمقارنة");
check(server.includes("if (assigns.length) await Repository.saveUserAssigns(userId, assigns);"),
  "وقائمةُ كلياتٍ فارغة لا تُقرأ «امحُ نطاقه»");
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
const inboxBody = server.slice(inboxAt, inboxAt + 4200);
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

console.log(`\n${passed} نجحت · ${failed} أخفقت`);
if (failed > 0) process.exit(1);
