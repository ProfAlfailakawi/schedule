import type { CurriculumCourseRule, ElectiveGroup } from "../types";
import { courseLevelFromCode, groupProgress, normalizeLevel, unmetPrereq } from "./curriculumRules";
import { AR, countOf } from "./arabicCount";

/**
 * ── مقترحُ الطالب: «سجّل هذه هذا الفصل لأنها تفتح لك كذا» ─────────────────────────
 *
 * من صحيفته وقواعدِها (المسبقات والمستويات والمجموعات الاختيارية) وما يُطرح فعلاً هذا الفصل:
 *   1. ما يستطيع تسجيله الآن = مسبقُه مجتاز، ومطروحٌ بشعبةٍ واحدةٍ على الأقل.
 *   2. أيّها أولى؟ ما يفتح له أكثر (مقرراتٌ إجبارية تتوقف عليه، وطولُ السلسلة بعده)، ثم المستوى الأدنى.
 *   3. يُملأ هدفُ وحداته (رغبتُه، وإلا ١٥)، ثم يُحاكى ما بعده فصلاً فصلاً ليُقال «تتخرّج بعد نحو كذا».
 * خالصةٌ بلا قاعدة بيانات: تُختبر وحدها، ويستعملها الباب والاختبار نفسُه.
 */

export interface AdviceInput {
  planCourseIds: readonly number[];
  passed: readonly number[];
  passedUnits: number;
  rules: readonly CurriculumCourseRule[];
  groups: readonly ElectiveGroup[];
  credit: ReadonlyMap<number, number>;
  name: (id: number) => string;
  code: (id: number) => string;
  /** مطروحٌ هذا الفصل بشعبةٍ واحدةٍ على الأقل. */
  offered: (id: number) => boolean;
  targetUnits: number;
}

export interface AdvicePick { courseId: number; name: string; code: string; credit: number; why: string; unlocks: string[] }
export interface AdviceWait { courseId: number; name: string; reason: string }
export interface Advice {
  hasRules: boolean;
  done: boolean;
  picks: AdvicePick[];
  units: number;
  target: number;
  /** فصولٌ بعد هذا الفصل لإكمال الصحيفة بهذا النسق، أو null إن لم تكتمل بالقواعد الحالية. */
  termsAfter: number | null;
  /** وحداتُ كل فصلٍ بعد هذا الفصل (للرسم: خطُّ الطريق إلى التخرّج). */
  path: number[];
  waiting: AdviceWait[];
  notOffered: string[];
  line: string;
  tail: string;
}

const MAX_TERMS = 14;
const MIN_UNITS = 12;
const MAX_UNITS = 15;
const quote = (name: string) => `«${name}»`;
const joinAnd = (names: string[]) => names.map(quote).join(" و");

