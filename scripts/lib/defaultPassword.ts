/**
 * ── كلمة السر الافتراضية للحسابات التي تُجهَّز بالسكربتات ─────────────────────
 *
 * بقرار المالك: تُنشأ حساباتُ القيادة والأقسام مفعَّلةً بكلمة سرٍّ افتراضية واحدة، يغيّرها صاحبُ الحساب
 * عند أول دخول. وهي كلمةٌ معروفة لكل من قرأ هذا الملف، فلا تُستعمل خارج هذا الغرض؛ ويمكن تجاوزها
 * بالمتغيّر DEFAULT_ACCOUNT_PASSWORD عند التشغيل دون تعديل الملف.
 *
 * الحساب القائم الذي له كلمة سرٍّ لا يُمسّ أبداً: تُفعَّل فقط الحساباتُ الموقوفة التي بلا كلمة سر
 * (ما أنشأته الإصدارات السابقة من هذه السكربتات).
 */
export const DEFAULT_ACCOUNT_PASSWORD = process.env.DEFAULT_ACCOUNT_PASSWORD || "12345678";

type PasswordRepository = { hashPassword(password: string): string; encryptPasswordForVault(password: string): string };

/** الحقولُ التي تجعل الحسابَ يدخل بالكلمة الافتراضية. */
export function defaultCredentials(repository: PasswordRepository) {
  return {
    SystemUserPass: repository.hashPassword(DEFAULT_ACCOUNT_PASSWORD),
    SystemUserPassVault: repository.encryptPasswordForVault(DEFAULT_ACCOUNT_PASSWORD),
    IsActive: true,
  };
}

/** موقوفٌ بلا كلمة سر: ما أنشأته السكربتات ولم يضع له المديرُ شيئاً بعد. */
export const needsDefaultCredentials = (user: { IsActive?: boolean; SystemUserPass?: string }) =>
  !user.IsActive && !String(user.SystemUserPass || "").trim();
