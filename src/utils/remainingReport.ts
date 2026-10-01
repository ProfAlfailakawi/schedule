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
  /** «لم يسجلوا» لا يساوي «لم يجتازوا − المسجلين»: قراءةٌ أخطأت. يُعتمد أوثقُهما ويُعلَّم الصف. */
  doubt?: { read: number; derived: number; chosen: number };
  /** خانة «لم يسجلوا» فارغةٌ بتصميم الكشف (لا شعب للمقرر): يؤخذ «لم يجتازوا». */
  blankByDesign?: boolean;
}

export interface RemainingReading {
  columns: ReportColumn[];
  /** عمود «المتبقي»: «الذين لم يسجلوا»، وإلا «لم يجتازوا»، وإلا عنوانٌ فيه «المتبقي»؛ أو null فيختار القسم. */
  column: number | null;
  /** يُؤخذ منه حين تكون خانة العمود فارغة: «لم يجتازوا» لمقررٍ بلا شعب في الكشف. */
  fallback: number | null;
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

/**
 * ما يعنيه عمودٌ من عنوانه، بأعمدة كشف العمادة SWRS136 («احصائية بعدد الطلبة
 * الذين لم يجتازوا المقرر ومسجلين بقوائم الانتظار»):
 *
 *   لم يجتازوا (في بداية التسجيل) · سعة الشعب · عدد المسجلين · المقاعد المتبقية
 *   · عدد الشعب · اعداد الذين لم يسجلوا
 *
 * «المتبقي» عند القسم هو «الذين لم يسجلوا» — لا «المقاعد المتبقية» وإن اشتركا
 * في الكلمة. والعنوان يُقرأ بقطعٍ ثابتة لأن القراءة الضوئية تُشوّه أطرافه
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
/** هل هذا عنوانُ عمودٍ يصلح «متبقياً»؟ */
export function labelLooksRemaining(label: string): boolean {
  const kind = columnKind(label);
  return kind === "unregistered" || kind === "notPassed" || kind === "remaining";
}

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
  const usualLength = [...byLength.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
  const matchedLines = new Set(matched.map(item => item.line));
  const foreign = [...new Set(lines.filter(line => !matchedLines.has(line))
    .flatMap(line => line.tokens.filter(token => token.code.length === usualLength && (usualLength >= 4 || /[A-Za-z]/.test(token.text) || inCode(line.page, token.x))
      && (!codeXOf.has(line.page) || inCode(line.page, token.x))).map(token => token.text)))].slice(0, 40);

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
  return { matched, foreign, assigned, kept, xOn };
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
  const { matched, foreign, assigned, kept } = tableOf(pages, courses, departmentCode);
  const columns: ReportColumn[] = kept.map((column, id) => {
    const samples = assigned.map(map => map.get(id)?.value).filter((v): v is number => v != null).slice(0, 4);
    /* عنوانٌ عُرف معناه في أيٍّ من الصفحات يكفي، ولو شوّهت القراءةُ غيره. */
    const label = column.labels.find(text => columnKind(text)) || column.labels[0] || "";
    const kind = columnKind(label) ?? (column.identity && !column.identity.startsWith("t:") ? column.identity as ColumnKind : null);
    return { id, x: column.x, label, samples, filled: column.filled, kind };
  });
  const ofKind = (kind: ColumnKind) => columns.filter(column => column.kind === kind).sort((a, b) => b.filled - a.filled)[0]?.id ?? null;
  const unregistered = ofKind("unregistered"), notPassed = ofKind("notPassed");
  const column = unregistered ?? notPassed ?? ofKind("remaining");
  const fallback = unregistered != null && notPassed != null ? notPassed : null;

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

  /* «عدد المسجلين» إن لم يُعرف عنوانه: عمودٌ بلا عنوانٍ معروف كلُّ ما فيه صفر،
     وقد امتلأ في أكثر الصفوف — هكذا يُطبع قبل التسجيل. */
  const registered = ofKind("registered") ?? columns.find(item => item.kind == null && item.filled >= rows.length * 0.5
    && rows.every(row => row.values[item.id] == null || row.values[item.id] === 0) && rows.some(row => row.values[item.id] === 0))?.id ?? null;

  /* 5) الخانة الفارغة بتصميم الكشف لا بخطأ القراءة: مقررٌ لا شعب له هذا الفصل
     يُترك صفّه فارغاً إلا «لم يجتازوا» (وعدد الشعب صفر). فلا يُؤخذ البديل إلا
     لصفٍّ هذه صورته؛ وما سواه خانةٌ لم تُقرأ، تُترك للمراجعة. */
  if (unregistered != null && fallback != null) for (const row of rows) {
    if (row.values[unregistered] != null || row.values[fallback] == null) continue;
    const others = Object.entries(row.values).filter(([id]) => Number(id) !== fallback && Number(id) !== unregistered);
    if (others.length <= 1 && others.every(([, value]) => value === 0)) row.blankByDesign = true;
  }

  /* 6) حسابُ الكشف نفسه يفحص القراءة: «لم يسجلوا» = «لم يجتازوا» − «المسجلين».
     يُفحص حين تُقرأ الثلاثة كلها؛ وخلافُها قراءةٌ أخطأت: يُعتمد أوثقها ويُعلَّم الصف. */
  if (unregistered != null && notPassed != null && registered != null) for (const row of rows) {
    const read = row.values[unregistered], passed = row.values[notPassed], enrolled = row.values[registered];
    if (read == null || passed == null || enrolled == null) continue;
    const derived = Math.max(0, passed - enrolled);
    if (read === derived) continue;
    row.doubt = { read, derived, chosen: (row.confidence[notPassed] ?? 100) > (row.confidence[unregistered] ?? 100) ? derived : read };
  }
  const seen = new Set(rows.map(row => row.courseId));
  return { columns, column, fallback, rows, foreign, missing: courses.filter(course => !seen.has(course.id)).map(course => course.id) };
}

/** قيمة المتبقي لصفّ: من العمود (أو ما رجّحه فحصُ الحساب)، وإلا من البديل حين تفرغ خانته. */
export function remainingOf(row: Pick<ReportRow, "values" | "doubt" | "blankByDesign">, columnId: number, fallbackId: number | null = null, primaryId: number | null = null): { value: number | undefined; fromFallback: boolean } {
  if (row.doubt && columnId === primaryId) return { value: row.doubt.chosen, fromFallback: false };
  if (row.values[columnId] != null) return { value: row.values[columnId], fromFallback: false };
  if (fallbackId != null && row.blankByDesign && row.values[fallbackId] != null) return { value: row.values[fallbackId], fromFallback: true };
  return { value: undefined, fromFallback: false };
}

/** قيم عمودٍ واحد (وبديله): رقم المقرر ← المتبقي. */
export function remainingValues(reading: Pick<RemainingReading, "rows"> & Partial<Pick<RemainingReading, "column">>, columnId: number, fallbackId: number | null = null): Record<string, number> {
  return Object.fromEntries(reading.rows
    .map(row => [String(row.courseId), remainingOf(row, columnId, fallbackId, reading.column ?? null).value] as const)
    .filter((entry): entry is readonly [string, number] => entry[1] != null));
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
