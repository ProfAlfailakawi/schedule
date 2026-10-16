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
import type { DemandRepair } from "../utils/demandRepair";
import type { SectionProposal } from "../utils/sectionOpening";
import { remainingNeed } from "../utils/curriculumRules";
import { auditSimOfferings, parseClock, simulateRegistration, type SimInput, type SimOffering, type SimPlanRules, type SimResult, type SimSlot, type SimStudent } from "../utils/registrationSim";

const DAYS: Array<[keyof import("../types").FSchedule, number]> = [["fsunday", 0], ["fmonday", 1], ["ftuesday", 2], ["fwednesday", 3], ["fthursday", 4]];

export function buildSimulationOfferings(termId: number, schedules: import("../types").FSchedule[], courseById: Map<number, AdCourse>): { offerings: SimOffering[]; duplicateRows: number } {
  const grouped = new Map<string, SimOffering>(), seenRows = new Map<string, { key: string; signature: string }>();
  let duplicateRows = 0;
  for (const row of schedules) {
    if (Number(row.AdTermId) !== termId) continue;
    const courseId = Number(row.AdCourseId), collegeId = Number(row.AdCollegeId), sectionId = Number(row.AdSectionId);
    const sectionCode = String(row.SCode || "").trim(), rowId = String(row.id ?? "");
    const key = `${termId}|${collegeId}|${sectionId}|${courseId}|${sectionCode}`;
    const signature = JSON.stringify([key, row.fsunday, row.fmonday, row.ftuesday, row.fwednesday, row.fthursday, row.fstarttime, row.fendtime, row.AdInstructorId, row.AdRoomCode, row.AdRoomHall]);
    const prior = seenRows.get(rowId);
    if (rowId && prior?.signature === signature) { duplicateRows += 1; continue; }
    if (rowId && prior) grouped.get(prior.key)?.issues?.push("invalid-identity");
    if (rowId) seenRows.set(rowId, { key, signature });
    const start = parseClock(row.fstarttime), end = parseClock(row.fendtime);
    let offering = grouped.get(key);
    if (!offering) {
      const course = courseById.get(courseId);
      offering = { id: key, courseId, code: sectionCode, collegeId, sectionId, capacity: Number(course?.MaxStudent) || 0, slots: [], issues: [] };
      grouped.set(key, offering);
    }
    if (prior || !Number.isInteger(Number(row.id)) || Number(row.id) <= 0) offering.issues!.push("invalid-identity");
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
  const credit = new Map([...courseById].map(([id, course]) => [id, Number.isFinite(Number(course.CourseCredit)) && course.CourseCredit !== null && String(course.CourseCredit).trim() !== "" ? Number(course.CourseCredit) : Number.NaN] as const));
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
        planId: plan.id, courseIds: [...new Set([...links.filter(link => link.planId === plan.id).map(link => Number(link.AdCourseId)), ...(set?.externals || []).map(Number)])],
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
        return Boolean(plan?.hasApprovedRules && plan.courseIds.length > 0 && plan.courseIds.every(id => courseById.has(Number(id)) && Number.isFinite(credit.get(Number(id))) && Number(credit.get(Number(id))) >= 0)
          && Array.isArray(profile.passedCourseIds) && profile.passedCourseIds.every(id => courseById.has(Number(id)) && Number.isFinite(credit.get(Number(id))) && Number(credit.get(Number(id))) >= 0));
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
    profiles: profiles.map(profile => [profile.id, profile.updatedAt, profile.wishes?.termId, profile.wishes?.updatedAt, profile.wishes?.courseIds, profile.wishes?.targetUnits, profile.wishes?.constraints, profile.passedCourseIds, profile.curriculumPlanId]),
    schedules: schedules.map(row => [row.id, row.rev, row.AdCollegeId, row.AdSectionId, row.AdCourseId, row.SCode, row.fsunday, row.fmonday, row.ftuesday, row.fwednesday, row.fthursday, row.fstarttime, row.fendtime, row.AdInstructorId, row.AdRoomCode, row.AdRoomHall]),
    courses: [...courseById.values()].map(row => [row.AdCourseId, row.CourseCode, row.CourseName, row.CourseCredit, row.MaxStudent]),
    plans: plans.map(plan => [plan.planId, plan.courseIds, plan.rules, plan.groups, plan.hasApprovedRules]),
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(fingerprintPayload)).digest("hex");
  return { input: { students, offerings: offeringRows, plans, credit, rounds }, courses: courseById, population: students.length, fingerprint, schedules, duplicateRows: offeringBuild.duplicateRows };
}

