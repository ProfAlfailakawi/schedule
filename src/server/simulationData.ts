/**
 * ── بروفةُ التسجيل: من قاعدة البيانات إلى المحرّك وبالعكس ─────────────────────
 *
 * المحرّكُ (`utils/registrationSim.ts`) نقيٌّ لا يعرف قاعدةً. هنا يُجمَع ما يحتاجه:
 * ملفّاتُ الطلبة بلا أسماء، والشعبُ المطروحة بمواعيدها وسعاتها، وقواعدُ الصحائف
 * **المعتمدة وحدها** (المسوّدةُ لا تدخل). ثم تُحفظ النتيجةُ: ملخّصٌ بالأعداد، وتذكرةٌ
 * لكل طالب.
 */
import { randomUUID } from "crypto";
import { Repository } from "../db/repository";
import type { AdCourse, AdTerm, RegistrationRun, RegistrationTicket } from "../types";
import { parseClock, simulateRegistration, type SimInput, type SimOffering, type SimPlanRules, type SimSlot, type SimStudent } from "../utils/registrationSim";

const DAYS: Array<[keyof import("../types").FSchedule, number]> = [["fsunday", 0], ["fmonday", 1], ["ftuesday", 2], ["fwednesday", 3], ["fthursday", 4]];

/** معرّفُ «صحيفةٍ افتراضية» لقسمٍ بلا صحائف: كتالوجُه الفعّال. */
export const sectionPlanId = (sectionId: number) => `sec:${sectionId}`;

export async function loadSimulationInput(term: AdTerm, rounds: number): Promise<{ input: SimInput; courses: Map<number, AdCourse> }> {
  const termId = Number(term.AdTermId);
  const [profiles, schedules, courses, sections, ruleSets] = await Promise.all([
    Repository.listStudentProfiles(), Repository.getSchedulesByScope({ termId }),
    Repository.getCourses(), Repository.getSections(), Repository.listRuleSets(),
  ]);
  const courseById = new Map((courses as AdCourse[]).map(course => [Number(course.AdCourseId), course] as const));
  const credit = new Map([...courseById].map(([id, course]) => [id, Number(course.CourseCredit) || 0] as const));
  const approved = new Map(ruleSets.map(set => [set.planId, set] as const));

  const plans: SimPlanRules[] = [];
  for (const section of sections as any[]) {
    const sid = Number(section.AdSectionId);
    const [sectionPlans, links, operational] = await Promise.all([
      Repository.getCurriculumPlans(sid), Repository.getCurriculumPlanCourses(sid), Repository.getOperationalCourseIds(sid),
    ]);
    const live = sectionPlans.filter(plan => plan.status !== "archived" && !plan.virtual);
    if (!live.length) {
      plans.push({ planId: sectionPlanId(sid), courseIds: [...operational], rules: [], groups: [], hasApprovedRules: false });
      continue;
    }
    for (const plan of live) {
      const set = approved.get(plan.id);
      plans.push({
        planId: plan.id, courseIds: [...new Set(links.filter(link => link.planId === plan.id).map(link => Number(link.AdCourseId)))],
        rules: set?.rules || [], groups: set?.groups || [], hasApprovedRules: Boolean(set),
      });
    }
  }

  /* الشعبة = مقررٌ + رمزُ شعبة؛ وصفوفُها (أيامٌ وأوقات) تُجمع مواعيدَ لها. */
  const grouped = new Map<string, SimOffering>();
  for (const row of schedules) {
    const courseId = Number(row.AdCourseId);
    const key = `${courseId}|${String(row.SCode || row.id)}`;
    const start = parseClock(row.fstarttime), end = parseClock(row.fendtime);
    let offering = grouped.get(key);
    if (!offering) {
      const course = courseById.get(courseId);
      offering = { id: key, courseId, code: String(row.SCode || row.id), collegeId: Number(row.AdCollegeId), sectionId: Number(row.AdSectionId), capacity: Number(course?.MaxStudent) > 0 ? Number(course!.MaxStudent) : 30, slots: [] };
      grouped.set(key, offering);
    }
    if (start === null || end === null || end <= start) continue;
    for (const [field, day] of DAYS) if ((row as any)[field]) offering.slots.push({ day, start, end } as SimSlot);
  }

  const students: SimStudent[] = profiles
    .filter(profile => profile.AdSectionId > 0)
    .map(profile => ({
      fp: profile.id, planId: profile.curriculumPlanId || sectionPlanId(profile.AdSectionId), passed: profile.passedCourseIds || [],
      wishes: profile.wishes && Number(profile.wishes.termId) === termId
        ? { targetUnits: profile.wishes.targetUnits, courseIds: profile.wishes.courseIds, constraints: profile.wishes.constraints || {} } : undefined,
    }));
  return { input: { students, offerings: [...grouped.values()], plans, credit, rounds }, courses: courseById };
}

