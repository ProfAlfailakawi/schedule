/**
 * ── رادارُ يوم التسجيل ──────────────────────────────────────────────────────
 *
 * محرّكٌ نقيٌّ حتميّ: يأخذ ملفّاتِ الطلبة (المنجَز والرغبات) والشعبَ المطروحة
 * وقواعدَ الصحائف المعتمدة، ويبني لكل طالبٍ **ثلاثَ خططٍ افتراضية** (أ/ب/ج) على
 * **دفتر مقاعدَ افتراضي**، ويقترح لكلٍّ **نافذةَ تسجيلٍ** بحسب الحاجة.
 *
 * ما يدّعيه وما لا يدّعيه — نصُّ فلسفة المشروع: «كلُّ رقمٍ يحمل أساسَه».
 *   • هو **تقديرٌ** من بياناتٍ جمعناها، لا بياناتُ التسجيل الرسمي ولا حجزُ مقعد.
 *   • المقاعدُ فيه افتراضيةٌ: دفترٌ نبنيه نحن، تُخصَّم منه الخطةُ (أ) بترتيب النوافذ.
 *     والخطتان (ب) و(ج) احتياطٌ لا يحجز شيئاً — يُفحص أنّ مقعدهما ما زال قائماً.
 *   • الترتيب: مَن حاجتُه أشدّ يسجّل أولاً (قريبٌ من التخرّج، ثم كثرةُ الإجباري).
 *     وساعاتُ النوافذ يقرّرها صاحبُ القرار من تقريرنا؛ هنا عددُ كلّ نافذة فقط.
 *   • لا قاعاتٍ ولا مدرّسين: المحرّكُ يعرف الوقتَ والسعةَ فقط.
 *
 * لا يلمس قاعدةَ بياناتٍ ولا ساعةً ولا عشوائيةً: المدخلاتُ نفسُها تُنتج المخرجاتِ نفسَها.
 */
import { dependentsOf, prereqMet, remainingNeed } from "./curriculumRules";
import type { CurriculumCourseRule, ElectiveGroup } from "../types";

export const SIM_UNITS_MIN = 12;
export const SIM_UNITS_MAX = 18;
export const SIM_UNITS_DEFAULT = 15;
/** أقلُّ نسبةٍ من السعة يُعدّ دونها المقعدُ «حرجاً». */
export const TIGHT_RATIO = 0.1;

export interface SimSlot { day: number; start: number; end: number }

/** شعبةٌ مطروحة: مقررٌ + رمزُ شعبة، وله مواعيدُه وسعتُه. */
export interface SimOffering {
  id: string;
  courseId: number;
  code: string;
  /** القسمُ صاحبُ الجدول: به تُعرف حالةُ التوقيع. */
  collegeId: number;
  sectionId: number;
  capacity: number;
  slots: SimSlot[];
}

export interface SimPlanRules { planId: string; courseIds: number[]; rules: CurriculumCourseRule[]; groups: ElectiveGroup[]; hasApprovedRules: boolean }

export interface SimStudent {
  fp: string;
  planId: string;
  /** المقرراتُ المنجَزة. */
  passed: number[];
  wishes?: { targetUnits: number; courseIds: number[]; constraints: { noMorning?: boolean; noAfternoon?: boolean; freeDay?: boolean } };
}

export interface SimInput {
  students: SimStudent[];
  offerings: SimOffering[];
  plans: SimPlanRules[];
  credit: ReadonlyMap<number, number>;
  /** عددُ جولات التسجيل (النوافذ). */
  rounds: number;
}

export type SimUnmetReason = "not-offered" | "conflict" | "full" | "prereq" | "units";

export interface SimItem { courseId: number; offeringId: string; tight: boolean }
export interface SimTicketPlan { label: "A" | "B" | "C"; items: SimItem[]; units: number }
export interface SimTicket {
  fp: string;
  planId: string;
  window: number;
  remainingUnits: number;
  /** لم يُدخل رغباتٍ: خُطّته مبنيةٌ على الافتراض (١٥ وحدة، بلا قيود). */
  defaulted: boolean;
  plans: SimTicketPlan[];
  unmet: Array<{ courseId: number; reason: SimUnmetReason }>;
}

