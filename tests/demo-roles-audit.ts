/**
 * ── تدقيق صفات البيئة التجريبية ─────────────────────────────────────────────
 *
 * سأل العميدُ أن يجرّب النظامَ بصفةِ كل مستخدم كما تُجرَّب في ميزان: يبدّل الصفة
 * من شريط الديمو فيرى شاشةَ العميد أو التسجيل أو رئيس القسم بنطاقها. وهذه
 * الميزة تعمل فقط إن حُقن الصندوقُ بحسابٍ لكل صفة، بنطاقٍ وصلاحياتٍ صحيحين،
 * وببياناتِ دورةٍ عاشت لا صندوقٍ فارغ.
 *
 * وما يحرسه هذا الملفّ:
 *   ١) حسابٌ لكل صفة، بصلاحياتها ونطاقها المشتقّين من التعريف نفسه.
 *   ٢) دورةُ اعتمادٍ مبذورة: إرسالٌ وإرجاعٌ وقبول، بأساسٍ للمقارنة وملاحظات.
 *   ٣) الملاحظاتُ المفتوحة مفتوحةٌ فعلاً — قيمتُها تطابق الصفّ الحيّ.
 *   ٤) الخادمُ يبدّل الصفة، ويكشف قائمتها، والحارس يسمح بالمسار.
 */

import fs from "fs";
import path from "path";
import { createDemoSandboxState, DEMO_ROLE_ACCOUNTS } from "../src/db/demoSandbox";
import { ACADEMIC_ROLES, roleDefinition, isViewerOnlyRole } from "../src/utils/academicRoles";
import { isApprovalWritePath, roleWriteDecision } from "../src/server/roleGuard";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const state = createDemoSandboxState();
const userById = new Map(state.users.map(u => [u.SystemUserId, u]));
const securityByUser = (id: number) => state.formSecurity.filter(s => s.SystemUserId === id).map(s => s.FormNameId).sort((a, b) => a - b);
const assignsByUser = (id: number) => state.collegeUserAssign.filter(a => a.SystemUserId === id);

/* ── ١) حسابٌ لكل صفة ───────────────────────────────────────────────────── */

check(DEMO_ROLE_ACCOUNTS.length === ACADEMIC_ROLES.length,
  `شريط الديمو يعرض الصفات كلها: ${DEMO_ROLE_ACCOUNTS.length} من ${ACADEMIC_ROLES.length}`);

for (const account of DEMO_ROLE_ACCOUNTS) {
  const user = userById.get(account.SystemUserId);
  check(Boolean(user), `«${account.label}» له حسابٌ في الصندوق`);
  check(!!user && String((user as any).Role) === account.role, `«${account.label}» يحمل صفتَه`);
  check(!!user && user.IsActive && !user.IsDeleted && !user.IsLocked, `«${account.label}» حسابٌ فعّال`);
  // الصلاحيات من القالب نفسه الذي يحكم الحساب الحقيقي.
  const expected = [...roleDefinition(account.role).formIds].sort((a, b) => a - b);
  check(JSON.stringify(securityByUser(account.SystemUserId)) === JSON.stringify(expected),
    `«${account.label}» شاشاتُه من قالب الصفة، لا أكثر`);
}

// المدير (الجذر) موجودٌ ويملك كل الشاشات — وهو مدخل البيئة.
const admin = userById.get(1);
check(!!admin && admin.IsAdminUser === true, "حساب المدير الجذر موجودٌ ومسؤول");
check(securityByUser(1).length === state.formNames.length, "المدير يملك كل الشاشات");

/* ── ٢) النطاق يُشتقّ من scopeMode ──────────────────────────────────────── */

const dean = DEMO_ROLE_ACCOUNTS.find(a => a.role === "dean")!;
check(assignsByUser(dean.SystemUserId).every(a => a.AdSectionId === 0) && assignsByUser(dean.SystemUserId).length >= 1,
  "العميد على كليةٍ كاملة، بلا قسمٍ قسم");

const head = DEMO_ROLE_ACCOUNTS.find(a => a.role === "registrarHead")!;
check(assignsByUser(head.SystemUserId).length === state.colleges.length,
  "رئيس التسجيل على كل الكليات");

const dept = DEMO_ROLE_ACCOUNTS.find(a => a.role === "departmentHead")!;
check(assignsByUser(dept.SystemUserId).some(a => a.AdSectionId > 0),
  "رئيس القسم على قسمٍ بعينه");

for (const account of DEMO_ROLE_ACCOUNTS) {
  if (isViewerOnlyRole(account.role)) {
    check(roleDefinition(account.role).readOnly, `«${account.label}» صفةُ اطّلاع، لا تكتب`);
  }
}

/* ── ٣) دورةٌ عاشت، لا صندوقٌ فارغ ──────────────────────────────────────── */

