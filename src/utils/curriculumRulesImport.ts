import type { CourseKind, CurriculumCourseRule, ElectiveGroup } from "../types";
import { toEnglishDigits } from "./digits";
import { normalizeGroups, normalizeRules, withDerivedGroups } from "./curriculumRules";

/**
 * ── من ورقة الصحيفة إلى مسوّدة قواعد ─────────────────────────────────────────
 *
 * الصحائفُ تصل جداولَ (CSV/Excel) بسطرٍ لكل مقرر. هذا يحوّلها إلى مسوّدةٍ تُراجَع
 * في الواجهة — لا يعتمد شيئاً. ما لا يُفهم يُرجَع في `diagnostics` بسطره، ولا
 * يُحذف بصمت ولا يُخمَّن: «وإن لم يكفِ الدليلُ فاترك القيمةَ للمراجعة».
 *
 * أعمدةُ السطر (كلُّها نصوص، والأرقامُ العربية مقبولة):
 *   section   اسمُ القسم (أو رمزه)
 *   plan      اسمُ الصحيفة — اختياري إن كان للقسم صحيفةٌ واحدة
 *   code      رمزُ المقرر
 *   level     المستوى ١–١٢
 *   kind      إجباري | كلية | جامعة | اختياري
 *   prereqAll مسبقاتٌ كلُّها لازمة، يفصل بينها «+»    مثل: ISL100+ISL110
 *   prereqAny مجموعاتٌ يكفي واحدٌ من كلٍّ منها، «;» بين المجموعات و«|» بين البدائل
 *   minUnits  وحداتٌ مجتازة لا تقلّ عن
 *   coreq     مقرناتٌ، يفصل بينها «+»
 *   group     اسمُ المجموعة الاختيارية
 *   groupMinCourses / groupMinUnits   حدّا المجموعة
 */
export interface RuleImportRow {
  section?: string; plan?: string; code?: string;
  level?: string | number; kind?: string;
  prereqAll?: string; prereqAny?: string; minUnits?: string | number; coreq?: string;
  group?: string; groupMinCourses?: string | number; groupMinUnits?: string | number;
}

export interface ImportPlan { id: string; sectionId: number; sectionName: string; sectionCode?: string; name: string; courseIds: number[] }
export interface ImportCourse { id: number; code: string }

export interface ImportDiagnostic { line: number; text: string }

export interface ImportedDraft {
  planId: string;
  sectionId: number;
  rules: CurriculumCourseRule[];
  groups: ElectiveGroup[];
}

