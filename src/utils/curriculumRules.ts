import type { CourseKind, CoursePrereq, CurriculumCourseRule, ElectiveGroup } from "../types";
import { AR, countOf } from "./arabicCount";

/**
 * ── قواعدُ الصحيفة: القاعدةُ في موضعٍ واحد ──────────────────────────────────
 *
 * مراجعةُ الصحيفة (الواجهة) والخادمُ ومحرّكُ المحاكاة وبابُ الطالب كلُّها تسأل
 * الأسئلةَ نفسَها: هل المقرر متاحٌ لهذا الطالب؟ وكم بقي من صحيفته؟ وهل في القواعد
 * دورةٌ تجعل مقرراً لا يُؤخذ أبداً؟ فتُجاب هنا وحدها.
 *
 * ثلاثةُ أنواعٍ من الشروط، كما تُكتب في الصحائف:
 *   · «مسبقُه كذا»            → `prereq.all`
 *   · «يجتاز كذا أو كذا»      → `prereq.anyOf` (مجموعاتٌ، يكفي واحدٌ من كلٍّ منها)
 *   · «يجتاز كذا وحدة»        → `prereq.minUnits`
 * وما يُسجَّل معه: `coreq`. والاختياري: مجموعةٌ بحدٍّ أدنى للمواد **وللوحدات معاً**.
 */

/** Levels follow the institutional 100–400 convention. Older 1–4 values are
 * normalized when read so stored plans remain compatible. */
export const CURRICULUM_LEVELS = [100, 200, 300, 400] as const;
export const MAX_LEVEL = 400;
export const MAX_UNITS_RULE = 200;
/** Older curricula sometimes stored the ordinal 1–4 instead of 100–400. */
export function normalizeLevel(value: unknown): number | undefined {
  const entered = Math.round(Number(value));
  const level = entered >= 1 && entered <= 4 ? entered * 100 : entered;
  return CURRICULUM_LEVELS.includes(level as typeof CURRICULUM_LEVELS[number]) ? level : undefined;
}
/** The final three digits in the institutional course code encode its 100-level band. */
export function courseLevelFromCode(value: unknown): number | undefined {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 3) return undefined;
  const number = Number(digits.slice(-3));
  const level = Math.floor(number / 100) * 100;
  return CURRICULUM_LEVELS.includes(level as typeof CURRICULUM_LEVELS[number]) ? level : undefined;
}
export const KINDS: readonly CourseKind[] = ["compulsory", "college", "university", "elective"];
export const KIND_LABEL: Record<CourseKind, string> = {
  compulsory: "إجباري", college: "متطلب كلية", university: "متطلب جامعة", elective: "اختياري",
};

const toId = (value: unknown): number => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
};
const uniqueIds = (list: unknown, exclude = 0): number[] =>
  [...new Set((Array.isArray(list) ? list : []).map(toId).filter(id => id > 0 && id !== exclude))];

/** قاعدةُ مقررٍ منظَّفة، أو null إن لم يُسمَّ المقرر. لا تُرمى استثناءات: الواجهةُ تُرسل ما تُرسل. */
export function normalizeRule(raw: any): CurriculumCourseRule | null {
  const courseId = toId(raw?.courseId);
  if (!courseId) return null;
  const rule: CurriculumCourseRule = { courseId };
  const level = normalizeLevel(raw?.level);
  if (level) rule.level = level;
  if (KINDS.includes(raw?.kind)) rule.kind = raw.kind;

  const all = uniqueIds(raw?.prereq?.all, courseId);
  const anyOf: number[][] = [];
  for (const group of Array.isArray(raw?.prereq?.anyOf) ? raw.prereq.anyOf : []) {
    const cleaned = uniqueIds(group, courseId);
    if (cleaned.length === 1) { if (!all.includes(cleaned[0])) all.push(cleaned[0]); }
    else if (cleaned.length > 1 && !anyOf.some(existing => existing.length === cleaned.length && existing.every(id => cleaned.includes(id)))) anyOf.push(cleaned);
  }
  const minUnits = Math.round(Number(raw?.prereq?.minUnits));
  const prereq: CoursePrereq = { all: all.sort((a, b) => a - b), anyOf };
  if (Number.isFinite(minUnits) && minUnits >= 1 && minUnits <= MAX_UNITS_RULE) prereq.minUnits = minUnits;
  if (prereq.all.length || prereq.anyOf.length || prereq.minUnits) rule.prereq = prereq;

  const coreq = uniqueIds(raw?.coreq, courseId);
  if (coreq.length) rule.coreq = coreq;
  const groupId = String(raw?.groupId ?? "").trim().slice(0, 40);
  if (groupId) rule.groupId = groupId;
  return rule;
}

