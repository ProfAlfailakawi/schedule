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

export type SheetRejectKind = "unreadable" | "unverified" | "college" | "department" | "empty" | "order";

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
  /** رمز الكلية بخانتين من رمز الكلية في النظام (011 ← 01)؛ فارغ إن لم يُعرف. */
  collegeCode?: string;
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

/** الصحيفة الجديدة تبدأ من هذه السنة؛ ما قبلها قديمةٌ تدخل «الصحيفة السابقة» ولا تمسّ الفعّالة. */
export const NEW_PLAN_FROM_YEAR = 2026;
export const isNewSheet = (plan: Pick<ParsedPlan, "startYear">) => plan.startYear >= NEW_PLAN_FROM_YEAR;

/**
 * صحائفُ برامج التربية الخاصة ورياض الأطفال تُطبع باسم القسم الإداري («علم النفس»، «علم التربية») لا باسم القسم
 * المختص؛ فيُقبل القسمُ المختار إن كان رمزُه بين رموز مقررات الصحيفة بعشرة مقرراتٍ فأكثر، وتؤخذ مقرراتُ رمزه وحدها.
 * لا يمسّ هذا صحيفةً باسم قسمٍ حقيقي (تكنولوجيا التعليم…)، فلا تُقبل في «أصول التربية» لوجود مقرراتٍ خدميةٍ منها.
 */
export const UMBRELLA_DEPARTMENTS = ["علم النفس", "علم التربية"];
const MIN_UMBRELLA_COURSES = 10;
const isUmbrellaSheet = (plan: Pick<ParsedPlan, "department">) => UMBRELLA_DEPARTMENTS.some(name => arabicMatchKey(name) === matchKey(plan.department));
const countOfDept = (plan: Pick<ParsedPlan, "courses">, dept: string) => plan.courses.filter(course => course.dept === dept).length;

/** مفتاح قسم الصحيفة (كلية+قسم الغالبان بين مقرراتها): 0109. */
export const sheetKey = (plan: Pick<ParsedPlan, "courses">) => `${dominantDepartment(plan, "college")}${dominantDepartment(plan)}`;

/** مفتاح مقررات القسم المختار من الصحيفة: الغالب فيها، أو رمز القسم نفسه في صحائف القسم الإداري. */
export function sheetOwnKey(plan: ParsedPlan, scope: Pick<SheetScope, "departmentKey" | "sectionName" | "collegeCode">): { key: string; umbrella: boolean } {
  const sectionKey = scope.departmentKey.replace(/\D/g, "");
  const known = /^\d{4}$/.test(sectionKey), deptCode = known ? sectionKey.slice(2) : "";
  const sheetDept = dominantDepartment(plan);
  const nameMatches = matchKey(stripSection(scope.sectionName)) === matchKey(plan.department) || matchKey(scope.sectionName).includes(matchKey(plan.department)) || matchKey(plan.department).includes(matchKey(scope.sectionName));
  if (!nameMatches && !(deptCode && sheetDept === deptCode) && isUmbrellaSheet(plan) && deptCode && countOfDept(plan, deptCode) >= MIN_UMBRELLA_COURSES) {
    return { key: `${dominantDepartment(plan, "college")}${deptCode}`, umbrella: true };
  }
  return { key: sheetKey(plan), umbrella: false };
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
  /* الصحيفة هي المعتمدة: ما كُتب يدوياً في النظام (رمز القسم أو اسمه) قد يكون خطأً. فيُقبل القسم إن طابق اسمُه
     أو رمزُه ما في الصحيفة، ويُصحَّح الآخر إليها؛ ويُرفض إن خالفها اسماً ورمزاً معاً (كصحيفة أصول لقسم آخر). */
  const sectionKey = scope.departmentKey.replace(/\D/g, "");
  const known = /^\d{4}$/.test(sectionKey);
  const collegeCode = scope.collegeCode || (known ? sectionKey.slice(0, 2) : ""), deptCode = known ? sectionKey.slice(2) : "";
  const sheetDept = dominantDepartment(plan), sheetCollege = dominantDepartment(plan, "college");
  const collegeDiffers = !(matchKey(scope.collegeName).includes(matchKey(plan.college)) || matchKey(plan.college).includes(matchKey(scope.collegeName)))
    || (Boolean(collegeCode) && sheetCollege !== collegeCode);
  const nameMatches = matchKey(stripSection(scope.sectionName)) === matchKey(plan.department)
    || matchKey(scope.sectionName).includes(matchKey(plan.department)) || matchKey(plan.department).includes(matchKey(scope.sectionName));
  const codeMatches = Boolean(deptCode) && sheetDept === deptCode;
  const umbrella = !nameMatches && !codeMatches && isUmbrellaSheet(plan) && Boolean(deptCode) && countOfDept(plan, deptCode) >= MIN_UMBRELLA_COURSES;
  if (collegeDiffers || (!nameMatches && !codeMatches && !umbrella)) {
    const fields: SheetMismatch["fields"] = [...(collegeDiffers ? ["college" as const] : []), ...(!nameMatches && !codeMatches ? ["department" as const] : [])];
    const mismatch: SheetMismatch = {
      fields,
      sheet: { college: plan.college, department: plan.department, departmentCode: sheetDept },
      chosen: { college: scope.collegeName, department: stripSection(scope.sectionName), departmentCode: deptCode },
    };
    const kind: SheetRejectKind = collegeDiffers ? "college" : "department";
    const what = collegeDiffers && fields.includes("department") ? "الكلية والقسم" : collegeDiffers ? "الكلية" : "القسم";
    return { kind, mismatch, message: `الصحيفة ليست لما اخترت: هي لـ${[collegeDiffers ? plan.college : "", `قسم «${plan.department}» (${sheetDept})`].filter(Boolean).join("، ")}، والمختار ${[collegeDiffers ? scope.collegeName : "", `قسم «${stripSection(scope.sectionName)}»${deptCode ? ` (${deptCode})` : ""}`].filter(Boolean).join("، ")}. اختر ${what} الصحيح أو ارفع الصحيفة الصحيحة.` };
  }
  const own = ownCourses(plan, sheetOwnKey(plan, scope).key);
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

/** رمز القسم من الصحيفة بنمط رمزه الحالي (أربع خانات إن كان بالهيئة، وإلا خانتان)؛ فارغ إن طابق. */
export function sheetSectionCode(plan: Pick<ParsedPlan, "courses">, currentCode: string): string {
  const dept = dominantDepartment(plan), current = String(currentCode || "").replace(/\D/g, "");
  const next = /^\d{4}$/.test(current) ? sheetKey(plan) : dept;
  return current && current.replace(/^0+(?=\d)/, "") === next.replace(/^0+(?=\d)/, "") ? "" : (dept ? next : "");
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
