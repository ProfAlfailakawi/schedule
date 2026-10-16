/**
 * استخراج عناصر النص (بإحداثياتها) من ملف «الخطة الدراسية» لتغذية `parsePlanItems`.
 * الملف المرفوع بياناتٌ غير موثوقة: حدٌّ للحجم والصفحات، وبلا أكواد ولا خطوط خارجية.
 */
import { AR, countOf } from "../utils/arabicCount";
import type { PlanItem } from "../utils/planPdfParser";

export const PLAN_PDF_MAX_BYTES = 2 * 1024 * 1024;
export const PLAN_PDF_MAX_PAGES = 6;

export async function extractPlanItems(input: Uint8Array | Buffer): Promise<PlanItem[][]> {
  if (input.byteLength > PLAN_PDF_MAX_BYTES) throw new Error("الملف أكبر من المسموح لصحيفة.");
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(input), disableWorker: true, useSystemFonts: false, isEvalSupported: false }).promise;
  if (doc.numPages > PLAN_PDF_MAX_PAGES) throw new Error(`صحيفةٌ بأكثر من ${countOf(PLAN_PDF_MAX_PAGES, AR.page)}؟ تحقق من الملف.`);
  const pages: PlanItem[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push((content.items as any[])
      .filter(item => typeof item.str === "string" && item.str.trim())
      .map(item => ({ str: String(item.str), x: Number(item.transform[4]), y: Number(item.transform[5]), w: Number(item.width) })));
  }
  return pages;
}