export function normalizeGroup(raw: any): ElectiveGroup | null {
  const id = String(raw?.id ?? "").trim().slice(0, 40);
  if (!id) return null;
  const minCourses = Math.max(0, Math.min(20, Math.round(Number(raw?.minCourses)) || 0));
  const minUnits = Math.max(0, Math.min(60, Math.round(Number(raw?.minUnits)) || 0));
  return {
    id, name: String(raw?.name ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 60) || "مجموعة اختيارية",
    minCourses, minUnits, courseIds: uniqueIds(raw?.courseIds).sort((a, b) => a - b),
  };
}

/** «واحدةٌ» لكل مقرر: آخرُ ما كُتب له يحلّ محلّ ما قبله. */
export function normalizeRules(raw: unknown): CurriculumCourseRule[] {
  const byCourse = new Map<number, CurriculumCourseRule>();
  for (const item of Array.isArray(raw) ? raw : []) {
    const rule = normalizeRule(item);
    if (rule) byCourse.set(rule.courseId, rule);
  }
  return [...byCourse.values()].sort((a, b) => a.courseId - b.courseId);
}

export function normalizeGroups(raw: unknown): ElectiveGroup[] {
  const byId = new Map<string, ElectiveGroup>();
  for (const item of Array.isArray(raw) ? raw : []) {
    const group = normalizeGroup(item);
    if (group) byId.set(group.id, group);
  }
  return [...byId.values()];
}

/**
 * انتماءُ المقرر إلى مجموعته يُقرأ من المجموعة نفسها — مصدرٌ واحد. فيُشتقّ
 * `rule.groupId` منها، ولا يختلف اثنان على أيِّ مجموعةٍ يتبع المقرر.
 */
export function withDerivedGroups(rules: readonly CurriculumCourseRule[], groups: readonly ElectiveGroup[]): CurriculumCourseRule[] {
  const groupOf = new Map<number, string>();
  for (const group of groups) for (const id of group.courseIds) if (!groupOf.has(id)) groupOf.set(id, group.id);
  const out = new Map<number, CurriculumCourseRule>();
  for (const rule of rules) {
    const { groupId: _dropped, ...rest } = rule;
    out.set(rule.courseId, rest);
  }
  for (const [courseId, groupId] of groupOf) out.set(courseId, { ...(out.get(courseId) || { courseId }), groupId });
  return [...out.values()].sort((a, b) => a.courseId - b.courseId);
}

/* ───────────────────────── الفحص ───────────────────────── */

export interface RuleIssue {
  /** block يمنع الاعتماد؛ warn يُقال ولا يمنع. */
  severity: "block" | "warn";
  code: string;
  text: string;
  courseId?: number;
  groupId?: string;
}

export interface CheckContext {
  /** مقرراتُ الصحيفة. */
  planCourseIds: readonly number[];
  /** كلُّ المقررات المعروفة في النظام (مسبقٌ قد يكون من قسمٍ آخر). */
  knownCourseIds: ReadonlySet<number>;
  credit: ReadonlyMap<number, number>;
  name: (id: number) => string;
}

const prereqIds = (prereq?: CoursePrereq): number[] => (prereq ? [...prereq.all, ...prereq.anyOf.flat()] : []);

