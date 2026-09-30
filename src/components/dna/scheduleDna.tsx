/*
 * Schedule-specific glue for the DNA kit: the approval relay drawn from a
 * status, and the deadline ring. Presentation only — both read values the
 * screens already hold.
 */
import { CalendarX, Hourglass } from "lucide-react";
import type { ScheduleApprovalStatus } from "../../types";
import { APPROVAL_STATUS_LABEL } from "../../utils/approvalWorkflow";
import { DnaRing, DnaStepper, type DnaStep, type DnaTone } from "./index";

const n = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");

/**
 * لجنة الجدول ← رئيس القسم ← التسجيل ← معتمد, from the status alone — the
 * same reading the approval bar draws, reduced to what an inbox row carries.
 */
export function approvalDnaSteps(
  status: ScheduleApprovalStatus,
  opts: { round?: number; pendingAdditions?: number } = {},
): DnaStep[] {
  const signedCommittee = status !== "drafting";
  const signedHead = status === "head" || status === "submitted" || status === "returned" || status === "accepted";
  const pending = Number(opts.pendingAdditions || 0);
  const round = Number(opts.round || 0);
  return [
    { key: "committee", label: "لجنة الجدول", state: signedCommittee ? "done" : "current" },
    {
      key: "head", label: "رئيس القسم",
      state: pending > 0 ? "current" : signedHead ? "done" : signedCommittee ? "current" : "pending",
      badge: pending > 0 ? `+${n(pending)}` : undefined,
    },
    {
      key: "registrar", label: "التسجيل",
      state: status === "accepted" ? "done" : status === "submitted" ? "current" : status === "returned" ? "returned" : "pending",
      badge: round > 1 ? `ج${n(round)}` : undefined,
    },
    { key: "accepted", label: "معتمد", state: status === "accepted" ? "done" : "pending" },
  ];
}

export function ApprovalDnaStepper({ status, round, pendingAdditions, size = "xs" }: {
  status: ScheduleApprovalStatus; round?: number; pendingAdditions?: number; size?: "xs" | "sm";
}) {
  return (
    <DnaStepper
      size={size}
      steps={approvalDnaSteps(status, { round, pendingAdditions })}
      ariaLabel={`مراحل الاعتماد — ${APPROVAL_STATUS_LABEL[status]}`}
    />
  );
}

/** Deadline ring: fill = daysLeft / 14, exactly like .apb-ring. */
export function DeadlineDnaRing({ deadline, label, size = 30 }: {
  deadline?: { daysLeft?: number; past?: boolean; tone?: string } | null;
  /** The full sentence the ring stands for (tooltip + screen readers). */
  label: string;
  size?: number;
}) {
  if (!deadline || deadline.tone === "none" || deadline.daysLeft == null && !deadline.past) return null;
  const days = Number(deadline.daysLeft ?? 0);
  const gone = Boolean(deadline.past);
  const tone: DnaTone = gone ? "danger" : deadline.tone === "near" || days <= 7 ? "warn" : "accent";
  const fill = gone ? 14 : Math.max(0.84, Math.min(14, days));
  return (
    <span className="dna-deadline" title={label}>
      <DnaRing
        value={fill}
        max={14}
        size={size}
        stroke={3}
        tone={tone}
        ariaLabel={label}
        label={gone ? <CalendarX aria-hidden="true" /> : days === 0 ? <Hourglass aria-hidden="true" /> : n(days)}
      />
    </span>
  );
}
