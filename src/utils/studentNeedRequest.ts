import type { RegistrationRun, RegistrationTicket, StudentProfile } from "../types";

/** A personal exception request is offered only after a current, non-stale
 * simulation proves that a student with at least 12 remaining units cannot
 * assemble 12 units. A graduating student whose whole remainder is below 12
 * is intentionally excluded. */
export function studentNeedsCommitteeHelp(
  profile: Pick<StudentProfile, "updatedAt" | "wishes">,
  run: Pick<RegistrationRun, "runId" | "ranAt"> | undefined,
  ticket: Pick<RegistrationTicket, "runId" | "remainingUnits" | "plans" | "unmet"> | undefined,
  termId: number,
): boolean {
  if (!run || !ticket || ticket.runId !== run.runId || profile.wishes?.termId !== termId) return false;
  const profileUpdated = Date.parse(profile.updatedAt || "");
  const simulationAt = Date.parse(run.ranAt || "");
  if (!Number.isFinite(profileUpdated) || !Number.isFinite(simulationAt) || profileUpdated > simulationAt) return false;
  if (!Number.isFinite(ticket.remainingUnits) || ticket.remainingUnits < 12 || !ticket.unmet.length) return false;
  const bestUnits = ticket.plans.reduce((best, plan) => Math.max(best, Number(plan.units) || 0), 0);
  return bestUnits < 12;
}