/** دورةٌ في المتطلبات تجعل مقرراً لا يُؤخذ أبداً. ترجع أولَ دورةٍ تجدها (أرقامٌ بالترتيب) أو null. */
export function findPrereqCycle(rules: readonly CurriculumCourseRule[]): number[] | null {
  const graph = new Map<number, number[]>();
  for (const rule of rules) graph.set(rule.courseId, [...new Set(prereqIds(rule.prereq))]);
  const state = new Map<number, 0 | 1 | 2>();
  const stack: number[] = [];
  const visit = (id: number): number[] | null => {
    state.set(id, 1); stack.push(id);
    for (const next of graph.get(id) || []) {
      if (state.get(next) === 1) return [...stack.slice(stack.indexOf(next)), next];
      if (!state.get(next)) { const found = visit(next); if (found) return found; }
    }
    stack.pop(); state.set(id, 2);
    return null;
  };
  for (const id of [...graph.keys()].sort((a, b) => a - b)) {
    if (!state.get(id)) { const found = visit(id); if (found) return found; }
  }
  return null;
}

export function checkRuleSet(set: { rules: readonly CurriculumCourseRule[]; groups: readonly ElectiveGroup[] }, ctx: CheckContext): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const plan = new Set(ctx.planCourseIds);
  const levelOf = new Map(set.rules.map(rule => [rule.courseId, rule.level] as const));
  const add = (issue: RuleIssue) => issues.push(issue);

  for (const rule of set.rules) {
    const label = ctx.name(rule.courseId);
    if (!plan.has(rule.courseId)) { add({ severity: "block", code: "not-in-plan", courseId: rule.courseId, text: `«${label}» ليس في هذه الصحيفة.` }); continue; }
    for (const id of [...prereqIds(rule.prereq), ...(rule.coreq || [])]) {
      if (!ctx.knownCourseIds.has(id)) add({ severity: "block", code: "unknown-ref", courseId: rule.courseId, text: `«${label}» يشير إلى مقررٍ غير معروف (${id}).` });
      else if (!plan.has(id)) add({ severity: "warn", code: "ref-outside-plan", courseId: rule.courseId, text: `«${label}»: «${ctx.name(id)}» ليس في هذه الصحيفة.` });
    }
    if (rule.prereq && rule.level) {
      const later = [...rule.prereq.all.filter(id => (levelOf.get(id) || 0) >= rule.level!), ...rule.prereq.anyOf.filter(group => group.every(id => (levelOf.get(id) || 0) >= rule.level!)).flat()];
      if (later.length) add({ severity: "warn", code: "prereq-level", courseId: rule.courseId, text: `«${label}» (المستوى ${rule.level}): مسبقُه «${ctx.name(later[0])}» ليس في مستوىً أسبق.` });
    }
    if (rule.kind === "elective" && !rule.groupId) add({ severity: "warn", code: "elective-no-group", courseId: rule.courseId, text: `«${label}» اختياري بلا مجموعة — لا يُحتسب في الخريج.` });
  }

  const cycle = findPrereqCycle(set.rules);
  if (cycle) add({ severity: "block", code: "cycle", courseId: cycle[0], text: `دورةٌ في المتطلبات: ${cycle.map(ctx.name).join(" ← ")} — لا يُؤخذ أيٌّ منها أبداً.` });

  const seen = new Map<number, string>();
  for (const group of set.groups) {
    const members = group.courseIds;
    for (const id of members) {
      if (!plan.has(id)) add({ severity: "warn", code: "group-outside-plan", groupId: group.id, courseId: id, text: `«${group.name}»: «${ctx.name(id)}» ليس في الصحيفة.` });
      if (seen.has(id) && seen.get(id) !== group.id) add({ severity: "block", code: "two-groups", groupId: group.id, courseId: id, text: `«${ctx.name(id)}» في مجموعتين اختياريتين.` });
      seen.set(id, group.id);
    }
    if (!members.length) add({ severity: "warn", code: "group-empty", groupId: group.id, text: `«${group.name}» بلا مقررات.` });
    if (group.minCourses > members.length) add({ severity: "block", code: "group-min-courses", groupId: group.id, text: `«${group.name}»: المطلوب ${countOf(group.minCourses, AR.course)} والمتاح ${countOf(members.length, AR.course)}.` });
    const sum = members.reduce((total, id) => total + (ctx.credit.get(id) || 0), 0);
    if (group.minUnits > sum) add({ severity: "block", code: "group-min-units", groupId: group.id, text: `«${group.name}»: المطلوب ${countOf(group.minUnits, AR.unit)} والمتاح ${countOf(sum, AR.unit)}.` });
    if (group.minCourses === 0 && group.minUnits === 0 && members.length) add({ severity: "warn", code: "group-no-minimum", groupId: group.id, text: `«${group.name}» بلا حدٍّ أدنى.` });
  }
  return issues;
}

