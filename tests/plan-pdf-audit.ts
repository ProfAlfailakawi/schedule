/**
 * قارئ «الخطة الدراسية» على صحيفتَي تكنولوجيا التعليم الحقيقيتين (2010 و2026):
 * كل مجموعةٍ وقسمٍ وعددِ وحدات التخرج يطابق المطبوع (بلا تحذيرات)، والمتطلبات
 * وPEN و«للبنات فقط» والمقرر الصفري كما طُبعت، ومقارنة الخطتين.
 */
import fs from "fs";
import { extractPlanItems, PLAN_PDF_MAX_BYTES } from "../src/server/planPdfExtract";
import { diffPlans, normalizeCourseName, parsePlanItems, type ParsedPlan } from "../src/utils/planPdfParser";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const load = async (name: string): Promise<ParsedPlan> => parsePlanItems(await extractPlanItems(fs.readFileSync(`tests/fixtures/plans/${name}.pdf`)));

(async () => {
  const fresh = await load("tech-edu-2026"), legacy = await load("tech-edu-2010");

  /* ── الترويسة والمجاميع ── */
  check(fresh.program === "BA-0115" && legacy.program === "BA-0115", "رمز البرنامج BA-0115 في الخطتين");
  check(fresh.startYear === 2026 && legacy.startYear === 2010, "سنة بدء الخطة: 2026 و2010 (المطبوع معكوساً 2027-2026)");
  check(fresh.department === "تكنولوجيا التعليم" && fresh.college === "كلية التربية الأساسية", "القسم والكلية");
  check(fresh.degreeUnits === 125 && legacy.degreeUnits === 130, "وحدات التخرج 125 و130");
  check(fresh.courses.length === 64 && legacy.courses.length === 73, "عدد المقررات 64 و73");
  check(fresh.warnings.length === 0, `الجديدة: كل المجاميع تطابق المطبوع (${fresh.warnings.join(" | ") || "بلا تحذيرات"})`);
  check(legacy.warnings.length === 0, `القديمة: كل المجاميع تطابق المطبوع (${legacy.warnings.join(" | ") || "بلا تحذيرات"})`);
  check(JSON.stringify(fresh.sections.map(s => s.units)) === "[25,66,24,10]", "أقسام الجديدة 25 + 66 + 24 + 10");
  check(JSON.stringify(legacy.sections.map(s => s.units)) === "[30,60,40]", "أقسام القديمة 30 + 60 + 40");
  const groupUnits = (plan: ParsedPlan) => plan.groups.map(g => `${g.kind[0]}${g.units}`).join(",");
  check(groupUnits(fresh) === "m9,m12,e3,e1,m60,e6,m24,t10", `مجموعات الجديدة: ${groupUnits(fresh)}`);
  check(groupUnits(legacy) === "m9,m15,e4,e2,m51,e9,m40", `مجموعات القديمة: ${groupUnits(legacy)}`);

  /* ── المقررات كما طُبعت ── */
  const get = (plan: ParsedPlan, key: string) => plan.courses.find(c => c.codeKey === key)!;
  const shaky = get(fresh, "0109105");
  check(shaky.name === "أسس تكنولوجيا التعليم" && shaky.units === 3 && shaky.hours === 3 && shaky.prereqAll.length === 0, "0109105: الاسم والوحدات والساعات بلا متطلب");
  check(JSON.stringify(get(fresh, "0109322").prereqAll) === '["0109220","0109221","0109233"]', "0109322: ثلاثة متطلبات كلها لازمة (أسطر تحت المقرر)");
  check(get(fresh, "0109123").hours === 4 && JSON.stringify(get(fresh, "0109123").prereqAll) === '["0109105","0109108"]', "0109123: أربع ساعات ومتطلبان");
  check(get(fresh, "0109498").units === 4 && get(fresh, "0109498").hours === 12, "0109498: ساعاتٌ من خانتين (12)");
  check(JSON.stringify(get(fresh, "0130164").prereqAny) === '[["0130099","PEN"]]' && get(fresh, "0130164").prereqAll.length === 0, "الإنجليزية (1): المتطلب «99 30 01 أو PEN» بديلٌ لا لازم");
  const remedial = get(fresh, "0130099");
  check(remedial.zeroCredit && remedial.units === 0 && remedial.hours === 5 && remedial.code === "013099", "013099: صفري الوحدات بخمس ساعات، ورمزه بخانتين محفوظ بالصيغتين");
  check(get(legacy, "0109468").prereqAll.length === 17 && get(fresh, "0109468").prereqAll.length === 1, "مشروع التخرج: 17 متطلباً في القديمة ومتطلب واحد في الجديدة (رمزٌ واحد، خطتان)");
  check(legacy.courses.filter(c => c.girlsOnly).map(c => c.codeKey).join() === "0111148,0111198" && fresh.courses.every(c => !c.girlsOnly), "«للبنات فقط»: مقرران في القديمة ولا شيء في الجديدة");
  check(get(legacy, "0109491").units === 9 && get(legacy, "0109491").hours === 16, "التدريب الميداني القديم: 9 وحدات و16 ساعة");
  check(fresh.courses.every(c => /^\d{7}$/.test(c.codeKey)) && legacy.courses.every(c => /^\d{7}$/.test(c.codeKey)), "كل مفتاح مقرر سبعُ خانات (كلية+قسم+رقم)");
  check(!fresh.courses.some(c => /[()]{2}|\)\d\(/.test(c.name)) && get(fresh, "0102114").name === "لغة عربية (1)", "الأقواس المعكوسة في النص تُصحَّح: «لغة عربية (1)»");
  check(!legacy.courses.some(c => c.college !== "01"), "الكلية 01 في كل الرموز (التربية الأساسية)");

  /* ── مقارنة الخطتين ── */
  const diff = diffPlans(legacy, fresh);
  check(diff.sameCode.length === 5 && diff.sameCode.every(row => !row.unitsChanged), "5 مقررات بالرمز نفسه، وحداتها لم تتغير");
  check(diff.renumbered.length === 10, "10 مقررات بالاسم نفسه برمزٍ مختلف");
  check(diff.renumbered.some(r => r.oldCode === "0114284" && r.newCode === "0121284") && diff.renumbered.some(r => r.oldCode === "0109499" && r.newCode === "0109492" && r.unitsChanged), "المناهج 0114284→0121284؛ حلقة البحث 0109499→0109492 مع تغيّر الوحدات");
  check(diff.oldOnly.length === 58 && diff.newOnly.length === 49, `قديمة بلا مقابل 58، وجديدة بلا مقابل 49 (${diff.oldOnly.length}/${diff.newOnly.length})`);
  check(normalizeCourseName("الثقافه العلميه") === normalizeCourseName("الثقافة العلمية"), "مطابقة الأسماء تتجاوز الهاء/التاء المربوطة");

  /* ── أسطر «أو» المتتالية تبقى مجموعةً واحدة، وغياب الترويسة تحذير ── */
  const rowsOf = (...rows: Array<[number, number, string]>) => rows.map(([x, y, str]) => ({ str, x, y, w: 40 }));
  const synthetic = parsePlanItems([rowsOf(
    [690, 500, "الكلية"], [700, 503, "كلية التربية"], [260, 503, "الفصل الدراسي الاول 2027-2026"],
    [685, 448, "-1 مقررات ثقافية عامة"], [509, 448, ")3( وحدة"],
    [702, 432, "مجموعة إجبارية"], [514, 432, ")3( وحدة"],
    [707, 405, "114 02 01"], [654, 405, "لغة"], [525, 405, "3"], [491, 405, "3"],
    [424, 393, "101 02 01"], [430, 381, "أو"], [424, 381, "102 02 01"], [430, 369, "أو"], [424, 369, "103 02 01"],
  )]);
  const only = synthetic.courses[0];
  check(JSON.stringify(only?.prereqAny) === '[["0102101","0102102","0102103"]]' && only?.prereqAll.length === 0, "أ ثم «أو ب» ثم «أو ج» = (أ أو ب أو ج) لا (أ أو ب) و ج");
  check(synthetic.warnings.some(w => /الكلية|القسم|الدرجة/.test(w)), "ترويسةٌ ناقصة (قسم/درجة) تُنتج تحذيراً لا قراءةً صامتة");

  /* ── ملفٌ غير موثوق ── */
  let refused = false;
  try { await extractPlanItems(new Uint8Array(PLAN_PDF_MAX_BYTES + 1)); } catch { refused = true; }
  check(refused, "ملفٌ أكبر من الحدّ يُرفض قبل القراءة");
  const empty = parsePlanItems([[]]);
  check(empty.courses.length === 0 && empty.warnings.length > 0, "ملفٌ بلا صحيفة: لا مقررات وتحذيرات صريحة، لا استثناء");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
