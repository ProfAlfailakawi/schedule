/**
 * ── تدقيق حارس الأدوار ──────────────────────────────────────────────────────
 *
 * هذا الملف هو الثمن الحقيقي للمرحلة الأولى. الكود الذي يمنع العميد من التعديل
 * أسطرٌ قليلة؛ والبرهان على أنه يمنعه فعلاً — ويبقى مانعاً بعد كل تعديلٍ على
 * الخادم — هو ما يلي.
 *
 * ثلاث طبقات:
 *   ١) تعريف الأدوار نفسه: من يقرأ، ومن يكتب، ومن يوقّع.
 *   ٢) قرار الحارس على كل تركيبةٍ ممكنة من طريقةٍ ومسارٍ وصفة.
 *   ٣) تدقيقٌ نصّي على ‎server.ts‎ يثبت أن الحارس ما زال مركّباً في موضعه —
 *      لأن دالّةً صحيحةً لا يستدعيها أحد لا تحمي شيئاً.
 */

import fs from "fs";
import path from "path";
import {
  ACADEMIC_ROLES, DEFAULT_MIGRATION_ROLE, canManageDeadline, canReviewSubmissions,
  isAcademicRole, isReadOnlyRole, isViewerOnlyRole, roleDefinition, roleLabel, signatureStage,
  type AcademicRole,
} from "../src/utils/academicRoles";
import { isApprovalWritePath, readOnlyRefusal, roleWriteDecision } from "../src/server/roleGuard";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

/* ── ١) تعريف الأدوار ───────────────────────────────────────────────────── */

const READERS: AcademicRole[] = ["dean", "viceDean", "registrarDean", "registrarHead", "registrarStaff", "departmentHead"];
const WRITERS: AcademicRole[] = ["committeeChair", "standard"];

for (const role of READERS) check(isReadOnlyRole(role), `«${roleLabel(role)}» صفة اطّلاع`);
for (const role of WRITERS) check(!isReadOnlyRole(role), `«${roleLabel(role)}» صفة تكتب`);

check(ACADEMIC_ROLES.length === READERS.length + WRITERS.length, "كل صفةٍ معرَّفة مصنّفة: لا صفة بلا حكم");
check(new Set(ACADEMIC_ROLES.map(r => r.id)).size === ACADEMIC_ROLES.length, "لا تكرار في معرّفات الصفات");
check(new Set(ACADEMIC_ROLES.map(r => r.order)).size === ACADEMIC_ROLES.length, "ترتيب العرض بلا تصادم");
check(ACADEMIC_ROLES.every(r => r.label.trim().length > 0 && r.hint.trim().length > 0), "كل صفةٍ لها اسمٌ وسطرُ شرح");

check(isViewerOnlyRole("dean") && isViewerOnlyRole("viceDean") && isViewerOnlyRole("registrarDean"), "العمداء الثلاثة عرضٌ صرف");
check(!isViewerOnlyRole("registrarHead") && !isViewerOnlyRole("registrarStaff") && !isViewerOnlyRole("departmentHead"), "من يشارك في الدورة ليس عرضاً صرفاً");

check(canReviewSubmissions("registrarHead") && canReviewSubmissions("registrarStaff"), "التسجيل يراجع الوارد");
check(!canReviewSubmissions("dean") && !canReviewSubmissions("registrarDean") && !canReviewSubmissions("committeeChair"), "المراجعة للتسجيل وحده");
check(canManageDeadline("registrarHead"), "رئيس التسجيل يضع الموعد");
check(ACADEMIC_ROLES.filter(r => canManageDeadline(r.id)).length === 1, "الموعد بيد واحدة لا أكثر");

check(signatureStage("committeeChair") === "committee", "اللجنة توقّع أولاً");
check(signatureStage("departmentHead") === "head", "رئيس القسم يوقّع ثانياً");
check(ACADEMIC_ROLES.filter(r => signatureStage(r.id) !== null).length === 2, "لا يوقّع إلا اثنان");

check(roleDefinition(undefined).id === DEFAULT_MIGRATION_ROLE, "حسابٌ بلا صفة يُقرأ رئيس لجنة");
check(roleDefinition(null).id === DEFAULT_MIGRATION_ROLE, "القيمة الفارغة كالغياب");
check(roleDefinition("مدير الجامعة").id === DEFAULT_MIGRATION_ROLE, "صفةٌ مجهولة لا تُرقّي أحداً");
check(!isAcademicRole("dean_"), "التحقّق من الصفة لا يقبل ما يشبهها");
check(!isReadOnlyRole(undefined), "الغياب لا يقفل حساباً قائماً");

