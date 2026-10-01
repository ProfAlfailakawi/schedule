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
export interface ReportCell { text: string; x0: number; x1: number; y: number }

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
}

export interface ReportRow {
  courseId: number;
  /** الرمز كما طُبع في الكشف. */
  printed: string;
  /** رقم العمود ← القيمة (مجموعةً إن تكرّر المقرر). */
  values: Record<number, number>;
  occurrences: number;
}

export interface RemainingReading {
  columns: ReportColumn[];
  /** العمود الذي عنوانه «المتبقي»، أو null فيختار القسم. */
  column: number | null;
  rows: ReportRow[];
  /** رموزٌ بشكل رموز المقررات وليست من مقررات القسم. */
  foreign: string[];
  /** مقررات القسم التي لم ترد في الكشف. */
  missing: number[];
}

const normalize = (value: string) => String(value || "")
  .normalize("NFKC")
  .replace(/[‎‏‪-‮⁦-⁩]/g, "")
  .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
const fold = (value: string) => normalize(value)
  .replace(/[ً-ْـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase();

/** هل هذا عنوانُ عمود «المتبقي»؟ (والنصّ العربي قد يخرج من PDF معكوساً) */
export function labelLooksRemaining(label: string): boolean {
  const text = fold(label).replace(/\s+/g, "");
  const reversed = [...text].reverse().join("");
  return [text, reversed].some(item => item.includes("متبق") || item.includes("remain"));
}

interface Token { text: string; x: number; value: number | null; code: string; cell: ReportCell }
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
          tokens.push({ text: part, x, value, code, cell });
        }
        if (parts.length > 1 && joined.length >= 6 && joined.length <= 8) tokens.push({ text, x: (cell.x0 + cell.x1) / 2, value: null, code: joined, cell });
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
  /* عمودُ الرمز حيث تتجمّع المطابقات؛ ومنه وحده يُؤخذ رمزُ كل صف. */
  const codeColumns = clusters(candidates.flat().map(item => item.token.x));
  const codeColumnHits = codeColumns.map(center => candidates.filter(items => items.some(item => Math.abs(item.token.x - center) <= 0.02)).length);
  const codeX = codeColumns[codeColumnHits.indexOf(Math.max(0, ...codeColumnHits))];

  const matched: Array<{ line: Line; courseId: number; code: Token }> = [];
  lines.forEach((line, index) => {
    const items = candidates[index];
    if (!items.length) return;
    const pick = codeX == null ? items[0] : items.find(item => Math.abs(item.token.x - codeX) <= 0.02);
    if (pick) matched.push({ line, courseId: pick.courseId, code: pick.token });
  });

  /* رموزٌ بطول رموز الكشف في صفوفٍ لم تطابق مقررات القسم. */
  const byLength = new Map<number, number>();
  for (const item of matched) byLength.set(item.code.code.length, (byLength.get(item.code.code.length) || 0) + 1);
  const usualLength = [...byLength.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
  const matchedLines = new Set(matched.map(item => item.line));
  const foreign = [...new Set(lines.filter(line => !matchedLines.has(line))
    .flatMap(line => line.tokens.filter(token => (usualLength >= 4 || /[A-Za-z]/.test(token.text)) && token.code.length === usualLength && (codeX == null || Math.abs(token.x - codeX) <= 0.02)).map(token => token.text)))].slice(0, 40);

  /* 2) الأرقام الأخرى في صفوف المقررات: أعمدة بمواضعها. */
  const numbers = matched.map(item => item.line.tokens.filter(token => token.cell !== item.code.cell && token.value != null && !(codeX != null && Math.abs(token.x - codeX) <= 0.02)));
  const centers = clusters(numbers.flat().map(token => token.x));
  const floor = Math.max(1, Math.ceil(matched.length * 0.2));
  const kept = centers
    .map(x => ({ x, filled: numbers.filter(tokens => tokens.some(token => Math.abs(token.x - x) <= 0.02)).length }))
    .filter(column => column.filled >= floor)
    .sort((a, b) => b.x - a.x);
  return { lines, matched, codeX, foreign, numbers, kept };
}

/**
 * خاناتٌ فارغة في صفوف المقررات تحت أعمدة الأرقام. القراءة الضوئية تُسقط
 * العددَ المنفرد («0»، «8»)، فيُعاد قراءةُ هذه الخانات وحدها.
 */
export function blankSpots(pages: readonly ReportCell[][], courses: ReadonlyArray<{ id: number; code: string }>, departmentCode: string): Array<{ page: number; x: number; y: number }> {
  const { matched, numbers, kept } = tableOf(pages, courses, departmentCode);
  return matched.flatMap((item, index) => kept
    .filter(column => !numbers[index].some(token => Math.abs(token.x - column.x) <= 0.02))
    .map(column => ({ page: item.line.page, x: column.x, y: item.line.y })));
}

export function readRemainingReport(
  pages: readonly ReportCell[][],
  courses: ReadonlyArray<{ id: number; code: string }>,
  departmentCode: string,
): RemainingReading {
  const { lines, matched, foreign, numbers, kept } = tableOf(pages, courses, departmentCode);

  /* عنوانُ كل عمود: النصّ المطبوع فوقه، فوق أول صفّ مقررٍ في صفحته. كلُّ خليةِ
     عنوانٍ لأقرب عمودٍ إليها وحده؛ وعنوانُ الكشف العريض لا يُنسب إلى عمود. */
  const firstRowY = new Map<number, number>();
  for (const item of matched) firstRowY.set(item.line.page, Math.min(firstRowY.get(item.line.page) ?? Infinity, item.line.y));
  const headerCells = lines.filter(line => firstRowY.has(line.page) && line.y < firstRowY.get(line.page)! && line.y >= firstRowY.get(line.page)! - 0.15)
    .flatMap(line => line.cells.filter(cell => cell.x1 - cell.x0 <= 0.25 && /[ء-يA-Za-z]/.test(normalize(cell.text))));
  const headerOf = new Map<ReportCell, number>();
  for (const cell of headerCells) {
    const center = (cell.x0 + cell.x1) / 2;
    let best = -1, distance = Infinity;
    kept.forEach((column, index) => {
      const d = cell.x0 - 0.01 <= column.x && column.x <= cell.x1 + 0.01 ? 0 : Math.abs(center - column.x);
      if (d < distance) { distance = d; best = index; }
    });
    if (best >= 0 && distance <= 0.06) headerOf.set(cell, best);
  }
  /* العنوان كما يُقرأ: سطراً سطراً من اليمين، والحروف المتلاصقة (يخرجها بعض
     المولّدات حرفاً حرفاً) بلا فراغ بينها. */
  const labelOf = (cells: ReportCell[]) => {
    const rowsOfLabel: ReportCell[][] = [];
    for (const cell of [...cells].sort((a, b) => a.y - b.y)) {
      const last = rowsOfLabel[rowsOfLabel.length - 1];
      if (last && Math.abs(last[0].y - cell.y) <= 0.006) last.push(cell); else rowsOfLabel.push([cell]);
    }
    const textOf = (row: ReportCell[]) => row.sort((a, b) => b.x1 - a.x1)
      .reduce((text, cell, index, all) => text + (index && all[index - 1].x0 - cell.x1 > 0.004 ? " " : "") + normalize(cell.text).trim(), "");
    return [...new Set(rowsOfLabel.map(textOf))].join(" ").replace(/\s+/g, " ").trim().slice(0, 60);
  };
  const columns: ReportColumn[] = kept.map((column, id) => {
    const samples = numbers.map(tokens => tokens.find(token => Math.abs(token.x - column.x) <= 0.02)?.value).filter((v): v is number => v != null).slice(0, 4);
    return { id, x: column.x, label: labelOf(headerCells.filter(cell => headerOf.get(cell) === id)), samples, filled: column.filled };
  });
  const remainingColumns = columns.filter(column => labelLooksRemaining(column.label));
  const column = remainingColumns.length ? remainingColumns.sort((a, b) => b.filled - a.filled)[0].id : null;

  /* 3) الصفوف: المقرر المكرّر يُجمع. */
  const rowsOf = new Map<number, ReportRow>();
  matched.forEach((item, index) => {
    const row = rowsOf.get(item.courseId) || { courseId: item.courseId, printed: item.code.text, values: {}, occurrences: 0 };
    row.occurrences++;
    for (const col of columns) {
      const token = numbers[index].find(candidate => nearest(columns.map(c => c.x), candidate.x) === col.id);
      if (token?.value != null) row.values[col.id] = (row.values[col.id] || 0) + token.value;
    }
    rowsOf.set(item.courseId, row);
  });
  const rows = [...rowsOf.values()];
  const seen = new Set(rows.map(row => row.courseId));
  return { columns, column, rows, foreign, missing: courses.filter(course => !seen.has(course.id)).map(course => course.id) };
}

/** قيم عمودٍ واحد: رقم المقرر ← المتبقي. */
export function remainingValues(reading: Pick<RemainingReading, "rows">, columnId: number): Record<string, number> {
  return Object.fromEntries(reading.rows.filter(row => row.values[columnId] != null).map(row => [String(row.courseId), row.values[columnId]]));
}
