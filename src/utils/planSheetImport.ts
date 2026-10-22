/**
 * ── رفع «الخطة الدراسية» (صحيفة التخرج) لقسمٍ واحد ────────────────────────────
 *
 * قرارات صاحب النظام:
 *   · الصحيفة تُرفع مرةً واحدة وتُطبَّق مباشرةً بلا خطوة «اعتمد التطبيق»؛ والقسم يعتمد بعدها قواعدها.
 *   · لا يُقبل إلا كشفُ الكلية والقسم المختارين، كاستيراد الجدول وكشف المتبقي.
 *   · من الصحيفة تؤخذ مقررات القسم وحده (رمز القسم: الخانتان الوسطى من «105 09 01»).
 *   · يُحفظ في القسم رقمُ المقرر بثلاث خانات فقط («105»)، والسعةُ لا تُمسّ.
 *   · أسماء المقررات تُصحَّح إلى صحيحها (courseNameCorrection) وتُسجَّل «قبل ← بعد».
 *
 * هذه الدوال نقيةٌ كلُّها: الخادم يقرأ الملف ويطبّق، وهنا القرار (أيقبل؟ وما الذي يؤخذ؟).
 */
import type { CurriculumReference, CurriculumReferenceGroup } from "../data/technologyEducationCurricula";
import { arabicMatchKey } from "./arabicText";
import { correctCourseName } from "./courseNameCorrection";
import type { ParsedPlan, PlanCourse } from "./planPdfParser";

export type SheetRejectKind = "unreadable" | "unverified" | "noCode" | "college" | "department" | "departmentCode" | "empty";

/** ما في الصحيفة وما المختار، للحقول المختلفة وحدها. */
export interface SheetMismatch {
  fields: Array<"college" | "department">;
  sheet: { college?: string; department?: string; departmentCode?: string };
  chosen: { college?: string; department?: string; departmentCode?: string };
}

export interface SheetRejection { kind: SheetRejectKind; message: string; mismatch?: SheetMismatch; warnings?: string[] }

export interface SheetScope {
  /** اسم الكلية في النظام («كلية التربية الأساسية - بنات»). */
  collegeName: string;
  /** اسم القسم في النظام. */
  sectionName: string;
  /** مفتاح القسم بصيغة الهيئة (كلية+قسم: 0109) كما في authorityDepartmentCode؛ فارغ إن لم يُسجَّل رمزه. */
  departmentKey: string;
}

const stripSection = (name: string) => String(name || "").replace(/^\s*قسم\s+/, "").replace(/\s*[·\-–—|].*$/, "").trim();
const matchKey = (text: string) => arabicMatchKey(stripSection(text));

/** تحذيراتُ القارئ التي لا تمنع: متطلبٌ لا تحويه الصحيفة (يُقرأ بقسمٍ آخر). */
const isOutsidePrereq = (warning: string) => /^متطلب \S+ في \S+ ليس في الخطة$/.test(warning);
/** مجاميعُ مطبوعةٌ لا تطابق مجموع مقرراتها: سهوٌ في الصحيفة نفسها (وُجد في صحائف الكلية الحقيقية)، لا في القراءة. */
const isPrintedArithmetic = (warning: string) => /^(مجموعة «.*»: |قسم «.*»: مجموع مجموعاته |مجموع الأقسام )/.test(warning);

/** ما يمنع الكتابة من تحذيرات القراءة: سطرٌ لم يُفهم، وحداتٌ مفقودة، رمزٌ مكرر… أما المجاميع المطبوعة فتُعرض ملاحظةً. */
export function blockingWarnings(plan: Pick<ParsedPlan, "warnings">): string[] {
  return plan.warnings.filter(warning => !isOutsidePrereq(warning) && !isPrintedArithmetic(warning));
}
export function printedTotalsNotes(plan: Pick<ParsedPlan, "warnings">): string[] {
  return plan.warnings.filter(isPrintedArithmetic).map(warning => `في الصحيفة المطبوعة: ${warning}`);
}

