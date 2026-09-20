/**
 * ── قرار حارس الأدوار، معزولاً عن الخادم ────────────────────────────────────
 *
 * الحارس نفسه سطرٌ واحد في ‎server.ts‎، لكنّ القرار الذي يتّخذه هو كل شيء:
 * إن أخطأ، فُتح للعميد بابُ تعديلٍ لا يظهر في أي شاشة. وملفُّ خادمٍ من اثني
 * عشر ألف سطر لا يُختبر بالنيّة؛ يُختبر بدالّةٍ تُستدعى وتُسأل.
 *
 * فالقرار هنا: دالّةٌ نقيّة، لا تعرف شيئاً عن express، تأخذ الطريقة والمسار
 * والصفة وتردّ بنعم أو لا وبالسبب. الخادم يستدعيها، والاختبار يستدعيها —
 * فلا يمكن أن يفترق ما يُختبر عمّا يُنفَّذ.
 */

import { isReadOnlyRole, isViewerOnlyRole, roleDefinition } from "../utils/academicRoles";

/** مسارات دورة الاعتماد: البابُ الضيّق الذي يمرّ منه القارئ دون أن يمسّ جدولاً. */
export const APPROVAL_WRITE_PREFIXES = ["/approvals", "/schedule-notes"] as const;

/** ما ليس تعديلاً على بيانات: الدخول والخروج والنبض والحضور. */
export const SESSION_WRITE_PATHS = new Set([
  "/auth/logout", "/auth/heartbeat", "/auth/presence",
  "/auth/login", "/auth/demo", "/demo/reset", "/demo/role", "/telemetry/client",
]);

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface RoleGuardInput {
  method: string;
  /** المسار داخل ‎/api‎، مثل ‎/schedules/418‎ — لا المسار الكامل. */
  path: string;
  /** هل المستخدم موثَّق أصلاً؟ غير الموثَّق يردّه حارس المصادقة، لا هذا. */
  authenticated: boolean;
  /** حساب الإدارة الرئيسي فوق الأدوار: هو من يوزّعها. */
  powerUser: boolean;
  role: unknown;
}

export type RoleGuardVerdict =
  | { allowed: true; reason: "read" | "unauthenticated" | "session" | "power" | "writer" | "approval" }
  | { allowed: false; reason: "read-only-role" };

export function isApprovalWritePath(pathname: string): boolean {
  return APPROVAL_WRITE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * الترتيب مقصود، وكل سطرٍ فيه يسبق ما بعده لسبب:
 *
 * القراءة أولاً لأنها الأغلب ولا شأن للأدوار بها. ثم غير الموثَّق، لأن ردّه
 * ليس من شأن هذا الحارس. ثم مسارات الجلسة، لأن منع الخروج عبثٌ صريح. ثم
 * الإدارة الرئيسية. ثم من يكتب أصلاً. وأخيراً البابُ الضيّق — ولا يُفتح إلا
 * لمن يشارك في الدورة، لا لمن جاء ليطّلع فحسب.
 */
export function roleWriteDecision(input: RoleGuardInput): RoleGuardVerdict {
  if (READ_METHODS.has(input.method.toUpperCase())) return { allowed: true, reason: "read" };
  if (!input.authenticated) return { allowed: true, reason: "unauthenticated" };
  if (SESSION_WRITE_PATHS.has(input.path)) return { allowed: true, reason: "session" };
  if (input.powerUser) return { allowed: true, reason: "power" };
  if (!isReadOnlyRole(input.role)) return { allowed: true, reason: "writer" };
  if (isApprovalWritePath(input.path) && !isViewerOnlyRole(input.role)) return { allowed: true, reason: "approval" };
  return { allowed: false, reason: "read-only-role" };
}

/** الرسالة كما يقرؤها صاحب الحساب: تقول الصفة، لا رمزاً. */
export function readOnlyRefusal(role: unknown) {
  const definition = roleDefinition(role);
  return {
    error: `حسابك بصفة «${definition.label}» للاطّلاع فقط. لا يمكن من هذا الحساب إضافة أو تعديل أو حذف.`,
    role: definition.id,
    readOnly: true,
  };
}
