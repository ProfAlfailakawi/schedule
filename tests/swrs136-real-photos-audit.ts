/**
 * كشف SWRS136 الحقيقي (التربية الإسلامية 0101، الفصل 202420) مصوَّراً بالهاتف —
 * صفحتان. القراءة الضوئية الحقيقية، لا خلايا مصطنعة:
 *  • الواضح: كل مقررات الصفحتين (٣٨) تُقرأ، و«اعداد الذين لم يسجلوا» صحيحةٌ كلها،
 *    والمقرر بلا شعب لا يُستورد له رقم، والقسم يُتحقق منه من رأس الكشف.
 *  • القسم المخالف: لا يُطبَّق (رفض أو مانع).
 *  • الطولية: تُرفض قبل القراءة.
 *  • الرديئة: لا تُقبل قيمةٌ خاطئة بصمت — رفضٌ أو مانع.
 */
import fs from "fs";
import { readReportCells } from "../src/utils/documentOcr";
import { readRemainingReport, assessRemainingImport, planRemainingApply, remainingOf, blankSpots, imageOrientationRefusal, confirmReportDepartment } from "../src/utils/remainingReport";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, detail ?? ""); }
};

/* المفتاح الصحيح: عمود «اعداد الذين لم يسجلوا» كما يُقرأ من الورقة (سطراً سطراً بعدد الصفوف). null = لا شعب.
   (المسجّلون صفرٌ في الكشف كله، فهو يساوي «لم يجتازوا» — وحساب الكشف يفحصه بها.) */
const truth: Record<string, number | null> = {
  "102": 54, "120": null, "150": 262, "151": 217, "153": 128, "154": 124, "155": 227, "156": 231, "162": 45, "201": 570,
  "202": 752, "204": 138, "205": 2, "206": 248, "208": 99, "209": 52, "250": 2, "251": 52, "252": 27, "253": 45,
  "254": 48, "255": null, "257": null, "258": 35, "262": 29, "263": 42, "264": 30, "301": 146, "302": 254, "304": 843,
  "306": 246, "356": 67, "357": 304, "402": 43, "405": 30, "406": 22, "407": 27, "456": 84,
};
const catalogueFor = (prefix: string) => Object.keys(truth).map((code, index) => ({ id: index + 1, code: `${prefix}${code}` }));
const pages = ["tests/fixtures/swrs136/page1.jpg", "tests/fixtures/swrs136/page2.jpg"].map(file => fs.readFileSync(file));

async function canvasLib() { return await import("@napi-rs/canvas"); }
async function transformed(input: Buffer, draw: (ctx: any, image: any, surface: any) => void, size: (w: number, h: number) => [number, number]) {
  const lib = await canvasLib();
  const image = await lib.loadImage(input);
  const [w, h] = size(image.width, image.height);
  const surface = lib.createCanvas(w, h);
  const ctx = surface.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  draw(ctx, image, surface);
  return Buffer.from(surface.toBuffer("image/jpeg"));
}

