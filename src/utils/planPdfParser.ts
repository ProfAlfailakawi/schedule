/**
 * ── قارئ «الخطة الدراسية» (عمادة القبول والتسجيل) ───────────────────────────
 *
 * الملف المطبوع صفحتان بعمودين، وفيه ما يلزم لصحيفةٍ كاملة: أقسامٌ مرقّمة
 * (ثقافية عامة، تخصصية، مهنية، تدريب ميداني)، تحتها مجموعاتٌ إجبارية
 * واختيارية بوحداتها، وفي كل صفٍّ رمزُ المقرر واسمُه ووحداتُه وساعاتُه
 * ومتطلباتُه السابقة (أسطرٌ تحت المقرر = كلُّها لازمة، و«أو» = بديل).
 *
 * القراءة من طبقة النص نفسها (عناصر pdfjs بإحداثياتها) لا من الصورة، فالأرقام
 * تخرج كما طُبعت. ولا يُصدَّق الملفُّ بلا فحص: كلُّ مجموعةٍ وكلُّ قسمٍ وعددُ
 * وحدات التخرج يُجمع ويُقارن بما طُبع، وأيُّ فرقٍ يخرج تحذيراً بنصّه — فالقراءة
 * الخاطئة تُكشف بالحساب لا بالنظر.
 *
 * الدالّة نقية: تأخذ عناصر النص وتردّ البنية. استخراج العناصر من الـPDF في
 * `planPdfExtract.ts`، والاختبار يغذّيها بالعناصر نفسها فلا يفترق ما يُختبر عمّا يُنفَّذ.
 *
 * الرمز المطبوع «رقم قسم كلية» (105 09 01) يُقرأ كلية+قسم+رقم = 0109105، وهو مفتاح
 * المقرر في الكتالوج (انظر authorityAcademicCodes). ورقمٌ من خانتين (99) يُحمل مرتين:
 * كما طُبع (013099) وبصفره البادئ (0130099)، ويُطابَق أيُّهما وُجد.
 */

import { AR, countOf } from "./arabicCount";

export interface PlanItem { str: string; x: number; y: number; w: number }

export type PlanGroupKind = "mandatory" | "elective" | "training";

export interface PlanGroup {
  id: string;
  sectionNo: number;
  name: string;
  kind: PlanGroupKind;
  /** الوحدات المطبوعة للمجموعة؛ null إن لم تُطبع. */
  units: number | null;
  /** مجموع وحدات المقررات المعروضة فيها (للاختيارية أكثر من المطلوب). */
  offeredUnits: number;
}

export interface PlanSection { no: number; name: string; units: number | null }

export interface PlanCourse {
  /** كما طُبع: كلية+قسم+رقم، 013099 للرقم ذي الخانتين. */
  code: string;
  /** برقمٍ من ثلاث خانات: 0130099. */
  codeKey: string;
  college: string;
  dept: string;
  number: string;
  name: string;
  units: number;
  hours: number;
  sectionNo: number;
  groupId: string;
  /** المتطلبات السابقة كلُّها لازمة (رموز codeKey). */
  prereqAll: string[];
  /** «أ أو ب»: يكفي واحدٌ؛ وقد يضمّ PEN (اختبار تحديد المستوى، لا مقرراً). */
  prereqAny: string[][];
  /** وُسم «للبنات فقط» في الاسم المطبوع. */
  girlsOnly: boolean;
  /** صفري الوحدات (تمهيدي): يُدرَّس ولا يُحتسب للتخرج. */
  zeroCredit: boolean;
}

export interface ParsedPlan {
  program: string;
  /** اسم البرنامج المطبوع بجانب رمزه («علوم - تربيه خاصه اعاقة سمعية»)؛ فارغ إن لم يُقرأ. */
  programName: string;
  /** سنة بدء الخطة (الأصغر من «2027-2026» المطبوعة معكوسة). */
  startYear: number;
  semesterLabel: string;
  college: string;
  department: string;
  degree: string;
  degreeUnits: number;
  sections: PlanSection[];
  groups: PlanGroup[];
  courses: PlanCourse[];
  /** فروقُ الحساب وما لم يُفهم. فارغةٌ = قراءةٌ تطابقت مع كل ما طُبع. */
  warnings: string[];
}

const SPLIT_X = 400;
const COLUMNS = {
  right: { code: [698, 722], prereq: [415, 445], name: [535, 706], units: [515, 540], hours: [478, 506] },
  left: { code: [328, 350], prereq: [44, 72], name: [168, 335], units: [146, 170], hours: [108, 135] },
} as const;
type ColumnName = keyof typeof COLUMNS;

