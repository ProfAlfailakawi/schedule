/**
 * ── بياناتٌ وهميةٌ لرادار التسجيل (البيئة التجريبية) ───────────────────────────
 *
 * مَن يدخل التجربةَ يجد المزايا الجديدة حيّةً بالأسماء الوهمية نفسها لا شاشاتٍ فارغة:
 *   • صحائفُ لتسعة أقسام (الخمسة الأولى والرياضيات وقسمُ المواقع الثلاثة)، **كلُّها بقواعدَ معتمدة** (فيكتمل
 *     الرادارُ وكشفُ التسجيل لكل قسم)، وقاعدةُ
 *     تخرّجٍ لكل قسم. ولقسم «علم البيانات» تعديلٌ على قاعدةٍ **قيد المراجعة** فوق نسخته المعتمدة
 *     (فتظهر أيقونةُ «مراجعة الصحيفة» والمعتمدةُ قائمةٌ لا تتأثر). وفي كل صحيفةٍ مقرّرٌ مطلوبٌ لا يُطرح
 *     هذا الفصل (مشروع التخرج) ومقرّراتٌ ضيّقةُ السعة، فلا يُفتح الرادارُ على أصفار.
 *   • ٣٢٠ ملفَّ طالبٍ وهمي بإنجازاتٍ ورغباتٍ، وتواريخُ طلبةٍ للفصل بجولةٍ جارية.
 *   • رادارٌ مشغَّل بالمحرّك نفسه (تذاكرُ وملخّص)، وأجوبةُ «هل سجلت؟» لبعضهم، وحالاتٌ مسمّاة في كل قسمٍ
 *     بقراراتٍ مختلفة (تنتظر اللجنة، سلّمتها، سُجّلت، رُدّت، لم توافق اللجنة) تصل «كشف التسجيل».
 *   • (قصصُ بقية الأقسام في الفصل الجاري، والفصلُ السابق «للعرض فقط»، في demoPreviousTermSeed.ts.)
 *
 * يُبذر داخل صندوق الزائر وحده (Repository.isDemoRequest) ولا يلمس بياناتِ الجامعة. حتميّ:
 * المولّدُ العشوائيُّ بذرةٌ ثابتة، فكلُّ زائرٍ يرى الأرقامَ نفسها. الأسماءُ والأرقام كلُّها وهمية.
 */
import { createHash } from "crypto";
import { Repository, caseRefFor } from "../db/repository";
import type { AdCourse, FSchedule, StudentProfile } from "../types";
import { pickDoorTerm } from "../utils/termStudentPhases";
import { runRegistrationSimulation } from "./simulationData";
import { TECHNOLOGY_EDUCATION_CURRICULA } from "../data/technologyEducationCurricula";
import { buildReferenceRules } from "../utils/referenceApply";
import { referenceCodeKey } from "../utils/curriculumReference";

/** أسماءٌ محايدة حتميّة (لا أسماء عائلات ولا أسماء واقعية): الوضع التجريبي حسّاس. */
export const demoStudentName = (index: number): string => `${index % 2 === 0 ? "طالب تجريبي" : "طالبة تجريبية"} ${index + 1}`;

/**
 * أنماطُ الطلبة التجريبيين: كلُّ قسمٍ يحوي كلَّ نمطٍ (يُوزَّع بالترتيب لا بالصدفة)،
 * فلا شاشةَ تُفتح على حالةٍ فارغة: مستجد، متقدّم، على أعتاب التخرج، متخرّج،
 * مُعطَّل بمتطلّبٍ سابق، متعثّر.
 */
export const DEMO_STUDENT_ARCHETYPES = ["new", "early", "mid", "advanced", "graduating", "graduated", "blocked", "struggling"] as const;
export type DemoStudentArchetype = typeof DEMO_STUDENT_ARCHETYPES[number];
export const demoArchetypeOf = (index: number, sectionCount: number): DemoStudentArchetype =>
  DEMO_STUDENT_ARCHETYPES[Math.floor(index / Math.max(1, sectionCount)) % DEMO_STUDENT_ARCHETYPES.length];
