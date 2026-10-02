import { authorityCourseCodeMatches } from "./authorityAcademicCodes";

/**
 * ── كشفُ «المتبقي» من عمادة التسجيل ─────────────────────────────────────────
 *
 * العمادة تعطي القسم كل فصل كشفاً PDF: لكل مقرر عددُ الطلبة الذين لم يسجّلوه
 * بعد. كتابتُه يدوياً أربعين رقماً كل فصل عناءٌ ومصدرُ خطأ، فيُقرأ الملف نفسه.
 *
 * ولا نموذج ثابتاً للكشف نعتمد عليه، فالقراءة بالأعمدة لا بالمواضع المحفوظة:
 *
 *   1) الصفّ صفٌّ لأن فيه رقمَ مقررٍ من مقررات القسم (بقاعدة مطابقة الهيئة
 *      نفسها: 0101102 ↔ 102). الرموز الطويلة أولاً؛ وإن لم يطبع الكشف إلا
 *      ثلاث خانات، فعمودُ الرمز هو الذي تتجمّع فيه المطابقات — كي لا يُحسب
 *      عددٌ مثل 105 مقرراً.
 *   2) الأرقام الأخرى في صفوف المقررات تتجمّع أعمدةً بمواضعها، ولكل عمودٍ
 *      عنوانُه المطبوع فوقه.
 *   3) العمود الذي عنوانه «المتبقي» يُختار تلقائياً؛ وإلا يختار القسم بنفسه
 *      وهو يرى أمثلةً من أرقام كل عمود.
 *   4) المقرر المكرّر في الكشف يُجمع ويُقال ذلك؛ ورموزٌ ليست من مقررات القسم
 *      تُذكر ولا تُستورد.
 *
 * دالةٌ صافية: الخادم يستخرج الخلايا (طبقة النص، وإلا القراءة الضوئية)، وهذه
 * تقرؤها، والواجهة تعرض المعاينة قبل أن يُملأ شيء.
 */

/** خليةٌ من صفحة الكشف، ومواضعها نسبةٌ من عرض الصفحة وارتفاعها (٠–١). */
export interface ReportCell { text: string; x0: number; x1: number; y: number; /** ثقة القراءة الضوئية (٠–١٠٠)؛ طبقة النص بلا ثقة = يقين. */ confidence?: number }

export interface ReportColumn {
  id: number;
  /** مركز العمود (٠–١ من عرض الصفحة). */
  x: number;
  /** العنوان المطبوع فوقه، إن وُجد. */
  label: string;
  /** أمثلةٌ من أرقامه، ليختار القسم وهو يرى. */
  samples: number[];
  /** في كم صفّ مقررٍ ظهر. */
  filled: number;
  /** ما يعنيه العمود إن عُرف عنوانه (columnKind). */
  kind: ColumnKind | null;
}

export interface ReportRow {
  courseId: number;
  /** الرمز كما طُبع في الكشف. */
  printed: string;
  /** رقم العمود ← القيمة (مجموعةً إن تكرّر المقرر). */
  values: Record<number, number>;
  /** رقم العمود ← أدنى ثقةٍ قُرئ بها (لا تُذكر لطبقة النص). */
  confidence: Record<number, number>;
  occurrences: number;
  /** «المقاعد المتبقية» المقروءة لا تساوي «سعة الشعب − عدد المسجلين»: قراءةٌ أخطأت؛ لا تُعتمد. */
  doubt?: { read: number; derived: number };
  /** خانة «المقاعد المتبقية» فارغةٌ بتصميم الكشف (لا شعب للمقرر فيه): لا قيمة تُستورد، ولا تُخمَّن من عمودٍ آخر. */
  blankByDesign?: boolean;
}

export interface RemainingReading {
  columns: ReportColumn[];
  /** عمود «المقاعد المتبقية» (أو عنوانٌ «المتبقي» وحده)؛ null إن لم يوجد — ولا يُستبدل به عمودٌ آخر. */
  column: number | null;
  /** لا بديل: أُبقي للتوافق، وهو null دائماً. */
  fallback: null;
  rows: ReportRow[];
  /** رموزٌ بشكل رموز المقررات وليست من مقررات القسم. */
  foreign: string[];
  /** مقررات القسم التي لم ترد في الكشف. */
  missing: number[];
  /** فجواتٌ بين صفوفٍ مقروءة بقدر سطرٍ أو أكثر: سطرٌ في الكشف لم يُقرأ رقم مقرره. */
  gaps?: Array<{ page: number; after: string; before: string }>;
}

const normalize = (value: string) => String(value || "")
  .normalize("NFKC")
  .replace(/[‎‏‪-‮⁦-⁩]/g, "")
  .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