/** الأقواس تُطبع معكوسةً في الطبقة النصية: «)1(» تعني «(1)». */
const unmirror = (text: string): string => text.replace(/[()]/g, ch => (ch === "(" ? ")" : "("));
const clean = (text: string): string => unmirror(String(text || "").normalize("NFKC")).replace(/\s+/g, " ").trim();
const CODE = /^(\d{2,3}) (\d{2}) (\d{2})$/;
const GLUED_PREREQ = /^[()]?(\d{2,3} \d{2} \d{2})\s*(?:أو)?[()]?$/;
const STRAY_CODE = /^\d{2,3} \d{2} \+\d{2}$/;
const inBand = (value: number, band: readonly [number, number]) => value >= band[0] && value <= band[1];

/** «105 09 01» تُطبع رقماً فقسماً فكلية (من اليسار): رقم المقرر 105، القسم 09، الكلية 01. */
const splitCode = (printed: string) => {
  const m = printed.match(CODE)!;
  return { number: m[1], dept: m[2], college: m[3] };
};
const toCode = (college: string, dept: string, number: string) => ({
  code: `${college}${dept}${number}`,
  codeKey: `${college}${dept}${number.padStart(3, "0")}`,
});

/** اسمٌ للمقارنة: يتجاوز الهاء/التاء المربوطة والألف والياء والأقواس والمسافات. */
export function normalizeCourseName(name: string): string {
  return String(name || "").normalize("NFKC")
    .replace(/[()\s_\-ـ]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/[ةه]/g, "");
}

interface Line { y: number; items: PlanItem[] }

function linesOf(items: PlanItem[]): Line[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || b.x - a.x);
  const lines: Line[] = [];
  for (const item of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - item.y) <= 2) last.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  for (const line of lines) line.items.sort((a, b) => b.x - a.x);
  return lines;
}

const centre = (item: PlanItem) => item.x + item.w / 2;