/** المقرراتُ المنجزة لنمطٍ في صحيفة قسمه (مرتّبة بالمستوى). */
export function demoPassedFor(kind: DemoStudentArchetype, courses: readonly AdCourse[]): number[] {
  const ids = courses.map(c => Number(c.AdCourseId)), n = ids.length;
  switch (kind) {
    case "new": return [];
    case "early": return ids.slice(0, Math.max(1, Math.floor(n * 0.25)));
    case "mid": return ids.slice(0, Math.max(2, Math.floor(n * 0.5)));
    case "advanced": return ids.slice(0, Math.max(3, Math.floor(n * 0.65)));
    case "graduating": return ids.slice(0, Math.max(0, n - 1));
    case "graduated": return ids;
    case "blocked": return ids.slice(1, Math.max(2, Math.floor(n * 0.5))); // ينقصه الأول فيُعطَّل ما يشترطه
    case "struggling": return ids.slice(0, 1);
  }
}

/** القسمُ الوحيد في الصندوق. */
export const DEMO_RADAR_SECTION_IDS: readonly number[] = [1];
/** مجموعُ مقاعد أول مقرّرين مطروحين في الفصل (المزدحمان). */
export const DEMO_TIGHT_SEATS = [6, 9] as const;

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

  /* ── صحيفتان حقيقيتان للقسم: الجديدة (2026/2027) فعّالة، والقديمة (2010/2011) انتقالية ──
     كلتاهما بقواعدَ معتمدة من الصحيفتين المرجعيتين (مقرّرات القسم نفسه؛ ومتطلباتُ مقرراتٍ لأقسامٍ أخرى تُهمَل). */
  const section = ((await Repository.getSections()) as any[]).find(row => Number(row.AdSectionId) === 1);
  if (!section) return;
  const sectionId = Number(section.AdSectionId), collegeId = Number(section.AdCollegeId);
  const termRows = (await Repository.getSchedulesByScope({ termId })) as FSchedule[];
  const catalogue = ((await Repository.getCoursesBySection(sectionId)) as AdCourse[]).sort((a, b) => String(a.CourseCode).localeCompare(String(b.CourseCode), "en"));
  const idByCode = new Map(catalogue.map(course => [referenceCodeKey(String(course.CourseCode)), Number(course.AdCourseId)] as const));
  const [oldRef, newRef] = ["old", "new"].map(id => TECHNOLOGY_EDUCATION_CURRICULA.find(ref => ref.id === id)!);
  const ownCodes = (ref: typeof newRef) => new Set(ref.groups.flatMap(group => group.courses.map(course => referenceCodeKey(course.code))).filter(code => idByCode.has(code)));
  const newCodes = ownCodes(newRef), oldCodes = ownCodes(oldRef);

  /* السعة: أول مقرّرين مطروحين هذا الفصل ضيّقا السعة، يزدحم عليهما الطلبة فيمتلئان (فيظهر «مقرراتٌ تمتلئ»). */
  const offered = [...new Set(termRows.map(row => Number(row.AdCourseId)))]
    .map(id => catalogue.find(course => Number(course.AdCourseId) === id)!).filter(Boolean);
  for (const [at, course] of offered.slice(0, 2).entries()) {
    const offerings = Math.max(1, new Set(termRows.filter(row => Number(row.AdCourseId) === Number(course.AdCourseId)).map(row => String(row.SCode))).size);
    await Repository.updateCourse(Number(course.AdCourseId), collegeId, sectionId, course.CourseCode, course.CourseName,
      Number(course.CourseCredit) || 3, Number(course.CourseHours) || 3, Math.ceil(DEMO_TIGHT_SEATS[at] / offerings));
  }

  const plan = await Repository.createCurriculumPlan({ collegeId, sectionId, name: "الصحيفة الجديدة 2026/2027", by: "عرض تجريبي" });
  const legacy = (await Repository.getCurriculumPlans(sectionId)).find(row => row.id !== plan.id);
  const fresh0 = (await Repository.getCoursesBySection(sectionId)) as AdCourse[];
  for (const course of fresh0) {
    const key = referenceCodeKey(String(course.CourseCode));
    if (newCodes.has(key)) await Repository.addCourseToCurriculumPlan(plan.id, course, "عرض تجريبي");
    if (legacy && !oldCodes.has(key)) await Repository.removeCourseFromCurriculumPlan(legacy.id, Number(course.AdCourseId));
  }
  const approve = async (planId: string, reference: typeof newRef, codes: Set<string>, who: string) => {
    const members = new Map([...idByCode].filter(([code]) => codes.has(code)));
    const built = buildReferenceRules(reference, members, idByCode, new Set());
    const now = new Date().toISOString();
    await Repository.updateRuleDraft(planId, () => ({
      id: planId, planId, AdCollegeId: collegeId, AdSectionId: sectionId, rules: built.rules, groups: built.groups, version: 0, status: "review", basedOnVersion: 0,
      updatedAt: now, updatedBy: `استيراد · ${who}`,
    }));
    await Repository.approveRuleDraft(planId, now, "رئيس لجنة الجدول (عرض تجريبي)");
  };
  await approve(plan.id, newRef, newCodes, "الصحيفة الجديدة");
  if (legacy) await approve(legacy.id, oldRef, oldCodes, "الصحيفة القديمة");
  /* تعديلٌ لاحق على قاعدة مقرّرٍ ينتظر المراجعة فوق نسخة الصحيفة الجديدة المعتمدة (الإصدار ١): هو المثالُ الوحيد
     لـ«صحيفة قيد المراجعة»، ويتعايش مع بياناتٍ كاملة لا يمسّها. */
  {
    const revised = new Date(Date.now() + 1000).toISOString();
    await Repository.updateRuleDraft(plan.id, current => current ? {
      ...current, status: "review", basedOnVersion: current.version, updatedAt: revised, updatedBy: "رئيس قسم تكنولوجيا التعليم (عرض تجريبي)",
      rules: current.rules.map((rule, index) => index === 1 ? { ...rule, level: Math.min(8, Number(rule.level || 1) + 1) } : rule),
    } : current);
  }
  /* قاعدةُ تخرّج الصحيفة الجديدة (125 وحدة): ويحتاجها طلبُ الخريج في الاستبيان وصحيفةُ التخرج. */
  const stamp = new Date().toISOString();
  await Repository.saveDegreeRule({
    AdSectionId: sectionId, degreeUnits: 125, fieldTrainingRequired: 95, graduateRegularPassed: 108, graduateSummerPassed: 114,
    updatedAt: stamp, updatedBy: "رئيس لجنة الجدول (عرض تجريبي)",
  });
  const planCourses = new Map<string, AdCourse[]>([
    [plan.id, catalogue.filter(course => newCodes.has(referenceCodeKey(String(course.CourseCode))))],
    ...(legacy ? [[legacy.id, catalogue.filter(course => oldCodes.has(referenceCodeKey(String(course.CourseCode))))] as [string, AdCourse[]]] : []),
  ]);

  /* ── ملفّاتُ الطلبة ── */
  const fps: Array<{ fp: string; sectionId: number; kind: DemoStudentArchetype }> = [];
  const total = 320;
  for (let i = 0; i < total; i += 1) {
    /* نحو 70٪ على الصحيفة الجديدة، والباقون على القديمة (الانتقالية). */
    const onLegacy = Boolean(legacy) && i % 10 >= 7;
    const ownPlan = onLegacy ? legacy! : plan;
    const courses = planCourses.get(ownPlan.id) || [];
    if (!courses.length) continue;
    const fp = createHash("sha256").update(`demo-student-${i}`).digest("hex").slice(0, 32);
    random(); // يحفظ تسلسل المولّد كما كان
    const kind = demoArchetypeOf(i, 1);
    const passed = demoPassedFor(kind, courses);
    const credit = new Map(courses.map(c => [Number(c.AdCourseId), Number(c.CourseCredit) || 0]));
    const iso = new Date().toISOString();
    const wishes = (kind === "graduating" || kind === "struggling" || kind === "blocked" || random() < 0.7) && kind !== "graduated" ? {
      termId, targetUnits: pick([12, 15, 15, 18]), courseIds: [] as number[], updatedAt: iso,
      constraints: { noMorning: random() < 0.2, noAfternoon: random() < 0.1, freeDay: random() < 0.3 },
    } : undefined;
    const base = { createdAt: iso, lastSeenAt: iso };
    const profile: StudentProfile = {
      id: fp, fingerprint: fp, AdCollegeId: collegeId, AdSectionId: sectionId, curriculumPlanId: ownPlan.id,
      passedCourseIds: passed, passedUnits: passed.reduce((s, id) => s + (credit.get(id) || 0), 0),
      updatedAt: new Date(Date.now() - 86_400_000).toISOString(), ...base, deleteAt: addDaysISO(opts.today, 900), deleteReason: "initial",
      nameCipher: await opts.sealIdentity(demoStudentName(i)), civilCipher: await opts.sealIdentity(String(300000000000 + i)),
      ...(wishes ? { wishes } : {}),
    };
    await Repository.updateStudentProfile(fp, () => profile);
    fps.push({ fp, sectionId, kind });
  }

  /* ── الرادار ── */
  const fresh = pickDoorTerm((await Repository.getTerms()) as any) || term;
  await runRegistrationSimulation(fresh, "عرض تجريبي");

  /* ── أجوبةُ «هل سجلت؟» لنحو نصفهم، وحالاتٌ مسمّاة لبعض المتعثّرين ── */
  const courseOf = new Map(((await Repository.getCourses()) as AdCourse[]).map(c => [Number(c.AdCourseId), c] as const));
  const REASONS = ["full", "full", "full", "conflict", "conflict", "prereq", "other"] as const;
  let cases = 0;
  const casesOf = new Map<number, number>();
  const REG_CYCLE = 5;
  const registeredAll = new Map<number, number>();
  for (const { fp, kind, sectionId: ownSection } of fps) {
    const forced = kind === "struggling" || kind === "blocked" || kind === "graduating";
    /* في كل قسمٍ طالبان على الأقل سجّلا كلَّ مقرراتهما (فلا يخلو قسمٌ من الناجحين في التسجيل). */
    const wantsAllRegistered = (kind === "new" || kind === "early") && (registeredAll.get(ownSection) || 0) < 2;
    if (random() > 0.5 && !forced && !wantsAllRegistered) continue;
    const ticket = await Repository.getRegistrationTicket(Number(fresh.AdTermId), fp);
    const items = ticket?.plans.find(p => p.label === "A")?.items || [];
    if (!items.length) continue;
    if (wantsAllRegistered) registeredAll.set(ownSection, (registeredAll.get(ownSection) || 0) + 1);
    const answers = items.map((item, at) => wantsAllRegistered ? { courseId: item.courseId, state: "registered" as const } : kind === "struggling" || kind === "blocked" ? (at === 0 || random() < 0.5
      ? { courseId: item.courseId, state: "stuck" as const, reason: kind === "blocked" ? "prereq" as const : pick(REASONS) }
      : { courseId: item.courseId, state: "registered" as const })
      : kind === "graduating" ? { courseId: item.courseId, state: "registered" as const }
      : random() < 0.8
      ? { courseId: item.courseId, state: "registered" as const }
      : { courseId: item.courseId, state: "stuck" as const, reason: pick(REASONS) });
    const iso = new Date().toISOString();
    await Repository.recordRegistrationAnswers(fp, Number(fresh.AdTermId), current => (current ? { ...current, registration: { termId: Number(fresh.AdTermId), at: iso, answers } } : undefined));
    const stuck = answers.filter(a => a.state === "stuck");
    const profile = await Repository.getStudentProfile(fp);
    const sectionKey = Number(profile?.AdSectionId || 0);
    if (stuck.length && (casesOf.get(sectionKey) || 0) < 14 && (kind === "struggling" || kind === "blocked" || random() < 0.6)) {
      const first = courseOf.get(stuck[0].courseId);
      if (first && profile) {
        const need = await Repository.saveStudentNeed({
          fingerprint: fp, AdCollegeId: Number(first.AdCollegeId), AdSectionId: profile.AdSectionId, studentSectionId: profile.AdSectionId,
          surveySectionId: Number(first.AdSectionId), AdTermId: Number(fresh.AdTermId), curriculumPlanId: profile.curriculumPlanId,
          courseIds: stuck.map(a => a.courseId), requestType: "new-course", nameCipher: profile.nameCipher, civilCipher: profile.civilCipher,
          eligibility: "not-checked", details: "من «مساري» بعد التسجيل — امتلأت الشعب",
        } as any);
        casesOf.set(sectionKey, (casesOf.get(sectionKey) || 0) + 1);
        cases += 1;
        /* قراراتٌ متنوعة: بلا قرار (تنتظر اللجنة) · سلّمتها اللجنة · سُجّلت · رُدّت · لم توافق اللجنة. */
        const courseId = stuck[0].courseId;
        switch (cases % REG_CYCLE) {
          case 1: await Repository.setStudentCourseState(need.id, { courseId, state: "awaiting-registration", by: "department", byRole: "رئيس لجنة الجدول", at: iso } as any); break;
          case 2: await Repository.setStudentCourseState(need.id, { courseId, state: "registered", by: "registration", byRole: "موظف التسجيل", at: iso } as any); break;
          case 3: await Repository.setStudentCourseState(need.id, { courseId, state: "rejected", reasonCode: "no-seat", note: "لا مقاعد في الشعب المفتوحة.", by: "registration", byRole: "موظف التسجيل", at: iso } as any); break;
          case 4: await Repository.setStudentCourseState(need.id, { courseId, state: "committee-rejected", reasonCode: "prerequisite", note: "يلزم اجتياز المتطلب السابق أولاً.", by: "department", byRole: "رئيس لجنة الجدول", at: iso } as any); break;
          default: break;
        }
        void caseRefFor;
      }
    }
  }
}