const fold = (value: unknown): string => String(value ?? "").normalize("NFKC").replace(/[ً-ْـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim().toLowerCase();
const codeKey = (value: unknown): string => String(value ?? "").replace(/[\s\-_.]/g, "").toUpperCase();

export function parseKind(value: unknown): CourseKind | undefined {
  const text = fold(value);
  if (!text) return undefined;
  if (/اجبار|compuls|core|اساس/.test(text)) return "compulsory";
  if (/كلي|college/.test(text)) return "college";
  if (/جامع|univers/.test(text)) return "university";
  if (/اختيار|elective|حر/.test(text)) return "elective";
  return undefined;
}

const num = (value: unknown): number => {
  const n = Number(toEnglishDigits(String(value ?? "")).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * @param rows   الأسطر كما وصلت
 * @param plans  صحائفُ النظام (القسم، الاسم، المقررات)
 * @param courses كلُّ المقررات برموزها — المسبقُ قد يكون من قسمٍ آخر
 */
export function rowsToDrafts(rows: readonly RuleImportRow[], plans: readonly ImportPlan[], courses: readonly ImportCourse[]): { drafts: ImportedDraft[]; diagnostics: ImportDiagnostic[] } {
  const diagnostics: ImportDiagnostic[] = [];
  const say = (line: number, text: string) => diagnostics.push({ line, text });
  const byCode = new Map<string, number[]>();
  for (const course of courses) byCode.set(codeKey(course.code), [...(byCode.get(codeKey(course.code)) || []), course.id]);

  const planOf = (row: RuleImportRow, line: number): ImportPlan | null => {
    const section = fold(row.section);
    const candidates = plans.filter(plan => !section || fold(plan.sectionName) === section || (plan.sectionCode && fold(plan.sectionCode) === section) || fold(plan.sectionName).includes(section));
    if (!candidates.length) { say(line, `قسمٌ غير معروف: «${row.section || ""}».`); return null; }
    const named = String(row.plan || "").trim();
    if (named) {
      const hit = candidates.find(plan => fold(plan.name) === fold(named)) || candidates.find(plan => fold(plan.name).includes(fold(named)));
      if (!hit) { say(line, `صحيفةٌ غير معروفة في هذا القسم: «${named}».`); return null; }
      return hit;
    }
    const sections = new Set(candidates.map(plan => plan.sectionId));
    if (sections.size > 1) { say(line, `القسم «${row.section}» يطابق أكثر من قسم — اكتب اسمه كاملاً.`); return null; }
    if (candidates.length > 1) { say(line, `للقسم أكثر من صحيفة — اكتب اسم الصحيفة في العمود plan.`); return null; }
    return candidates[0];
  };

  const resolve = (plan: ImportPlan, text: string, line: number): number | null => {
    const key = codeKey(text);
    if (!key) return null;
    const ids = byCode.get(key) || [];
    if (!ids.length) { say(line, `رمزُ مقررٍ غير معروف: «${text}».`); return null; }
    const inPlan = ids.filter(id => plan.courseIds.includes(id));
    if (inPlan.length === 1) return inPlan[0];
    if (inPlan.length > 1 || ids.length > 1) { say(line, `الرمز «${text}» يطابق أكثر من مقرر.`); return null; }
    return ids[0];
  };
  const list = (plan: ImportPlan, text: unknown, line: number): number[] =>
    String(text ?? "").split("+").map(part => resolve(plan, part, line)).filter((id): id is number => id !== null);

  const perPlan = new Map<string, { plan: ImportPlan; rules: Map<number, CurriculumCourseRule>; groups: Map<string, { name: string; ids: number[]; minCourses: number; minUnits: number }> }>();
  rows.forEach((row, index) => {
    const line = index + 1;
    if (!String(row.code ?? "").trim()) return;
    const plan = planOf(row, line);
    if (!plan) return;
    const course = resolve(plan, String(row.code), line);
    if (course === null) return;
    if (!plan.courseIds.includes(course)) say(line, `«${row.code}» ليس في صحيفة «${plan.name}» — يُضاف للمراجعة لكن راجعه.`);
    const bucket = perPlan.get(plan.id) || { plan, rules: new Map(), groups: new Map() };
    perPlan.set(plan.id, bucket);

    const rule: CurriculumCourseRule = { courseId: course };
    const level = num(row.level);
    if (String(row.level ?? "").trim() && (level < 1 || level > 12)) say(line, `مستوىً خارج ١–١٢: «${row.level}».`);
    else if (level) rule.level = level;
    const kind = parseKind(row.kind);
    if (String(row.kind ?? "").trim() && !kind) say(line, `نوعٌ غير مفهوم: «${row.kind}».`);
    if (kind) rule.kind = kind;
    const all = list(plan, row.prereqAll, line);
    const anyOf = String(row.prereqAny ?? "").split(";").map(group => group.split("|").map(part => resolve(plan, part, line)).filter((id): id is number => id !== null)).filter(group => group.length);
    const minUnits = num(row.minUnits);
    if (all.length || anyOf.length || minUnits) rule.prereq = { all, anyOf, ...(minUnits ? { minUnits } : {}) };
    const coreq = list(plan, row.coreq, line);
    if (coreq.length) rule.coreq = coreq;
    bucket.rules.set(course, rule);

    const groupName = String(row.group ?? "").trim();
    if (groupName) {
      const key = fold(groupName);
      const group = bucket.groups.get(key) || { name: groupName, ids: [], minCourses: 0, minUnits: 0 };
      if (!group.ids.includes(course)) group.ids.push(course);
      group.minCourses = Math.max(group.minCourses, num(row.groupMinCourses));
      group.minUnits = Math.max(group.minUnits, num(row.groupMinUnits));
      bucket.groups.set(key, group);
      if (!rule.kind) rule.kind = "elective";
    }
  });

  const drafts: ImportedDraft[] = [];
  for (const { plan, rules, groups } of perPlan.values()) {
    const groupList = normalizeGroups([...groups.values()].map((group, i) => ({ id: `g${i + 1}`, name: group.name, minCourses: group.minCourses, minUnits: group.minUnits, courseIds: group.ids })));
    drafts.push({ planId: plan.id, sectionId: plan.sectionId, groups: groupList, rules: withDerivedGroups(normalizeRules([...rules.values()]), groupList) });
  }
  return { drafts, diagnostics };
}