export function adviseStudent(input: AdviceInput): Advice {
  const passed = new Set(input.passed.map(Number));
  const plan = [...new Set(input.planCourseIds.map(Number))];
  const ruleOf = new Map(input.rules.map(rule => [rule.courseId, rule] as const));
  const credit = (id: number) => input.credit.get(id) || 0;
  /* فصلُ الطالب بين ١٢ و١٥ وحدة: لا يُقترح فوق ١٥ ولا يُترك دون ١٢ ما دام في المطروح ما يملؤه. */
  const target = Math.max(MIN_UNITS, Math.min(MAX_UNITS, Math.round(input.targetUnits) || MAX_UNITS));
  const inGroup = new Set(input.groups.flatMap(group => group.courseIds));
  const loose = new Set(input.rules.filter(rule => rule.kind === "elective" && !inGroup.has(rule.courseId)).map(rule => rule.courseId));
  const compulsory = plan.filter(id => !inGroup.has(id) && !loose.has(id) && !passed.has(id));
  const groups = input.groups.map(group => groupProgress({ ...group, courseIds: group.courseIds.filter(id => plan.includes(id)) }, passed, input.credit));
  const groupOf = new Map<number, number>();
  groups.forEach((progress, index) => progress.group.courseIds.forEach(id => groupOf.set(id, index)));

  /* ما يتوقّف على ماذا: من يذكر هذا المقررَ مسبقاً. وعدُّ ما يفتحه يقتصر على الإجباري المتبقّي. */
  const dependents = new Map<number, Set<number>>();
  for (const id of plan) {
    const prereq = ruleOf.get(id)?.prereq;
    if (!prereq) continue;
    for (const need of [...prereq.all, ...prereq.anyOf.flat()]) (dependents.get(need) || dependents.set(need, new Set()).get(need)!).add(id);
  }
  const compulsorySet = new Set(compulsory);
  const unlocksMemo = new Map<number, Set<number>>();
  const unlocksOf = (id: number, trail = new Set<number>()): Set<number> => {
    if (unlocksMemo.has(id)) return unlocksMemo.get(id)!;
    const out = new Set<number>();
    if (trail.has(id)) return out;
    const next = new Set(trail).add(id);
    for (const child of dependents.get(id) || []) {
      if (passed.has(child)) continue;
      if (compulsorySet.has(child)) out.add(child);
      for (const grand of unlocksOf(child, next)) out.add(grand);
    }
    unlocksMemo.set(id, out);
    return out;
  };
  const depthMemo = new Map<number, number>();
  const depthOf = (id: number, trail = new Set<number>()): number => {
    if (depthMemo.has(id)) return depthMemo.get(id)!;
    if (trail.has(id)) return 0;
    const next = new Set(trail).add(id);
    let best = 0;
    for (const child of dependents.get(id) || []) if (!passed.has(child) && compulsorySet.has(child)) best = Math.max(best, 1 + depthOf(child, next));
    depthMemo.set(id, best);
    return best;
  };
  const levelOf = (id: number) => courseLevelFromCode(input.code(id)) || normalizeLevel(ruleOf.get(id)?.level) || 300;
  const score = (id: number) => depthOf(id) * 40 + [...unlocksOf(id)].filter(child => compulsorySet.has(child)).length * 8 + (500 - levelOf(id)) / 10 + (compulsorySet.has(id) ? 25 : 0);

  const allowed = (id: number, have: ReadonlySet<number>, units: number) => {
    const lack = unmetPrereq(ruleOf.get(id)?.prereq, have, units);
    return lack.all.length === 0 && lack.anyOf.length === 0 && lack.unitsShort === 0;
  };

  /* ما بقي من كل مجموعةٍ اختيارية، يتناقص مع كل اختيار. */
  const needC = groups.map(progress => progress.needCourses);
  const needU = groups.map(progress => progress.needUnits);
  const groupOpen = (id: number) => { const g = groupOf.get(id); return g !== undefined && (needC[g] > 0 || needU[g] > 0); };
  const electivePool = groups.flatMap(progress => progress.candidateIds);

  const pickTerm = (have: Set<number>, units: number, onlyOffered: boolean): number[] => {
    const pool = [...compulsory.filter(id => !have.has(id)), ...electivePool.filter(id => !have.has(id) && groupOpen(id))]
      .filter(id => allowed(id, have, units) && (!onlyOffered || input.offered(id)))
      .sort((a, b) => score(b) - score(a) || a - b);
    const picked: number[] = [];
    let sum = 0;
    const take = { c: needC.slice(), u: needU.slice() };
    const eligible = new Set(pool);
    for (const id of pool) {
      if (picked.includes(id)) continue;
      /* ما يُسجَّل معه: يدخل معه أو لا يدخل — مقرنٌ غير متاح أو لا يتّسع له الفصل يُسقط المقرر. */
      const partners = (ruleOf.get(id)?.coreq || []).filter(c => !have.has(c) && !picked.includes(c) && c !== id);
      if (partners.some(c => !eligible.has(c))) continue;
      const group = [id, ...partners];
      const cost = group.reduce((acc, c) => acc + credit(c), 0);
      if (group.some(c => credit(c) <= 0)) continue;
      if (sum + cost > target) continue;
      const open = group.filter(c => { const g = groupOf.get(c); return g === undefined || take.c[g] > 0 || take.u[g] > 0; });
      if (open.length !== group.length) continue;
      for (const c of group) {
        picked.push(c); sum += credit(c);
        const g = groupOf.get(c);
        if (g !== undefined) { take.c[g] -= 1; take.u[g] -= credit(c); }
      }
      if (sum >= target) break;
    }
    return picked;
  };
  const commit = (ids: readonly number[], have: Set<number>) => {
    for (const id of ids) {
      have.add(id);
      const g = groupOf.get(id);
      if (g !== undefined) { needC[g] -= 1; needU[g] -= credit(id); }
    }
  };
  const stillNeeded = (have: ReadonlySet<number>) => compulsory.some(id => !have.has(id)) || groups.some((_, g) => needC[g] > 0 || needU[g] > 0);

  const have = new Set(passed);
  let units = input.passedUnits;
  const picksIds = pickTerm(have, units, true);
  commit(picksIds, have);
  units += picksIds.reduce((sum, id) => sum + credit(id), 0);

  /* فصولٌ بعد هذا: يُفترض أن المطروح يتّسع (لا نعرف جداول المستقبل). */
  let termsAfter: number | null = 0;
  const path: number[] = [];
  while (stillNeeded(have)) {
    if ((termsAfter as number) >= MAX_TERMS) { termsAfter = null; break; }
    const next = pickTerm(have, units, false);
    if (!next.length) { termsAfter = null; break; }
    commit(next, have);
    const termUnits = next.reduce((sum, id) => sum + credit(id), 0);
    units += termUnits; path.push(termUnits);
    termsAfter = (termsAfter as number) + 1;
  }

  const picks: AdvicePick[] = picksIds.map(id => {
    const unlocks = [...unlocksOf(id)].filter(child => compulsorySet.has(child)).sort((a, b) => score(b) - score(a)).map(input.name);
    const g = groupOf.get(id);
    let why: string;
    const partner = (ruleOf.get(id)?.coreq || []).filter(c => picksIds.includes(c) && c !== id);
    if (unlocks.length) why = `يفتح لك ${joinAnd(unlocks.slice(0, 2))}${unlocks.length > 2 ? ` و${countOf(unlocks.length - 2, AR.course)} غيرها` : ""}`;
    else if (partner.length) why = `يُسجَّل مع ${joinAnd(partner.map(input.name))}`;
    else if (g !== undefined) why = `اختياريٌّ تحتاجه من «${groups[g].group.name}»`;
    else why = "مطلوبٌ لتخرّجك";
    return { courseId: id, name: input.name(id), code: input.code(id), credit: credit(id), why, unlocks };
  });
  const pickUnits = picks.reduce((sum, pick) => sum + pick.credit, 0);

  /* ما ينتظره: مطلوبٌ لكن مسبقُه لم يكتمل — مع ما ينقصه بكلماتٍ بسيطة. */
  const current = new Set(passed);
  const waiting: AdviceWait[] = compulsory.filter(id => !allowed(id, current, input.passedUnits)).sort((a, b) => score(b) - score(a)).slice(0, 6).map(id => {
    const lack = unmetPrereq(ruleOf.get(id)?.prereq, current, input.passedUnits);
    const parts = [...lack.all.map(input.name).map(quote), ...lack.anyOf.map(group => quote(input.name(group[0]))), ...(lack.unitsShort ? [countOf(lack.unitsShort, AR.unit)] : [])];
    return { courseId: id, name: input.name(id), reason: `بعد ${parts.join(" و")}` };
  });
  const notOffered = compulsory.filter(id => allowed(id, current, input.passedUnits) && !input.offered(id) && !picksIds.includes(id)).sort((a, b) => score(b) - score(a)).slice(0, 4).map(input.name);

  const done = !compulsory.length && groups.every(progress => progress.done);
  let line: string, tail: string;
  if (done) { line = "أنجزت كل متطلبات صحيفتك."; tail = "راجع مرشدك لإجراءات التخرّج."; }
  else if (!picks.length) { line = "لا مقرراً مطروحاً الآن تستطيع تسجيله من صحيفتك."; tail = waiting.length ? "تنتظر مقرراتك مسبقاتٍ أو شعباً لم تُطرح بعد." : "تابع الجدول حين يعتمده قسمك."; }
  else {
    line = `سجّل ${countOf(picks.length, AR.course)} هذا الفصل (${countOf(pickUnits, AR.unit)}).`;
    tail = termsAfter === 0 ? "وهذه آخر مقرراتك — تتخرّج بنهاية الفصل بإذن الله."
      : termsAfter === null ? "ولا تكتمل صحيفتك من هذه الخطوات وحدها — راجع مرشدك."
      : `وإن واصلت بهذا النسق تتخرّج بعد نحو ${countOf(termsAfter, AR.term)} أخرى.`;
  }
  return { hasRules: input.rules.length > 0, done, picks, units: pickUnits, target, termsAfter, path: termsAfter === null ? [] : path, waiting, notOffered, line, tail };
}
