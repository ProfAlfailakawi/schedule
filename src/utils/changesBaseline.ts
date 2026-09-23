/**
 * ── أساسُ «ما تحرّك» حين لا تحمل الجولةُ السابقة نسخة ─────────────────────
 *
 * المرساةُ لحظةُ آخِرِ نظرةٍ للتسجيل: إرجاعُ هذه الجولة أو قبولُها، وإلا
 * إرجاعُ الجولة السابقة أو قبولُها. **والإرسالُ ليس نظرة**: لو كان مرساةً
 * لرأى التسجيلُ في أول مراجعةٍ «تعديلاً واحداً منذ الإرسال» بدل الجدول كلِّه.
 *
 * واللقطةُ تحفظ ما كان قبل التعديل وتُنشأ لحظتَه. فأقدمُ لقطةٍ بعد المرساة
 * هي الحالُ قبل أوّلِ تعديلٍ في الجولة — أي ما رآه التسجيل آخرَ مرّة بعينه —
 * فتظهر التعديلاتُ المتتابعة كلُّها، لا آخرُها وحده. ونسخةُ الجولة نفسِها
 * تُستثنى، وإلا قُورنت الجولةُ بنفسها.
 *
 * وحين نظر التسجيلُ ولا لقطةَ بعده فلم يُعدَّل شيء: الجدولُ الحيُّ هو الأساس،
 * و«ما تحرّك» فارغ — لا «كلُّ موعدٍ مضاف» كما كان يُعرض لجدولٍ مقبولٍ لم يُمسّ.
 * وحين لم ينظر التسجيلُ قطّ ولا لقطة: أولُ مراجعةٍ حقاً.
 */
export interface BaselineRound {
  number: number;
  reviewedVersionId?: string;
  returnedAt?: string;
  acceptedAt?: string;
}

export interface BaselineCapture {
  id: string;
  createdAt: string;
}

export type BaselineChoice =
  | { kind: "capture"; versionId: string }
  | { kind: "reviewed" }
  | { kind: "none" };

export function chooseCaptureBaseline(rounds: BaselineRound[], round: number, historyNewestFirst: BaselineCapture[]): BaselineChoice {
  const currentRound = rounds.find(item => item.number === round);
  const previousRound = rounds
    .filter(item => item.number < round)
    .sort((a, b) => b.number - a.number)[0];
  const lastLookAt = currentRound?.returnedAt || currentRound?.acceptedAt
    || previousRound?.returnedAt || previousRound?.acceptedAt;
  const candidates = historyNewestFirst.filter(item => item.id !== currentRound?.reviewedVersionId
    && (!lastLookAt || String(item.createdAt) >= String(lastLookAt)));
  const oldest = candidates[candidates.length - 1];
  if (oldest) return { kind: "capture", versionId: oldest.id };
  if (lastLookAt) return { kind: "reviewed" };
  return { kind: "none" };
}
