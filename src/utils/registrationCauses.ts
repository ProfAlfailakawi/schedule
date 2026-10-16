import { simulateRegistration, type SimInput, type SimRelax, type SimResult, type SimTicket } from "./registrationSim";

/**
 * ── لماذا لا يبلغ هذا الطالبُ 12 وحدة؟ ────────────────────────────────────────
 *
 * لا يُخمَّن سببٌ بنصٍّ؛ يُقاس بمقارنة سيناريوهات: يُرفع قيدٌ واحد عن الجميع (السعة، التعارض،
 * قيود الطالب، المسبق) ثم يُسأل: هل بلغ هذا الطالبُ 12 وحدة؟ فمن لا يصلح حالُه بأيٍّ منها
 * «غير مطروح أو غير ذلك»، ومن يصلح بقيدين فأكثر «مشترك». رفعُ القيد عن الجميع معاً
 * سيناريو لا بيانٌ سببيٌّ مطلق، وهكذا يُقال في الواجهة: «تقدير بمقارنة سيناريوهات».
 */

export type ShortfallCause = "full" | "conflict" | "constraints" | "prereq" | "shared" | "other";
export const CAUSE_ORDER: readonly ShortfallCause[] = ["full", "conflict", "constraints", "prereq", "shared", "other"];
export const CAUSE_LABEL: Record<ShortfallCause, string> = {
  full: "امتلاء الشعب", conflict: "تعارض الأوقات", constraints: "قيود الطالب", prereq: "المتطلب السابق", shared: "أكثر من سبب", other: "مقرر غير مطروح أو بيانات",
};

const RELAXATIONS: ReadonlyArray<[Exclude<ShortfallCause, "shared" | "other">, SimRelax]> = [
  ["full", { capacity: true }], ["conflict", { conflicts: true }], ["constraints", { constraints: true }], ["prereq", { prereq: true }],
];
const reaches12 = (ticket: SimTicket | undefined) => ticket?.assessment === "canReach15" || ticket?.assessment === "canReach12To14" || ticket?.assessment === "graduatingBelow12";

export interface ShortfallReport {
  baseline: SimResult;
  /** من لم يبلغ 12 (فئة «أقل من 12» المثبتة، لا «غير معلوم»). */
  short: number;
  byStudent: Map<string, ShortfallCause>;
  totals: Record<ShortfallCause, number>;
}

export const emptyCauseTotals = (): Record<ShortfallCause, number> => ({ full: 0, conflict: 0, constraints: 0, prereq: 0, shared: 0, other: 0 });

export function explainShortfalls(input: SimInput): ShortfallReport {
  const responders = input.students.filter(student => student.wishes);
  const base: SimInput = { ...input, students: responders, assessCapacity: true };
  const baseline = simulateRegistration(base);
  const shortFps = baseline.tickets.filter(ticket => ticket.assessment === "below12").map(ticket => ticket.fp);
  const fixedBy = new Map<string, ShortfallCause[]>(shortFps.map(fp => [fp, []]));
  if (shortFps.length) {
    for (const [cause, relax] of RELAXATIONS) {
      const result = simulateRegistration({ ...base, relax });
      const after = new Map(result.tickets.map(ticket => [ticket.fp, ticket] as const));
      for (const fp of shortFps) if (reaches12(after.get(fp))) fixedBy.get(fp)!.push(cause);
    }
  }
  const byStudent = new Map<string, ShortfallCause>();
  const totals = emptyCauseTotals();
  for (const [fp, causes] of fixedBy) {
    const cause: ShortfallCause = causes.length === 1 ? causes[0] : causes.length > 1 ? "shared" : "other";
    byStudent.set(fp, cause);
    totals[cause] += 1;
  }
  return { baseline, short: shortFps.length, byStudent, totals };
}

/** السببُ الأكبر لمن لم يبلغ 12: الأكثر عدداً بين الأسباب المحدّدة (يُسقَط «مشترك» و«غير ذلك» إلا إن لم يبقَ غيرُهما). */
export function dominantCause(totals: Readonly<Record<ShortfallCause, number>>): ShortfallCause | null {
  const named = CAUSE_ORDER.filter(cause => cause !== "shared" && cause !== "other");
  const best = named.reduce<ShortfallCause | null>((top, cause) => (totals[cause] > (top ? totals[top] : 0) ? cause : top), null);
  if (best) return best;
  if (totals.shared > 0) return "shared";
  return totals.other > 0 ? "other" : null;
}