/* ───────────────────────── الأسئلة التي يسألها المحرّك ───────────────────────── */

export function prereqMet(prereq: CoursePrereq | undefined, passed: ReadonlySet<number>, passedUnits: number): boolean {
  if (!prereq) return true;
  if (prereq.all.some(id => !passed.has(id))) return false;
  if (prereq.anyOf.some(group => !group.some(id => passed.has(id)))) return false;
  if (prereq.minUnits && passedUnits < prereq.minUnits) return false;
  return true;
}

export interface UnmetPrereq { all: number[]; anyOf: number[][]; unitsShort: number }

/** ما الذي ينقص طالباً لم يستوفِ المسبق: لكل مجموعةٍ لم يُجتَز منها شيءٌ تُذكر كاملة. */
export function unmetPrereq(prereq: CoursePrereq | undefined, passed: ReadonlySet<number>, passedUnits: number): UnmetPrereq {
  if (!prereq) return { all: [], anyOf: [], unitsShort: 0 };
  return {
    all: prereq.all.filter(id => !passed.has(id)),
    anyOf: prereq.anyOf.filter(group => !group.some(id => passed.has(id))),
    unitsShort: prereq.minUnits ? Math.max(0, prereq.minUnits - passedUnits) : 0,
  };
}

/** المقرنُ يُسجَّل معه: يكفي اجتيازُه قبلُ أو تسجيلُه في الفصل نفسه. */
export function coreqMet(coreq: readonly number[] | undefined, passed: ReadonlySet<number>, registering: ReadonlySet<number>): boolean {
  return !coreq || coreq.every(id => passed.has(id) || registering.has(id));
}

export interface GroupProgress {
  group: ElectiveGroup;
  passedCourses: number;
  passedUnits: number;
  needCourses: number;
  needUnits: number;
  done: boolean;
  /** ما يستطيع أخذه منها: لم يُجتَز بعد. */
  candidateIds: number[];
}

export function groupProgress(group: ElectiveGroup, passed: ReadonlySet<number>, credit: ReadonlyMap<number, number>): GroupProgress {
  const done = group.courseIds.filter(id => passed.has(id));
  const passedUnits = done.reduce((sum, id) => sum + (credit.get(id) || 0), 0);
  const needCourses = Math.max(0, group.minCourses - done.length);
  const needUnits = Math.max(0, group.minUnits - passedUnits);
  return {
    group, passedCourses: done.length, passedUnits, needCourses, needUnits,
    done: needCourses === 0 && needUnits === 0, candidateIds: group.courseIds.filter(id => !passed.has(id)),
  };
}

export interface PlanNeed {
  /** إجباريٌّ لم يُجتَز. */
  compulsoryRemaining: number[];
  compulsoryUnits: number;
  groups: GroupProgress[];
  /** وحداتٌ تقديرية: الإجباري كلُّه + ما تحتاجه كل مجموعةٍ لتكتمل. */
  remainingUnits: number;
  /** وحداتُ الصحيفة المطلوبة كلُّها (للنسبة). */
  requiredUnits: number;
}

/**
 * كم بقي من الصحيفة. **الاختياريُّ يُحسب بمجموعته** لا بمقرراته كلها: من ينجز
 * «٢ من ٥» لا يبقى عليه الثلاثةُ الباقية. فلا يُبالَغ في المتبقّي ولا يتأخّر
 * التخرّجُ المقدَّر بلا سبب.
 */
