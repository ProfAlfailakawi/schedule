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
import type { AdCourse, CurriculumCourseRule, ElectiveGroup, FSchedule, StudentProfile } from "../types";
import { pickDoorTerm } from "../utils/termStudentPhases";
import { runRegistrationSimulation } from "./simulationData";
import { DEMO_PREVIOUS_TERM_ID } from "../db/demoSandbox";

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
    case "advanced": return ids.slice(0, Math.max(3, Math.floor(n * 0.75)));
    case "graduating": return ids.slice(0, Math.max(0, n - 1));
    case "graduated": return ids;
    case "blocked": return ids.slice(1, Math.max(2, Math.floor(n * 0.5))); // ينقصه الأول فيُعطَّل ما يشترطه
    case "struggling": return ids.slice(0, 1);
  }
}

/** الأقسامُ التي تُبذر لها الصحائفُ والطلبة: الخمسة الأولى، والرياضيات، وقسمُ المواقع الثلاثة. */
export const DEMO_RADAR_SECTION_IDS: readonly number[] = [1, 2, 3, 4, 5, 9, 6, 7, 8];
const ISL_SECTION_IDS: readonly number[] = [6, 7, 8];
/** أستاذا المقرّرين المطروحين الإضافيين لكل كلية: مَن يخلو يومُ خميسه بعد الثانية والنصف. */
const ISL_THURSDAY_INSTRUCTORS: Record<number, readonly [number, number]> = { 1: [3, 2], 2: [7, 8], 3: [11, 12] };
const ISL_EXTRA_COURSES: ReadonlyArray<readonly [string, string]> = [["ISL102", "السيرة النبوية"], ["ISL201", "الفقه الميسّر"], ["ISL202", "الثقافة الإسلامية"]];
/** مجموعُ مقاعد أول مقرّرين في كل صحيفة (المزدحمان). */
export const DEMO_TIGHT_SEATS = [6, 9] as const;
/** وحداتُ المقرّرات المطروحة في صحائف العرض. */
export const DEMO_COURSE_CREDIT = 4;
/** وحداتُ المقرّرَين الإضافيَّين: 4+4+4+3 = 15 تُبلغ سقفَ الرادار. */
export const DEMO_EXTRA_CREDIT = 3;

