/**
 * ── رادارُ التسجيل: من قاعدة البيانات إلى المحرّك وبالعكس ─────────────────────
 *
 * المحرّكُ (`utils/registrationSim.ts`) نقيٌّ لا يعرف قاعدةً. هنا يُجمَع ما يحتاجه:
 * ملفّاتُ الطلبة بلا أسماء، والشعبُ المطروحة بمواعيدها وسعاتها، وقواعدُ الصحائف
 * **المعتمدة وحدها** (المسوّدةُ لا تدخل). ثم تُحفظ النتيجةُ: ملخّصٌ بالأعداد، وتذكرةٌ
 * لكل طالب.
 */
import { createHash, randomUUID } from "crypto";
import { Repository } from "../db/repository";
import type { AdCourse, AdTerm, RegistrationRun, RegistrationTicket } from "../types";
import { remainingNeed } from "../utils/curriculumRules";
import { auditSimOfferings, parseClock, simulateRegistration, type SimInput, type SimOffering, type SimPlanRules, type SimSlot, type SimStudent } from "../utils/registrationSim";

const DAYS: Array<[keyof import("../types").FSchedule, number]> = [["fsunday", 0], ["fmonday", 1], ["ftuesday", 2], ["fwednesday", 3], ["fthursday", 4]];

export function buildSimulationOfferings(termId: number, schedules: import("../types").FSchedule[], courseById: Map<number, AdCourse>): { offerings: SimOffering[]; duplicateRows: number } {
  const grouped = new Map<string, SimOffering>(), seenRows = new Set<string>();
  let duplicateRows = 0;
  for (const row of schedules) {
    const courseId = Number(row.AdCourseId), collegeId = Number(row.AdCollegeId), sectionId = Number(row.AdSectionId);
    const sectionCode = String(row.SCode || "").trim(), rowId = String(row.id ?? "");
    const key = `${termId}|${collegeId}|${sectionId}|${courseId}|${sectionCode}`;
    if (rowId && seenRows.has(rowId)) { duplicateRows += 1; continue; }
    if (rowId) seenRows.add(rowId);
    const start = parseClock(row.fstarttime), end = parseClock(row.fendtime);
    let offering = grouped.get(key);
    if (!offering) {
      const course = courseById.get(courseId);
      offering = { id: key, courseId, code: sectionCode, collegeId, sectionId, capacity: Number(course?.MaxStudent) || 0, slots: [], issues: [] };
      grouped.set(key, offering);
    }
    const course = courseById.get(courseId);
    if (!course || !Number.isInteger(courseId) || courseId <= 0 || !sectionCode || collegeId <= 0 || sectionId <= 0
      || (course && (Number(course.AdCollegeId) !== collegeId || Number(course.AdSectionId) !== sectionId))) offering.issues!.push("invalid-identity");
    const days = DAYS.filter(([field]) => Boolean((row as any)[field]));
    if (start === null || end === null || end <= start) offering.issues!.push("invalid-meetings");
    if (!days.length) offering.issues!.push("missing-meetings");
    if (start !== null && end !== null && end > start) for (const [, day] of days) {
      const slot = { day, start, end } as SimSlot;
      if (!offering.slots.some(existing => existing.day === day && existing.start === start && existing.end === end)) offering.slots.push(slot);
    }
  }
  return { offerings: [...grouped.values()], duplicateRows };
}

/** معرّفُ «صحيفةٍ افتراضية» لقسمٍ بلا صحائف: كتالوجُه الفعّال. */
export const sectionPlanId = (sectionId: number) => `sec:${sectionId}`;