export function remainingNeed(
  planCourseIds: readonly number[],
  set: { rules: readonly CurriculumCourseRule[]; groups: readonly ElectiveGroup[] },
  passed: ReadonlySet<number>,
  credit: ReadonlyMap<number, number>,
): PlanNeed {
  const plan = [...new Set(planCourseIds)];
  const inGroup = new Set(set.groups.flatMap(group => group.courseIds));
  const electiveLoose = new Set(set.rules.filter(rule => rule.kind === "elective" && !inGroup.has(rule.courseId)).map(rule => rule.courseId));
  const compulsory = plan.filter(id => !inGroup.has(id) && !electiveLoose.has(id));
  const compulsoryRemaining = compulsory.filter(id => !passed.has(id));
  const compulsoryUnits = compulsoryRemaining.reduce((sum, id) => sum + (credit.get(id) || 0), 0);
  const groups = set.groups.map(group => groupProgress({ ...group, courseIds: group.courseIds.filter(id => plan.includes(id)) }, passed, credit));
  const typical = (progress: GroupProgress) => {
    const credits = progress.candidateIds.map(id => credit.get(id) || 0).filter(c => c > 0);
    return credits.length ? credits.reduce((a, b) => a + b, 0) / credits.length : 3;
  };
  const groupUnits = groups.reduce((sum, progress) => sum + Math.max(progress.needUnits, progress.needCourses * typical(progress)), 0);
  const requiredUnits = compulsory.reduce((sum, id) => sum + (credit.get(id) || 0), 0)
    + set.groups.reduce((sum, group) => sum + Math.max(group.minUnits, group.minCourses * 3), 0);
  return { compulsoryRemaining, compulsoryUnits, groups, remainingUnits: Math.round(compulsoryUnits + groupUnits), requiredUnits };
}

/** ما يتوقّف على هذا المقرر: كلُّ مقررٍ يذكره مسبقاً. */
export function dependentsOf(rules: readonly CurriculumCourseRule[], courseId: number): number[] {
  return rules.filter(rule => prereqIds(rule.prereq).includes(courseId)).map(rule => rule.courseId);
}

/** المسبقُ مكتوباً بالعربية، لبطاقةٍ أو رسالة. */
export function describePrereq(prereq: CoursePrereq | undefined, name: (id: number) => string): string {
  if (!prereq) return "";
  const parts: string[] = [];
  if (prereq.all.length) parts.push(prereq.all.map(name).join(" + "));
  for (const group of prereq.anyOf) parts.push(`(${group.map(name).join(" أو ")})`);
  if (prereq.minUnits) parts.push(countOf(prereq.minUnits, AR.unit));
  return parts.join(" + ");
}

/** المستوياتُ من القواعد: خريطةٌ مستوى ← مقررات، ومقرراتٌ بلا مستوى تُجمع تحت 0. */
export function byLevel(planCourseIds: readonly number[], rules: readonly CurriculumCourseRule[], codeById?: ReadonlyMap<number, string>): Map<number, number[]> {
  const levelOf = new Map(rules.map(rule => [rule.courseId, normalizeLevel(rule.level) || 0] as const));
  const out = new Map<number, number[]>();
  for (const id of planCourseIds) {
    // The institutional course code is the canonical level signal. A saved
    // rule is only a fallback for legacy course codes that carry no 100-band.
    const level = (codeById ? courseLevelFromCode(codeById.get(id)) : undefined) || levelOf.get(id) || 0;
    out.set(level, [...(out.get(level) || []), id]);
  }
  const code = (id: number) => String(codeById?.get(id) ?? "");
  return new Map([...out]
    .map(([level, ids]) => [level, [...ids].sort((a, b) => code(a).localeCompare(code(b), "en", { numeric: true }) || a - b)] as const)
    .sort((a, b) => (a[0] === 0 ? Number.MAX_SAFE_INTEGER : a[0]) - (b[0] === 0 ? Number.MAX_SAFE_INTEGER : b[0])));
}
