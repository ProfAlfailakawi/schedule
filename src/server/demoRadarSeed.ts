/**
 * ── بياناتٌ وهميةٌ لرادار التسجيل (البيئة التجريبية) ───────────────────────────
 *
 * مَن يدخل التجربةَ يجد المزايا الجديدة حيّةً بالأسماء الوهمية نفسها لا شاشاتٍ فارغة:
 *   • صحائفُ لخمسة أقسام: ثلاثةٌ بقواعدَ **معتمدة**، وقسمٌ **قيد المراجعة** (فتظهر أيقونةُ
 *     «مراجعة الصحيفة»)، وقسمٌ بلا قواعد (فيُحصى «بلا قواعد معتمدة»).
 *   • ٣٢٠ ملفَّ طالبٍ وهمي بإنجازاتٍ ورغباتٍ، وتواريخُ طلبةٍ للفصل بجولةٍ جارية.
 *   • رادارٌ مشغَّل بالمحرّك نفسه (تذاكرُ وملخّص)، وأجوبةُ «هل سجلت؟» لبعضهم، وحالاتٌ مسمّاة
 *     لقسمين تصل «كشف التسجيل».
 *
 * يُبذر داخل صندوق الزائر وحده (Repository.isDemoRequest) ولا يلمس بياناتِ الجامعة. حتميّ:
 * المولّدُ العشوائيُّ بذرةٌ ثابتة، فكلُّ زائرٍ يرى الأرقامَ نفسها. الأسماءُ والأرقام كلُّها وهمية.
 */
import { createHash } from "crypto";
import { Repository, caseRefFor } from "../db/repository";
import type { AdCourse, CurriculumCourseRule, ElectiveGroup, StudentProfile } from "../types";
import { pickDoorTerm } from "../utils/termStudentPhases";
import { runRegistrationSimulation } from "./simulationData";

const NAMES = ["نورة محمد العتيبي", "فهد عبدالله الرشيدي", "مريم خالد المطيري", "خالد سعد العنزي", "هند يوسف الكندري", "سلمان ناصر الدوسري", "دانة فيصل الصباح", "بدر أحمد الهاجري", "لولوة جاسم الشمري", "عبدالرحمن علي الفضلي", "شهد مبارك العجمي", "يوسف حمد الخالدي"];