const fold = (value: string) => normalize(value)
  .replace(/[ً-ْـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase();

/**
 * ما يعنيه عمودٌ من عنوانه، بأعمدة كشف العمادة SWRS136 («احصائية بعدد الطلبة
 * الذين لم يجتازوا المقرر ومسجلين بقوائم الانتظار»):
 *
 *   لم يجتازوا (في بداية التسجيل) · سعة الشعب · عدد المسجلين · المقاعد المتبقية
 *   · عدد الشعب · اعداد الذين لم يسجلوا
 *
 * مدخلُ التخطيط هو «المقاعد المتبقية» وحده — لا «الذين لم يسجلوا» ولا «لم
 * يجتازوا» وإن اشتركت في المعنى القريب. والعنوان يُقرأ بقطعٍ ثابتة لأن القراءة الضوئية تُشوّه أطرافه
 * («اعدد انين أم يسجلرا»)، والنصّ العربي قد يخرج من PDF معكوساً.
 */
export type ColumnKind = "unregistered" | "notPassed" | "seats" | "capacity" | "registered" | "sections" | "remaining";
export const COLUMN_TITLES: Record<ColumnKind, string> = {
  unregistered: "اعداد الذين لم يسجلوا", notPassed: "لم يجتازوا في بداية التسجيل", seats: "المقاعد المتبقية",
  capacity: "سعة الشعب", registered: "عدد المسجلين", sections: "عدد الشعب", remaining: "المتبقي",
};
export function columnKind(label: string): ColumnKind | null {
  const text = fold(label).replace(/\s+/g, "");
  const has = (part: string) => text.includes(part) || [...text].reverse().join("").includes(part);
  /* تشويهات القراءة الضوئية المعروفة: «يسحلوا»، «يجتاروآ»، «بدلية». «لم يجتازوا»
     أولاً: عنوانٌ مثل «الطلبة الذين لم يجتازوا» فيه «الذين» أيضاً. */
  if (has("يجتا") || has("التسجيل") || has("بدايه") || has("بدليه")) return "notPassed";
  if (has("يسجل") || has("يسحل") || has("الذين")) return "unregistered";
  if (has("مقاعد")) return "seats";
  if (has("مسجل")) return "registered";
  if (has("سعه")) return "capacity";
  if (has("عددالشعب")) return "sections";
  if (has("متبق") || has("remain")) return "remaining";
  return null;
}
/** هل هذا عنوانُ عمود «المقاعد المتبقية» (مدخل التخطيط)؟ */
export function labelLooksRemaining(label: string): boolean {
  const kind = columnKind(label);
  return kind === "seats" || kind === "remaining";
}
/** أقلُّ ثقةِ قراءةٍ ضوئية تُقبل بها خانة «المقاعد المتبقية». */
export const MIN_CELL_CONFIDENCE = 55;

interface Token { text: string; x: number; value: number | null; code: string; cell: ReportCell; confidence: number }
interface Line { page: number; y: number; cells: ReportCell[]; tokens: Token[] }

/** الخلايا صفوفاً: ما تقارب ارتفاعُه صفٌّ واحد. */
function linesOf(pages: readonly ReportCell[][]): Line[] {
  const lines: Line[] = [];
  pages.forEach((cells, page) => {
    const sorted = cells.filter(cell => normalize(cell.text).trim()).sort((a, b) => a.y - b.y);
    const groups: Array<{ y: number; cells: ReportCell[] }> = [];
    for (const cell of sorted) {
      const last = groups[groups.length - 1];
      if (last && Math.abs(cell.y - last.y) <= 0.006) { last.cells.push(cell); last.y = last.cells.reduce((sum, item) => sum + item.y, 0) / last.cells.length; }
      else groups.push({ y: cell.y, cells: [cell] });
    }
    for (const group of groups) {
      const tokens: Token[] = [];
      for (const cell of group.cells) {
        const text = normalize(cell.text).trim();
        const parts = text.split(/\s+/).filter(Boolean);
        /* رمزٌ مطبوعٌ مقسوماً في خلية واحدة: «0101 102» أو «0101-102». */
        const joined = /^[\d\s\-–.]+$/.test(text) ? text.replace(/\D/g, "") : "";
        let offset = 0;
        for (const part of parts) {
          const at = text.indexOf(part, offset);
          offset = at + part.length;
          const width = cell.x1 - cell.x0;
          const x = parts.length === 1 ? (cell.x0 + cell.x1) / 2 : cell.x0 + width * ((at + part.length / 2) / Math.max(1, text.length));
          const digits = part.replace(/[,٬]/g, "");
          const value = /^\d{1,6}$/.test(digits) ? Number(digits) : null;
          const code = /^[A-Za-z]{0,5}-?\d{3,8}$/.test(part) ? part.replace(/\D/g, "") : "";
          tokens.push({ text: part, x, value, code, cell, confidence: cell.confidence ?? 100 });
        }
        if (parts.length > 1 && joined.length >= 6 && joined.length <= 8) tokens.push({ text, x: (cell.x0 + cell.x1) / 2, value: null, code: joined, cell, confidence: cell.confidence ?? 100 });
      }
      lines.push({ page, y: group.y, cells: group.cells, tokens });
    }
  });
  return lines;
}

/** مراكزُ متقاربة عمودٌ واحد. */
function clusters(xs: number[], gap = 0.015): number[] {
  const sorted = [...xs].sort((a, b) => a - b);
  const out: Array<{ sum: number; n: number; last: number }> = [];
  for (const x of sorted) {
    const current = out[out.length - 1];
    if (current && x - current.last <= gap) { current.sum += x; current.n++; current.last = x; }
    else out.push({ sum: x, n: 1, last: x });
  }
  return out.map(item => item.sum / item.n);
}
const nearest = (centers: number[], x: number, gap = 0.02) => {
  let best = -1, distance = Infinity;
  centers.forEach((center, index) => { const d = Math.abs(center - x); if (d < distance) { distance = d; best = index; } });
  return distance <= gap ? best : -1;
};

/** الصفوف التي فيها مقررٌ من مقررات القسم، وأعمدةُ أرقامها. */
function tableOf(pages: readonly ReportCell[][], courses: ReadonlyArray<{ id: number; code: string }>, departmentCode: string) {
  const lines = linesOf(pages);
  /* «MATH101» لا يطابق «CS101» وإن اتفقت الأرقام: الحروف إن طُبعت في الطرفين جزءٌ من الرمز. */
  const lettersOf = (value: string) => normalize(value).replace(/[^A-Za-z]/g, "").toUpperCase();
  const matchOf = (token: Token) => {
    const letters = lettersOf(token.text);
    const hits = courses.filter(course => authorityCourseCodeMatches(token.code, course.code, departmentCode)
      && (!letters || !lettersOf(course.code) || lettersOf(course.code) === letters));
    return hits.length === 1 ? hits[0].id : 0;
  };

  /* 1) المرشّحون لرمز المقرر في كل صف: الطويلة أولاً، والثلاثية إن لم يطبع الكشف غيرها. */
  const long = lines.map(line => line.tokens.filter(token => token.code.length >= 4).map(token => ({ token, courseId: matchOf(token) })).filter(item => item.courseId));
  const useLong = long.some(items => items.length);
  const candidates = useLong ? long
    : lines.map(line => line.tokens.filter(token => token.code.length === 3).map(token => ({ token, courseId: matchOf(token) })).filter(item => item.courseId));
  /* عمودُ الرمز حيث تتجمّع المطابقات — في كل صفحةٍ وحدها، فصورتا هاتفٍ لا
     تتطابق حدودهما — ومنه وحده يُؤخذ رمزُ كل صف. */
  const pageList = [...new Set(lines.map(line => line.page))];
  const codeXOf = new Map<number, number>();
  for (const page of pageList) {
    const onPage = candidates.filter((_, index) => lines[index].page === page);
    const centers = clusters(onPage.flat().map(item => item.token.x));
    const hits = centers.map(center => onPage.filter(items => items.some(item => Math.abs(item.token.x - center) <= 0.02)).length);
    if (centers.length) codeXOf.set(page, centers[hits.indexOf(Math.max(...hits))]);
  }
  const inCode = (page: number, x: number) => codeXOf.has(page) && Math.abs(x - codeXOf.get(page)!) <= 0.02;

  const matched: Array<{ line: Line; courseId: number; code: Token }> = [];
  lines.forEach((line, index) => {
    const items = candidates[index];
    if (!items.length) return;
    const pick = codeXOf.has(line.page) ? items.find(item => inCode(line.page, item.token.x)) : items[0];
    if (pick) matched.push({ line, courseId: pick.courseId, code: pick.token });
  });

  /* رموزٌ بطول رموز الكشف في صفوفٍ لم تطابق مقررات القسم. */
  const byLength = new Map<number, number>();
  for (const item of matched) byLength.set(item.code.code.length, (byLength.get(item.code.code.length) || 0) + 1);
  /* لا مطابقة أصلاً (كشف قسمٍ آخر): الرموز الكاملة ذات السبع خانات تُذكر ليُعرف قسمها. */
  const usualLength = [...byLength.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 7;
  const matchedLines = new Set(matched.map(item => item.line));
  const foreign = [...new Set(lines.filter(line => !matchedLines.has(line))
    .flatMap(line => line.tokens.filter(token => token.code.length === usualLength && (usualLength >= 4 || /[A-Za-z]/.test(token.text) || inCode(line.page, token.x))
      && (!codeXOf.has(line.page) || inCode(line.page, token.x))).map(token => token.text)))].slice(0, 40);

  /* صفوف مقرراتٍ ليست من القسم: لا تُستورد ولا تُحسب، لكنها سطورٌ مقروءة —
     فلا تُعدّ «سطراً ناقصاً» بين مقررين من القسم. */
  const foreignLines = lines.filter(line => !matchedLines.has(line) && line.tokens.some(token => token.code.length === usualLength && inCode(line.page, token.x)))
    .map(line => ({ page: line.page, y: line.y }));

  /* 2) الأرقام الأخرى في صفوف المقررات: أعمدةٌ بمواضعها في كل صفحة. */
  const numbers = matched.map(item => item.line.tokens.filter(token => token.cell !== item.code.cell && token.value != null && !inCode(item.line.page, token.x)));
  const pagesWithRows = [...new Set(matched.map(item => item.line.page))];
  const perPage = new Map<number, number[]>();
  for (const page of pagesWithRows) {
    const rows = numbers.filter((_, index) => matched[index].line.page === page);
    const floor = Math.max(1, Math.ceil(rows.length * 0.2));
    perPage.set(page, clusters(rows.flat().map(token => token.x))
      .filter(x => rows.filter(tokens => tokens.some(token => Math.abs(token.x - x) <= 0.02)).length >= floor)
      .sort((a, b) => b - a));
  }

  /* عنوانُ كل عمودٍ في صفحته: النصّ المطبوع فوقه، فوق أول صفّ مقرر. الخليةُ
     لعمودها إن غطّته أو قاربته بنصف عرض عمودٍ معتاد — فعنوانُ عمودٍ خلا من
     الأرقام في هذه الصفحة لا يلتصق بجاره. */
  const firstRowY = new Map<number, number>();
  for (const item of matched) firstRowY.set(item.line.page, Math.min(firstRowY.get(item.line.page) ?? Infinity, item.line.y));
  const headerCellsOf = new Map<number, ReportCell[][]>();
  for (const page of pagesWithRows) {
    const centers = perPage.get(page)!;
    const spacing = centers.slice(1).map((x, index) => centers[index] - x).sort((a, b) => a - b);
    const half = Math.max(0.015, Math.min(0.06, (spacing[Math.floor(spacing.length / 2)] ?? 0.06) / 2));
    const groups: ReportCell[][] = centers.map(() => []);
    for (const line of lines) {
      if (line.page !== page || line.y >= firstRowY.get(page)! || line.y < firstRowY.get(page)! - 0.15) continue;
      for (const cell of line.cells) {
        if (cell.x1 - cell.x0 > 0.25 || !/[ء-يA-Za-z]/.test(normalize(cell.text))) continue;
        const middle = (cell.x0 + cell.x1) / 2;
        let best = -1, distance = Infinity;
        centers.forEach((x, id) => { const d = cell.x0 - 0.01 <= x && x <= cell.x1 + 0.01 ? 0 : Math.abs(middle - x); if (d < distance) { distance = d; best = id; } });
        if (best >= 0 && distance <= half) groups[best].push(cell);
      }
    }
    headerCellsOf.set(page, groups);
  }

  /* 3) هويةُ العمود عبر الصفحات: معناه من عنوانه (columnKind)، وإلا عنوانُه نفسه
     إن طُبع كما هو في صفحةٍ أخرى، وإلا ترتيبُه حين تتساوى الأعمدة، وإلا موضعُه.
     فصورتا هاتفٍ بتأطيرين مختلفين، أو صفحةٌ خلا فيها عمودٌ من الأرقام، تبقى
     أعمدتها هي هي ولا يُسقط عمودٌ قيمَ صفحةٍ أخرى. */
  const keyOf = (label: string) => fold(label).replace(/[^ء-يa-z]/g, "");
  const labelsOf = new Map(pagesWithRows.map(page => [page, headerCellsOf.get(page)!.map(group => labelOf(group))]));
  const keyCount = new Map<string, number>();
  for (const page of pagesWithRows) for (const label of new Set(labelsOf.get(page)!.map(keyOf).filter(Boolean))) keyCount.set(label, (keyCount.get(label) || 0) + 1);
  const identityOf = (label: string) => columnKind(label) ?? ((keyCount.get(keyOf(label)) || 0) > 1 ? `t:${keyOf(label)}` : null);
  const reference = [...pagesWithRows].sort((a, b) => perPage.get(b)!.length - perPage.get(a)!.length || a - b)[0];
  const globals: Array<{ identity: string | null; xs: number[]; labels: string[] }> = [];
  const slotOf = new Map<number, number[]>();
  for (const page of [reference, ...pagesWithRows.filter(page => page !== reference)]) {
    if (page == null) continue;
    const centers = perPage.get(page)!, labels = labelsOf.get(page)!;
    const sameShape = page !== reference && centers.length === perPage.get(reference)!.length;
    const used = new Set<number>();
    slotOf.set(page, centers.map((x, rank) => {
      const identity = identityOf(labels[rank]);
      let slot = identity ? globals.findIndex((global, index) => !used.has(index) && global.identity === identity) : -1;
      if (slot < 0 && page !== reference && sameShape && !used.has(slotOf.get(reference)![rank])) slot = slotOf.get(reference)![rank];
      if (slot < 0 && page !== reference) {
        let best = -1, distance = Infinity;
        globals.forEach((global, index) => { const d = Math.abs(global.xs[0] - x); if (!used.has(index) && d < distance) { distance = d; best = index; } });
        if (best >= 0 && distance <= 0.02) slot = best;
      }
      if (slot < 0) { globals.push({ identity, xs: [], labels: [] }); slot = globals.length - 1; }
      used.add(slot);
      globals[slot].xs.push(x);
      if (labels[rank]) globals[slot].labels.push(labels[rank]);
      globals[slot].identity ??= identity;
      return slot;
    }));
  }
  /* كل صفحةٍ إلى إطار الصفحة المرجعية: x_صفحة = a·x_مرجع + b، من الأعمدة
     المشتركة وعمود الرمز. به يُعرف موضعُ عمودٍ خلا من الأرقام في صفحةٍ (فاتت
     القراءةَ خاناتُه كلها) لتُعاد قراءةُ خاناته، وبه تُرتَّب الأعمدة. */
  const frame = new Map<number, { a: number; b: number }>();
  for (const page of pagesWithRows) {
    if (page === reference) { frame.set(page, { a: 1, b: 0 }); continue; }
    const pairs: Array<[number, number]> = [];
    if (codeXOf.has(reference) && codeXOf.has(page)) pairs.push([codeXOf.get(reference)!, codeXOf.get(page)!]);
    slotOf.get(page)!.forEach((slot, local) => {
      const at = slotOf.get(reference)!.indexOf(slot);
      if (at >= 0) pairs.push([perPage.get(reference)![at], perPage.get(page)![local]]);
    });
    if (pairs.length >= 2) {
      const n = pairs.length, mx = pairs.reduce((sum, [x]) => sum + x, 0) / n, my = pairs.reduce((sum, [, y]) => sum + y, 0) / n;
      const sxx = pairs.reduce((sum, [x]) => sum + (x - mx) ** 2, 0), sxy = pairs.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0);
      const a = sxx > 1e-6 ? sxy / sxx : 1;
      frame.set(page, a > 0.5 && a < 2 ? { a, b: my - a * mx } : { a: 1, b: my - mx });
    } else frame.set(page, { a: 1, b: pairs.length ? pairs[0][1] - pairs[0][0] : 0 });
  }
  const refX = globals.map((_, slot) => {
    const at = slotOf.get(reference)?.indexOf(slot) ?? -1;
    if (at >= 0) return perPage.get(reference)![at];
    for (const page of pagesWithRows) {
      const local = slotOf.get(page)!.indexOf(slot);
      if (local >= 0) { const { a, b } = frame.get(page)!; return (perPage.get(page)![local] - b) / a; }
    }
    return globals[slot].xs[0];
  });
  /* الأعمدة بترتيبها من اليمين في إطار الصفحة المرجعية (الأكثر أعمدة). */
  const order = globals.map((_, index) => index).sort((a, b) => refX[b] - refX[a]);
  const rankOf = new Map(order.map((slot, index) => [slot, index]));
  const columnOf = (page: number, x: number) => {
    const local = nearest(perPage.get(page) || [], x, 0.03);
    return local < 0 ? -1 : rankOf.get(slotOf.get(page)![local])!;
  };
  /* كل صفّ: العمود ← الرقم (أول رقمٍ يقع فيه). */
  const assigned = matched.map((item, index) => {
    const map = new Map<number, Token>();
    for (const token of numbers[index]) { const column = columnOf(item.line.page, token.x); if (column >= 0 && !map.has(column)) map.set(column, token); }
    return map;
  });
  const kept = order.map((slot, id) => ({
    x: refX[slot], labels: globals[slot].labels, identity: globals[slot].identity,
    filled: assigned.filter(map => map.has(id)).length,
  }));
  /* مركز عمودٍ في صفحةٍ بعينها: موضعه المقروء، وإلا موضعه بإطار الصفحة. */
  const xOn = (page: number, id: number) => {
    const local = (slotOf.get(page) || []).indexOf(order[id]);
    if (local >= 0) return perPage.get(page)![local];
    const map = frame.get(page);
    if (!map) return null;
    const x = map.a * refX[order[id]] + map.b;
    return x > 0 && x < 1 ? x : null;
  };
  return { matched, foreign, foreignLines, assigned, kept, xOn };
}

/* العنوان كما يُقرأ: سطراً سطراً من اليمين، والحروف المتلاصقة (يخرجها بعض
   المولّدات حرفاً حرفاً) بلا فراغ بينها. */
function labelOf(cells: ReportCell[]): string {
  const rowsOfLabel: ReportCell[][] = [];
  for (const cell of [...cells].sort((a, b) => a.y - b.y)) {
    const last = rowsOfLabel[rowsOfLabel.length - 1];
    if (last && Math.abs(last[0].y - cell.y) <= 0.006) last.push(cell); else rowsOfLabel.push([cell]);
  }
  const textOf = (row: ReportCell[]) => row.sort((a, b) => b.x1 - a.x1)
    .reduce((text, cell, index, all) => text + (index && all[index - 1].x0 - cell.x1 > 0.004 ? " " : "") + normalize(cell.text).trim(), "");
  return [...new Set(rowsOfLabel.map(textOf))].join(" ").replace(/\s+/g, " ").trim().slice(0, 60);
}

/**
 * خاناتٌ فارغة في صفوف المقررات تحت أعمدة الأرقام. القراءة الضوئية تُسقط
 * العددَ المنفرد («0»، «8»)، فيُعاد قراءةُ هذه الخانات وحدها.
 */
export function blankSpots(pages: readonly ReportCell[][], courses: ReadonlyArray<{ id: number; code: string }>, departmentCode: string): Array<{ page: number; x: number; y: number }> {
  const { matched, assigned, kept, xOn } = tableOf(pages, courses, departmentCode);
  return matched.flatMap((item, index) => kept
    .map((_, id) => ({ id, x: xOn(item.line.page, id) }))
    .filter((column): column is { id: number; x: number } => column.x != null && !assigned[index].has(column.id))
    .map(column => ({ page: item.line.page, x: column.x, y: item.line.y })));
}

export function readRemainingReport(
  pages: readonly ReportCell[][],
  courses: ReadonlyArray<{ id: number; code: string }>,
  departmentCode: string,
): RemainingReading {
  const { matched, foreign, foreignLines, assigned, kept } = tableOf(pages, courses, departmentCode);
  const columns: ReportColumn[] = kept.map((column, id) => {
    const samples = assigned.map(map => map.get(id)?.value).filter((v): v is number => v != null).slice(0, 4);
    /* عنوانٌ عُرف معناه في أيٍّ من الصفحات يكفي، ولو شوّهت القراءةُ غيره. */
    const label = column.labels.find(text => columnKind(text)) || column.labels[0] || "";
    const kind = columnKind(label) ?? (column.identity && !column.identity.startsWith("t:") ? column.identity as ColumnKind : null);
    return { id, x: column.x, label, samples, filled: column.filled, kind };
  });
  const ofKind = (kind: ColumnKind) => columns.filter(column => column.kind === kind).sort((a, b) => b.filled - a.filled)[0]?.id ?? null;
  /* «المقاعد المتبقية» وحدها، وإلا عمودٌ عنوانه «المتبقي» — ولا يُستبدل بها «لم يسجلوا» ولا «لم يجتازوا». */
  const column = ofKind("seats") ?? ofKind("remaining");

  /* 4) الصفوف: المقرر المكرّر يُجمع. */
  const rowsOf = new Map<number, ReportRow>();
  matched.forEach((item, index) => {
    const row = rowsOf.get(item.courseId) || { courseId: item.courseId, printed: item.code.text, values: {}, confidence: {}, occurrences: 0 };
    row.occurrences++;
    for (const [id, token] of assigned[index]) {
      if (token.value == null) continue;
      row.values[id] = (row.values[id] || 0) + token.value;
      row.confidence[id] = Math.min(row.confidence[id] ?? 100, token.confidence);
    }
    rowsOf.set(item.courseId, row);
  });
  const rows = [...rowsOf.values()];

  const registered = ofKind("registered"), capacity = ofKind("capacity"), sections = ofKind("sections");

  /* 5) خانةٌ فارغة بتصميم الكشف: مقررٌ لا شعب له في الكشف (عدد الشعب صفر، أو
     السعة والمسجّلون فارغان معها). لا قيمة تُستورد له، ولا تُخمَّن من جاره. */
  if (column != null) for (const row of rows) {
    if (row.values[column] != null) continue;
    const noSections = sections != null ? row.values[sections] === 0
      : (capacity == null || row.values[capacity] == null) && (registered == null || row.values[registered] == null);
    if (noSections) row.blankByDesign = true;
  }

  /* 6) حسابُ الكشف يفحص القراءة: «المقاعد المتبقية» = «سعة الشعب» − «عدد المسجلين».
     يُفحص حين تُقرأ الثلاثة؛ وخلافُها قراءةٌ أخطأت — لا يُعتمد الرقم، ويُطلب أوضح. */
  if (column != null && registered != null && capacity != null) for (const row of rows) {
    const read = row.values[column], cap = row.values[capacity], enrolled = row.values[registered];
    if (read == null || cap == null || enrolled == null) continue;
    const derived = Math.max(0, cap - enrolled);
    if (read !== derived) row.doubt = { read, derived };
  }
  const seen = new Set(rows.map(row => row.courseId));
  /* 7) سطرٌ ضاع رقم مقرره (القراءة الضوئية أسقطته) يترك فجوةً بين جارَيه بقدر
     سطرٍ كامل: يُذكر ولا يُسكت عنه، فلا يبدو الكشف مكتملاً وهو ناقص. */
  const gaps: Array<{ page: number; after: string; before: string }> = [];
  for (const page of new Set(matched.map(item => item.line.page))) {
    const lines = [
      ...matched.filter(item => item.line.page === page).map(item => ({ y: item.line.y, code: item.code.text as string | null })),
      ...foreignLines.filter(line => line.page === page).map(line => ({ y: line.y, code: null as string | null })),
    ].sort((a, b) => a.y - b.y);
    const steps = lines.slice(1).map((item, index) => item.y - lines[index].y).filter(step => step > 0.004).sort((a, b) => a - b);
    if (steps.length < 4) continue;
    const pitch = steps[Math.floor(steps.length / 2)];
    lines.slice(1).forEach((item, index) => {
      const before = lines[index];
      /* الفجوة بجوار مقررٍ من خارج القسم لا تُسمّى به: يُذكر أقرب مقررٍ من القسم. */
      if (item.y - before.y > pitch * 1.6) gaps.push({
        page: page + 1,
        after: before.code ?? [...lines.slice(0, index + 1)].reverse().find(line => line.code)?.code ?? "أول الصفحة",
        before: item.code ?? lines.slice(index + 1).find(line => line.code)?.code ?? "آخر الصفحة",
      });
    });
  }
  return { columns, column, fallback: null, rows, foreign, missing: courses.filter(course => !seen.has(course.id)).map(course => course.id), gaps };
}

export type CellState = "read" | "unread" | "noSections" | "mismatch" | "lowConfidence";
/**
 * قيمة «المقاعد المتبقية» لصفّ كما قُرئت من عمودها وحده. خانةٌ فارغة أو
 * ضعيفة القراءة أو تخالف حسابَ الكشف ← لا قيمة (لا تُخمَّن من عمودٍ مجاور).
 */
export function remainingOf(row: Pick<ReportRow, "values" | "doubt" | "blankByDesign"> & Partial<Pick<ReportRow, "confidence">>, columnId: number): { value: number | undefined; state: CellState } {
  if (row.doubt) return { value: undefined, state: "mismatch" };
  const value = row.values[columnId];
  if (value == null) return { value: undefined, state: row.blankByDesign ? "noSections" : "unread" };
  if ((row.confidence?.[columnId] ?? 100) < MIN_CELL_CONFIDENCE) return { value: undefined, state: "lowConfidence" };
  return { value, state: "read" };
}

/** قيم عمود «المقاعد المتبقية»: رقم المقرر ← العدد، لما قُرئ بوضوحٍ فقط. */
export function remainingValues(reading: Pick<RemainingReading, "rows">, columnId: number): Record<string, number> {
  return Object.fromEntries(reading.rows
    .map(row => [String(row.courseId), remainingOf(row, columnId).value] as const)
    .filter((entry): entry is readonly [string, number] => entry[1] != null));
}

/**
 * القسم الذي طُبع له الكشف: من ترويسته («رمز القسم العلمي 0101»)، وإلا من
 * بادئة رموز المقررات ذات السبع خانات إن اتفق أكثرها على قسمٍ واحد.
 */
export function detectReportDepartment(headerText: string, printedCodes: readonly string[]): string | undefined {
  const fromHeader = readReportHeader(headerText).department;
  if (fromHeader) return fromHeader;
  const prefixes = printedCodes.map(code => normalize(code).replace(/\D/g, "")).filter(code => code.length === 7).map(code => code.slice(0, 4));
  if (prefixes.length < 2) return undefined;
  const counts = new Map<string, number>();
  for (const prefix of prefixes) counts.set(prefix, (counts.get(prefix) || 0) + 1);
  const [best, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return n / prefixes.length >= 0.6 ? best : undefined;
}

/**
 * هل رأس الكشف لقسمنا؟ برمزه (بقراءةٍ قد تزيد رقماً واحداً: «0١10١») أو باسمه.
 * لا يكفي تطابق أرقام المقررات وحدها: الأرقام الثلاثية تتكرر بين الأقسام.
 */
export function confirmReportDepartment(headerText: string, departmentCode: string, departmentName = "", detected?: string): { confirmed: boolean; byCode: boolean; byName: boolean } {
  const code = String(departmentCode || "");
  const plain = fold(headerText).replace(/\s+/g, " ");
  const tokens = [...plain.matchAll(/القسم(?:\s*العلمي)?[^\d]{0,8}?([\d\s]{4,9})/g)].map(match => match[1].replace(/\s/g, ""));
  const nearCode = (token: string) => token === code
    || (token.length === code.length + 1 && [...token].some((_, index) => token.slice(0, index) + token.slice(index + 1) === code));
  const byCode = Boolean(code) && (detected === code || tokens.some(nearCode));
  const squash = (value: string) => fold(value).replace(/^قسم\s+/, "").replace(/[^ء-ي0-9]/g, "");
  const name = squash(departmentName);
  const byName = name.length >= 4 && squash(headerText).includes(name);
  return { confirmed: byCode || byName, byCode, byName };
}

export interface ImportAssessment {
  /** يُرفض الملف كله (لا يُطبَّق منه شيء): قسمٌ آخر، أو لا عمود «المقاعد المتبقية»، أو لا خانة واحدة مقروءة. */
  reject: string | null;
  detectedDepartment?: string;
  /** مقرراتٌ لم تُقرأ خانتها (فارغة أو ضعيفة أو تخالف حساب الكشف): تُعرض صفراء فارغة، ولا تُحسب. */
  unread: number[];
  /** مقرراتٌ لا شعب لها في الكشف: لا قيمة تُستورد. */
  noSections: number[];
  read: number;
  /** ملاحظاتٌ صفراء تُعرض ولا تمنع (مثل سطرٍ لم يُقرأ رقم مقرره). */
  notes: string[];
  /** لم يُقرأ في رأس الكشف رمز القسم ولا اسمه: على المستخدم أن يؤكد أن الكشف لقسمه قبل التطبيق (ليس رفضاً). */
  needsDepartmentConfirmation: boolean;
}

/**
 * الحكم على قراءة الكشف قبل أن يُعرض أو يُطبَّق — دالةٌ صافية يستعملها الخادم والاختبار.
 * يُرفض الكشف كله في أربع حالات فقط: قسمٌ آخر، لا مقررات للقسم، لا عمود «المقاعد المتبقية»،
 * ولا خانةً واحدة مقروءة. غير ذلك يُعرض ما قُرئ، وما لم يُقرأ يظهر لصاحبه أصفر فارغاً.
 */
export function assessRemainingImport(
  reading: RemainingReading,
  context: { departmentCode: string; departmentName?: string; headerText?: string },
): ImportAssessment {
  const printed = [...reading.rows.map(row => row.printed), ...reading.foreign];
  const detected = detectReportDepartment(context.headerText || "", printed);
  const selected = context.departmentName ? `«${context.departmentName}» (${context.departmentCode})` : context.departmentCode;
  const base = { detectedDepartment: detected, unread: [] as number[], noSections: [] as number[], read: 0, notes: [] as string[], needsDepartmentConfirmation: false };
  const confirmation = confirmReportDepartment(context.headerText || "", context.departmentCode, context.departmentName, detected);
  if (detected && context.departmentCode && detected !== context.departmentCode && !confirmation.byName) {
    return { ...base, reject: `الكشف لقسمٍ آخر: القسم المختار في النظام ${selected}، والقسم في الكشف ${detected}. اختر القسم الصحيح أو ارفع كشف قسمك — لم يُستورد شيء.` };
  }
  if (!reading.rows.length) {
    return { ...base, reject: reading.foreign.length
      ? `الكشف لا يحوي مقررات القسم المختار ${selected} (فيه رموزٌ مثل ${reading.foreign.slice(0, 3).join("، ")}) — هل هو كشف قسمٍ آخر؟`
      : "لم أجد في الملف أرقام مقررات هذا القسم — تأكد أنه كشف «المقاعد المتبقية» من عمادة التسجيل، وأن الصورة واضحة." };
  }
  if (reading.column == null) {
    return { ...base, reject: "لم أجد في الكشف عمود «المقاعد المتبقية» — وهو وحده ما تُبنى عليه خطة الشعب، فلا يؤخذ عمودٌ آخر بدله. ارفع صورةً أوضح تظهر فيها عناوين الأعمدة، أو الكشف PDF." };
  }
  const states = reading.rows.map(row => ({ id: row.courseId, ...remainingOf(row, reading.column!) }));
  const unread = states.filter(item => item.state !== "read" && item.state !== "noSections").map(item => item.id);
  const noSections = states.filter(item => item.state === "noSections").map(item => item.id);
  const read = states.filter(item => item.state === "read").length;
  if (!read) {
    return { ...base, unread, noSections, read, reject: `لم تُقرأ خانة «المقاعد المتبقية» لأي مقرر — لا شيء يُعرض للمراجعة. ارفع صورةً أوضح (مستقيمة، بإضاءةٍ جيدة، وتظهر الأعمدة كاملة) أو الكشف PDF.` };
  }
  const notes = (reading.gaps || []).map(gap => `سطرٌ لم يُقرأ رقم مقرره بين المقرر ${gap.after} والمقرر ${gap.before} (الصفحة ${gap.page}) — قد يكون مقرراً من مقرراتك؛ أضف قيمته يدوياً إن وُجد.`);
  return { ...base, unread, noSections, read, notes, needsDepartmentConfirmation: !confirmation.confirmed, reject: null };
}

export interface RemainingApplyPlan {
  /** الخريطة الجديدة المحفوظة: رقم المقرر ← العدد. */
  next: Record<string, number>;
  /** كم مقرراً يُكتب له قيمةٌ من الكشف. */
  fromSheet: number;
  /** كم مقرراً يُكتب له قيمةٌ كتبها المستخدم يدوياً. */
  manual: number;
  /** مجموع ما يُكتب (fromSheet + manual). */
  total: number;
  /** مقررات الكشف التي لا تُكتب لها قيمة فتبقى خانتها على حالها (لا صفر ولا تخمين). */
  untouched: number[];
}

/** قيمةٌ كتبها المستخدم: عددٌ صحيح غير سالب، وإلا لا شيء. */
export function manualRemainingValue(raw: unknown): number | undefined {
  const text = normalize(String(raw ?? "")).trim();
  if (!/^\d{1,6}$/.test(text)) return undefined;
  return Number(text);
}

/**
 * ما يُطبَّق من المعاينة — دالةٌ صافية: المقروءُ بوضوح + ما كتبه المستخدم يدوياً فقط.
 * الخانة التي لم تُقرأ تبقى فارغةً (أو على قيمتها المحفوظة سابقاً)، لا تصير صفراً ولا
 * تُؤخذ من عمودٍ مجاور؛ والقيمة المحفوظة سابقاً لمقررٍ لا تُمسّ إلا بقراءةٍ واضحة أو بما كتبه المستخدم.
 */
export function planRemainingApply(
  reading: Pick<RemainingReading, "rows">,
  columnId: number,
  manual: Readonly<Record<string, string | number>> = {},
  previous: Readonly<Record<string, string | number>> = {},
): RemainingApplyPlan {
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(previous)) {
    const kept = manualRemainingValue(value);
    if (kept !== undefined) next[key] = kept;
  }
  let fromSheet = 0, typed = 0;
  const untouched: number[] = [];
  for (const row of reading.rows) {
    const key = String(row.courseId);
    const hand = manualRemainingValue(manual[key]);
    if (hand !== undefined) { next[key] = hand; typed++; continue; }
    const { value } = remainingOf(row, columnId);
    if (value !== undefined) { next[key] = value; fromSheet++; } else untouched.push(row.courseId);
  }
  return { next, fromSheet, manual: typed, total: fromSheet + typed, untouched };
}

/** أبعاد صورة PNG أو JPEG (مع اتجاه EXIF)؛ null لغيرها. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const b = bytes;
  if (b.length > 24 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    return { width: u32(16), height: u32(20) };
  }
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let rotated = false, i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1], length = (b[i + 2] << 8) | b[i + 3];
    if (marker === 0xe1 && String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]) === "Exif") {
      const t = i + 10, little = b[t] === 0x49;
      const u16 = (k: number) => little ? b[k] | (b[k + 1] << 8) : (b[k] << 8) | b[k + 1];
      const u32 = (k: number) => little ? (b[k] | (b[k + 1] << 8) | (b[k + 2] << 16) | (b[k + 3] << 24)) >>> 0 : ((b[k] << 24) | (b[k + 1] << 16) | (b[k + 2] << 8) | b[k + 3]) >>> 0;
      const ifd = t + u32(t + 4), count = ifd + 2 <= b.length ? u16(ifd) : 0;
      for (let e = 0; e < count; e++) {
        const at = ifd + 2 + e * 12;
        if (at + 10 > b.length) break;
        if (u16(at) === 0x0112) { const o = u16(at + 8); rotated = o >= 5 && o <= 8; }
      }
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (b[i + 5] << 8) | b[i + 6], width = (b[i + 7] << 8) | b[i + 8];
      return rotated ? { width: height, height: width } : { width, height };
    }
    i += 2 + length;
  }
  return null;
}

/** كشف العمادة عريضٌ (أفقي): صورةٌ طوليّة لا تُقرأ أعمدتها كاملة — تُرفض قبل القراءة. */
export function imageOrientationRefusal(bytes: Uint8Array, fileName = ""): string {
  const size = imageSize(bytes);
  if (!size || !size.width || !size.height) return "";
  if (size.height > size.width * 1.05) {
    return `${fileName ? `«${fileName}»: ` : ""}الصورة طوليّة (${size.width}×${size.height}) وكشف العمادة عريض — صوّره أفقياً (أدِر الهاتف) لتظهر أعمدته كاملة، ثم ارفعه.`;
  }
  return "";
}

/**
 * ترويسة الكشف: القسم والفصل كما طبعتهما العمادة، ليُنبَّه القسم إن رفع كشف
 * قسمٍ آخر أو فصلٍ آخر — والرموز الثلاثية (102) تطابق مقرراتِ أيِّ قسمٍ بالخطأ.
 *   «رمز القسم العلمي 0101 التربيه الاسلاميه»
 *   «الفصل الدراسي : 202420 الفصل الدراسي الثاني 2025-2024»
 */
export function readReportHeader(text: string): { department?: string; season?: "first" | "second" | "summer"; years?: [number, number] } {
  const plain = fold(text).replace(/\s+/g, " ");
  const department = plain.match(/القسم العلمي\s*:?\s*(\d{4})(?!\d)/)?.[1];
  const named = plain.match(/(الاول|الثاني|الصيفي)\s*(\d{4})\s*[-/]\s*(\d{4})/);
  const coded = plain.match(/(?<!\d)(20\d{2})(10|20|30)(?!\d)/);
  const season = named ? ({ "الاول": "first", "الثاني": "second", "الصيفي": "summer" } as const)[named[1] as "الاول"]
    : coded ? ({ "10": "first", "20": "second", "30": "summer" } as const)[coded[2] as "10"] : undefined;
  const years = named ? [Math.min(Number(named[2]), Number(named[3])), Math.max(Number(named[2]), Number(named[3]))] as [number, number]
    : coded ? [Number(coded[1]), Number(coded[1]) + 1] as [number, number] : undefined;
  return { ...(department ? { department } : {}), ...(season ? { season } : {}), ...(years ? { years } : {}) };
}