export interface SimCourseDemand { courseId: number; wanted: number; seated: number; unmet: Record<SimUnmetReason, number> }
export interface SimSeat { offeringId: string; courseId: number; capacity: number; taken: number }
export interface SimResult {
  tickets: SimTicket[];
  seats: SimSeat[];
  demand: SimCourseDemand[];
  windows: number[];
  students: number;
  withoutRules: number;
  defaulted: number;
}

const hash = (text: string): number => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const NOON = 12 * 60;

export function parseClock(value: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? "").trim());
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(minutes) && Number(m[1]) < 24 && Number(m[2]) < 60 ? minutes : null;
}

export function slotsConflict(a: readonly SimSlot[], b: readonly SimSlot[]): boolean {
  return a.some(x => b.some(y => x.day === y.day && x.start < y.end && y.start < x.end));
}

const clampUnits = (n: number) => Math.min(SIM_UNITS_MAX, Math.max(SIM_UNITS_MIN, Math.round(n) || SIM_UNITS_DEFAULT));

interface Ledger { capacity: Map<string, number>; taken: Map<string, number> }
const free = (ledger: Ledger, id: string) => (ledger.capacity.get(id) || 0) - (ledger.taken.get(id) || 0);
const isTight = (ledger: Ledger, id: string) => free(ledger, id) <= Math.ceil((ledger.capacity.get(id) || 0) * TIGHT_RATIO);

/** مجموعةُ مواعيد خطةٍ جارية: تُفحص بها المنافسةُ على الوقت. */
interface Pick { courseId: number; offeringId: string }

