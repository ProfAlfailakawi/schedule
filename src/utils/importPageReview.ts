import { AR, countOf } from "./arabicCount";

/**
 * A scanned page may be accepted with a few printed lines that produced no row
 * (up to two, or 15% of the page; beyond that the file is refused). Those rows
 * are not in the preview at all: nothing on the table is red, and the page
 * would publish short unless the reviewer notices its note. So the page asks
 * for one explicit confirmation — «راجعت الصفحة» — that the reviewer compared
 * it with the paper, and saving or publishing waits for it. The preview edits
 * rows but cannot add one, so the missing lines are added in the schedule once
 * the file is in; the sentences say exactly that. One rule for both import
 * screens.
 */
export type ReviewablePage = { page?: number; missedLines?: number };

/** Pages that still wait for the reviewer's confirmation, in page order. */
export function pagesAwaitingReview(pages: ReviewablePage[] | undefined, reviewed: readonly number[]): number[] {
  const done = new Set(reviewed);
  return (Array.isArray(pages) ? pages : [])
    .filter(page => Number(page?.missedLines) > 0 && Number(page?.page) > 0 && !done.has(Number(page.page)))
    .map(page => Number(page.page))
    .sort((a, b) => a - b);
}

/** The blocking line a waiting page adds to the preview's issues. */
export function pageReviewIssue(page: number, missedLines: number): string {
  return `الصفحة ${page}: ${countOf(missedLines, AR.line)} بلا صف في المعاينة — قارنها بالورقة ثم اضغط «راجعت الصفحة»، وأضف الناقص في الجدول بعد الاستيراد.`;
}

/** The line beside the save / publish buttons while pages still wait. */
export function pageReviewWaitLine(pages: readonly number[]): string {
  if (!pages.length) return "";
  const named = pages.length === 1 ? `الصفحة ${pages[0]}` : `الصفحات ${pages.join("، ")}`;
  return `بانتظار مراجعة ${named}: قارن أسطرها بالورقة ثم اضغط «راجعت الصفحة». الأسطر الناقصة تُضاف في الجدول بعد الاستيراد.`;
}

/** Pages a request did not confirm among those the import receipt requires.
 *  The server's own check: the client's gate is a disabled button, which an
 *  outdated cached app or a direct request never sees. Inputs are untrusted,
 *  so anything that is not a positive whole page number is ignored. */
export function unconfirmedReviewPages(required: unknown, reviewed: unknown): number[] {
  const pagesOf = (value: unknown) => (Array.isArray(value) ? value : []).map(Number).filter(page => Number.isInteger(page) && page > 0);
  const done = new Set(pagesOf(reviewed));
  return [...new Set(pagesOf(required))].filter(page => !done.has(page)).sort((a, b) => a - b);
}

/** All blocking lines for the pages still waiting, ready to merge into the issues. */
export function pageReviewIssues(pages: ReviewablePage[] | undefined, reviewed: readonly number[]): string[] {
  const byPage = new Map((Array.isArray(pages) ? pages : []).map(page => [Number(page?.page), Number(page?.missedLines) || 0] as const));
  return pagesAwaitingReview(pages, reviewed).map(page => pageReviewIssue(page, byPage.get(page) || 0));
}
