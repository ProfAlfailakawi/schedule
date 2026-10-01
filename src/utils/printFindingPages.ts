/**
 * ── الورقة المطبوعة تحمل كلَّ المواعيد، صفحةً صفحة ──────────────────────────
 *
 * كانت ورقةُ مراجعة الاعتماد تطبع خمسة مواعيد من كل ملاحظة ثم «+ 20 موعداً
 * آخر»، وتضع ثلاث ملاحظات في الصفحة الأولى وأربعاً في كل صفحةٍ بعدها مهما
 * طالت. والورقةُ هي ما يُوقَّع عليه: ما لم يُطبع لم يره الموقّع.
 *
 * فصار كلُّ موعدٍ يُطبع، والملاحظاتُ تُرصّ بحسب طولها لا بعددها: كل صفحةٍ
 * منطقية صفحةٌ فعلية واحدة (A4 أفقي)، وما زاد عن صفحةٍ يُكمَل في التي تليها
 * بعنوان «تتمة». الأرقام بالمليمتر، مأخوذةٌ من 08-print.css (صفّا موعدين
 * بخط 7.8pt) ومعايَرة على السعة التي كانت تُطبع سليمةً من قبل.
 */

export interface PrintFindingPiece<T> {
  finding: T;
  rowIds: number[];
  /** 1 للقطعة الأولى من الملاحظة، وما بعدها تتمة. */
  part: number;
  parts: number;
}

export interface PrintPackingGeometry {
  /** ما يتّسع للملاحظات في الصفحة الأولى بعد الترويسة والحلقة والشريط. */
  firstCapacity: number;
  /** ما يتّسع لها في صفحات المتابعة بعد الترويسة وسطر «متابعة التقرير». */
  nextCapacity: number;
  /** رأس الملاحظة: عنوانها وتفصيلها ومادتها. */
  header: number;
  /** صفٌّ من موعدين (الشبكة عمودان). */
  pair: number;
  /** التباعد بين ملاحظتين. */
  gap: number;
  /** خانات التوقيع أسفل الصفحة الأخيرة. */
  signatures: number;
}

/* مقيسةٌ على PDF من Chrome (A4 أفقي، 08-print.css): تبدأ الملاحظات عند 78مم
   في الصفحة الأولى و46مم في صفحات المتابعة، وينتهي المتن عند 183مم؛ رأسُ
   الملاحظة 16مم بسطرين، وصفّ الموعدين 7.1مم، وخانات التوقيع 24مم. الهامشُ
   فوق المقيس متعمَّد: عنوانٌ أو تفصيلٌ يلتفّ سطراً ثالثاً لا يدفع شيئاً إلى
   ورقةٍ لم تُحسب. */
export const PRINT_FINDING_GEOMETRY: PrintPackingGeometry = {
  firstCapacity: 102,
  nextCapacity: 134,
  header: 18,
  pair: 7.3,
  gap: 2.3,
  signatures: 25,
};

const piecesCost = (rows: number, g: PrintPackingGeometry) => g.header + g.gap + Math.ceil(rows / 2) * g.pair;

export function packPrintFindings<T>(
  findings: T[],
  rowIdsOf: (finding: T) => number[],
  geometry: PrintPackingGeometry = PRINT_FINDING_GEOMETRY,
): PrintFindingPiece<T>[][] {
  const g = geometry;
  const pages: Array<{ used: number; pieces: PrintFindingPiece<T>[] }> = [{ used: 0, pieces: [] }];
  const capacityOf = (index: number) => (index === 0 ? g.firstCapacity : g.nextCapacity);
  const newPage = () => { pages.push({ used: 0, pieces: [] }); return pages[pages.length - 1]; };

  for (const finding of findings) {
    const all = [...new Set((rowIdsOf(finding) || []).map(Number).filter(Number.isFinite))];
    const placed: PrintFindingPiece<T>[] = [];
    let rest = all;
    /* حلقةٌ تنتهي بوضع آخر قطعة، لا بفراغ `rest`: ملاحظةٌ بلا مواعيد لها رأسٌ
       يُطبع أيضاً، وكانت تسقط إن لم تتّسع لها الصفحة الجارية. */
    for (;;) {
      const page = pages[pages.length - 1];
      const room = capacityOf(pages.length - 1) - page.used;
      const cost = piecesCost(rest.length, g);
      const place = (rowIds: number[]) => {
        const piece = { finding, rowIds, part: 0, parts: 0 };
        page.pieces.push(piece); page.used += piecesCost(rowIds.length, g); placed.push(piece);
      };
      if (cost <= room) { place(rest); break; }
      /* ما لا يتّسع يُقسم: يأخذ ما بقي من الصفحة ويُكمَل في التالية. ولا تبدأ
         ملاحظةٌ في ذيل صفحةٍ مشغولة بأقلّ من ثلاثة صفوفٍ من مواعيدها. */
      const fitPairs = Math.floor((room - g.header - g.gap) / g.pair);
      const minPairs = page.pieces.length ? 3 : 1;
      if (fitPairs >= minPairs && rest.length > fitPairs * 2) {
        place(rest.slice(0, fitPairs * 2));
        rest = rest.slice(fitPairs * 2);
        newPage();
        continue;
      }
      /* صفحةٌ فارغة لا تتّسع حتى لرأسٍ وصفّ: لا يُعقل بهذه المقاييس، لكن لا تُعلَّق الحلقة. */
      if (!page.pieces.length) { place(rest); break; }
      newPage();
    }
    placed.forEach((piece, index) => { piece.part = index + 1; piece.parts = placed.length; });
  }

  /* خانات التوقيع تحت آخر ملاحظة: إن لم تتّسع لها الصفحة الأخيرة انتقلت معها
     آخرُ ملاحظةٍ إلى صفحةٍ جديدة، فلا تقف التواقيع وحدها على ورقة. */
  const last = pages[pages.length - 1];
  const lastCapacity = capacityOf(pages.length - 1);
  if (last.used + g.signatures > lastCapacity && last.pieces.length > 1) {
    const moved = last.pieces.pop()!;
    pages.push({ used: piecesCost(moved.rowIds.length, g), pieces: [moved] });
  }
  return pages.map(page => page.pieces).filter((page, index) => index === 0 || page.length);
}