/**
 * ── رغباتُ «مساري» في التجربة ──────────────────────────────────────────────────
 * الطلبةُ المبذورون لهم رغباتٌ بلا مقررات، فلا تظهر لشارة «مساري» ولا لعلامة «+N» في مفتاح الألوان ولا لجرس القسم
 * ما يُعرَض به الطلب على الشعب. تُملأ هنا رغباتُ كلٍّ منهم بمقرراتٍ من قسمه — بعد أن يُحسب الرادارُ والفصلُ السابق، فلا يتغيّر
 * رقمٌ فيهما — فيرى العارضُ مقرراتٍ يزيد طلبُها على شعبها (الأقلُّ سعةً والأقلُّ شعباً أكثرَ طلباً، كما في الواقع).
 */
export async function seedDemoMasariDemand(): Promise<void> {
  if (!Repository.isDemoRequest()) return;
  const door = pickDoorTerm((await Repository.getTerms()) as any);
  if (!door) return;
  const doorId = Number(door.AdTermId);
  const random = rng(20261018);
  const coursesOf = new Map<number, AdCourse[]>();
  let at = 0;
  for (const profile of await Repository.listStudentProfiles()) {
    if (!profile.wishes || Number(profile.wishes.termId) !== doorId || profile.wishes.courseIds?.length) continue;
    const sectionId = Number(profile.AdSectionId);
    if (!coursesOf.has(sectionId)) {
      const offeredIds = new Set(((await Repository.getSchedulesByScope({ termId: doorId })) as FSchedule[]).map(row => Number(row.AdCourseId)));
      const list = ((await Repository.getCoursesBySection(sectionId)) as AdCourse[]).filter(course => offeredIds.has(Number(course.AdCourseId))).slice()
        .sort((a, b) => (Number(a.MaxStudent) || 0) - (Number(b.MaxStudent) || 0) || String(a.CourseCode).localeCompare(String(b.CourseCode)));
      coursesOf.set(sectionId, list);
    }
    const pool = [...(coursesOf.get(sectionId) || [])];
    if (!pool.length) continue;
    /* الأصغر سعةً أعلى وزناً: يُسحب بلا تكرار ثلاثةً إلى خمسة مقررات. */
    const picks: number[] = [];
    const want = Math.min(pool.length, 3 + (at % 3));
    while (picks.length < want) {
      const weights = pool.map((_, index) => pool.length - index + 1);
      let roll = random() * weights.reduce((sum, weight) => sum + weight, 0), chosen = 0;
      for (; chosen < weights.length - 1 && roll >= weights[chosen]; chosen += 1) roll -= weights[chosen];
      picks.push(Number(pool[chosen].AdCourseId));
      pool.splice(chosen, 1);
    }
    await Repository.updateStudentProfile(profile.id, current => current && current.wishes
      ? { ...current, wishes: { ...current.wishes, courseIds: picks } } as StudentProfile
      : current);
    at += 1;
  }
}
