/**
 * كشف SWRS136 الحقيقي (التربية الإسلامية 0101، الفصل 202420) مصوَّراً بالهاتف —
 * صفحتان. القراءة الضوئية الحقيقية، لا خلايا مصطنعة:
 *  • الواضح: كل مقررات الصفحتين (٣٨) تُقرأ، و«المقاعد المتبقية» صحيحةٌ كلها،
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

/* المفتاح الصحيح كما يُقرأ من الورقة (سطراً سطراً بعدد الصفوف). null = لا شعب. */
const truth: Record<string, number | null> = {
  "102": 1336, "120": null, "150": 150, "151": 435, "153": 350, "154": 70, "155": 340, "156": 350, "162": 210, "201": 256,
  "202": 280, "204": 350, "205": 70, "206": 420, "208": 140, "209": 70, "250": 70, "251": 140, "252": 350, "253": 70,
  "254": 210, "255": null, "257": null, "258": 70, "262": 140, "263": 70, "264": 70, "301": 70, "302": 210, "304": 210,
  "306": 490, "356": 210, "357": 280, "402": 280, "405": 140, "406": 420, "407": 140, "456": 70,
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
  check(reading.rows.length === 38 && reading.missing.length === 0, "كل مقررات الصفحتين (٣٨) قُرئت — بما فيها رموزٌ أسقطت القراءةُ الأولى رقماً منها (252، 255)", reading.missing);
  const wrong: string[] = [], unread: string[] = [];
  for (const row of reading.rows) {
    const code = catalogue.find(course => course.id === row.courseId)!.code.slice(4);
    const { value } = remainingOf(row, reading.column!);
    if (truth[code] == null) { if (value !== undefined) wrong.push(`${code}=${value} (بلا شعب)`); continue; }
    if (value === undefined) unread.push(code); else if (value !== truth[code]) wrong.push(`${code}=${value}≠${truth[code]}`);
  }
  check(wrong.length === 0, "لا قيمة خاطئة: «المقاعد المتبقية» تطابق الورقة، والمقرر بلا شعب بلا رقم", wrong);
  check(unread.length === 0, "ولا خانة ناقصة", unread);
  check(confirmReportDepartment(cells.headerText, "0101", "التربية الإسلامية").confirmed, "القسم يُتحقق منه من رأس الكشف رغم تشوّه القراءة («دمر القسم 0١10١»)");

  /* القسم المخالف: الأرقام الثلاثية نفسها في كتالوج قسمٍ آخر — لا يجوز أن تُطبَّق. */
  const other = catalogueFor("0202");
  const otherReading = readRemainingReport(cells.pages, other, "0202");
  const otherAssessment = assessRemainingImport(otherReading, { departmentCode: "0202", departmentName: "الرياضيات", headerText: cells.headerText });
  check(Boolean(otherAssessment.reject) || otherAssessment.needsDepartmentConfirmation, "كشف قسمٍ آخر لا يُطبَّق ولو تطابقت أرقام المقررات: رفض، أو تأكيدٌ صريح من المستخدم لا غير", otherAssessment);
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
      const applied = planRemainingApply(poorReading, poorReading.column!);
      check(applied.total === poorRead && Object.entries(applied.next).every(([id, value]) => truth[catalogue.find(course => course.id === Number(id))!.code.slice(4)] === value),
        "الصورة الرديئة: ما يُطبَّق هو المقروء وحده، وكله يطابق الورقة", applied);
    }
    check(Boolean(poorAssessment.reject) || poorWrong.length === 0, "الصورة الرديئة: رفضٌ، أو قبولٌ جزئي بلا قيمةٍ خاطئة واحدة (والناقص يُعرض أصفر)", { poorWrong, poorRead });
  }
}

main().then(() => {
  console.log(`\nSWRS136 real photos: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}).catch(error => { console.error(error); process.exit(1); });