check(state.scheduleApprovals.length >= 3, "بُذرت دورةُ اعتمادٍ لعدّة أقسام");
const submitted = state.scheduleApprovals.find(a => a.status === "submitted");
const returned = state.scheduleApprovals.find(a => a.status === "returned");
const accepted = state.scheduleApprovals.find(a => a.status === "accepted");
check(!!submitted, "قسمٌ عند التسجيل — يظهر في وارد المراجعة");
check(!!returned, "قسمٌ مُرجَعٌ — ينتظر ردّ القسم");
check(!!accepted, "قسمٌ معتمد");

check(!!submitted && submitted.currentRound >= 2, "القسم المُرسَل في جولةٍ ثانية — للدورة تاريخ");
const baselineId = submitted?.rounds.find(r => r.reviewedVersionId)?.reviewedVersionId;
check(!!baselineId, "للمقارنة أساسٌ محفوظ: نسخةٌ رآها التسجيل");
const baseline = state.scheduleVersions.find(v => v.id === baselineId);
check(!!baseline && baseline.rows.length > 0, "النسخة الأساس تحمل صفوفاً — فالتقرير يُظهر ما تحرّك لا جدولاً جديداً");
check(!!submitted && submitted.signatures.length === 2, "القسم المُرسَل موقّعٌ من اللجنة ومن رئيس القسم");

/* ── ٤) الملاحظاتُ المفتوحة مفتوحةٌ فعلاً ───────────────────────────────── */

const scheduleById = new Map(state.schedules.map(r => [Number(r.id), r]));
function liveValue(row: any, field: string): string {
  if (field === "room") return `${String(row.AdRoomCode || "")}/${String(row.AdRoomHall || "")}`;
  if (field === "instructor") return String(Number(row.AdInstructorId || 0));
  if (field === "time") return `${String(row.fstarttime || "")}-${String(row.fendtime || "")}`;
  return "";
}
const registrarNotes = state.scheduleComments.filter(c => c.origin === "registrar" && !c.rebuttal);
check(registrarNotes.length > 0, "ثمّة ملاحظاتُ تسجيلٍ مبذورة");
for (const note of registrarNotes) {
  const row = scheduleById.get(Number(note.scheduleId));
  check(!!row, `ملاحظةُ التسجيل معلّقةٌ على صفٍّ موجود (${note.id})`);
  check(!!row && liveValue(row, String(note.field)) === String(note.valueAtNote),
    `ملاحظةٌ «مفتوحة»: قيمتُها تطابق الصفّ الحيّ فلا تُقرأ «عُولجت» وهي على حالها (${note.id})`);
}
// ملاحظةٌ رُدَّ عليها لتظهر لدى التسجيل «تنتظر قرارك».
check(state.scheduleComments.some(c => c.origin === "registrar" && c.rebuttal), "ملاحظةٌ ردّ عليها القسم — تنتظر قرار التسجيل");
// ملاحظةٌ داخليةٌ من القسم لا تمنع الإرسال.
check(state.scheduleComments.some(c => c.origin === "department"), "ملاحظةٌ داخليةٌ من القسم");

/* ── ٥) الخادمُ يبدّل الصفة، والحارس يسمح بالمسار ───────────────────────── */

const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
check(server.includes('app.post("/api/demo/role"'), "الخادم يفتح مسار تبديل الصفة");
check(server.includes('app.post("/api/demo/role", rateLimitDemoRole,'),
  "ومسارُ التبديل محدودُ المعدّل بحدٍّ يُطبَّق دائماً — لا يُترك مساراً مصادَقاً بلا حدّ");
check(server.includes("Repository.createSession(sessionId, targetId, DEMO_SESSION_TTL_MS)"),
  "التبديل يعيد ربط الجلسة بحساب الصفة المطلوبة");
check(server.includes("if (!Repository.isDemoRequest())") && server.slice(server.indexOf('app.post("/api/demo/role"')).includes("isDemoRequest"),
  "وهو مقصورٌ على البيئة التجريبية: لا رفعَ صلاحيةٍ في جلسةٍ حقيقية");
check(server.includes("DEMO_ROLE_ACCOUNTS") && server.includes("roles: DEMO_ROLE_ACCOUNTS"),
  "قائمةُ الصفات تصل الواجهةَ مع حمولة الجلسة");
check(server.includes("fullSchedule"), "تقرير التغييرات يحمل الجدول كاملاً، لا التغييرات وحدها");

// الحارس يسمح بمسار تبديل الصفة كإجراء جلسة، لا يردّه ٤٠٣ على صفةٍ للاطّلاع.
const verdict = roleWriteDecision({ method: "POST", path: "/demo/role", authenticated: true, powerUser: false, role: "dean" });
check(verdict.allowed, "الحارس يمرّر /demo/role ولو كانت الصفة الحالية للاطّلاع");
check(!isApprovalWritePath("/demo/role"), "و/demo/role ليس مسار اعتماد");

console.log(`\n${passed} نجحت · ${failed} أخفقت`);
if (failed > 0) process.exit(1);