export function parsePlanItems(pages: PlanItem[][]): ParsedPlan {
  const warnings: string[] = [];
  const plan: ParsedPlan = {
    program: "", programName: "", startYear: 0, semesterLabel: "", college: "", department: "", degree: "", degreeUnits: 0,
    sections: [], groups: [], courses: [], warnings,
  };

  /* ── الترويسة: الصفحة الأولى فوق أول جدول ── */
  const head = (pages[0] || []).map(item => ({ ...item, str: clean(item.str) })).filter(item => item.str);
  const headText = (pred: (item: PlanItem) => boolean) => head.filter(pred).sort((a, b) => b.x - a.x);
  const program = head.find(item => /^BA-\d+$/i.test(item.str));
  plan.program = program ? program.str.toUpperCase() : "";
  if (program) {
    /* اسم البرنامج على سطر رمزه نفسه إلى يساره (الترويسة تُقرأ معكوسة). */
    const title = head.filter(item => Math.abs(item.y - program.y) < 4 && item.x + item.w < program.x && !/^BA-/i.test(item.str)).sort((a, b) => b.str.length - a.str.length)[0];
    plan.programName = title?.str || "";
  }
  const semester = head.find(item => /^الفصل\s.*\d{4}-\d{4}/.test(item.str));
  if (semester) {
    plan.semesterLabel = semester.str;
    const years = semester.str.match(/(\d{4})-(\d{4})/);
    if (years) plan.startYear = Math.min(Number(years[1]), Number(years[2]));
  }
  const collegeItem = head.find(item => item.str.startsWith("كلية "));
  plan.college = collegeItem?.str || "";
  const deptItems = headText(item => item.y > 480 && item.y < 495 && item.str !== ":" && !/^BA-/i.test(item.str) && item.str !== "القسم" && item.str !== "البرنامج");
  plan.department = deptItems.find(item => item.x > 600)?.str || deptItems[0]?.str || "";
  const degree = head.find(item => /^(بكالوريوس|دبلوم|ماجستير|دكتوراه)/.test(item.str));
  plan.degree = degree?.str || "";
  const total = head.find(item => /^\d{2,3}$/.test(item.str) && item.y > 460 && item.y < 480 && item.x < 400);
  plan.degreeUnits = total ? Number(total.str) : 0;
  if (!plan.program) warnings.push("لم يُقرأ رمز البرنامج (BA-…)");
  if (!plan.startYear) warnings.push("لم تُقرأ سنة بدء الخطة");
  if (!plan.degreeUnits) warnings.push("لم يُقرأ عدد وحدات التخرج");
  if (!plan.college) warnings.push("لم تُقرأ الكلية");
  if (!plan.department) warnings.push("لم يُقرأ القسم");
  if (!plan.degree) warnings.push("لم تُقرأ الدرجة العلمية");

  /* ── الجسم: عمودٌ بعد عمود، الأيمن أولاً ثم الأيسر، صفحةً بعد صفحة ── */
  let section: PlanSection | null = null;
  let group: PlanGroup | null = null;
  let current: PlanCourse | null = null;
  /* مجموعةُ «أ أو ب» المفتوحة: أسطرُ «أو» المتتالية تُضاف إليها فلا تنقسم إلى (أ أو ب) و ج. */
  let openAny: string[] | null = null;
  let groupIndex = 0;
  let pending: { course: PlanCourse; group: PlanGroup; unitsMissing: boolean; hoursMissing: boolean } | null = null;
  const pendingAll: Array<NonNullable<typeof pending>> = [];

  /* «تربية عملية» و«التربية العملية» عنوانٌ واحد. */
  const sameTitle = (a: string, b: string) => a.replace(/ال/g, "").replace(/\s+/g, "") === b.replace(/ال/g, "").replace(/\s+/g, "");
  const openGroup = (name: string, units: number | null) => {
    if (!section) { warnings.push(`مجموعة «${name}» قبل أي قسم`); return; }
    /* «تربية عملية (7) وحدة» تُطبع مرتين متتاليتين: الأولى عنوان قسمٍ بلا رقم، والثانية مجموعته.
       فالمجموعةُ الفارغة المكرَّرة ترتفع إلى قسمٍ جديد، ولا تُحسب مجموعتين. */
    if (group && group.sectionNo === section.no && sameTitle(group.name, name) && group.units === units && group.offeredUnits === 0) {
      const no = Math.max(0, ...plan.sections.map(item => item.no)) + 1;
      const own: PlanSection = { no, name, units };
      plan.sections.push(own);
      section = own; groupIndex = 1;
      group.sectionNo = no; group.id = `s${no}g1`;
      return;
    }
    groupIndex += 1;
    const kind: PlanGroupKind = /اختيارية|إختيارية/.test(name) ? "elective" : /التدريب/.test(name) ? "training" : "mandatory";
    group = { id: `s${section.no}g${groupIndex}`, sectionNo: section.no, name, kind, units, offeredUnits: 0 };
    plan.groups.push(group);
    current = null; openAny = null;
  };
  const unitsOf = (text: string): number | null => {
    const hit = text.match(/\((\d+)\)\s*وحدة/);
    return hit ? Number(hit[1]) : null;
  };

  pages.forEach(page => {
    const body = page.map(item => ({ ...item, str: clean(item.str) })).filter(item => item.str && item.y < 456 && item.y > 45);
    for (const colName of ["right", "left"] as ColumnName[]) {
      const band = COLUMNS[colName];
      const column = body.filter(item => (colName === "right" ? item.x >= SPLIT_X : item.x < SPLIT_X));
      for (const line of linesOf(column)) {
        const text = line.items.map(item => item.str).join(" ");
        /* رأس الجدول يتكرر تحت كل مجموعة */
        if (/رمز المقرر/.test(text) && /اسم المقرر/.test(text)) continue;
        const first = line.items[0]?.str || "";
        if (/^-\d\b|^\d-|^\d\.\s*\S/.test(first) || (/^-?\d[-.]?$/.test(first) && line.items.length > 1)) {
          const m = text.replace(/\(\d+\)\s*وحدة/, "").match(/-?(\d)[-.]?\s*(.+)$/);
          const no = m ? Number(m[1]) : plan.sections.length + 1;
          section = { no, name: (m?.[2] || "").trim(), units: unitsOf(text) };
          plan.sections.push(section);
          group = null; current = null; openAny = null; groupIndex = 0;
          continue;
        }
        /* «453 10 +01 تدريب ميداني (2)»: صدى سطرٍ سبق (تقسيم الصفحة)، لا مقرر جديد. */
        if (line.items.some(item => STRAY_CODE.test(item.str))) continue;
        /* متطلبٌ بقوسٍ أو «أو» ملتصقةٍ برمزه («(251 05 01أو»): يُنزع الزائد ويُسجَّل «أو». */
        const glued = line.items.some(item => GLUED_PREREQ.test(item.str) && !CODE.test(item.str));
        if (glued) for (const item of line.items) { const m = item.str.match(GLUED_PREREQ); if (m && !CODE.test(item.str)) item.str = m[1]; }
        const codeItems = line.items.filter(item => CODE.test(item.str));
        const course = codeItems.find(item => inBand(item.x, band.code));
        const prereqs = codeItems.filter(item => inBand(item.x, band.prereq));
        const orMark = glued || line.items.some(item => /(^|\s)أو(\s|$)/.test(item.str));
        const pen = line.items.some(item => /\bPEN\b/.test(item.str));

        if (course) {
          const printed = splitCode(course.str);
          const nameItems = line.items.filter(item => centre(item) > band.name[0] && centre(item) < band.name[1] && item !== course && !CODE.test(item.str));
          const name = nameItems.map(item => item.str).join(" ").trim();
          const num = (b: readonly [number, number]) => line.items.find(item => /^\d{1,2}$/.test(item.str) && inBand(centre(item), b));
          const unitsItem = num(band.units), hoursItem = num(band.hours);
          if (!group) {
            if (section) openGroup(section.name, section.units);
            else { warnings.push(`مقرر ${course.str} قبل أي قسم`); continue; }
          }
          const ids = toCode(printed.college, printed.dept, printed.number);
          const units = unitsItem ? Number(unitsItem.str) : NaN;
          const hours = hoursItem ? Number(hoursItem.str) : NaN;
          openAny = null;
          current = {
            ...ids, college: printed.college, dept: printed.dept, number: printed.number, name,
            units: Number.isFinite(units) ? units : 0, hours: Number.isFinite(hours) ? hours : 0,
            sectionNo: section!.no, groupId: group!.id,
            prereqAll: [], prereqAny: [],
            girlsOnly: /للبنات فقط/.test(name), zeroCredit: Number.isFinite(units) && units === 0,
          };
          plan.courses.push(current);
          group!.offeredUnits += current.units;
          /* الساعات قد تنزل سطراً تحت المقرر: تُلحَق به إن جاءت، وإلا حُذِّر في النهاية. */
          pending = { course: current, group: group!, unitsMissing: !Number.isFinite(units), hoursMissing: !Number.isFinite(hours) };
          pendingAll.push(pending);
        }

        /* رقمٌ وحيد في عمود الوحدات/الساعات تحت مقررٍ ناقص: تتمّة سطره. */
        if (!course && pending && (pending.unitsMissing || pending.hoursMissing) && line.items.every(item => /^\d{1,2}$/.test(item.str) && (inBand(centre(item), band.units) || inBand(centre(item), band.hours)))) {
          for (const item of line.items) {
            if (pending.unitsMissing && inBand(centre(item), band.units)) { pending.course.units = Number(item.str); pending.course.zeroCredit = pending.course.units === 0; pending.group.offeredUnits += pending.course.units; pending.unitsMissing = false; }
            else if (pending.hoursMissing && inBand(centre(item), band.hours)) { pending.course.hours = Number(item.str); pending.hoursMissing = false; }
          }
          continue;
        }

        /* المتطلبات: على سطر المقرر نفسه، أو أسطرٍ تحته بلا رمز مقرر */
        if (current && (prereqs.length || pen || orMark)) {
          const keys = prereqs.map(item => { const c = splitCode(item.str); return toCode(c.college, c.dept, c.number).codeKey; });
          if (orMark || pen) {
            /* «أ أو ب»: أ هو آخر لازمٍ سبق، وما بعد «أو» بدائل */
            if (openAny) {
              /* سطرُ «أو» ثالثٌ فأكثر: يلتحق بالمجموعة المفتوحة */
              openAny.push(...keys);
              if (pen) openAny.push("PEN");
            } else {
              const alternatives: string[] = [];
              const base = current.prereqAll.pop();
              if (base) alternatives.push(base);
              alternatives.push(...keys);
              if (pen) alternatives.push("PEN");
              if (alternatives.length > 1) { current.prereqAny.push(alternatives); openAny = alternatives; }
              else if (alternatives.length === 1) current.prereqAll.push(alternatives[0]);
            }
          } else {
            openAny = null;
            for (const key of keys) if (!current.prereqAll.includes(key)) current.prereqAll.push(key);
          }
          continue;
        }
        if (course) continue;

        /* عنوان مجموعة: «مجموعة إجبارية 2 (12) وحدة» أو «التدريب الميداني (10) وحدة» */
        const unitsHere = unitsOf(text);
        if (unitsHere !== null || /^مجموعة/.test(first)) {
          const name = text.replace(/\(\d+\)\s*وحدة/, "").trim();
          if (name && !/^وحدة$/.test(name)) openGroup(name, unitsHere);
          continue;
        }
        if (/^(الصفحة|SWRCAPP)/.test(text) || /^\d{1,2}-\d{1,2}-\d{4}$/.test(text)) continue;
        warnings.push(`سطرٌ لم يُفهم: «${text.slice(0, 60)}»`);
      }
    }
  });

  for (const item of pendingAll) {
    if (item.unitsMissing) warnings.push(`مقرر ${item.course.code}: لم تُقرأ الوحدات`);
    if (item.hoursMissing) warnings.push(`مقرر ${item.course.code}: لم تُقرأ الساعات`);
  }

  /* ── الفحص بالحساب: كلُّ ما طُبع يجب أن يساوي ما قُرئ ── */
  const byKey = new Map<string, PlanCourse>();
  for (const course of plan.courses) {
    if (byKey.has(course.codeKey)) warnings.push(`رمز مكرر في الخطة: ${course.code}`);
    byKey.set(course.codeKey, course);
  }
  for (const course of plan.courses) {
    const refs = [...course.prereqAll, ...course.prereqAny.flat()].filter(key => key !== "PEN");
    for (const ref of refs) if (!byKey.has(ref)) warnings.push(`متطلب ${ref} في ${course.code} ليس في الخطة`);
    if (course.prereqAll.includes(course.codeKey)) warnings.push(`${course.code} متطلبٌ لنفسه`);
  }
  for (const group of plan.groups) {
    if (group.units === null) continue;
    if (group.kind === "elective") {
      if (group.offeredUnits < group.units) warnings.push(`مجموعة «${group.name}»: المعروض ${countOf(group.offeredUnits, AR.unit)} أقل من المطلوب ${countOf(group.units, AR.unit)}`);
    } else if (group.offeredUnits !== group.units) {
      warnings.push(`مجموعة «${group.name}»: مجموع المقررات ${countOf(group.offeredUnits, AR.unit)} والمطبوع ${countOf(group.units, AR.unit)}`);
    }
  }
  let sum = 0;
  for (const sec of plan.sections) {
    const parts = plan.groups.filter(g => g.sectionNo === sec.no);
    const required = parts.reduce((total, g) => total + (g.units ?? g.offeredUnits), 0);
    if (sec.units !== null && required !== sec.units) warnings.push(`قسم «${sec.name}»: مجموع مجموعاته ${required} والمطبوع ${sec.units}`);
    sum += sec.units ?? required;
  }
  if (plan.degreeUnits && sum !== plan.degreeUnits) warnings.push(`مجموع الأقسام ${countOf(sum, AR.unit)} وعدد وحدات التخرج المطبوع ${plan.degreeUnits}`);
  return plan;
}

