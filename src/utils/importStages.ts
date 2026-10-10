/*
 * Stations of the PDF/OCR import, derived ONLY from the phases the server really
 * streams (`event.phase`: render, orient, read, rescue, match — see
 * src/utils/documentOcr.ts and the emit in server.ts). Presentation only: the
 * percentage, the bar and the parsing live in ScheduleTransfer and are untouched.
 *
 * Phases are not strictly ordered on the wire (a `read` event is sent just before
 * `orient`), so the current station is the furthest one reached and never goes
 * back. A station passed without its phase ever arriving (the precise rescue pass
 * only runs when pages need it; a cached read skips rendering) is shown as
 * skipped instead of pretending it ran.
 */
export type ImportStageState = "done" | "current" | "pending" | "skipped";

export const IMPORT_STAGES = [
  { key: "prepare", label: "تجهيز الصفحات", phases: ["render", "orient"] },
  { key: "read", label: "قراءة الجدول", phases: ["read"] },
  { key: "rescue", label: "تدقيق الصفحات", phases: ["rescue"] },
  { key: "match", label: "مطابقة السجل", phases: ["match"] },
] as const;

const stageOf = (phase: string) => IMPORT_STAGES.findIndex((stage) => (stage.phases as readonly string[]).includes(phase));

/** Remember a phase that arrived (unknown phases are ignored; repeats are no-ops). */
export function noteImportPhase(seen: readonly string[], phase: string): string[] {
  return stageOf(phase) < 0 || seen.includes(phase) ? [...seen] : [...seen, phase];
}

export function importStageStates(seen: readonly string[]): ImportStageState[] {
  const reached = seen.reduce((max, phase) => Math.max(max, stageOf(phase)), 0);
  return IMPORT_STAGES.map((stage, i) => {
    if (i > reached) return "pending";
    if (i === reached) return "current";
    // The first station is the file preparation the request itself implies.
    return i === 0 || stage.phases.some((phase) => seen.includes(phase)) ? "done" : "skipped";
  });
}