export async function loadSimulationInput(term: AdTerm, rounds: number): Promise<{ input: SimInput; courses: Map<number, AdCourse>; population: number; fingerprint: string; schedules: import("../types").FSchedule[]; duplicateRows: number }> {
  const termId = Number(term.AdTermId);
  const [profiles, schedules, courses, sections, ruleSets] = await Promise.all([
    Repository.listStudentProfiles(), Repository.getSchedulesByScope({ termId }),
    Repository.getCourses(), Repository.getSections(), Repository.listRuleSets(),
  ]);
  const courseById = new Map((courses as AdCourse[]).map(course => [Number(course.AdCourseId), course] as const));
  const credit = new Map([...courseById].map(([id, course]) => [id, Number(course.CourseCredit) || 0] as const));
  const approved = new Map(ruleSets.map(set => [set.planId, set] as const));
  const referenced = new Set(profiles.map(profile => profile.curriculumPlanId).filter((id): id is string => Boolean(id)));

  const plans: SimPlanRules[] = [];
  for (const section of sections as any[]) {
    const sid = Number(section.AdSectionId);
    const [sectionPlans, links, operational] = await Promise.all([
      Repository.getCurriculumPlans(sid), Repository.getCurriculumPlanCourses(sid), Repository.getOperationalCourseIds(sid),
    ]);
    /* صحيفةٌ أُرشفت وما زال في الملفّات من يدرس عليها تبقى في الحساب، وإلا خرج طلبتُها بلا خطط. */
    const live = sectionPlans.filter(plan => !plan.virtual && (plan.status !== "archived" || referenced.has(plan.id)));
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
  const offeringBuild = buildSimulationOfferings(termId, schedules as any[], courseById);
  const offeringRows = offeringBuild.offerings;
  const audited = auditSimOfferings(offeringRows);

  const planById = new Map(plans.map(plan => [plan.planId, plan] as const));
  const students: SimStudent[] = profiles
    .filter(profile => profile.AdSectionId > 0)
    .map(profile => ({
      fp: profile.id, collegeId: Number(profile.AdCollegeId), sectionId: Number(profile.AdSectionId), planId: profile.curriculumPlanId || sectionPlanId(profile.AdSectionId), passed: profile.passedCourseIds || [],
      assessable: (() => {
        const plan = planById.get(profile.curriculumPlanId || sectionPlanId(profile.AdSectionId));
        return Boolean(plan?.hasApprovedRules && plan.courseIds.length > 0 && plan.courseIds.every(id => courseById.has(Number(id)) && Number(credit.get(Number(id))) > 0)
          && Array.isArray(profile.passedCourseIds) && profile.passedCourseIds.every(id => courseById.has(Number(id)) && Number(credit.get(Number(id))) > 0));
      })(),
      wishes: profile.wishes && Number(profile.wishes.termId) === termId
        ? { targetUnits: profile.wishes.targetUnits, courseIds: profile.wishes.courseIds, constraints: profile.wishes.constraints || {} } : undefined,
      remainingUnits: undefined,
    }));
  for (const student of students) {
    const plan = planById.get(student.planId);
    if (plan?.hasApprovedRules) {
      student.remainingUnits = remainingNeed(plan.courseIds, { rules: plan.rules, groups: plan.groups }, new Set(student.passed), credit).remainingUnits;
    }
  }
  const fingerprintPayload = {
    termId,
    profiles: profiles.map(profile => [profile.id, profile.updatedAt, profile.wishes?.termId, profile.wishes?.updatedAt, profile.wishes?.courseIds, profile.wishes?.targetUnits, profile.passedCourseIds, profile.curriculumPlanId]),
    schedules: schedules.map(row => [row.id, row.rev, row.AdCollegeId, row.AdSectionId, row.AdCourseId, row.SCode, row.fsunday, row.fmonday, row.ftuesday, row.fwednesday, row.fthursday, row.fstarttime, row.fendtime, row.AdInstructorId, row.AdRoomCode, row.AdRoomHall]),
    courses: [...courseById.values()].map(row => [row.AdCourseId, row.CourseCode, row.CourseName, row.CourseCredit, row.MaxStudent]),
    plans: plans.map(plan => [plan.planId, plan.courseIds, plan.rules, plan.groups, plan.hasApprovedRules]),
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(fingerprintPayload)).digest("hex");
  return { input: { students, offerings: offeringRows, plans, credit, rounds }, courses: courseById, population: students.length, fingerprint, schedules, duplicateRows: offeringBuild.duplicateRows };
}

/** تشغيلٌ كامل: يحسب ويحفظ، ويُرجع الملخّص. */
export async function runRegistrationSimulation(term: AdTerm, by: string): Promise<RegistrationRun> {
  const rounds = Math.max(1, term.AdTermStudentPhases?.rounds?.length || 2);
  const { input, courses, population, fingerprint, duplicateRows } = await loadSimulationInput(term, rounds);
  const participants = input.students.filter(student => student.wishes);
  const nonParticipants = input.students.filter(student => !student.wishes).map(student => ({ ...student, wishes: { targetUnits: 15, courseIds: [], constraints: {} } }));
  const result = simulateRegistration({ ...input, students: participants, assessCapacity: true });
  const projection = simulateRegistration({ ...input, students: nonParticipants, assessCapacity: true });
  const termId = Number(term.AdTermId);
  const runId = randomUUID();
  const makeCourseRows = (scenario: ReturnType<typeof simulateRegistration>): RegistrationRun["courses"] => {
    const perCourse = new Map<number, RegistrationRun["courses"][number]>();
    const owner = new Map(scenario.seats.map(seat => [seat.courseId, input.offerings.find(o => o.id === seat.offeringId)] as const));
    for (const seat of scenario.seats) {
      const base = owner.get(seat.courseId);
      if (!base) continue;
      const row = perCourse.get(seat.courseId) || { courseId: seat.courseId, collegeId: base.collegeId, sectionId: base.sectionId, sections: 0, capacity: 0, taken: 0, wanted: 0, seated: 0, unmet: { "not-offered": 0, conflict: 0, full: 0, prereq: 0, units: 0 } };
      row.sections += 1; row.capacity += seat.capacity; row.taken += seat.taken;
      perCourse.set(seat.courseId, row);
    }
    for (const d of scenario.demand) {
      const row = perCourse.get(d.courseId);
      if (row) { row.wanted = d.wanted; row.seated = d.seated; row.unmet = d.unmet; continue; }
      const own = courses.get(d.courseId);
      perCourse.set(d.courseId, { courseId: d.courseId, collegeId: Number(own?.AdCollegeId) || 0, sectionId: Number(own?.AdSectionId) || 0, sections: 0, capacity: 0, taken: 0, wanted: d.wanted, seated: d.seated, unmet: d.unmet });
    }
    return [...perCourse.values()];
  };
  const allAudit = auditSimOfferings(input.offerings);
  const issueCounts: Record<string, number> = {};
  for (const issue of allAudit.issues) issueCounts[issue.code] = (issueCounts[issue.code] || 0) + 1;
  const run: RegistrationRun = {
    id: String(termId), termId, runId, ranAt: new Date().toISOString(), ranBy: by, students: participants.length, population,
    withoutRules: result.withoutRules, defaulted: nonParticipants.length, rounds, windows: result.windows,
    courses: makeCourseRows(result), capacity: result.capacity,
    projected: { students: nonParticipants.length, capacity: projection.capacity, courses: makeCourseRows(projection) },
    dataQuality: { total: input.offerings.length, ready: allAudit.confirmed.length, excluded: Math.max(0, input.offerings.length - allAudit.confirmed.length), issues: { ...issueCounts, ...(duplicateRows ? { duplicateRows } : {}) } },
    sourceFingerprint: fingerprint, stale: false,
  };
  /* Only an actual current-term response can generate a private ticket. */
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
    const legacyKeys = new Map<string, string[]>();
    for (const row of schedules) {
      const legacy = `${Number(row.AdCourseId)}|${String(row.SCode || row.id)}`;
      const key = `${termId}|${Number(row.AdCollegeId)}|${Number(row.AdSectionId)}|${Number(row.AdCourseId)}|${String(row.SCode || "").trim()}`;
      let offering = offerings.get(key);
      if (!offering) { offering = { code: String(row.SCode || row.id), collegeId: Number(row.AdCollegeId), sectionId: Number(row.AdSectionId), slots: [] }; offerings.set(key, offering); }
      legacyKeys.set(legacy, [...(legacyKeys.get(legacy) || []), key]);
      const start = parseClock(row.fstarttime), end = parseClock(row.fendtime);
      if (start === null || end === null || end <= start) continue;
      for (const [field, day] of DAYS) if ((row as any)[field]) {
        if (!offering.slots.some(slot => slot.day === day && slot.start === start && slot.end === end)) offering.slots.push({ day, start, end });
      }
    }
    for (const [legacy, keys] of legacyKeys) if (new Set(keys).size === 1) {
      const offering = offerings.get(keys[0]);
      if (offering) offerings.set(legacy, offering);
    }
    const signed = new Set(approvals.filter(a => SIGNED.has(a.status)).map(a => `${a.AdCollegeId}:${a.AdSectionId}`));
    return { offerings, signed };
  });
}

/** للاختبار: يمحو ذاكرةَ المواعيد والتواقيع. */
export const resetTicketContext = (): void => contextMemo.invalidate();
