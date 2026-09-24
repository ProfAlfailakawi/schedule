/**
 * What to tell the reviewer when a PDF import ends without its result.
 *
 * The server streams progress lines and ends with a `done` or `error` line, and
 * every refusal it decides on arrives as JSON with its own sentence. When
 * neither arrives, something between the browser and the reader broke — and
 * the one generic «تعذرت قراءة PDF» used to cover every such case, including an
 * instance killed for memory in the middle of a reading (2026-09-24). Each case
 * below says what actually happened and what to do next. None imported a row.
 *
 * `status` is the HTTP status of the response, or 0 when none arrived.
 */
export function interruptedImportMessage(status: number): string {
  if (status === 413)
    return "حجم الملف أكبر من الحد المسموح (24 ميغابايت). لم يُستورد أي صف. قسّم الملف ثم ارفع كل جزء وحده.";
  if (status === 429 || status === 502 || status === 503 || status === 504)
    return "الخادم مشغول أو يُعاد تشغيله الآن. لم يُستورد أي صف. انتظر دقيقة ثم أعد رفع الملف.";
  if (status === 0)
    return "تعذّر الوصول إلى الخادم، فلم يصل الملف. تحقّق من الاتصال ثم أعد المحاولة.";
  if (status >= 200 && status < 300)
    return "انقطع الاتصال بالخادم قبل أن تكتمل قراءة الملف. لم يُستورد أي صف. أعد رفع الملف؛ وإن تكرر الانقطاع فارفع ملف Excel أو PDF مُصدَّراً من النظام، أو قسّم الملف.";
  return `تعذرت قراءة PDF (رمز الخادم ${status}). لم يُستورد أي صف.`;
}
