/**
 * ── حالاتُ التجربة كاملة وأسماؤها محايدة (كليةٌ واحدة · قسمٌ واحد · 2026/2027) ─────
 * يزرع رادارَ التجربة داخل صندوقٍ حقيقي ويثبت: (1) لا اسمَ شخصٍ واقعيّ ولا لقبَ عائلة؛
 * (2) في القسم الوحيد كلُّ نمط طالب (مستجد … متخرّج، معطَّل بمتطلّب، متعثّر)، على صحيفتين حقيقيتين
 *     (الجديدة فعّالة والقديمة انتقالية)؛
 * (3) لا شاشةَ فارغة: صحيفتان بقواعدَ معتمدة وقاعدةُ تخرّج، ومتعثّرون وناجحون في التسجيل، وحالاتٌ مسمّاة
 *     لكشف التسجيل بقراراتٍ مختلفة.
 */
import { Repository } from "../src/db/repository";
import { createDemoSandboxState, DEMO_TERM_CURRENT } from "../src/db/demoSandbox";
import { DEMO_RADAR_SECTION_IDS, DEMO_STUDENT_ARCHETYPES, DEMO_STUDENT_TOTAL, demoArchetypeOf, demoStudentName, seedDemoRadar } from "../src/server/demoRadarSeed";
import { diffSchedules } from "../src/utils/scheduleDiff";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) passed++; else failed++; console.log(ok ? `\x1b[32m✓ ${label}\x1b[0m` : `\x1b[31m✗ ${label}\x1b[0m`); };

/* ── 1: الأسماء ── */
const NEUTRAL = /^(طالب تجريبي|طالبة تجريبية|عضو هيئة تدريس تجريبي) \d+$/;
const state = createDemoSandboxState();
check(state.instructors.length >= 16 && state.instructors.every(p => NEUTRAL.test(p.AdInstructorName)), "أساتذة الصندوق بأسماء محايدة مرقّمة");
check(Array.from({ length: DEMO_STUDENT_TOTAL }, (_, i) => demoStudentName(i)).every(n => NEUTRAL.test(n)), "أسماء الطلبة محايدة وحتمية");
const FAMILY = /(الصباح|العتيبي|الرشيدي|المطيري|العنزي|الكندري|الدوسري|الهاجري|الشمري|الفضلي|العجمي|الخالدي)/;
check(!FAMILY.test(JSON.stringify(state.instructors)) && !FAMILY.test(JSON.stringify(state.users)), "لا لقبَ عائلةٍ في أساتذة الصندوق ولا حساباته");
const acceptedDemoVersion = state.scheduleVersions.find(version => version.id === "demo-ver-t1-accepted");
const currentDemoRows = state.schedules.filter(row => Number(row.AdTermId) === DEMO_TERM_CURRENT);
const demoChanges = diffSchedules(acceptedDemoVersion?.rows, currentDemoRows);
const removedDemoCourses = new Set(demoChanges.entries.filter(entry => entry.kind === "removed").map(entry => Number(entry.row.AdCourseId)));
check(removedDemoCourses.size >= 2, `تغييرات الجدول في الديمو تعرض مقررين محذوفين على الأقل (${removedDemoCourses.size})`);

