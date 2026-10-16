/**
 * المرجع المكتوب بيدٍ (technologyEducationCurricula) مقابل طبقة النص في الصحيفتين نفسيهما.
 *
 * تدقيقُ المرجع الأصلي يقارنه بنسخته هو (137 صفاً)، فلا يلتقط خطأ نسخٍ وقع عند الإدخال. هذا
 * الفحص يقارنه بالمصدر: الرمز، الوحدات، الساعات، المتطلبات (وPEN)، حدّ كل مجموعة ونوعها.
 * وحده التصحيح الإملائي في الأسماء مسموحٌ، وبقائمةٍ مسمّاة لا بتساهلٍ عام.
 */
import fs from "fs";
import { extractPlanItems } from "../src/server/planPdfExtract";
import { normalizeCourseName, parsePlanItems, type ParsedPlan } from "../src/utils/planPdfParser";
import { TECHNOLOGY_EDUCATION_CURRICULA } from "../src/data/technologyEducationCurricula";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};

/** تصحيحاتٌ إملائية مقصودة: الاسم المطبوع بإملائه القديم ← الاسم في المرجع. لا يُقبل غيرهما. */
const SPELLING_CORRECTIONS: Record<string, { printed: string; corrected: string }> = {
  "0105107": { printed: "مدخل الى حاسبات الجيب ولاحصاء", corrected: "مدخل إلى حاسبات الجيب والإحصاء" },
  "0109227": { printed: "مبادىءالحاسوب التعليمى", corrected: "مبادئ الحاسوب التعليمي" },
  "0115154": { printed: "سيكلوجيه النمو", corrected: "سيكولوجية النمو" },
  "0115256": { printed: "سيكلوجيه الابتكار", corrected: "سيكولوجية الابتكار" },
  "0115296": { printed: "سيكلوجيه القراءه", corrected: "سيكولوجية القراءة" },
};

(async () => {
  const sources: Array<[string, string]> = [["old", "tech-edu-2010"], ["new", "tech-edu-2026"]];
  for (const [id, file] of sources) {
    const reference = TECHNOLOGY_EDUCATION_CURRICULA.find(item => item.id === id)!;
    const plan: ParsedPlan = parsePlanItems(await extractPlanItems(fs.readFileSync(`tests/fixtures/plans/${file}.pdf`)));
    const ref = new Map<string, { course: any; group: any }>();
    for (const group of reference.groups) for (const course of group.courses) ref.set(course.code, { course, group });
    const printed = new Map(plan.courses.map(course => [course.codeKey, course] as const));
    const problems: string[] = [];

    for (const [key, source] of printed) {
      const hit = ref.get(key);
      if (!hit) { problems.push(`${key} مطبوع وغير موجود في المرجع`); continue; }
      const { course, group } = hit;
      if (course.credit !== source.units) problems.push(`${key} وحدات: مرجع ${course.credit}، مطبوع ${source.units}`);
      if (course.hours !== source.hours) problems.push(`${key} ساعات: مرجع ${course.hours}، مطبوع ${source.hours}`);
      const exception = SPELLING_CORRECTIONS[key];
      const nameOk = exception
        ? course.name === exception.corrected && source.name === exception.printed
        : normalizeCourseName(course.name) === normalizeCourseName(source.name);
      if (!nameOk) problems.push(`${key} اسم: مرجع «${course.name}»، مطبوع «${source.name}»`);
      const refPrereq = course.prerequisites.filter((code: string) => code !== "PEN");
      const wantAll = [...source.prereqAll].sort().join(), haveAll = [...refPrereq].sort().join();
      if (source.prereqAny.length) {
        const alternatives = source.prereqAny.flat().filter(code => code !== "PEN");
        if (haveAll !== [...alternatives].sort().join() || course.externalAlternative !== "PEN") problems.push(`${key} بديل PEN: مرجع [${refPrereq}] + ${course.externalAlternative}`);
      } else if (wantAll !== haveAll || course.externalAlternative) problems.push(`${key} متطلبات: مرجع [${haveAll}]، مطبوع [${wantAll}]`);
      const printedGroup = plan.groups.find(item => item.id === source.groupId)!;
      if (group.requiredUnits !== printedGroup.units) problems.push(`${key} حدّ المجموعة: مرجع ${group.requiredUnits}، مطبوع ${printedGroup.units}`);
      if (group.elective !== (printedGroup.kind === "elective")) problems.push(`${key} نوع المجموعة (اختيارية) يخالف المطبوع`);
    }
    for (const key of ref.keys()) if (!printed.has(key)) problems.push(`${key} في المرجع وغير مطبوع`);
    check(printed.size === ref.size, `${id}: ${printed.size} مقرراً مطبوعاً و${ref.size} في المرجع`);
    check(problems.length === 0, `${id}: المرجع يطابق المطبوع في الرمز والوحدات والساعات والمتطلبات وحدود المجموعات${problems.length ? " — " + problems.join(" | ") : ""}`);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
