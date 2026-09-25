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