/* ── ٢) قرار الحارس ────────────────────────────────────────────────────── */

const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
/* عيّنةٌ من مسارات الكتابة الحقيقية في هذا الخادم، بما فيها ما يبدو بريئاً. */
const DATA_PATHS = [
  "/schedules", "/schedules/418", "/courses", "/courses/12", "/instructors",
  "/sections", "/colleges", "/terms", "/rooms", "/users", "/permissions",
  "/user-scopes", "/intelligence/drafts", "/intelligence/drafts/d1/publish",
  "/hall-barter/requests", "/schedule-versions", "/system-backup/import",
  "/visiting-roster", "/department-rooms", "/schedule-constraints",
];

for (const role of READERS) {
  for (const method of WRITE_METHODS) {
    for (const p of DATA_PATHS) {
      const verdict = roleWriteDecision({ method, path: p, authenticated: true, powerUser: false, role });
      if (verdict.allowed) { check(false, `ثغرة: ${roleLabel(role)} استطاع ${method} ${p}`); }
    }
  }
}
check(true, `كل صفات الاطّلاع مُنعت من ${WRITE_METHODS.length * DATA_PATHS.length} تركيبة كتابة`);

for (const role of WRITERS) {
  const all = DATA_PATHS.every(p => WRITE_METHODS.every(m =>
    roleWriteDecision({ method: m, path: p, authenticated: true, powerUser: false, role }).allowed));
  check(all, `«${roleLabel(role)}» يكتب كما كان قبل هذه الإضافة`);
}

for (const role of READERS) {
  const reads = DATA_PATHS.every(p => ["GET", "HEAD", "OPTIONS"].every(m =>
    roleWriteDecision({ method: m, path: p, authenticated: true, powerUser: false, role }).allowed));
  check(reads, `«${roleLabel(role)}» يقرأ كل شيء بلا عائق`);
}

const APPROVAL_PATHS = ["/approvals", "/approvals/sign", "/approvals/1:2:3/return", "/schedule-notes", "/schedule-notes/n1/resolve"];
for (const role of ["registrarHead", "registrarStaff", "departmentHead"] as AcademicRole[]) {
  const ok = APPROVAL_PATHS.every(p => roleWriteDecision({ method: "POST", path: p, authenticated: true, powerUser: false, role }).allowed);
  check(ok, `«${roleLabel(role)}» يشارك في دورة الاعتماد`);
}
for (const role of ["dean", "viceDean", "registrarDean"] as AcademicRole[]) {
  const blocked = APPROVAL_PATHS.every(p => !roleWriteDecision({ method: "POST", path: p, authenticated: true, powerUser: false, role }).allowed);
  check(blocked, `«${roleLabel(role)}» لا يكتب حتى في دورة الاعتماد`);
}

check(isApprovalWritePath("/approvals") && isApprovalWritePath("/approvals/x/sign"), "مسار الاعتماد يُعرف بجذره وفروعه");
check(!isApprovalWritePath("/approvals-export"), "بادئةٌ مشابهة لا تُفتح: لا يكفي أن يبدأ المسار بالحروف نفسها");
check(!isApprovalWritePath("/schedules"), "مسار الجداول ليس من الدورة");

check(roleWriteDecision({ method: "POST", path: "/auth/logout", authenticated: true, powerUser: false, role: "dean" }).allowed, "الخروج مفتوحٌ لكل صفة");
check(roleWriteDecision({ method: "POST", path: "/auth/heartbeat", authenticated: true, powerUser: false, role: "dean" }).allowed, "النبض ليس تعديلاً");
check(roleWriteDecision({ method: "DELETE", path: "/schedules/1", authenticated: true, powerUser: true, role: "dean" }).allowed, "الإدارة الرئيسية فوق الصفات");
check(roleWriteDecision({ method: "POST", path: "/schedules", authenticated: false, powerUser: false, role: "dean" }).allowed, "غير الموثَّق شأنُ حارس المصادقة لا هذا");
check(roleWriteDecision({ method: "post", path: "/schedules", authenticated: true, powerUser: false, role: "dean" }).allowed === false, "الطريقة تُقرأ بلا حساسيةٍ لحالة الأحرف");
check(!roleWriteDecision({ method: "POST", path: "/schedules", authenticated: true, powerUser: false, role: undefined }).allowed === false, "حسابٌ بلا صفة يكتب: الترحيل راحةٌ لا شرط");