/* ── مقارنة خطتين لنفس البرنامج: ما بقي، وما تغيّر رمزه، وما أُلغي أو أُضيف ── */
export interface PlanDiff {
  sameCode: Array<{ code: string; oldName: string; newName: string; unitsChanged: boolean; hoursChanged: boolean }>;
  renumbered: Array<{ oldCode: string; newCode: string; name: string; unitsChanged: boolean; hoursChanged: boolean }>;
  oldOnly: PlanCourse[];
  newOnly: PlanCourse[];
}

export function diffPlans(oldPlan: ParsedPlan, newPlan: ParsedPlan): PlanDiff {
  const newByKey = new Map(newPlan.courses.map(course => [course.codeKey, course] as const));
  const taken = new Set<string>();
  const diff: PlanDiff = { sameCode: [], renumbered: [], oldOnly: [], newOnly: [] };
  for (const old of oldPlan.courses) {
    const same = newByKey.get(old.codeKey);
    if (same) {
      taken.add(same.codeKey);
      diff.sameCode.push({ code: old.codeKey, oldName: old.name, newName: same.name, unitsChanged: old.units !== same.units, hoursChanged: old.hours !== same.hours });
    }
  }
  for (const old of oldPlan.courses) {
    if (newByKey.has(old.codeKey)) continue;
    const match = newPlan.courses.find(course => !taken.has(course.codeKey) && normalizeCourseName(course.name) === normalizeCourseName(old.name));
    if (match) { taken.add(match.codeKey); diff.renumbered.push({ oldCode: old.codeKey, newCode: match.codeKey, name: match.name, unitsChanged: old.units !== match.units, hoursChanged: old.hours !== match.hours }); }
    else diff.oldOnly.push(old);
  }
  diff.newOnly = newPlan.courses.filter(course => !taken.has(course.codeKey));
  return diff;
}