export function simulateRegistration(input: SimInput): SimResult {
  const planOf = new Map(input.plans.map(plan => [plan.planId, plan] as const));
  const byCourse = new Map<number, SimOffering[]>();
  const offeringOf = new Map<string, SimOffering>();
  for (const offering of input.offerings) {
    offeringOf.set(offering.id, offering);
    byCourse.set(offering.courseId, [...(byCourse.get(offering.courseId) || []), offering]);
  }
  for (const list of byCourse.values()) list.sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }) || a.id.localeCompare(b.id));
  const ledger: Ledger = { capacity: new Map(input.offerings.map(o => [o.id, Math.max(0, o.capacity)])), taken: new Map() };
  const credit = (id: number) => input.credit.get(id) || 0;

  /* ── حاجةُ كلّ طالب ── */
  interface Prepared {
    student: SimStudent; passed: Set<number>; passedUnits: number; plan: SimPlanRules | undefined;
    need: ReturnType<typeof remainingNeed>; target: number; defaulted: boolean; score: number;
    candidates: Array<{ courseId: number; priority: number; required: boolean }>; unmet: Map<number, SimUnmetReason>;
    /** مقرناتُ مقررٍ لم تُنجَز بعد: تُسجَّل معه أو لا يُسجَّل. */
    coreqNeed: (courseId: number) => number[];
    prereqOk: (courseId: number) => boolean;
  }
  const prepared: Prepared[] = input.students.map(student => {
    const plan = planOf.get(student.planId);
    const passed = new Set(student.passed);
    const passedUnits = student.passed.reduce((sum, id) => sum + credit(id), 0);
    const courseIds = plan?.courseIds || [];
    const set = plan?.hasApprovedRules ? { rules: plan.rules, groups: plan.groups } : { rules: [] as CurriculumCourseRule[], groups: [] as ElectiveGroup[] };
    const need = remainingNeed(courseIds, set, passed, input.credit);
    const wished = new Set(student.wishes?.courseIds || []);
    const rules = plan?.hasApprovedRules ? plan.rules : [];
    const unmet = new Map<number, SimUnmetReason>();
    const candidates: Prepared["candidates"] = [];
    const rule = (id: number) => rules.find(r => r.courseId === id);
    const prereqOk = (courseId: number) => prereqMet(rule(courseId)?.prereq, passed, passedUnits);
    const coreqNeed = (courseId: number) => (rule(courseId)?.coreq || []).filter(id => !passed.has(id));
    /** يُرجع هل قُبل مرشّحاً (ليُحسب في حدّ المجموعة الاختيارية). */
    const consider = (courseId: number, required: boolean): boolean => {
      const r = rule(courseId);
      if (!prereqOk(courseId)) { unmet.set(courseId, "prereq"); return false; }
      if (!byCourse.has(courseId)) { unmet.set(courseId, "not-offered"); return false; }
      const unlocks = dependentsOf(rules, courseId).length;
      const priority = (required ? 1000 : 400) - (r?.level || 6) * 20 + unlocks * 8 + (wished.has(courseId) ? 150 : 0);
      candidates.push({ courseId, priority, required });
      return true;
    };
    need.compulsoryRemaining.forEach(id => consider(id, true));
    for (const group of need.groups) {
      if (group.done) continue;
      /* ما يلزم من المجموعة: ما رغب فيه أولاً، ثم الأقلُّ تعدّداً في الشعب لا الأعسر. */
      const pool = group.candidateIds.filter(id => !passed.has(id));
      const ranked = [...pool].sort((a, b) => (wished.has(b) ? 1 : 0) - (wished.has(a) ? 1 : 0) || (byCourse.get(b)?.length || 0) - (byCourse.get(a)?.length || 0) || a - b);
      /* حتى يتحقّق الحدّان معاً: عددُ المقررات والوحدات (مقرراتٌ من ثلاث وحداتٍ وحدُّ ست وحداتٍ: اثنان لا واحد). */
      let taken = 0, units = 0;
      for (const id of ranked) {
        if (taken > 0 && taken >= group.needCourses && units >= group.needUnits) break;
        if (consider(id, true)) { taken += 1; units += credit(id); }
      }
    }
    /* رغبةٌ خارج المطلوب (اختياريٌّ حرّ ضمن صحيفته) تدخل بأولويةٍ أدنى. */
    for (const id of wished) {
      if (passed.has(id) || candidates.some(c => c.courseId === id) || !courseIds.includes(id)) continue;
      consider(id, false);
    }
    candidates.sort((a, b) => b.priority - a.priority || a.courseId - b.courseId);
    const defaulted = !student.wishes;
    const target = Math.min(clampUnits(student.wishes?.targetUnits ?? SIM_UNITS_DEFAULT), Math.max(SIM_UNITS_MIN, need.remainingUnits));
    /* حاجتُه: من أوشك على التخرّج أولاً، ثم من عليه إجباريٌّ أكثر. */
    const graduating = need.remainingUnits > 0 && need.remainingUnits <= 36 ? 2000 - need.remainingUnits : 0;
    return { student, passed, passedUnits, plan, need, target, defaulted, score: graduating + need.compulsoryUnits, candidates, unmet, coreqNeed, prereqOk };
  });

  /* ── النوافذ: الأشدّ حاجةً أولاً، ثم تقسيمٌ متساوٍ على الجولات ── */
  const order = [...prepared].sort((a, b) => b.score - a.score || hash(a.student.fp) - hash(b.student.fp) || a.student.fp.localeCompare(b.student.fp));
  const rounds = Math.max(1, Math.floor(input.rounds) || 1);
  const windowOf = new Map<string, number>();
  order.forEach((entry, index) => windowOf.set(entry.student.fp, Math.min(rounds, Math.floor((index * rounds) / Math.max(1, order.length)) + 1)));

  const fits = (picks: readonly Pick[], offering: SimOffering) =>
    !picks.some(p => slotsConflict(offeringOf.get(p.offeringId)!.slots, offering.slots));
  const allowedByConstraints = (offering: SimOffering, c: NonNullable<SimStudent["wishes"]>["constraints"] | undefined) => {
    if (!c) return true;
    if (c.noMorning && offering.slots.some(s => s.start < NOON)) return false;
    if (c.noAfternoon && offering.slots.some(s => s.end > NOON)) return false;
    return true;
  };
  /** أفضلُ شعبةٍ لمقررٍ بين ما بقي: تتّسع، ولا تتعارض، وتتفق وقيودَه؛ والأقلُّ ازدحاماً أولاً، وتجمعُ الأيامَ. */
  const bestOffering = (courseId: number, picks: readonly Pick[], constraints: NonNullable<SimStudent["wishes"]>["constraints"] | undefined, avoid: ReadonlySet<string>, mode: "strict" | "relaxed") => {
    const days = new Set(picks.flatMap(p => offeringOf.get(p.offeringId)!.slots.map(s => s.day)));
    let best: { offering: SimOffering; score: number } | null = null;
    /* «امتلأت» لا تُقال ما دامت شعبةٌ فيها مقعدٌ لم يمنعها إلا الوقتُ أو القيد: ذاك تعارضٌ لا نقصُ مقاعد. */
    let anyFull = false, anyOpen = false;
    for (const offering of byCourse.get(courseId) || []) {
      if (free(ledger, offering.id) <= 0) { anyFull = true; continue; }
      anyOpen = true;
      if (!fits(picks, offering)) continue;
      if (mode === "strict" && !allowedByConstraints(offering, constraints)) continue;
      const cap = ledger.capacity.get(offering.id) || 1;
      let score = (free(ledger, offering.id) / cap) * 10;
      if (constraints?.freeDay) score += offering.slots.filter(s => days.has(s.day)).length * 3 - offering.slots.filter(s => !days.has(s.day)).length;
      if (avoid.has(offering.id)) score -= 100;
      if (!best || score > best.score || (score === best.score && offering.id < best.offering.id)) best = { offering, score };
    }
    const reason: SimUnmetReason = anyOpen ? "conflict" : anyFull ? "full" : "not-offered";
    return best ? { offering: best.offering } : { reason };
  };
  /**
   * يضع مقرراً مع مقرناتِه معاً: كلُّها أو لا شيء. المقرنُ الذي لا يُطرح أو يتعارض أو
   * ينقصه مسبقٌ يُسقط المقرّرَ كلَّه، فلا تذكرةَ بمقررٍ بلا مقرنه.
   */
  const place = (entry: Prepared, courseId: number, picks: readonly Pick[], constraints: NonNullable<SimStudent["wishes"]>["constraints"] | undefined, avoid: ReadonlySet<string>, mode: "strict" | "relaxed"): { add: Pick[] } | { reason: SimUnmetReason } => {
    const bundle = [courseId, ...entry.coreqNeed(courseId).filter(id => id !== courseId && !picks.some(p => p.courseId === id))];
    const add: Pick[] = [];
    for (const id of bundle) {
      if (id !== courseId && !entry.prereqOk(id)) return { reason: "prereq" };
      const found = bestOffering(id, [...picks, ...add], constraints, avoid, mode);
      if (!("offering" in found)) return { reason: id === courseId ? found.reason : (found.reason === "not-offered" ? "not-offered" : "conflict") };
      add.push({ courseId: id, offeringId: found.offering.id });
    }
    return { add };
  };

  const demand = new Map<number, SimCourseDemand>();
  const row = (courseId: number): SimCourseDemand => {
    let r = demand.get(courseId);
    if (!r) { r = { courseId, wanted: 0, seated: 0, unmet: { "not-offered": 0, conflict: 0, full: 0, prereq: 0, units: 0 } }; demand.set(courseId, r); }
    return r;
  };

  const tickets = new Map<string, SimTicket>();
  const planA = new Map<string, Pick[]>();

  /* ── الخطة (أ): تُخصم من الدفتر بترتيب النوافذ ── */
  for (const entry of order) {
    const { student, target, candidates } = entry;
    const picks: Pick[] = [];
    let units = 0;
    const unmet = [...entry.unmet].map(([courseId, reason]) => ({ courseId, reason }));
    for (const [courseId, reason] of entry.unmet) { row(courseId).wanted += 1; row(courseId).unmet[reason] += 1; }
    for (const c of candidates) {
      if (picks.some(p => p.courseId === c.courseId)) continue; // دخل مقرناً لمقررٍ سبقه
      const r = row(c.courseId);
      r.wanted += 1;
      const bundleUnits = credit(c.courseId) + entry.coreqNeed(c.courseId).filter(id => !picks.some(p => p.courseId === id)).reduce((sum, id) => sum + credit(id), 0);
      if (units + bundleUnits > target && picks.length) { r.unmet.units += 1; unmet.push({ courseId: c.courseId, reason: "units" }); continue; }
      const placed = place(entry, c.courseId, picks, student.wishes?.constraints, new Set(), "strict");
      if ("add" in placed) {
        for (const pick of placed.add) {
          ledger.taken.set(pick.offeringId, (ledger.taken.get(pick.offeringId) || 0) + 1);
          picks.push(pick); units += credit(pick.courseId);
          row(pick.courseId).seated += 1;
          if (pick.courseId !== c.courseId) row(pick.courseId).wanted += 1;
        }
      } else { r.unmet[placed.reason] += 1; unmet.push({ courseId: c.courseId, reason: placed.reason }); }
    }
    planA.set(student.fp, picks);
    tickets.set(student.fp, {
      fp: student.fp, planId: student.planId, window: windowOf.get(student.fp) || 1, remainingUnits: entry.need.remainingUnits, defaulted: entry.defaulted,
      plans: [{ label: "A", items: picks.map(p => ({ courseId: p.courseId, offeringId: p.offeringId, tight: isTight(ledger, p.offeringId) })), units }], unmet,
    });
  }

  /* ── (ب) و(ج): احتياطٌ على الدفتر النهائي، لا يحجز مقعداً ── */
  const backup = (entry: Prepared, label: "B" | "C"): SimTicketPlan => {
    const a = planA.get(entry.student.fp) || [];
    const avoid = new Set(a.map(p => p.offeringId));
    const picks: Pick[] = [];
    let units = 0;
    const cap = label === "B" ? entry.target : SIM_UNITS_MIN;
    const list = label === "B" ? entry.candidates : entry.candidates.filter(c => c.required);
    for (const c of list) {
      if (picks.some(p => p.courseId === c.courseId)) continue;
      const bundleUnits = credit(c.courseId) + entry.coreqNeed(c.courseId).filter(id => !picks.some(p => p.courseId === id)).reduce((sum, id) => sum + credit(id), 0);
      if (units + bundleUnits > cap && picks.length) continue;
      /* (ب): شعباً مختلفة عن (أ) كلما أمكن — إن امتلأت (أ) فهذه بديلُها. (ج): أيُّ شعبةٍ، بلا قيودٍ. */
      const placed = place(entry, c.courseId, picks, label === "B" ? entry.student.wishes?.constraints : undefined, label === "B" ? avoid : new Set(), label === "B" ? "strict" : "relaxed");
      if ("add" in placed) for (const pick of placed.add) { picks.push(pick); units += credit(pick.courseId); }
    }
    return { label, items: picks.map(p => ({ courseId: p.courseId, offeringId: p.offeringId, tight: isTight(ledger, p.offeringId) })), units };
  };
  for (const entry of order) {
    const ticket = tickets.get(entry.student.fp)!;
    ticket.plans.push(backup(entry, "B"), backup(entry, "C"));
  }

  const seats: SimSeat[] = input.offerings.map(o => ({ offeringId: o.id, courseId: o.courseId, capacity: Math.max(0, o.capacity), taken: ledger.taken.get(o.id) || 0 }));
  const windows = Array.from({ length: rounds }, () => 0);
  for (const ticket of tickets.values()) windows[ticket.window - 1] += 1;
  return {
    tickets: order.map(entry => tickets.get(entry.student.fp)!),
    seats, demand: [...demand.values()].sort((a, b) => a.courseId - b.courseId), windows,
    students: input.students.length,
    withoutRules: prepared.filter(p => !p.plan?.hasApprovedRules).length,
    defaulted: prepared.filter(p => p.defaulted).length,
  };
}
