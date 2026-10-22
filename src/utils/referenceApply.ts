import type { CurriculumReference } from "../data/technologyEducationCurricula";
import type { CourseKind, CurriculumCourseRule, ElectiveGroup } from "../types";
import { courseLevelFromCode } from "./curriculumRules";
import { referenceCodeKey } from "./curriculumReference";

/**
 * ── تطبيق الصحيفة المرجعية على كتالوج موقعٍ واحد ──────────────────────────────
 *
 * قرارات صاحب النظام (15/10/2026):
 *   · الصحيفة هي المرجع: اسمٌ أو وحداتٌ أو ساعاتٌ تخالفها في الكتالوج تُصحَّح إليها،
 *     حتى لمقرر قسمٍ آخر (يطبّقها الحساب الرئيسي وحده، ويُسجَّل كل تغيير).
 *   · الناقص يُضاف في كتالوج القسم المالك بحسب رمز القسم داخل رمز المقرر، فإن لم
 *     يتحدّد مالكٌ واحد لم يُخمَّن شيء وبُلّغ به.
 *   · مقررات البنات والبنين في الصحيفة القديمة وحدها: «للبنات فقط» (مطبوعة) تُضاف في
 *     مواقع فرع البنات (012*) فحسب؛ ومقررات البنين (مستنتجة، وسمها «مقترح») في فرع 011.
 *     الصحيفة الجديدة للجميع. لكل موقع صحيفتُه وطلبتُه، فالانتماء بالموقع هو التمييز.
 *   · «0130099 أو PEN»: PEN اختبارٌ لا مقرر، فلا يُقيَّد به مقرر؛ تبقى المتطلب المطبوع
 *     بديلاً خارجياً ويُذكر في الملاحظات.
 * الدالة نقية: تأخذ المقارنة الجاهزة وتردّ العمليات. الكتابة في الخادم، فالمعاينة والتطبيق
 * يمرّان من هنا فلا يفترق ما يُعرض عمّا يُنفَّذ.
 */

export type AudienceBranch = "boys" | "girls";
/** أقسام قرأتها الصحيفة بلا وسمٍ مطبوع؛ استنتاجٌ وافق عليه صاحب النظام ويُعرض «مقترح». */
export const INFERRED_BOYS_ONLY: ReadonlySet<string> = new Set(["0106148", "0106198", "0165148", "0165198", "0169148", "0169198"]);

export interface ComparedCourse {
  code: string; name: string; credit: number; hours: number; prerequisites: string[]; externalAlternative?: string;
  state: "matched" | "different" | "missing" | "ambiguous";
  current?: { id: number; code: string; name: string; credit: number; hours: number };
  ownerSectionId: number;
}
export interface ComparedGroup { id: string; name: string; category: string; requiredUnits: number; elective: boolean; courses: ComparedCourse[] }

export interface PlannedUpdate { courseId: number; code: string; ownerSectionId: number; /** الاسم يتغيّر (والاسم هوية المقرر المجمَّدة في الصحائف غير الفعالة). */ identityChange: boolean; /** المقرر في صحيفةٍ انتقالية/مؤرشفة: تغيير اسمه لا يُنفَّذ إلا بتأكيدٍ صريح. */ frozen?: boolean; before: { name: string; credit: number; hours: number }; after: { name: string; credit: number; hours: number } }
export interface PlannedCreate { code: string; name: string; credit: number; hours: number; sectionId: number }
export interface PlannedSkip { code: string; name: string; reason: string }

export interface ReferenceApplication {
  updates: PlannedUpdate[];
  creates: PlannedCreate[];
  /** مقرراتٌ موجودةٌ تُربط بالصحيفة (ما لم تكن مرتبطة). */
  links: Array<{ courseId: number; code: string }>;
  skipped: PlannedSkip[];
  notes: string[];
  /** مقررات الصحيفة في هذا الموقع بعد الاستبعاد: للعدّ والمراجعة. */
  courseCount: number;
  /** منها متطلباتٌ عامة (مقررات أقسامٍ أخرى): تُعرض في صحيفة القسم مقفولةً وتُحتسب في التقدّم. */
  externals: number;
}