/** الرمز الأكثر تكراراً للقسم بين مقررات الصحيفة: هو قسمها (المقررات الخدمية لأقسامٍ أخرى أقل عدداً). */
export function dominantDepartment(plan: Pick<ParsedPlan, "courses">, field: "dept" | "college" = "dept"): string {
  const counts = new Map<string, number>();
  for (const course of plan.courses) counts.set(course[field], (counts.get(course[field]) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "";
}

/** هل تُقبل هذه الصحيفة لهذا القسم؟ null = تُقبل. لا يُكتب شيءٌ قبل أن تمرّ كل الفحوص. */
export function checkSheetScope(plan: ParsedPlan, scope: SheetScope): SheetRejection | null {
  if (!plan.courses.length || !plan.college || !plan.department) {
    return { kind: "unreadable", message: "لم تُقرأ الكلية أو القسم أو المقررات من الملف. ارفع «الخطة الدراسية» PDF كما تطبعها SWRCAPP (نصاً لا صورة)." };
  }
  const blocking = blockingWarnings(plan);
  if (blocking.length) {
    return { kind: "unverified", message: "القراءة غير مطمئنة (سطر لم يُفهم أو وحدات ناقصة)، فلم تُكتب: " + blocking.slice(0, 3).join(" · "), warnings: blocking };
  }
  const sectionKey = scope.departmentKey.replace(/\D/g, "");
  if (!/^\d{4}$/.test(sectionKey)) {
    return { kind: "noCode", message: `رمز قسم «${stripSection(scope.sectionName)}» في النظام ${scope.departmentKey ? `(${scope.departmentKey}) ليس رمز الهيئة (رقمان)` : "غير مسجّل"}، فلا يمكن التحقق أن الصحيفة له. اضبط رمز القسم في «الأقسام» كما في نظام العمادة.` };
  }
  const collegeCode = sectionKey.slice(0, 2), deptCode = sectionKey.slice(2);
  const sheetDept = dominantDepartment(plan);
  const collegeDiffers = !(matchKey(scope.collegeName).includes(matchKey(plan.college)) || matchKey(plan.college).includes(matchKey(scope.collegeName)))
    || dominantDepartment(plan, "college") !== collegeCode;
  const nameDiffers = matchKey(stripSection(scope.sectionName)) !== matchKey(plan.department)
    && !matchKey(scope.sectionName).includes(matchKey(plan.department)) && !matchKey(plan.department).includes(matchKey(scope.sectionName));
  const codeDiffers = sheetDept !== deptCode;
  /* الرمزان (كلية+قسم) هما الحَكَم؛ اختلافُ تسمية القسم وحده («معلم الحاسب» و«حاسوب») لا يرفض، ويُذكر ملاحظة. */
  if (collegeDiffers || codeDiffers) {
    const fields: SheetMismatch["fields"] = [...(collegeDiffers ? ["college" as const] : []), ...(nameDiffers || codeDiffers ? ["department" as const] : [])];
    const mismatch: SheetMismatch = {
      fields,
      sheet: { college: plan.college, department: plan.department, departmentCode: sheetDept },
      chosen: { college: scope.collegeName, department: stripSection(scope.sectionName), departmentCode: deptCode },
    };
    const kind: SheetRejectKind = collegeDiffers ? "college" : nameDiffers ? "department" : "departmentCode";
    const what = collegeDiffers && (nameDiffers || codeDiffers) ? "الكلية والقسم" : collegeDiffers ? "الكلية" : "القسم";
    return { kind, mismatch, message: `الصحيفة ليست لما اخترت: هي لـ${[collegeDiffers ? plan.college : "", `قسم «${plan.department}» (${sheetDept})`].filter(Boolean).join("، ")}، والمختار ${[collegeDiffers ? scope.collegeName : "", `قسم «${stripSection(scope.sectionName)}» (${deptCode})`].filter(Boolean).join("، ")}. اختر ${what} الصحيح أو ارفع الصحيفة الصحيحة.` };
  }
  const own = ownCourses(plan, sectionKey);
  if (!own.length) return { kind: "empty", message: "لا مقررات لهذا القسم في الصحيفة." };
  const numbers = own.map(course => Number(course.number));
  if (new Set(numbers).size !== numbers.length) return { kind: "unverified", message: "رقم مقرر يتكرر بين رمزين فرعيين للقسم: لا يمكن حفظه برقمه وحده." };
  return null;
}

/**
 * اسمُ القسم يُؤخذ من الصحيفة المعتمدة: إن خالف ما عندنا («معلم الحاسب» و«حاسوب») ردّ الاسم الجديد
 * (بنمط التسمية الحالي: «قسم …» إن كان اسمه الحالي بها)، وإلا فارغاً. بعد قبول الرمزين فقط.
 */
export function sheetSectionName(plan: Pick<ParsedPlan, "department">, currentName: string): string {
  const a = matchKey(currentName), b = matchKey(plan.department);
  if (!b || a === b) return "";
  const bare = stripSection(plan.department);
  return /^\s*قسم\s/.test(currentName) ? `قسم ${bare}` : bare;
}

/** أقسامٌ تشمل صحيفتُها رمزاً فرعياً ثانياً هو منها (الكهرباء 72 والإلكترونيات 73): كلُّه من الصحيفة. */
export const DEPARTMENT_EXTRA_CODES: Readonly<Record<string, readonly string[]>> = { "72": ["73"] };

/** مقررات القسم وحده: رمز القسم والكلية في رمز المقرر (ومعها رموزه الفرعية إن وُجدت). */
export function ownCourses(plan: Pick<ParsedPlan, "courses">, departmentKey: string): PlanCourse[] {
  const key = departmentKey.replace(/\D/g, "");
  const depts = new Set([key.slice(2), ...(DEPARTMENT_EXTRA_CODES[key.slice(2)] || [])]);
  return plan.courses.filter(course => course.college === key.slice(0, 2) && depts.has(course.dept));
}

/** ما يُحفظ في القسم رمزاً: رقم المقرر وحده كما طُبع («105»)، بلا رمز الكلية ولا القسم. */
export const storedCode = (course: Pick<PlanCourse, "number">) => course.number;

export interface NameFix { code: string; before: string; after: string; rules: string[] }

/** أسماء مقررات القسم بعد التصحيح، وما تغيّر منها (قبل ← بعد). */
export function correctedNames(courses: readonly PlanCourse[]): { names: Map<string, string>; fixes: NameFix[] } {
  const names = new Map<string, string>(), fixes: NameFix[] = [];
  for (const course of courses) {
    const { name, rules } = correctCourseName(course.name);
    names.set(course.codeKey, name);
    if (rules.length) fixes.push({ code: storedCode(course), before: course.name, after: name, rules });
  }
  return { names, fixes };
}

/**
 * الصحيفة المقروءة بصيغة المرجع التي يستهلكها بناء القواعد (buildReferenceRules): مقررات القسم وحدها،
 * مجموعاتٌ بوحداتها، والمتطلب «أ أو PEN» بديلاً خارجياً (PEN اختبارٌ لا مقرر). «أو» بين مقررين
 * لا تدعمه القواعد: يُقال في الملاحظات ولا يُقيَّد به شيء. المتطلبات من خارج القسم تبقى بمفتاحها
 * ليُحسم أمرها في الكتالوج (قراءةً فحسب).
 */
export function sheetToReference(plan: ParsedPlan, own: readonly PlanCourse[], names: ReadonlyMap<string, string>): { reference: CurriculumReference; notes: string[] } {
  const notes: string[] = [];
  const groups: CurriculumReferenceGroup[] = [];
  for (const group of plan.groups) {
    const courses = own.filter(course => course.groupId === group.id).map(course => {
      const prerequisites = [...course.prereqAll];
      let externalAlternative: string | undefined;
      for (const any of course.prereqAny) {
        const real = any.filter(code => code !== "PEN");
        if (any.includes("PEN") && real.length === 1) { prerequisites.push(real[0]); externalAlternative = "PEN"; }
        else notes.push(`«${names.get(course.codeKey) || course.name}»: متطلبٌ «${any.join(" أو ")}» بين مقررين لا تدعمه القواعد؛ لم يُقيَّد به.`);
      }
      return { code: course.codeKey, name: names.get(course.codeKey) || course.name, credit: course.units, hours: course.hours, prerequisites: [...new Set(prerequisites)], ...(externalAlternative ? { externalAlternative } : {}) };
    });
    if (!courses.length) continue;
    groups.push({ id: group.id, name: group.name, category: plan.sections.find(section => section.no === group.sectionNo)?.name || "", requiredUnits: group.units ?? group.offeredUnits, elective: group.kind === "elective", courses });
  }
  return { reference: { id: "new", program: plan.program, name: `الخطة الدراسية ${plan.program}`, effectiveTerm: plan.semesterLabel || String(plan.startYear || ""), degreeUnits: plan.degreeUnits, groups }, notes };
}
