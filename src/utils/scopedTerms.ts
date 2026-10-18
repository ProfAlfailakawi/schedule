/**
 * الفصول التي تظهر في قائمة الفصل لنطاقٍ بعينه: ما فيه بيانات، والفصل الحالي دائماً ولو كان فارغاً (قد يريد القسم
 * إنشاءه). القاعدةُ في هذه الدالة وحدها؛ يستدعيها الخادم (`/api/terms/scoped`) وتُختبر دون خادم.
 *
 *   termIds: الفصول بترتيبها كما وردت، وفيها ما له صفوف، والحالي.
 */
export function visibleTermIds(
  termIds: readonly number[],
  rowCountByTerm: ReadonlyMap<number, number>,
  currentTermId: number,
): number[] {
  return termIds.filter(id => (rowCountByTerm.get(Number(id)) || 0) > 0 || Number(id) === Number(currentTermId));
}
