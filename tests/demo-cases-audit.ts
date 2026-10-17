/**
 * ── حالاتُ التجربة كاملة وأسماؤها محايدة ───────────────────────────────────
 * يزرع رادارَ التجربة داخل صندوقٍ حقيقي ويثبت: (1) لا اسمَ شخصٍ واقعيّ ولا لقبَ عائلة؛
 * (2) كلُّ قسمٍ من الأقسام التسعة (بما فيها قسمُ المواقع الثلاثة والرياضيات) مبذورٌ فيه كلُّ نمط طالب
 *     (مستجد … متخرّج، معطَّل بمتطلّب، متعثّر)؛
 * (3) لا شاشةَ فارغة، ولا قسمَ «قيد المراجعة» أو «بلا قواعد» يُخرجه من الرادار: لكل قسمٍ صحيفةٌ بقواعدَ
 *     معتمدة وقاعدةُ تخرّج، ومتعثّرون وناجحون في التسجيل، وحالاتٌ مسمّاة لكشف التسجيل بقراراتٍ مختلفة.
 *     (كان قسما «علم البيانات» و«الإدارة» حالتين مقصودتين بلا تذاكر؛ تغيّر قصدُ العرض إلى بياناتٍ كاملةٍ للجميع.)
 */
import { createHash } from "crypto";
import { Repository } from "../src/db/repository";
import { createDemoSandboxState, DEMO_PREVIOUS_TERM_ID } from "../src/db/demoSandbox";
import { DEMO_CURRENT_TERM_EXTRA_SCOPES, DEMO_PREVIOUS_TERM_SCOPES, seedDemoCurrentTermStories, seedDemoPreviousTerm } from "../src/server/demoPreviousTermSeed";
import { DAY_LETTERS, requestItemFromRow } from "../src/utils/instructorRequestItems";
import { termIsFrozen } from "../src/utils/termSequence";
import { DEMO_RADAR_SECTION_IDS, DEMO_STUDENT_ARCHETYPES, demoArchetypeOf, demoStudentName, seedDemoRadar } from "../src/server/demoRadarSeed";

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
  const sections = (await Repository.getSections() as any[]).filter(r => DEMO_RADAR_SECTION_IDS.includes(Number(r.AdSectionId)));
  check(sections.length === 9, `تسعةُ أقسامٍ في الرادار (${sections.length})`);
  check(profiles.length === 320, `٣٢٠ ملفاً مبذوراً (${profiles.length})`);
  const termForNeeds = (await Repository.getTerms())[0];
  const needsAll = await Repository.getStudentNeedsForTerm(Number(termForNeeds.AdTermId));
  for (const sec of sections) {
    const mine = profiles.filter(p => Number(p.AdSectionId) === Number(sec.AdSectionId));
    check(mine.length > 0 && mine.some(p => p.passedCourseIds.length === 0) && mine.some(p => p.passedCourseIds.length > 0), `القسم ${sec.AdSectionCode}: مستجدّون ومتقدّمون`);
    check(mine.some(p => p.wishes) && mine.some(p => !p.wishes), `القسم ${sec.AdSectionCode}: بعضهم قدّم رغباته وبعضهم لا`);
    const stuck = mine.some(p => p.registration?.answers?.some(a => a.state === "stuck")), ok = mine.some(p => p.registration?.answers?.length && p.registration.answers.every(a => a.state === "registered"));
    check(stuck && ok, `القسم ${sec.AdSectionCode} (${sec.AdSectionId}): متعثّرون وناجحون في التسجيل`);
    /* صحيفةٌ بقواعدَ معتمدة ومقرّرٌ لا يُطرح وقاعدةُ تخرّج — فلا «بلا قواعد» ولا «قيد المراجعة» يُسقط القسمَ من الرادار. */
    const plan = (await Repository.getCurriculumPlans(Number(sec.AdSectionId))).find(row => row.status === "active");
    const live = plan ? await Repository.getRuleSet(plan.id) : undefined;
    check(!!plan && !!live && live.version >= 1 && live.rules.length >= 4, `القسم ${sec.AdSectionCode}: صحيفةٌ نشطةٌ بقواعدَ معتمدة (${live?.rules.length ?? 0} قاعدة)`);
    check((await Repository.getDegreeRules()).some(rule => Number(rule.AdSectionId) === Number(sec.AdSectionId)), `القسم ${sec.AdSectionCode}: قاعدةُ تخرّجٍ محفوظة`);
    const sectionNeeds = needsAll.filter(need => Number(need.AdSectionId) === Number(sec.AdSectionId));
    check(sectionNeeds.length >= 3, `القسم ${sec.AdSectionCode}: حالاتٌ مسمّاة لكشف التسجيل (${sectionNeeds.length})`);
  }
  for (const kind of DEMO_STUDENT_ARCHETYPES) {
    const idx = Array.from({ length: 320 }, (_, i) => i).filter(i => demoArchetypeOf(i, sections.length) === kind);
    check(idx.length >= sections.length, `نمط «${kind}» حاضر في كل قسم (${idx.length})`);
  }
  const graduated = profiles.filter(p => !p.wishes && p.passedCourseIds.length > 0);
  check(graduated.length > 0, "طلبةٌ متخرّجون (أنهوا الصحيفة)");
  const term = (await Repository.getTerms())[0];
  const needs = await Repository.getStudentNeedsForTerm(Number(term.AdTermId));
  check(needs.length >= 60, `حالاتٌ مسمّاة لكشف التسجيل (${needs.length})`);
  const stateOf = (need: any) => String((need.courseStates || [])[0]?.state || "pending");
  const kinds = new Set(needs.map(stateOf));
  check(["pending", "awaiting-registration", "registered", "rejected", "committee-rejected"].every(kind => kinds.has(kind)), `كشفُ التسجيل بكل حالات القرار (${[...kinds].join("، ")})`);
  check(profiles.every(p => p.nameCipher && NEUTRAL.test(String(p.nameCipher).replace("sealed:", ""))), "كلُّ اسمٍ مختومٍ محايد");

  /* ── 3: قصصُ الفصل الجاري (بقية الأقسام) والفصلُ السابق — «للعرض فقط» لا فارغاً ── */
  const deps = {
    sealIdentity: async (value: string) => `sealed:${value}`,
    fingerprintOf: async (civil: string) => createHash("sha256").update(civil).digest("hex").slice(0, 32),
    requestItemFromRow, dayLetters: DAY_LETTERS,
  };
  await seedDemoCurrentTermStories(deps, Number(term.AdTermId));
  await seedDemoPreviousTerm(deps);
  const terms = await Repository.getTerms();
  check(termIsFrozen(DEMO_PREVIOUS_TERM_ID, terms as any) && !termIsFrozen(Number(term.AdTermId), terms as any), "الفصلُ السابق مجمَّد (للعرض فقط) والجاري مفتوح");
  const allNeeds = await Repository.getStudentNeedsForTerm(DEMO_PREVIOUS_TERM_ID);
  check(allNeeds.every(need => NEUTRAL.test(String(need.nameCipher || "").replace("sealed:", ""))), "أسماء طلبة الفصل السابق محايدة");
  check(!FAMILY.test(JSON.stringify(allNeeds.map(need => need.nameCipher))), "ولا لقبَ عائلةٍ فيها");
  const stateOfNeed = (need: any) => String((need.courseStates || [])[0]?.state || (need.requestType === "graduate" ? "graduate" : "pending"));
  for (const [label, termId, scopes] of [["السابق", DEMO_PREVIOUS_TERM_ID, DEMO_PREVIOUS_TERM_SCOPES], ["الجاري", Number(term.AdTermId), DEMO_CURRENT_TERM_EXTRA_SCOPES]] as const) {
    const needsOfTerm = await Repository.getStudentNeedsForTerm(termId);
    const requests = await Repository.getInstructorRequests(0, 0, termId);
    const proposals = await Repository.getStudyProposalsByTerm(termId);
    for (const scope of scopes) {
      const where = `الفصل ${label} · قسم ${scope.sectionId}`;
      const mine = needsOfTerm.filter(need => Number(need.AdSectionId) === scope.sectionId && String(need.nameCipher || "").includes("تجريبي"));
      const kinds = new Set(mine.map(stateOfNeed));
      check(["pending", "awaiting-registration", "registered", "rejected", "committee-rejected", "graduate"].every(kind => kinds.has(kind)) && mine.some(need => need.requestType === "course-conflict"),
        `${where}: كشفُ التسجيل بكل الحالات (${[...kinds].join("، ")})`);
      const own = requests.filter(row => Number(row.AdSectionId) === scope.sectionId);
      check(own.length >= 2, `${where}: رغباتُ أساتذة (${own.length})`);
      if (label === "السابق") check(own.some(row => row.status === "settled") && own.some(row => row.status !== "settled"), `${where}: رغباتٌ منتهيةٌ وأخرى ما زالت مفتوحة (تُعرض معطّلةً)`);
      const props = proposals.filter(row => Number(row.AdSectionId) === scope.sectionId);
      check(props.length >= 2 && new Set(props.map(row => row.status)).size >= 2, `${where}: مقترحاتٌ دراسية بحالاتٍ مختلفة (${props.map(row => row.status).join("، ")})`);
    }
  }
  const prevApprovals = (await Repository.getScheduleApproval(1, 1, DEMO_PREVIOUS_TERM_ID));
  check(prevApprovals?.status === "accepted" && prevApprovals.rounds.length === 2 && !!prevApprovals.rounds[0].reviewedVersionId, "الفصل السابق: دورةُ اعتمادٍ من جولتين بنسخةٍ محفوظة تُظهر «ما تحرّك»");
  const prevNotes = await Repository.getScheduleCommentsByScope(1, 1, DEMO_PREVIOUS_TERM_ID);
  check(prevNotes.length >= 2 && prevNotes.every((note: any) => note.resolved), "وملاحظاتُه محلولة (للعرض)");
});
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