/** تشغيلٌ كامل: يحسب ويحفظ، ويُرجع الملخّص. */
export async function runRegistrationSimulation(term: AdTerm, by: string): Promise<RegistrationRun> {
  const rounds = Math.max(1, term.AdTermStudentPhases?.rounds?.length || 2);
  const { input, courses } = await loadSimulationInput(term, rounds);
  const result = simulateRegistration(input);
  const termId = Number(term.AdTermId);
  const runId = randomUUID();
  const perCourse = new Map<number, RegistrationRun["courses"][number]>();
  const owner = new Map(input.offerings.map(o => [o.courseId, o] as const));
  for (const seat of result.seats) {
    const base = owner.get(seat.courseId)!;
    const row = perCourse.get(seat.courseId) || { courseId: seat.courseId, collegeId: base.collegeId, sectionId: base.sectionId, sections: 0, capacity: 0, taken: 0, wanted: 0, seated: 0, unmet: { "not-offered": 0, conflict: 0, full: 0, prereq: 0, units: 0 } };
    row.sections += 1; row.capacity += seat.capacity; row.taken += seat.taken;
    perCourse.set(seat.courseId, row);
  }
  for (const d of result.demand) {
    const row = perCourse.get(d.courseId);
    if (row) { row.wanted = d.wanted; row.seated = d.seated; row.unmet = d.unmet; continue; }
    /* مقررٌ مطلوب لا شعبةَ له هذا الفصل: يظهر بطلبه وحده. */
    const own = courses.get(d.courseId);
    perCourse.set(d.courseId, { courseId: d.courseId, collegeId: Number(own?.AdCollegeId) || 0, sectionId: Number(own?.AdSectionId) || 0, sections: 0, capacity: 0, taken: 0, wanted: d.wanted, seated: d.seated, unmet: d.unmet });
  }
  const run: RegistrationRun = {
    id: String(termId), termId, runId, ranAt: new Date().toISOString(), ranBy: by, students: result.students,
    withoutRules: result.withoutRules, defaulted: result.defaulted, rounds, windows: result.windows, courses: [...perCourse.values()],
  };
  const tickets: RegistrationTicket[] = result.tickets.map(ticket => ({ ...ticket, id: `${termId}_${ticket.fp}`, termId, runId }));
  await Repository.saveRegistrationRun(run, tickets);
  return run;
}

/* ── ما يراه الطالبُ: مواعيدُ شعبةٍ لا تظهر إلا إذا وُقّع جدولُ قسمها ──────────── */
import { createTtlMemo } from "./notificationCache";

export interface TicketContext {
  offerings: Map<string, { code: string; collegeId: number; sectionId: number; slots: SimSlot[] }>;
  /** أقسامٌ وقّعت لجنتُها ورئيسُها: `college:section`. */
  signed: Set<string>;
}
const SIGNED = new Set(["head", "submitted", "accepted"]);
const contextMemo = createTtlMemo<TicketContext>({ ttlMs: 5 * 60_000 });

export function ticketContext(termId: number): Promise<TicketContext> {
  return contextMemo.get(String(termId), async () => {
    const [schedules, approvals] = await Promise.all([Repository.getSchedulesByScope({ termId }), Repository.getScheduleApprovalsForTerm(termId)]);
    const offerings: TicketContext["offerings"] = new Map();
    for (const row of schedules) {
      const key = `${Number(row.AdCourseId)}|${String(row.SCode || row.id)}`;
      let offering = offerings.get(key);
      if (!offering) { offering = { code: String(row.SCode || row.id), collegeId: Number(row.AdCollegeId), sectionId: Number(row.AdSectionId), slots: [] }; offerings.set(key, offering); }
      const start = parseClock(row.fstarttime), end = parseClock(row.fendtime);
      if (start === null || end === null || end <= start) continue;
      for (const [field, day] of DAYS) if ((row as any)[field]) offering.slots.push({ day, start, end });
    }
    const signed = new Set(approvals.filter(a => SIGNED.has(a.status)).map(a => `${a.AdCollegeId}:${a.AdSectionId}`));
    return { offerings, signed };
  });
}

/** للاختبار: يمحو ذاكرةَ المواعيد والتواقيع. */
export const resetTicketContext = (): void => contextMemo.invalidate();
