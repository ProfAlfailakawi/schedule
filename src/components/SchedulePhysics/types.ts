import type { FSchedule } from "../../types";

export type ScheduleDayKey = "fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday";
export type SchedulePhysicsQuality = "excellent" | "good" | "neutral" | "suboptimal" | "impossible" | "unknown";
export type SchedulePhysicsPhase = "idle" | "armed" | "dragging" | "settling" | "returning";

export interface SchedulePhysicsTarget {
  day: ScheduleDayKey;
  start: string;
  label: string;
  rect?: DOMRect;
}

export interface SchedulePhysicsFingerprintItem {
  label: string;
  value: string;
  tone?: "good" | "warn" | "neutral" | "info";
}

export interface SchedulePhysicsHorizon {
  tone: "good" | "guarded" | "warn" | "unknown";
  label: string;
  summary: string;
}

export interface SchedulePhysicsStress {
  level: "low" | "guarded" | "high" | "unknown";
  label: string;
  summary: string;
}

export interface SchedulePhysicsCounterfactual {
  title: string;
  bullets: string[];
}

export interface SchedulePhysicsAutopsy {
  headline: string;
  summary: string;
  bullets: string[];
  confidence: string;
}

export interface SchedulePhysicsDecision {
  key: string;
  quality: SchedulePhysicsQuality;
  title: string;
  summary: string;
  reasons: string[];
  positives: string[];
  tradeoffs: string[];
  conflicts: Array<{ type?: string; severity?: string; message?: string; detail?: string }>;
  ripple: any | null;
  why: any | null;
  whyNot: any | null;
  loading?: boolean;
  dataAvailable: boolean;
  hardBlocked?: boolean;
  fingerprint?: SchedulePhysicsFingerprintItem[];
  horizon?: SchedulePhysicsHorizon;
  stress?: SchedulePhysicsStress;
  counterfactual?: SchedulePhysicsCounterfactual;
  autopsy?: SchedulePhysicsAutopsy;
}

export interface SchedulePhysicsDragState {
  phase: SchedulePhysicsPhase;
  row: FSchedule | null;
  sourceDay: ScheduleDayKey | null;
  sourceStart: string;
  target: SchedulePhysicsTarget | null;
  decision: SchedulePhysicsDecision | null;
  pointerType: string;
  velocityX: number;
  velocityY: number;
}

export interface SchedulePhysicsDropRequest {
  row: FSchedule;
  sourceDay: ScheduleDayKey;
  target: SchedulePhysicsTarget;
  decision: SchedulePhysicsDecision | null;
}