/* ── 2: الزرع ── */
const id = `demo_cases_${Date.now()}`;
Repository.createDemoSandbox(id, 120_000);
const today = new Date().toISOString().slice(0, 10);
await Repository.withDemoSandbox(id, async () => {
  await seedDemoRadar({ sealIdentity: async (v: string) => `sealed:${v}`, today });
  const profiles = await Repository.listStudentProfiles();
  const sections = (await Repository.getSections() as any[]).filter(r => DEMO_RADAR_SECTION_IDS.includes(Number(r.AdSectionId)));
  check(sections.length === 1, `قسمٌ واحد في الرادار (${sections.length})`);
  check(profiles.length === DEMO_STUDENT_TOTAL, `٦٤ ملفاً مبذوراً (${profiles.length})`);
  const termForNeeds = (await Repository.getTerms())[0];
  const needsAll = await Repository.getStudentNeedsForTerm(Number(termForNeeds.AdTermId));
  for (const sec of sections) {
    const mine = profiles.filter(p => Number(p.AdSectionId) === Number(sec.AdSectionId));
    check(mine.length > 0 && mine.some(p => p.passedCourseIds.length === 0) && mine.some(p => p.passedCourseIds.length > 0), `القسم ${sec.AdSectionCode}: مستجدّون ومتقدّمون`);
    check(mine.some(p => p.wishes) && mine.some(p => !p.wishes), `القسم ${sec.AdSectionCode}: بعضهم قدّم رغباته وبعضهم لا`);
    const stuck = mine.some(p => p.registration?.answers?.some(a => a.state === "stuck")), ok = mine.some(p => p.registration?.answers?.length && p.registration.answers.every(a => a.state === "registered"));
    check(stuck && ok, `القسم ${sec.AdSectionCode} (${sec.AdSectionId}): متعثّرون وناجحون في التسجيل`);
    /* صحيفةٌ بقواعدَ معتمدة ومقرّرٌ لا يُطرح وقاعدةُ تخرّج — فلا «بلا قواعد» ولا «قيد المراجعة» يُسقط القسمَ من الرادار. */
    const plans = await Repository.getCurriculumPlans(Number(sec.AdSectionId));
    const plan = plans.find(row => row.status === "active");
    const live = plan ? await Repository.getRuleSet(plan.id) : undefined;
    check(!!plan && !!live && live.version >= 1 && live.rules.length >= 20, `القسم ${sec.AdSectionCode}: صحيفةٌ نشطةٌ بقواعدَ معتمدة (${live?.rules.length ?? 0} قاعدة)`);
    const old = plans.find(row => row.status === "transition");
    const oldLive = old ? await Repository.getRuleSet(old.id) : undefined;
    check(!!old && !!oldLive && oldLive.rules.length >= 20, `القسم ${sec.AdSectionCode}: وصحيفةٌ قديمةٌ انتقالية بقواعدَ (${oldLive?.rules.length ?? 0})`);
    check(mine.some(p => p.curriculumPlanId === plan?.id) && mine.some(p => p.curriculumPlanId === old?.id), `القسم ${sec.AdSectionCode}: طلبةٌ على الصحيفتين`);
    check((await Repository.getDegreeRules()).some(rule => Number(rule.AdSectionId) === Number(sec.AdSectionId)), `القسم ${sec.AdSectionCode}: قاعدةُ تخرّجٍ محفوظة`);
    const sectionNeeds = needsAll.filter(need => Number(need.AdSectionId) === Number(sec.AdSectionId));
    check(sectionNeeds.length >= 3, `القسم ${sec.AdSectionCode}: حالاتٌ مسمّاة لكشف التسجيل (${sectionNeeds.length})`);
  }
  for (const kind of DEMO_STUDENT_ARCHETYPES) {
    const idx = Array.from({ length: DEMO_STUDENT_TOTAL }, (_, i) => i).filter(i => demoArchetypeOf(i, sections.length) === kind);
    check(idx.length >= sections.length, `نمط «${kind}» حاضر في كل قسم (${idx.length})`);
  }
  const graduated = profiles.filter(p => !p.wishes && p.passedCourseIds.length > 0);
  check(graduated.length > 0, "طلبةٌ متخرّجون (أنهوا الصحيفة)");
  const term = (await Repository.getTerms())[0];
  const needs = await Repository.getStudentNeedsForTerm(Number(term.AdTermId));
  check(needs.length >= 10, `حالاتٌ مسمّاة لكشف التسجيل (${needs.length})`);
  const stateOf = (need: any) => String((need.courseStates || [])[0]?.state || "pending");
  const kinds = new Set(needs.map(stateOf));
  check(["pending", "awaiting-registration", "registered", "rejected", "committee-rejected"].every(kind => kinds.has(kind)), `كشفُ التسجيل بكل حالات القرار (${[...kinds].join("، ")})`);
  check(profiles.every(p => p.nameCipher && NEUTRAL.test(String(p.nameCipher).replace("sealed:", ""))), "كلُّ اسمٍ مختومٍ محايد");

});
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
