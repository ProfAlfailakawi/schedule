/**
 * ── حالاتُ التجربة كاملة وأسماؤها محايدة ───────────────────────────────────
 * يزرع رادارَ التجربة داخل صندوقٍ حقيقي ويثبت: (1) لا اسمَ شخصٍ واقعيّ ولا لقبَ عائلة؛
 * (2) كلُّ قسمٍ مبذورٌ فيه كلُّ نمط طالب (مستجد … متخرّج، معطَّل بمتطلّب، متعثّر)؛
 * (3) لا شاشةَ فارغة: ملفات، أجوبة متعثّرة، حالات مسمّاة، صحائف.
 */
import { Repository } from "../src/db/repository";
import { createDemoSandboxState } from "../src/db/demoSandbox";
import { DEMO_STUDENT_ARCHETYPES, demoArchetypeOf, demoStudentName, seedDemoRadar } from "../src/server/demoRadarSeed";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) passed++; else failed++; console.log(ok ? `\x1b[32m✓ ${label}\x1b[0m` : `\x1b[31m✗ ${label}\x1b[0m`); };

/* ── 1: الأسماء ── */
const NEUTRAL = /^(طالب تجريبي|طالبة تجريبية|عضو هيئة تدريس تجريبي) \d+$/;
const state = createDemoSandboxState();
check(state.instructors.length >= 16 && state.instructors.every(p => NEUTRAL.test(p.AdInstructorName)), "أساتذة الصندوق بأسماء محايدة مرقّمة");
check(Array.from({ length: 320 }, (_, i) => demoStudentName(i)).every(n => NEUTRAL.test(n)), "أسماء الطلبة محايدة وحتمية");
const FAMILY = /(الصباح|العتيبي|الرشيدي|المطيري|العنزي|الكندري|الدوسري|الهاجري|الشمري|الفضلي|العجمي|الخالدي)/;
check(!FAMILY.test(JSON.stringify(state.instructors)) && !FAMILY.test(JSON.stringify(state.users)), "لا لقبَ عائلةٍ في أساتذة الصندوق ولا حساباته");

/* ── 2: الزرع ── */
const id = `demo_cases_${Date.now()}`;
Repository.createDemoSandbox(id, 120_000);
const today = new Date().toISOString().slice(0, 10);
await Repository.withDemoSandbox(id, async () => {
  await seedDemoRadar({ sealIdentity: async (v: string) => `sealed:${v}`, today });
  const profiles = await Repository.listStudentProfiles();
  const sections = (await Repository.getSections() as any[]).filter(r => [1, 2, 3, 4, 5].includes(Number(r.AdSectionId)));
  check(profiles.length === 320, `٣٢٠ ملفاً مبذوراً (${profiles.length})`);
  for (const sec of sections) {
    const mine = profiles.filter(p => Number(p.AdSectionId) === Number(sec.AdSectionId));
    check(mine.length > 0 && mine.some(p => p.passedCourseIds.length === 0) && mine.some(p => p.passedCourseIds.length > 0), `القسم ${sec.AdSectionCode}: مستجدّون ومتقدّمون`);
    check(mine.some(p => p.wishes) && mine.some(p => !p.wishes), `القسم ${sec.AdSectionCode}: بعضهم قدّم رغباته وبعضهم لا`);
    const bare = [2, 3].includes(Number(sec.AdSectionId)); // DS قيد المراجعة وMGT بلا قواعد: حالتان مقصودتان لا تُقيَّم تذاكرهما
    const stuck = mine.some(p => p.registration?.answers?.some(a => a.state === "stuck")), ok = mine.some(p => p.registration?.answers?.length && p.registration.answers.every(a => a.state === "registered"));
    check(bare ? !stuck : stuck && ok, `القسم ${sec.AdSectionCode}: ${bare ? "حالةٌ مقصودة (قيد المراجعة/بلا قواعد)" : "متعثّرون وناجحون في التسجيل"}`);
  }
  for (const kind of DEMO_STUDENT_ARCHETYPES) {
    const idx = Array.from({ length: 320 }, (_, i) => i).filter(i => demoArchetypeOf(i, sections.length) === kind);
    check(idx.length >= sections.length, `نمط «${kind}» حاضر في كل قسم (${idx.length})`);
  }
  const graduated = profiles.filter(p => !p.wishes && p.passedCourseIds.length > 0);
  check(graduated.length > 0, "طلبةٌ متخرّجون (أنهوا الصحيفة)");
  const term = (await Repository.getTerms())[0];
  const needs = await Repository.getStudentNeedsForTerm(Number(term.AdTermId));
  check(needs.length >= 14, `حالاتٌ مسمّاة لكشف التسجيل (${needs.length})`);
  check(profiles.every(p => p.nameCipher && NEUTRAL.test(String(p.nameCipher).replace("sealed:", ""))), "كلُّ اسمٍ مختومٍ محايد");
});
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