const girlsOnly = (name: string) => /للبنات\s+فقط/.test(name);

/** هل يدخل المقرر موقعاً من فرع كذا؟ الصحيفة الجديدة للجميع. */
export function audienceOf(reference: Pick<CurriculumReference, "id">, course: { code: string; name: string }): AudienceBranch | null {
  if (reference.id === "new") return null;
  if (girlsOnly(course.name)) return "girls";
  if (INFERRED_BOYS_ONLY.has(referenceCodeKey(course.code))) return "boys";
  return null;
}

/** فرع الموقع: 012 بنات، وغيره (011) بنين. */
export const branchAudience = (branchRoot: string): AudienceBranch => (branchRoot === "012" ? "girls" : "boys");

export function planReferenceApplication(reference: CurriculumReference, groups: readonly ComparedGroup[], branchRoot: string, memberIds: ReadonlySet<number>, targetSectionId: number): ReferenceApplication {
  const here = branchAudience(branchRoot);
  const out: ReferenceApplication = { updates: [], creates: [], links: [], skipped: [], notes: [], courseCount: 0, externals: 0 };
  for (const group of groups) {
    for (const course of group.courses) {
      const audience = audienceOf(reference, course);
      if (audience && audience !== here) {
        out.skipped.push({ code: course.code, name: course.name, reason: audience === "girls" ? "للبنات فقط: لا يدخل موقعاً للبنين" : "للبنين (مستنتج): لا يدخل موقعاً للبنات" });
        continue;
      }
      out.courseCount += 1;
      const foreign = course.ownerSectionId !== targetSectionId;
      if (audience === "boys") out.notes.push(`«${course.name}» للبنين بالاستنتاج لا بنصٍّ مطبوع: راجعه.`);
      if (course.externalAlternative) out.notes.push(`«${course.name}»: متطلبه ${course.prerequisites.join("، ") || "—"} أو ${course.externalAlternative}؛ ${course.externalAlternative} اختبارٌ لا مقرر فلم يُقيَّد به.`);
      if (course.state === "ambiguous") { out.skipped.push({ code: course.code, name: course.name, reason: "الرمز يطابق أكثر من سجل: يلزم حسم الهوية يدوياً" }); out.courseCount -= 1; continue; }
      if (course.state === "missing") {
        if (!course.ownerSectionId) { out.skipped.push({ code: course.code, name: course.name, reason: "لم يتحدد قسمٌ مالك واحد لهذا الرمز في هذه الكلية" }); out.courseCount -= 1; continue; }
        out.creates.push({ code: course.code, name: course.name, credit: course.credit, hours: course.hours, sectionId: course.ownerSectionId });
        if (foreign) out.externals += 1;
        continue;
      }
      const current = course.current!;
      if (foreign) out.externals += 1;
      if (course.state === "different" && (current.name.normalize("NFKC").trim() !== course.name || current.credit !== course.credit || current.hours !== course.hours)) {
        out.updates.push({
          courseId: current.id, code: course.code, ownerSectionId: course.ownerSectionId, identityChange: current.name.normalize("NFKC").trim() !== course.name,
          before: { name: current.name, credit: current.credit, hours: current.hours }, after: { name: course.name, credit: course.credit, hours: course.hours },
        });
      }
      /* الصحيفة تضمّ مقررات قسمها وحده؛ مقرر قسمٍ آخر يُصحَّح في كتالوجه ولا يُربط هنا. */
      if (course.ownerSectionId === targetSectionId && !memberIds.has(current.id)) out.links.push({ courseId: current.id, code: course.code });
    }
  }
  return out;
}

/* ── القواعد: المستوى والنوع والمسبقات والمجموعات الاختيارية ───────────────────── */

const kindOf = (category: string, elective: boolean): CourseKind => elective ? "elective" : /ثقافية/.test(category) ? "university" : "compulsory";

export interface BuiltRules { rules: CurriculumCourseRule[]; groups: ElectiveGroup[]; notes: string[] }