const addDaysISO = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** مولّدٌ حتميّ صغير (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export async function seedDemoRadar(opts: { sealIdentity: (value: string) => Promise<string>; today: string }): Promise<void> {
  if (!Repository.isDemoRequest()) return;
  const random = rng(20261015);
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
  const term = (await Repository.getTerms())[0];
  if (!term) return;
  const termId = Number(term.AdTermId);

  /* ── تواريخ الطلبة: الرغباتُ أُغلقت، والجولةُ الأولى جارية ── */
  await Repository.setTermStudentPhases(termId, {
    wishesOpen: addDaysISO(opts.today, -20), wishesClose: addDaysISO(opts.today, -8),
    rounds: [
      { id: "r1", name: "المبكر", start: addDaysISO(opts.today, -2), end: addDaysISO(opts.today, 4) },
      { id: "r2", name: "العادي", start: addDaysISO(opts.today, 10), end: addDaysISO(opts.today, 16) },
      { id: "r3", name: "المتأخر", start: addDaysISO(opts.today, 20), end: addDaysISO(opts.today, 26) },
    ],
    requestsClose: addDaysISO(opts.today, 40),
  });

  /* ── صحائفُ وقواعد ── */
  const sections = (await Repository.getSections() as any[]).filter(row => [1, 2, 3, 4, 5].includes(Number(row.AdSectionId)));
  const planOf = new Map<number, { id: string; courses: AdCourse[] }>();
  for (const section of sections) {
    const sectionId = Number(section.AdSectionId), collegeId = Number(section.AdCollegeId);
    const courses = ((await Repository.getCoursesBySection(sectionId)) as AdCourse[]).sort((a, b) => String(a.CourseCode).localeCompare(String(b.CourseCode), "en"));
    if (courses.length < 3) continue;
    const plan = await Repository.createCurriculumPlan({ collegeId, sectionId, name: "الصحيفة الجديدة", by: "عرض تجريبي" });
    for (const course of courses) await Repository.addCourseToCurriculumPlan(plan.id, course, "عرض تجريبي");
    planOf.set(sectionId, { id: plan.id, courses });
    if (sectionId === 3) continue; // قسمٌ بلا قواعد
    const rules: CurriculumCourseRule[] = courses.map((course, index) => ({
      courseId: Number(course.AdCourseId), level: Math.min(8, 1 + Math.floor(index / 2)), kind: index >= courses.length - 2 && courses.length > 4 ? "elective" : "compulsory",
      ...(index >= 2 && !(index >= courses.length - 2 && courses.length > 4) ? { prereq: { all: [Number(courses[index - 2].AdCourseId)], anyOf: [] } } : {}),
    }));
    const groups: ElectiveGroup[] = courses.length > 4
      ? [{ id: "g1", name: "اختياري القسم", minCourses: 1, minUnits: 3, courseIds: courses.slice(-2).map(c => Number(c.AdCourseId)) }] : [];
    rules.forEach(rule => { if (groups[0]?.courseIds.includes(rule.courseId)) rule.groupId = "g1"; });
    const now = new Date().toISOString();
    await Repository.updateRuleDraft(plan.id, () => ({
      id: plan.id, planId: plan.id, AdCollegeId: collegeId, AdSectionId: sectionId, rules, groups, version: 0, status: "review", basedOnVersion: 0,
      updatedAt: now, updatedBy: "استيراد · عرض تجريبي",
    }));
    /* الثاني وحده يبقى قيد المراجعة ليظهر في «مراجعة الصحيفة»؛ والثالث بلا قواعد (استثناءٌ مقصود)، والباقي معتمد. */
    if (sectionId !== 2) await Repository.approveRuleDraft(plan.id, now, "رئيس لجنة الجدول (عرض تجريبي)");
  }

  /* ── ملفّاتُ الطلبة ── */
  const fps: Array<{ fp: string; sectionId: number }> = [];
  const total = 320;
  for (let i = 0; i < total; i += 1) {
    const section = sections[i % sections.length];
    const sectionId = Number(section.AdSectionId), collegeId = Number(section.AdCollegeId);
    const plan = planOf.get(sectionId);
    const courses = plan?.courses || ((await Repository.getCoursesBySection(sectionId)) as AdCourse[]);
    if (!courses.length) continue;
    const fp = createHash("sha256").update(`demo-student-${i}`).digest("hex").slice(0, 32);
    const year = Math.floor(random() * 4);
    const passed = courses.slice(0, Math.floor((courses.length * year) / 4)).map(c => Number(c.AdCourseId));
    const credit = new Map(courses.map(c => [Number(c.AdCourseId), Number(c.CourseCredit) || 0]));
    const iso = new Date().toISOString();
    const wishes = random() < 0.7 ? {
      termId, targetUnits: pick([12, 15, 15, 18]), courseIds: [] as number[], updatedAt: iso,
      constraints: { noMorning: random() < 0.2, noAfternoon: random() < 0.1, freeDay: random() < 0.3 },
    } : undefined;
    const base = { createdAt: iso, lastSeenAt: iso };
    const profile: StudentProfile = {
      id: fp, fingerprint: fp, AdCollegeId: collegeId, AdSectionId: sectionId, curriculumPlanId: plan?.id,
      passedCourseIds: passed, passedUnits: passed.reduce((s, id) => s + (credit.get(id) || 0), 0),
      updatedAt: new Date(Date.now() - 86_400_000).toISOString(), ...base, deleteAt: addDaysISO(opts.today, 900), deleteReason: "initial",
      nameCipher: await opts.sealIdentity(NAMES[i % NAMES.length]), civilCipher: await opts.sealIdentity(String(300000000000 + i)),
      ...(wishes ? { wishes } : {}),
    };
    await Repository.updateStudentProfile(fp, () => profile);
    fps.push({ fp, sectionId });
  }

  /* ── الرادار ── */
  const fresh = pickDoorTerm((await Repository.getTerms()) as any) || term;
  await runRegistrationSimulation(fresh, "عرض تجريبي");

  /* ── أجوبةُ «هل سجلت؟» لنحو نصفهم، وحالاتٌ مسمّاة لبعض المتعثّرين ── */
  const courseOf = new Map(((await Repository.getCourses()) as AdCourse[]).map(c => [Number(c.AdCourseId), c] as const));
  const REASONS = ["full", "full", "full", "conflict", "conflict", "prereq", "other"] as const;
  let cases = 0;
  for (const { fp } of fps) {
    if (random() > 0.5) continue;
    const ticket = await Repository.getRegistrationTicket(Number(fresh.AdTermId), fp);
    const items = ticket?.plans.find(p => p.label === "A")?.items || [];
    if (!items.length) continue;
    const answers = items.map(item => random() < 0.8
      ? { courseId: item.courseId, state: "registered" as const }
      : { courseId: item.courseId, state: "stuck" as const, reason: pick(REASONS) });
    const iso = new Date().toISOString();
    await Repository.recordRegistrationAnswers(fp, Number(fresh.AdTermId), current => (current ? { ...current, registration: { termId: Number(fresh.AdTermId), at: iso, answers } } : undefined));
    const stuck = answers.filter(a => a.state === "stuck");
    if (stuck.length && cases < 14 && random() < 0.6) {
      const first = courseOf.get(stuck[0].courseId);
      const profile = await Repository.getStudentProfile(fp);
      if (first && profile) {
        const need = await Repository.saveStudentNeed({
          fingerprint: fp, AdCollegeId: Number(first.AdCollegeId), AdSectionId: profile.AdSectionId, studentSectionId: profile.AdSectionId,
          surveySectionId: Number(first.AdSectionId), AdTermId: Number(fresh.AdTermId), curriculumPlanId: profile.curriculumPlanId,
          courseIds: stuck.map(a => a.courseId), requestType: "new-course", nameCipher: profile.nameCipher, civilCipher: profile.civilCipher,
          eligibility: "not-checked", details: "من «مساري» بعد التسجيل — امتلأت الشعب",
        } as any);
        cases += 1;
        if (cases % 3 === 0) await Repository.setStudentCourseState(need.id, { courseId: stuck[0].courseId, state: "awaiting-registration", by: "department", byRole: "رئيس لجنة الجدول", at: iso } as any);
        void caseRefFor;
      }
    }
  }
}
