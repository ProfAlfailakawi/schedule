/**
 * ── سيناريو «قسمٌ في ثلاث كليات» لاختبارات الميزات متعدّدة المواقع ─────────────────
 *
 * الصندوقُ التجريبي كليةٌ واحدة وقسمٌ واحد (للعرض على الأقسام)، لكنّ المنتج يدعم قسماً بالاسم نفسه في عدّة
 * كليات (الدراسات الإسلامية) وفصلاً ماضياً. فهذه الميزاتُ تُختبر بسيناريو يبنيه الاختبارُ نفسُه داخل صندوقه
 * بدوال المستودع الحقيقية، لا بما يحمله بذرُ العرض.
 */
import { Repository } from "../../src/db/repository";

export async function addMultiSiteFixture(): Promise<void> {
  const colleges = await Repository.getColleges();
  const mainCollege = Number(colleges[0].AdCollegeId);
  const second = await Repository.createCollege("TST2", "كلية اختبار ثانية");
  const third = await Repository.createCollege("TST3", "كلية اختبار ثالثة");
  for (const collegeId of [mainCollege, Number(second.AdCollegeId), Number(third.AdCollegeId)]) {
    const section = await Repository.createSection(collegeId, "ISL", "الدراسات الإسلامية");
    await Repository.createCourse(collegeId, Number(section.AdSectionId), "ISL101", "مدخل إلى الدراسات الإسلامية", 2, 2, 40, false);
  }
  /* فصلٌ مضى: يلزم لاختبارات الترحيل (الماضي مجمَّد) وللتاريخ. */
  await Repository.createTerm("الفصل الثاني 2025/2026", { start: "2026-02-01", weeks: 15 });
}