/**
 * memberIdByCode: مقررات هذه الصحيفة (قسم الصحيفة) بمفتاح الرمز المطبوع — لها وحدها قواعد.
 * knownIdByCode: كل مقررات الموقع (المسبق قد يكون لقسمٍ آخر فيُقال تحذيراً لا حاجزاً).
 */
export function buildReferenceRules(reference: CurriculumReference, memberIdByCode: ReadonlyMap<string, number>, knownIdByCode: ReadonlyMap<string, number>, skipCodes: ReadonlySet<string>): BuiltRules {
  const rules: CurriculumCourseRule[] = [], groups: ElectiveGroup[] = [], notes: string[] = [];
  for (const group of reference.groups) {
    const members: number[] = [];
    for (const course of group.courses) {
      const key = referenceCodeKey(course.code);
      const id = memberIdByCode.get(key);
      if (!id || skipCodes.has(key)) continue;
      const rule: CurriculumCourseRule = { courseId: id, kind: kindOf(group.category, group.elective) };
      const level = courseLevelFromCode(course.code);
      if (level) rule.level = level;
      const all: number[] = [];
      for (const need of course.prerequisites) {
        const needId = knownIdByCode.get(referenceCodeKey(need));
        if (needId && !all.includes(needId)) all.push(needId);
        else if (!needId && !skipCodes.has(referenceCodeKey(need))) notes.push(`متطلب «${need}» لمقرر «${course.name}» غير موجود في كتالوج الموقع.`);
      }
      /* «أ أو ب»: مجموعةٌ يكفي واحدٌ منها؛ لا تُقيَّد إلا حين توجد كل أعضائها في الكتالوج، وإلا فالتقييد بالموجود وحده يحجب من اجتاز الآخر. */
      const anyOf: number[][] = [];
      for (const group of course.anyOf || []) {
        const ids = group.map(code => knownIdByCode.get(referenceCodeKey(code)));
        if (ids.every(Boolean)) anyOf.push([...new Set(ids as number[])]);
        else notes.push(`متطلب «${group.join(" أو ")}» لمقرر «${course.name}» غير موجود في كتالوج الموقع.`);
      }
      /* بديلٌ خارجي (PEN): لا يُقيَّد به المقرر، فالمتطلب المطبوع وحده يكفي أن يُنصح به لا أن يُشترط. */
      if ((all.length || anyOf.length) && !course.externalAlternative) rule.prereq = { all, anyOf };
      if (group.elective) { rule.groupId = `${reference.id}-${group.id}`; members.push(id); }
      rules.push(rule);
    }
    if (group.elective && members.length) {
      groups.push({ id: `${reference.id}-${group.id}`, name: `${group.category} · ${group.name}`.slice(0, 60), minCourses: 0, minUnits: group.requiredUnits, courseIds: members });
    }
  }
  return { rules, groups, notes };
}

/**
 * هويةُ المقرر (اسمُه) مجمَّدة في الصحائف الانتقالية والمؤرشفة لحماية السجل التاريخي.
 * الصحيفة المرجعية تغلب بأمر صاحب النظام، لكن لا بصمت: تغيير الاسم المجمَّد يُعرض أولاً
 * ويُنفَّذ بتأكيدٍ صريح؛ وبدونه تُطبَّق الوحدات والساعات ويُحبس الاسم ويُبلَّغ به.
 */
export function splitFrozenUpdates(updates: readonly PlannedUpdate[], confirmIdentity: boolean): { apply: PlannedUpdate[]; held: PlannedUpdate[] } {
  const apply: PlannedUpdate[] = [], held: PlannedUpdate[] = [];
  for (const update of updates) {
    if (update.frozen && update.identityChange && !confirmIdentity) {
      held.push(update);
      if (update.before.credit !== update.after.credit || update.before.hours !== update.after.hours) apply.push({ ...update, identityChange: false, after: { ...update.after, name: update.before.name } });
    } else apply.push(update);
  }
  return { apply, held };
}