export interface DemandRepairImpact {
  before: SimResult["capacity"];
  after: SimResult["capacity"];
  delta12: number;
  delta15: number;
  conflictsBefore: number;
  conflictsAfter: number;
  deltaConflicts: number;
  scheduleChanges: number;
  respondents: number;
  virtualCapacity: true;
}

export interface SectionOpeningImpact extends DemandRepairImpact {}

/** Add proposed sections only to a throwaway schedule and compare the actual
 * responder population. A placement with no measured benefit is not promoted. */
export function rankSectionOpeningsBySimulation(
  input: SimInput,
  schedules: import("../types").FSchedule[],
  courses: Map<number, AdCourse>,
  termId: number,
  proposals: SectionProposal[],
): { proposals: Array<SectionProposal & { simulationImpact: SectionOpeningImpact }>; tested: number; rejected: number } {
  const responders = input.students.filter(student => student.wishes);
  if (!responders.length) return { proposals: [], tested: 0, rejected: proposals.length };
  const baseline = simulateRegistration({
    ...input, students: responders, offerings: buildSimulationOfferings(termId, schedules, courses).offerings, assessCapacity: true,
  });
  const summarize = (result: SimResult, scope?: { collegeId: number; sectionId: number }) => {
    const ids = new Set(responders.filter(student => !scope || (student.collegeId === scope.collegeId && student.sectionId === scope.sectionId)).map(student => student.fp));
    const value: SimResult["capacity"] = { canReach15: 0, canReach12To14: 0, below12: 0, graduatingBelow12: 0, unknown: 0 };
    for (const ticket of result.tickets) if (ids.has(ticket.fp)) value[ticket.assessment || "unknown"] += 1;
    return value;
  };
  const conflictCount = (result: SimResult, scope?: { collegeId: number; sectionId: number }) => {
    const ids = new Set(responders.filter(student => !scope || (student.collegeId === scope.collegeId && student.sectionId === scope.sectionId)).map(student => student.fp));
    return result.tickets.filter(ticket => ids.has(ticket.fp)).reduce((sum, ticket) => sum + ticket.unmet.filter(item => item.reason === "conflict").length, 0);
  };
  const scopedFor = (proposal: SectionProposal) => {
    const course = courses.get(proposal.courseId);
    return { collegeId: Number(course?.AdCollegeId) || 0, sectionId: Number(course?.AdSectionId) || 0 };
  };
  const reaches12 = (value: SimResult["capacity"]) => value.canReach15 + value.canReach12To14;
  let nextId = Math.max(0, ...schedules.map(row => Number(row.id) || 0)) + 1;
  const accepted: Array<SectionProposal & { simulationImpact: SectionOpeningImpact }> = [];
  for (const proposal of proposals) {
    const course = courses.get(proposal.courseId), scope = scopedFor(proposal);
    if (!course || !scope.collegeId || !scope.sectionId || proposal.predicted || !proposal.placements.length) continue;
    const added = proposal.placements.map(placement => ({
      id: nextId++, AdCollegeId: scope.collegeId, AdSectionId: scope.sectionId, AdTermId: termId,
      AdCourseId: proposal.courseId, AdCourseName: course.CourseName, SCode: placement.sectionCode,
      AdInstructorId: placement.instructorId,
      fsunday: placement.day === "fsunday", fmonday: placement.day === "fmonday", ftuesday: placement.day === "ftuesday",
      fwednesday: placement.day === "fwednesday", fthursday: placement.day === "fthursday",
      fstarttime: placement.start, fendtime: placement.end, AdRoomCode: placement.roomCode, AdRoomHall: placement.roomHall,
      buildingId: placement.buildingId, roomId: placement.roomId, locationStatus: "VERIFIED" as const,
    } as import("../types").FSchedule));
    const revised = [...schedules, ...added];
    const afterResult = simulateRegistration({
      ...input, students: responders, offerings: buildSimulationOfferings(termId, revised, courses).offerings, assessCapacity: true,
    });
    const before = summarize(baseline, scope), after = summarize(afterResult, scope);
    const delta12 = reaches12(after) - reaches12(before), delta15 = after.canReach15 - before.canReach15;
    const conflictsBefore = conflictCount(baseline, scope), conflictsAfter = conflictCount(afterResult, scope);
    const deltaConflicts = conflictsBefore - conflictsAfter;
    const beforeAll = new Map(baseline.tickets.map(ticket => [ticket.fp, ticket.assessment || "unknown"] as const));
    const afterAll = new Map(afterResult.tickets.map(ticket => [ticket.fp, ticket.assessment || "unknown"] as const));
    const regresses = responders.some(student => {
      const prior = beforeAll.get(student.fp), next = afterAll.get(student.fp);
      if (prior === "canReach15") return next !== "canReach15";
      if (prior === "canReach12To14") return next !== "canReach15" && next !== "canReach12To14";
      if (prior === "graduatingBelow12") return next !== "graduatingBelow12" && next !== "canReach15" && next !== "canReach12To14";
      return false;
    });
    if (regresses || delta12 < 0 || delta15 < 0 || (delta12 === 0 && delta15 === 0 && deltaConflicts <= 0)) continue;
    accepted.push({ ...proposal, simulationImpact: { before, after, delta12, delta15, conflictsBefore, conflictsAfter, deltaConflicts,
      scheduleChanges: proposal.placements.length, respondents: responders.filter(student => student.collegeId === scope.collegeId && student.sectionId === scope.sectionId).length, virtualCapacity: true } });
  }
  accepted.sort((a, b) => b.simulationImpact.delta12 - a.simulationImpact.delta12 || b.simulationImpact.delta15 - a.simulationImpact.delta15
    || b.simulationImpact.deltaConflicts - a.simulationImpact.deltaConflicts
    || a.simulationImpact.scheduleChanges - b.simulationImpact.scheduleChanges || b.shortfall - a.shortfall);
  return { proposals: accepted, tested: proposals.filter(proposal => !proposal.predicted && proposal.placements.length > 0).length, rejected: proposals.length - accepted.length };
}

