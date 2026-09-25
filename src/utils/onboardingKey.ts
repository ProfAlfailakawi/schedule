/**
 * ── علامة «رأى الجولة»، لكل صفة ─────────────────────────────────────────────
 *
 * الجولة صارت بحسب الصفة (N26): رئيس القسم والتسجيل والعميدان يرون جولتهم لا
 * جولة اللجنة. فالعلامة تحمل الصفة: حسابٌ تتغيّر صفته — أو صفةٌ تُجرَّب في
 * البيئة التجريبية — يرى جولة صفته الجديدة مرّة.
 */
export function onboardingSeenKey(userId: number | string, roleId: string | undefined): string {
  return `schedule-onboarding-v5-${userId}-${roleId || "committeeChair"}`;
}

/**
 * الصفاتُ التي صارت لها جولتُها الخاصة (onboardingScenesFor في Onboarding.tsx).
 * ما عداها يرى الجولة العامّة نفسها التي كانت قبل N26 — جولة اللجنة.
 */
export const ROLES_WITH_OWN_TOUR: ReadonlySet<string> = new Set([
  "departmentHead", "registrarHead", "registrarStaff", "dean", "registrarDean", "viceDean",
]);

/**
 * العلامة القديمة (v4، بلا صفة). من أنهى الجولة العامّة قبل N26 لا تُعاد عليه —
 * لم يتغيّر فيها شيء (مراجعة 12). أمّا الصفات ذات الجولة الجديدة فتراها مرّة.
 */
export function legacyOnboardingSeenKey(userId: number | string, roleId: string | undefined): string | null {
  return ROLES_WITH_OWN_TOUR.has(roleId || "committeeChair") ? null : `schedule-onboarding-v4-${userId}`;
}

/** أرأى هذا الحسابُ جولةَ صفته؟ القراءة الوحيدة التي يسألها التطبيق. */
export function onboardingSeen(read: (key: string) => string | null | undefined, userId: number | string, roleId: string | undefined): boolean {
  if (read(onboardingSeenKey(userId, roleId))) return true;
  const legacy = legacyOnboardingSeenKey(userId, roleId);
  return Boolean(legacy && read(legacy));
}