const addDaysISO = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** مولّدٌ حتميّ صغير (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** مقرّراتٌ تخصّصيةٌ إضافيةٌ تُطرح في كل قسم (بعد الموجود في الترتيب الهجائي، فلا تزاحم المقرّرَين الضيّقَين ولا مشروعَ التخرج). */
export const DEMO_EXTRA_OFFERED: ReadonlyArray<readonly [string, string]> = [["410", "مقرر تخصصي (١)"], ["420", "مقرر تخصصي (٢)"]];
const EXTRA_SLOTS: ReadonlyArray<{ days: ReadonlyArray<"fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday">; start: string; end: string }> = [
  ...["09:30", "11:00", "14:00", "15:30", "17:00"].map((start, at) => ({ days: ["fmonday", "fwednesday"] as const, start, end: ["10:45", "12:15", "15:15", "16:45", "18:15"][at] })),
  ...["11:00", "15:30", "17:00"].map((start, at) => ({ days: ["fsunday", "ftuesday"] as const, start, end: ["12:15", "16:45", "18:15"][at] })),
];
const toMinutes = (clock: string) => { const [h, m] = String(clock || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
const DAY_FLAGS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;

/** يُنشئ مقرّرَي `DEMO_EXTRA_OFFERED` في القسم ويطرحهما بشعبةٍ واحدة في أول موعدٍ لا يتعارض فيه أستاذٌ ولا قاعة. */
async function offerExtraCourses(collegeId: number, sectionId: number, termId: number, sectionCode: string): Promise<void> {
  const rows = (await Repository.getSchedulesByScope({ termId })) as FSchedule[];
  const mine = rows.filter(row => Number(row.AdSectionId) === sectionId);
  const template = mine[0];
  if (!template) return;
  const instructors = [...new Set(mine.map(row => Number(row.AdInstructorId)).filter(Boolean))];
  const busy = (candidate: { days: readonly string[]; start: string; end: string }, instructorId: number) => rows.some(row =>
    candidate.days.some(day => (row as any)[day]) && toMinutes(row.fstarttime) < toMinutes(candidate.end) && toMinutes(candidate.start) < toMinutes(row.fendtime)
    && (Number(row.AdInstructorId) === instructorId || (row.AdRoomCode === template.AdRoomCode && row.AdRoomHall === template.AdRoomHall)));
  for (const [suffix, name] of DEMO_EXTRA_OFFERED) {
    const course = await Repository.createCourse(collegeId, sectionId, `${sectionCode}${suffix}`, name, DEMO_EXTRA_CREDIT, 3, 30, false);
    const slot = EXTRA_SLOTS.flatMap(candidate => instructors.map(instructorId => ({ candidate, instructorId }))).find(({ candidate, instructorId }) => !busy(candidate, instructorId));
    if (!slot) continue;
    const created = await Repository.createSchedule({
      ...template, AdCourseId: Number(course.AdCourseId), AdCourseName: course.CourseName, SCode: "01", AdInstructorId: slot.instructorId,
      ...Object.fromEntries(DAY_FLAGS.map(day => [day, slot.candidate.days.includes(day)])),
      fstarttime: slot.candidate.start, fendtime: slot.candidate.end, fdetail: "", rev: 0,
    } as any);
    rows.push(created);
  }
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
  const sections = (await Repository.getSections() as any[]).filter(row => DEMO_RADAR_SECTION_IDS.includes(Number(row.AdSectionId)))
    .sort((a, b) => DEMO_RADAR_SECTION_IDS.indexOf(Number(a.AdSectionId)) - DEMO_RADAR_SECTION_IDS.indexOf(Number(b.AdSectionId)));
  const termRows = (await Repository.getSchedulesByScope({ termId })) as FSchedule[];
  const planOf = new Map<number, { id: string; courses: AdCourse[] }>();
  for (const section of sections) {
    const sectionId = Number(section.AdSectionId), collegeId = Number(section.AdCollegeId);
    /* قسمُ المواقع الثلاثة له مقرّرٌ مطروحٌ واحد: تُكمَل صحيفتُه بمقرّراتٍ في الكتالوج لا تُطرح بعد، فيُقرأ رادارُه ويُقرَّر فيه. */
    if (ISL_SECTION_IDS.includes(sectionId)) {
      const made: AdCourse[] = [];
      for (const [code, name] of ISL_EXTRA_COURSES) made.push(await Repository.createCourse(collegeId, sectionId, code, name, 2, 2, 40, false));
      /* أولُ مقرّرين منها يُطرحان (الخميس بعد الظهر بقاعة القسم، وأستاذان يخلو يومُهما) — فيبلغ طالبٌ 12 وحدةً
         بثلاثة مقرّرات؛ والباقي في الكتالوج فحسب. */
      const template = termRows.find(row => Number(row.AdSectionId) === sectionId);
      const offered: Array<[AdCourse | undefined, string, string, string, number]> = [
        [made[0], "03", "14:30", "16:10", (ISL_THURSDAY_INSTRUCTORS[collegeId] || [])[0]],
        [made[1], "04", "16:20", "18:00", (ISL_THURSDAY_INSTRUCTORS[collegeId] || [])[1]],
      ];
      if (template) for (const [course, sCode, start, end, instructorId] of offered) {
        if (!course) continue;
        await Repository.createSchedule({
          ...template, AdCourseId: Number(course.AdCourseId), AdCourseName: course.CourseName, SCode: sCode,
          AdInstructorId: instructorId ?? Number(template.AdInstructorId), fstarttime: start, fendtime: end, fdetail: "", rev: 0,
        } as any);
      }
    }
    /* مقرّران تخصّصيّان إضافيان (٣ وحدات) مطروحان في كل قسم. المحرّكُ يملأ حتى سقف 15 وحدةً ولا يتجاوزه، فمقرّراتٌ
       من أربع وحداتٍ وحدَها تقف عند 12 (ثلاثة مقرّرات) لأن الرابع يتجاوز السقف: لا يبلغ أحدٌ 15 أبداً ويبقى نطاقُ «15 وحدة»
       صفراً. بأربعٍ + ثلاثٍ (4+4+4+3) يبلغها من تتّسع له المقاعد ولا تتعارض أوقاتُه، ومن فاته مقرّرٌ يقف عند 12–14. */
    await offerExtraCourses(collegeId, sectionId, termId, String(section.AdSectionCode));
    let courses = ((await Repository.getCoursesBySection(sectionId)) as AdCourse[]).sort((a, b) => String(a.CourseCode).localeCompare(String(b.CourseCode), "en"));
    if (courses.length < 3) continue;
    /* وحداتُ المقرّرات المطروحة أربع (فيبلغ طالبٌ 12 وحدة بثلاثة مقرّرات و15 بأربعة)، وأول مقرّرين ضيّقا
       السعة: يزدحم عليهما الطلبة فيمتلئان (فيظهر «مقرراتٌ تمتلئ») — مجموعُ مقاعد أولهما 6 وثانيهما 9. */
    for (const [at, course] of courses.entries()) {
      const offerings = Math.max(1, new Set(termRows.filter(row => Number(row.AdCourseId) === Number(course.AdCourseId)).map(row => String(row.SCode))).size);
      const capacity = at === 0 ? Math.ceil(DEMO_TIGHT_SEATS[0] / offerings) : at === 1 ? Math.ceil(DEMO_TIGHT_SEATS[1] / offerings) : Number(course.MaxStudent) || 30;
      await Repository.updateCourse(Number(course.AdCourseId), collegeId, sectionId, course.CourseCode, course.CourseName,
        DEMO_EXTRA_OFFERED.some(([suffix]) => String(course.CourseCode) === `${String(section.AdSectionCode)}${suffix}`) ? DEMO_EXTRA_CREDIT : DEMO_COURSE_CREDIT, Number(course.CourseHours) || 3, capacity);
    }
    /* مقرّرٌ مطلوبٌ في الصحيفة ولا يُطرح هذا الفصل: لا صفوفَ له في الجدول (فيظهر «مطلوبةٌ ولا تُطرح»). */
    const capstone = await Repository.createCourse(collegeId, sectionId, `${String(section.AdSectionCode)}490`, "مشروع التخرج", 3, 3, 30, false);
    /* مجموعةٌ اختيارية في كل صحيفة (يُنتقى منها مقرّرٌ واحد) — فتُعرض «المجموعات الاختيارية» ممتلئةً لا «لا مجموعات». */
    const electives = [
      await Repository.createCourse(collegeId, sectionId, `${String(section.AdSectionCode)}380`, "مقرر اختياري (أ)", 3, 3, 30, false),
      await Repository.createCourse(collegeId, sectionId, `${String(section.AdSectionCode)}390`, "مقرر اختياري (ب)", 3, 3, 30, false),
    ];
    const electiveIds = electives.map(course => Number(course.AdCourseId));
    courses = [...((await Repository.getCoursesBySection(sectionId)) as AdCourse[])].sort((a, b) => String(a.CourseCode).localeCompare(String(b.CourseCode), "en"));
    const plan = await Repository.createCurriculumPlan({ collegeId, sectionId, name: "الصحيفة الجديدة", by: "عرض تجريبي" });
    for (const course of courses) await Repository.addCourseToCurriculumPlan(plan.id, course, "عرض تجريبي");
    planOf.set(sectionId, { id: plan.id, courses });
    const capstoneId = Number(capstone.AdCourseId);
    const core = courses.filter(course => Number(course.AdCourseId) !== capstoneId && !electiveIds.includes(Number(course.AdCourseId)));
    const lastCompulsory = core[core.length - 1];
    /* أول ثلاثة مقرّراتٍ بلا متطلّب (يبلغ المستجدّ 12 وحدة)، والرابع يتطلّب الأول في الأقسام الفردية فقط
       (فيبلغ المستجدّ في الزوجية 15)، ومشروع التخرج يتطلّب آخرَ مقرّرٍ مطروح. */
    const rules: CurriculumCourseRule[] = core.map((course, index) => ({
      courseId: Number(course.AdCourseId), level: index >= 3 ? 2 : 1, kind: "compulsory" as const,
      ...(index === 3 && sectionId % 2 === 1 ? { prereq: { all: [Number(core[0].AdCourseId)], anyOf: [] } } : {}),
    }));
    rules.push({ courseId: capstoneId, level: 3, kind: "compulsory", ...(lastCompulsory ? { prereq: { all: [Number(lastCompulsory.AdCourseId)], anyOf: [] } } : {}) });
    for (const id of electiveIds) rules.push({ courseId: id, level: 2, kind: "elective", groupId: "g1" });
    const groups: ElectiveGroup[] = [{ id: "g1", name: "اختياري القسم", minCourses: 1, minUnits: 3, courseIds: electiveIds }];
    const now = new Date().toISOString();
    await Repository.updateRuleDraft(plan.id, () => ({
      id: plan.id, planId: plan.id, AdCollegeId: collegeId, AdSectionId: sectionId, rules, groups, version: 0, status: "review", basedOnVersion: 0,
      updatedAt: now, updatedBy: "استيراد · عرض تجريبي",
    }));
    await Repository.approveRuleDraft(plan.id, now, "رئيس لجنة الجدول (عرض تجريبي)");
    /* قاعدةُ تخرّجٍ لكل قسم: ويحتاجها طلبُ الخريج في الاستبيان وصحيفةُ التخرج. */
    await Repository.saveDegreeRule({
      AdSectionId: sectionId, degreeUnits: 130, fieldTrainingRequired: 100, graduateRegularPassed: 112, graduateSummerPassed: 118,
      updatedAt: now, updatedBy: "رئيس لجنة الجدول (عرض تجريبي)",
    });
    /* علم البيانات: تعديلٌ لاحق على قاعدة مقرّرٍ ينتظر المراجعة، والنسخةُ المعتمدة (١) قائمةٌ كما هي.
       هذا هو المثالُ الوحيد لـ«صحيفة قيد المراجعة»، ويتعايش مع بيانات كاملة لا يمسّها. */
    if (sectionId === 2) {
      const revised = new Date(Date.now() + 1000).toISOString();
      await Repository.updateRuleDraft(plan.id, current => current ? {
        ...current, status: "review", basedOnVersion: current.version, updatedAt: revised, updatedBy: "رئيس قسم علم البيانات (عرض تجريبي)",
        rules: current.rules.map((rule, index) => index === 1 ? { ...rule, level: Math.min(8, Number(rule.level || 1) + 1) } : rule),
      } : current);
    }
  }

  /* ── ملفّاتُ الطلبة ── */
  const fps: Array<{ fp: string; sectionId: number; kind: DemoStudentArchetype }> = [];
  const total = 320;
  for (let i = 0; i < total; i += 1) {
    const section = sections[i % sections.length];
    const sectionId = Number(section.AdSectionId), collegeId = Number(section.AdCollegeId);
    const plan = planOf.get(sectionId);
    const courses = plan?.courses || ((await Repository.getCoursesBySection(sectionId)) as AdCourse[]);
    if (!courses.length) continue;
    const fp = createHash("sha256").update(`demo-student-${i}`).digest("hex").slice(0, 32);
    random(); // يحفظ تسلسل المولّد كما كان
    const kind = demoArchetypeOf(i, sections.length);
    const passed = demoPassedFor(kind, courses);
    const credit = new Map(courses.map(c => [Number(c.AdCourseId), Number(c.CourseCredit) || 0]));
    const iso = new Date().toISOString();
    const wishes = (kind === "graduating" || kind === "struggling" || kind === "blocked" || random() < 0.7) && kind !== "graduated" ? {
      termId, targetUnits: pick([12, 15, 15, 18]), courseIds: [] as number[], updatedAt: iso,
      constraints: { noMorning: random() < 0.2, noAfternoon: random() < 0.1, freeDay: random() < 0.3 },
    } : undefined;
    const base = { createdAt: iso, lastSeenAt: iso };
    const profile: StudentProfile = {
      id: fp, fingerprint: fp, AdCollegeId: collegeId, AdSectionId: sectionId, curriculumPlanId: plan?.id,
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
 * ── رادارُ الفصل السابق (للعرض فقط) ──────────────────────────────────────────
 * يُفتح الرادارُ على الفصل السابق فيجد أرقاماً كاملة لا شاشةً فارغة: الشعبُ نفسُها المطروحة في الجاري،
 * ورادارٌ محسوبٌ بالمحرّك نفسه من رغبات الطلبة، وأجوبةُ «هل سجلت؟» لنحو نصفهم. ملفُّ الطالب يحمل رغباتِ فصلٍ واحد،
 * فيُحسب الرادارُ على رغبات الفصل الجاري ويُسجَّل ذلك في `RegistrationRun.wishesTermId` — تجربةٌ لا تاريخٌ حقيقي.
 * يُستدعى بعد بذر الفصلين (آخرَ الترتيب)، فلا تُوسَم نتيجتُه «قديمة» بكتابةٍ لاحقة.
 */
export async function seedDemoPreviousTermRadar(): Promise<void> {
  if (!Repository.isDemoRequest()) return;
  const terms = (await Repository.getTerms()) as any[];
  const previous = terms.find(row => Number(row.AdTermId) === DEMO_PREVIOUS_TERM_ID);
  const door = pickDoorTerm(terms as any);
  if (!previous || !door || Number(door.AdTermId) === DEMO_PREVIOUS_TERM_ID) return;
  const previousId = Number(previous.AdTermId), doorId = Number(door.AdTermId);
  if (await Repository.getRegistrationRun(previousId)) return; // مبذورٌ من قبل

  /* المقرّراتُ المطروحة في الجاري ولا صفَّ لها في السابق (الإضافيةُ والإسلامية): تُطرح فيه بشعبها نفسِها. */
  const [current, old] = await Promise.all([Repository.getSchedulesByScope({ termId: doorId }), Repository.getSchedulesByScope({ termId: previousId })]) as [FSchedule[], FSchedule[]];
  const had = new Set(old.map(row => Number(row.AdCourseId)));
  for (const row of current) {
    if (had.has(Number(row.AdCourseId)) || String(row.fdetail || "").includes("حالة تجريبية مقصودة")) continue;
    const { id: _id, ...rest } = row as any;
    await Repository.createSchedule({ ...rest, AdTermId: previousId, rev: 0 });
  }

  await runRegistrationSimulation(previous, "عرض تجريبي", { wishesTermId: doorId });

  const random = rng(20260301);
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
  const REASONS = ["full", "full", "full", "conflict", "conflict", "prereq", "other"] as const;
  for (const profile of await Repository.listStudentProfiles()) {
    if (!profile.wishes || Number(profile.wishes.termId) !== doorId || random() > 0.55) continue;
    const ticket = await Repository.getRegistrationTicket(previousId, profile.id);
    const items = ticket?.plans.find(plan => plan.label === "A")?.items || [];
    if (!items.length) continue;
    const answers = items.map((item, at) => random() < (at === 0 ? 0.7 : 0.82)
      ? { courseId: item.courseId, state: "registered" as const }
      : { courseId: item.courseId, state: "stuck" as const, reason: pick(REASONS) });
    /* الملفُّ يحمل جوابَ فصلٍ واحد (الجاري): يُكتب جوابُ السابق للعدّادات ثم يُعاد جوابُ الجاري كما كان. */
    const original = profile.registration;
    await Repository.recordRegistrationAnswers(profile.id, previousId, current => current ? { ...current, registration: { termId: previousId, at: new Date().toISOString(), answers } } : undefined);
    await Repository.updateStudentProfile(profile.id, current => {
      if (!current) return current;
      const { registration: _registration, ...rest } = current;
      return (original ? { ...rest, registration: original } : rest) as StudentProfile;
    });
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
      const list = ((await Repository.getCoursesBySection(sectionId)) as AdCourse[]).slice()
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