/** Re-score only current-term respondents after each candidate schedule move.
 * The helper is pure: it reads no storage and persists no scenario or result. */
export function rankDemandRepairsBySimulation(
  input: SimInput,
  schedules: import("../types").FSchedule[],
  courses: Map<number, AdCourse>,
  termId: number,
  repairs: DemandRepair[],
  scope: { collegeId: number; sectionId: number },
): Array<DemandRepair & { simulationImpact: DemandRepairImpact }> {
  const responders = input.students.filter(student => student.wishes);
  const scoped = responders.filter(student => student.collegeId === scope.collegeId && student.sectionId === scope.sectionId);
  const scopedIds = new Set(scoped.map(student => student.fp));
  const count = (result: SimResult) => {
    const ids = new Set(scoped.map(student => student.fp));
    const value: SimResult["capacity"] = { canReach15: 0, canReach12To14: 0, below12: 0, graduatingBelow12: 0, unknown: 0 };
    for (const ticket of result.tickets) if (ids.has(ticket.fp)) value[ticket.assessment || "unknown"] += 1;
    return value;
  };
  const baselineResult = simulateRegistration({ ...input, students: responders, assessCapacity: true });
  const before = count(baselineResult);
  const conflictCount = (result: SimResult) => result.tickets.filter(ticket => scopedIds.has(ticket.fp))
    .reduce((sum, ticket) => sum + ticket.unmet.filter(item => item.reason === "conflict").length, 0);
  const conflictsBefore = conflictCount(baselineResult);
  const baselineByStudent = new Map(baselineResult.tickets.map(ticket => [ticket.fp, ticket.assessment || "unknown"] as const));
  const reaches12 = (value: SimResult["capacity"]) => value.canReach15 + value.canReach12To14;
  return repairs.flatMap(repair => {
    const moves = [repair, ...(repair.swapWith ? [{ rowId: repair.swapWith.rowId, to: repair.swapWith.to }] : [])];
    const moveById = new Map(moves.map(move => [Number(move.rowId), move.to] as const));
    const revised = schedules.map(row => {
      const to = moveById.get(Number(row.id));
      return to ? {
        ...row,
        fsunday: to.day === "fsunday", fmonday: to.day === "fmonday",
        ftuesday: to.day === "ftuesday", fwednesday: to.day === "fwednesday",
        fthursday: to.day === "fthursday", fstarttime: to.start, fendtime: to.end,
      } : row;
    });
    if (!revised.some(row => Number(row.id) === Number(repair.rowId))) return [];
    const offerings = buildSimulationOfferings(termId, revised, courses).offerings;
    const afterResult = simulateRegistration({ ...input, students: responders, offerings, assessCapacity: true });
    const after = count(afterResult);
    const delta12 = reaches12(after) - reaches12(before), delta15 = after.canReach15 - before.canReach15;
    const conflictsAfter = conflictCount(afterResult), deltaConflicts = conflictsBefore - conflictsAfter;
    const afterByStudent = new Map(afterResult.tickets.map(ticket => [ticket.fp, ticket.assessment || "unknown"] as const));
    const regresses = responders.some(student => {
      const prior = baselineByStudent.get(student.fp), next = afterByStudent.get(student.fp);
      if (prior === "canReach15") return next !== "canReach15";
      if (prior === "canReach12To14") return next !== "canReach15" && next !== "canReach12To14";
      if (prior === "graduatingBelow12") return next !== "graduatingBelow12" && next !== "canReach15" && next !== "canReach12To14";
      return false;
    });
    /* Never trade away a known student's 12-unit, 15-unit, or graduation
       outcome anywhere in the responding population to improve this section. */
    if (regresses || delta12 < 0 || delta15 < 0 || (delta12 === 0 && delta15 === 0 && deltaConflicts <= 0)) return [];
    return [{ ...repair, simulationImpact: { before, after, delta12, delta15, conflictsBefore, conflictsAfter, deltaConflicts,
      scheduleChanges: repair.swapWith ? 2 : 1, respondents: scoped.length, virtualCapacity: true as const } }];
  }).sort((a, b) => b.simulationImpact.delta12 - a.simulationImpact.delta12
    || b.simulationImpact.delta15 - a.simulationImpact.delta15
    || b.simulationImpact.deltaConflicts - a.simulationImpact.deltaConflicts
    || a.simulationImpact.scheduleChanges - b.simulationImpact.scheduleChanges
    || b.removes - a.removes || a.distanceMinutes - b.distanceMinutes);
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
  const scopes: NonNullable<RegistrationRun["scopes"]> = [];
  const scopeKeys = new Set(input.students.map(student => `${student.collegeId}:${student.sectionId}`));
  const sumScenario = (scenario: ReturnType<typeof simulateRegistration>, students: SimStudent[]) => {
    const fps = new Set(students.map(student => student.fp));
    const capacity = { canReach15: 0, canReach12To14: 0, below12: 0, graduatingBelow12: 0, unknown: 0 };
    const windows = Array.from({ length: rounds }, () => 0);
    for (const ticket of scenario.tickets) if (fps.has(ticket.fp)) {
      capacity[ticket.assessment || "unknown"] += 1;
      windows[ticket.window - 1] += 1;
    }
    return { students: students.length, capacity, windows };
  };
  for (const key of scopeKeys) {
    const [collegeId, sectionId] = key.split(":").map(Number);
    const mine = (student: SimStudent) => student.collegeId === collegeId && student.sectionId === sectionId;
    const actualStudents = participants.filter(mine), predicted = nonParticipants.filter(mine);
    const actual = sumScenario(result, actualStudents), projected = sumScenario(projection, predicted);
    const offerings = input.offerings.filter(offering => offering.collegeId === collegeId && offering.sectionId === sectionId);
    const audit = auditSimOfferings(offerings), issues: Record<string, number> = {};
    for (const issue of audit.issues) issues[issue.code] = (issues[issue.code] || 0) + 1;
    scopes.push({ collegeId, sectionId, students: actual.students, capacity: actual.capacity, windows: actual.windows,
      projected: { students: projected.students, capacity: projected.capacity }, population: actualStudents.length + predicted.length, defaulted: predicted.length,
      withoutRules: actualStudents.filter(student => !input.plans.find(plan => plan.planId === student.planId)?.hasApprovedRules).length,
      dataQuality: { total: offerings.length, ready: audit.confirmed.length, excluded: offerings.length - audit.confirmed.length, issues },
    });
  }
  const run: RegistrationRun = {
    id: String(termId), termId, runId, ranAt: new Date().toISOString(), ranBy: by, students: participants.length, population,
    withoutRules: result.withoutRules, defaulted: nonParticipants.length, rounds, windows: result.windows,
    courses: makeCourseRows(result), capacity: result.capacity,
    projected: { students: nonParticipants.length, capacity: projection.capacity, courses: makeCourseRows(projection) },
    dataQuality: { total: input.offerings.length, ready: allAudit.confirmed.length, excluded: Math.max(0, input.offerings.length - allAudit.confirmed.length), issues: { ...issueCounts, ...(duplicateRows ? { duplicateRows } : {}) } },
    scopes, sourceFingerprint: fingerprint, stale: false,
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