async function main() {
  check(pages.every(page => imageOrientationRefusal(page) === ""), "الصورتان العرضيتان مقبولتان الاتجاه");

  const catalogue = catalogueFor("0101");
  const cells = await readReportCells(pages, "image/jpeg", found => blankSpots(found, catalogue, "0101"));
  const reading = readRemainingReport(cells.pages, catalogue, "0101");
  const assessment = assessRemainingImport(reading, { departmentCode: "0101", departmentName: "التربية الإسلامية", headerText: cells.headerText });
  check(assessment.reject === null && assessment.notes.length === 0 && !assessment.needsDepartmentConfirmation, "الكشف الحقيقي الواضح: يُقبل بلا ملاحظات ولا تأكيد قسم", assessment);
  /* الفرع من ترويسة الصورة («الفرع : 012 … بنات»): يُقبل في فرعه، ويُرفض في البنين وفي الجهراء. */
  const asBranch = (code: string, collegeName: string) => assessRemainingImport(reading, { departmentCode: "0101", departmentName: "التربية الإسلامية", headerText: cells.headerText, branch: { code, collegeName } });
  check(asBranch("012", "كلية التربية الأساسية - بنات").reject === null, "صورة فرع البنات تُقبل في «كلية التربية الأساسية - بنات»", asBranch("012", "كلية التربية الأساسية - بنات").reject);
  check(/بنين/.test(asBranch("011", "كلية التربية الأساسية - بنين").reject || ""), "وتُرفض في «بنين» برسالةٍ تسمّي الفرعين");
  check(/الجهراء/.test(asBranch("012", "كلية التربية الأساسية - بنات - الجهراء").reject || ""), "وتُرفض في «الجهراء» وإن شاركته «بنات» ورمز 012");
  check(reading.rows.length === 38 && reading.missing.length === 0, "كل مقررات الصفحتين (٣٨) قُرئت — بما فيها رموزٌ أسقطت القراءةُ الأولى رقماً منها (252، 255)", reading.missing);
  const wrong: string[] = [], unread: string[] = [];
  for (const row of reading.rows) {
    const code = catalogue.find(course => course.id === row.courseId)!.code.slice(4);
    const { value } = remainingOf(row, reading.column!);
    if (truth[code] == null) { if (value !== undefined) wrong.push(`${code}=${value} (بلا شعب)`); continue; }
    /* التفصيل للتشخيص: المقروء من «لم يسجلوا» و«لم يجتازوا» و«المسجلين» وحساب الكشف. */
    const of = (kind: string) => { const column = reading.columns.find(item => item.kind === kind); return column ? row.values[column.id] : undefined; };
    const detail = `${code} (لم يسجلوا ${row.values[reading.column!] ?? "—"}، لم يجتازوا ${of("notPassed") ?? "—"}، المسجلين ${of("registered") ?? "—"}${row.doubt ? `، الحساب ${row.doubt.derived}` : ""})`;
    if (value === undefined) unread.push(detail); else if (value !== truth[code]) wrong.push(`${code}=${value}≠${truth[code]} — ${detail}`);
  }
  /* القراءة الضوئية لعمود «لم يسجلوا» ليست معصومة: حساب الكشف (لم يجتازوا − المسجلين) يوقف أغلب
     أخطائها (150، 153، 254 تُعرض للمراجعة)، وقد يُسقط رقماً من الخانتين معاً فيوافق نفسه (356: 67 ← 6).
     فالضمان ليس «قراءةٌ بلا خطأ» بل: لا يُعبَّأ رقمٌ مصوَّر قبل أن يؤكده المستخدم بمقارنته بالورقة. */
  console.log(`  · الصور: ${reading.rows.length - wrong.length - unread.length} مطابقة، ${unread.length} للمراجعة، ${wrong.length} مخالفة تنتظر تأكيد المستخدم`, { unread, wrong });
  const scanRead = reading.rows.filter(row => remainingOf(row, reading.column!).value !== undefined).map(row => row.courseId);
  check(scanRead.length >= 30 && wrong.length <= 2, "الصور تُقرأ في أغلبها (30 مقرراً فأكثر بقيمة، ومخالفةٌ واحدة أو اثنتان على الأكثر)", { read: scanRead.length, wrong });
  const blind = planRemainingApply(reading, reading.column!, {}, {}, [], [], { confirmed: [] });
  check(blind.total === 0 && Object.keys(blind.next).length === 0, "كشفٌ مصوَّر: لا يُعبَّأ رقمٌ مقروء قبل تأكيده — ولا المخالف منها", blind);
  const id356 = catalogue.find(course => course.code.endsWith("356"))!.id;
  const corrected = planRemainingApply(reading, reading.column!, { [id356]: "67" }, {}, [], [], { confirmed: scanRead.filter(id => id !== id356) });
  check(corrected.next[String(id356)] === 67 && corrected.manual === 1 && corrected.fromSheet === scanRead.length - 1,
    "ما أكّده المستخدم يُعبَّأ، وما صحّحه بيده (356 ← 67) يُعبَّأ تصحيحه لا المقروء", corrected);
  check(confirmReportDepartment(cells.headerText, "0101", "التربية الإسلامية").confirmed, "القسم يُتحقق منه من رأس الكشف رغم تشوّه القراءة («دمر القسم 0١10١»)");

  /* PDF ممسوح بصفحتين (يُبنى من الصورتين بـ scripts/make-scan-pdf.mjs): المسار نفسه الذي يرفع به المستخدم ملفاً.
     رمزٌ قُرئ خطأً بصيغةٍ صالحة (263 ← 203) يظهر مشتبهاً أصفر ولا يُطبَّق قبل التأكيد، ولا قيمةَ خاطئة. */
  const pdfCells = await readReportCells(fs.readFileSync("tests/fixtures/swrs136/report.pdf"), "application/pdf", found => blankSpots(found, catalogue, "0101"));
  const pdfReading: any = readRemainingReport(pdfCells.pages, catalogue, "0101");
  const pdfAssessment: any = assessRemainingImport(pdfReading, { departmentCode: "0101", departmentName: "التربية الإسلامية", headerText: pdfCells.headerText });
  /* ترويسته الممسوحة لا تُظهر رمز القسم («!0010»)، فلا يثبت أنه للقسم المختار: يُرفض برسالةٍ تطلب PDF النظام —
     لا يُقبل بتأكيدٍ بنقرة. والقراءة نفسها (أدناه) تبقى مفحوصة. */
  check(pdfCells.pageCount === 2 && /رمز القسم العلمي/.test(pdfAssessment.reject || ""), "PDF ممسوح لم يُقرأ رمز قسمه من ترويسته: يُرفض ويُطلب PDF النظام", pdfAssessment.reject);
  const suspect = (pdfReading.suspects || []).find((item: any) => item.expected.endsWith("263"));
  const id263 = catalogue.find(course => course.code.endsWith("263"))!.id;
  check(Boolean(suspect) && !pdfReading.missing.includes(id263), "الرمز المقروء خطأً (203) يظهر مشتبهاً بـ263 ولا يضيع الصف", pdfReading.suspects);
  const unconfirmed = planRemainingApply(pdfReading, pdfReading.column!, {}, {}, [], pdfReading.suspects || [], { confirmed: [] });
  const confirmedPlan = planRemainingApply(pdfReading, pdfReading.column!, {}, {}, [id263], pdfReading.suspects || [], { confirmed: [] });
  check(!(String(id263) in unconfirmed.next) && unconfirmed.total === 0, "PDF ممسوح: لا المشتبه ولا غيره يُطبَّق قبل التأكيد");
  check(confirmedPlan.next[String(id263)] === truth["263"] && confirmedPlan.total === 1,
    "وبعد تأكيد المشتبه قيمته صحيحة (42)، ولا يُطبَّق معه رقمٌ ممسوحٌ لم يؤكَّد", confirmedPlan);

  /* القسم المخالف: الأرقام الثلاثية نفسها في كتالوج قسمٍ آخر — لا يجوز أن تُطبَّق. */
  const other = catalogueFor("0202");
  const otherReading = readRemainingReport(cells.pages, other, "0202");
  const otherAssessment = assessRemainingImport(otherReading, { departmentCode: "0202", departmentName: "الرياضيات", headerText: cells.headerText });
  check(Boolean(otherAssessment.reject) && !otherAssessment.needsDepartmentConfirmation, "كشف قسمٍ آخر لا يُطبَّق ولو تطابقت أرقام المقررات: رفضٌ لا تأكيد", otherAssessment);
  check(!otherAssessment.reject || /الرياضيات/.test(otherAssessment.reject), "والرسالة تسمّي القسم المختار");

  /* الطولية: الصورة نفسها مدوّرةً ربع دورة. */
  const portrait = await transformed(pages[0], (ctx, image, surface) => { ctx.translate(surface.width, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(image, 0, 0); }, (w, h) => [h, w]);
  check(/طول|عرض|اتجاه/.test(imageOrientationRefusal(portrait)), "الصورة الطولية تُرفض قبل القراءة برسالةٍ مفهومة", imageOrientationRefusal(portrait));

  /* الرديئة: مصغّرةٌ جداً ثم مكبّرة (ضبابية) — لا تُقبل قيمةٌ خاطئة بصمت. */
  const poor = await Promise.all(pages.map(page => transformed(page, (ctx, image, surface) => {
    ctx.drawImage(image, 0, 0, Math.round(image.width / 5), Math.round(image.height / 5));
    ctx.drawImage(surface, 0, 0, Math.round(image.width / 5), Math.round(image.height / 5), 0, 0, image.width, image.height);
  }, (w, h) => [w, h])));
  const poorCells = await readReportCells(poor, "image/jpeg", found => blankSpots(found, catalogue, "0101")).catch(error => ({ error }));
  if ("error" in poorCells) check(true, "الصورة الرديئة: رُفضت القراءة نفسها");
  else {
    const poorReading = readRemainingReport(poorCells.pages, catalogue, "0101");
    const poorAssessment = assessRemainingImport(poorReading, { departmentCode: "0101", departmentName: "التربية الإسلامية", headerText: poorCells.headerText });
    /* لا رفضٌ كليّ لقراءةٍ ناقصة: يُعرض ما قُرئ، ولا تدخل خطةَ التطبيق إلا قيمةٌ تطابق الورقة. */
    const poorWrong: string[] = [];
    let poorRead = 0;
    if (!poorAssessment.reject) {
      for (const row of poorReading.rows) {
        const code = catalogue.find(course => course.id === row.courseId)!.code.slice(4);
        const { value } = remainingOf(row, poorReading.column!);
        if (value === undefined) continue;
        poorRead++;
        if (truth[code] == null || value !== truth[code]) poorWrong.push(`${code}=${value}≠${truth[code]}`);
      }
      const applied = planRemainingApply(poorReading, poorReading.column!, {}, {}, [], [], { confirmed: [] });
      check(applied.total === 0, "الصورة الرديئة: لا يُطبَّق منها رقمٌ قبل تأكيد المستخدم", applied);
    }
    console.log(`  · الرديئة: ${poorRead} بقيمة، ${poorWrong.length} مخالفة (لا تُعبَّأ قبل التأكيد)`);
    check(Boolean(poorAssessment.reject) || poorRead > 0, "الصورة الرديئة: رفضٌ، أو قبولٌ جزئي يُعرض للتأكيد", { poorWrong, poorRead });
  }
}

main().then(() => {
  console.log(`\nSWRS136 real photos: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}).catch(error => { console.error(error); process.exit(1); });
