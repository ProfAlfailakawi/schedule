/**
 * ── هل اختار الأستاذ بديلَ القسم؟ ─────────────────────────────────────────────
 *
 * القسم يرفض بنداً ويعرض بدائل (يوم/أيام + بداية). والأستاذ يضغط أحدها ثم
 * يُرسل. كان الحدث «اخترتَ بديلاً» معرَّفاً في الأنواع ولا يُسجَّل أبداً، فلا
 * يعرف القسم في الخط الزمني أن الأستاذ قَبِل ما عُرض عليه. المطابقة هنا وحدها:
 * الأيامُ نفسها (بلا اعتبارٍ للترتيب) والبدايةُ نفسها.
 */
export interface DepartmentAlternative { day?: string; days?: string[]; start?: string }

const clock = (value: unknown) => {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  return match ? `${Number(match[1])}:${match[2]}` : "";
};

export function chosenAlternativeIndex(
  alternatives: ReadonlyArray<DepartmentAlternative> | undefined | null,
  days: ReadonlyArray<string>,
  start: string,
): number {
  if (!alternatives?.length || !days.length || !clock(start)) return -1;
  const wanted = [...new Set(days.map(String))].sort().join(",");
  return alternatives.findIndex(alternative => {
    const offered = (alternative.days?.length ? alternative.days : [alternative.day]).filter(Boolean).map(String);
    return [...new Set(offered)].sort().join(",") === wanted && clock(alternative.start) === clock(start);
  });
}