/* الصفحات العامة يحكمها الرمز لا الحساب: عضو هيئة مسجّلُ الدخول بصفة اطّلاع
   (رئيس قسم، عميد) يُرسل بطاقته ويوقّع طلبه كأيّ زائر. */
for (const role of READERS) {
  for (const p of ["/public/staff/abc", "/public/staff/abc/note", "/public/request/abc", "/public/request/abc/check", "/public/survey/abc"]) {
    const v = roleWriteDecision({ method: "POST", path: p, authenticated: true, powerUser: false, role });
    check(v.allowed && v.reason === "public", `«${roleLabel(role)}» يكتب في الصفحة العامة ${p} بصفته صاحب الرابط`);
  }
}
check(!roleWriteDecision({ method: "POST", path: "/publications", authenticated: true, powerUser: false, role: "dean" }).allowed,
  "البابُ العام بمساره الكامل ‎/public/‎ لا بما يبدأ بحروفه");
check(!roleWriteDecision({ method: "POST", path: "/schedules/public/1", authenticated: true, powerUser: false, role: "dean" }).allowed,
  "كلمةُ public في وسط المسار لا تفتح شيئاً");

const refusal = readOnlyRefusal("dean");
check(refusal.readOnly === true && refusal.role === "dean", "الرفض يُسمّي الصفة للواجهة");
check(refusal.error.includes("عميد الكلية"), "الرفض يُقرأ بالعربية ويسمّي الصفة لصاحبه");

/* ── ٣) الحارس مركّبٌ في موضعه ──────────────────────────────────────────── */

const serverSource = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
check(serverSource.includes("roleWriteDecision"), "الخادم يستدعي قرار الحارس");
check(serverSource.includes("readOnlyRefusal"), "الخادم يردّ برسالة الرفض المعرَّفة");

const guardAt = serverSource.indexOf("roleWriteDecision({");
const authAt = serverSource.indexOf('app.use("/api", authMiddleware');
const firstWriteRoute = Math.min(
  ...["app.post(\"/api/", "app.put(\"/api/", "app.delete(\"/api/", "app.patch(\"/api/"]
    .map(needle => { const at = serverSource.indexOf(needle); return at === -1 ? Number.MAX_SAFE_INTEGER : at; })
);
check(guardAt > authAt && authAt !== -1, "الحارس بعد التعرّف على صاحب الحساب: لا يُحكم على صفةٍ لم تُقرأ بعد");
check(guardAt < firstWriteRoute, "الحارس قبل أول مسار كتابة: لا مسار يسبقه فيفلت منه");
check(serverSource.includes('app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextFunction) => {\n  const verdict = roleWriteDecision({'),
  "الحارس على مدخل /api كله، لا على مسارٍ بعينه");

check(serverSource.includes("migrateLegacyAccountsToCommitteeRole"), "ترحيل الحسابات القائمة مُستدعى عند الإقلاع");
check(/if \(!databaseFailure\) await migrateLegacyAccountsToCommitteeRole\(\);/.test(serverSource), "الترحيل لا يعمل على قاعدةٍ لم تُقلع");

/* ── مصالحةُ رؤساء الأقسام: نزعُ شاشة الورشة عن الحسابات القائمة ──────────────
 * تغييرُ القالب وحده لا يكفي: الحسابُ القائم يحمل الشاشة ٧ محفوظةً، وحفظُه لا
 * يُعيد القالب إلا عند تغيّر الصفة. فتُنزع عند الإقلاع. */
check(serverSource.includes("async function reconcileDepartmentHeadPermissions"), "مصالحةُ صلاحيات رؤساء الأقسام معرَّفة");
check(/if \(!databaseFailure\) await reconcileDepartmentHeadPermissions\(\);/.test(serverSource), "وتُستدعى عند الإقلاع على قاعدةٍ مُقلِعة");
check(/String\(\(user as any\)\.Role\) !== "departmentHead"/.test(serverSource) && serverSource.includes("filter(id => id !== SCHEDULE_WORKSPACE_FORM_ID)"),
  "تنزع الشاشة ٧ عن رؤساء الأقسام وحدهم، وتبقي بقيةَ صلاحياتهم");

console.log(`\n${passed} نجحت · ${failed} أخفقت`);
if (failed > 0) process.exit(1);
