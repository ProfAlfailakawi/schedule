/**
 * الفصول التي تظهر في قائمة الفصل لنطاقٍ بعينه: ما فيه بيانات، وأحدثُ فصلٍ دائماً ولو كان فارغاً (فصلٌ جديد قد يريد
 * القسم إنشاءه). فإن أُنشئ بعده فصلٌ أحدث صار هذا قديماً: يختفي إن كان فارغاً. القاعدةُ في هذه الدالة وحدها؛ يستدعيها
 * الخادم (`/api/terms/scoped`) وتُختبر دون خادم.
 *
 *   termIds: الفصول بترتيبها كما وردت، وفيها ما له صفوف، وأحدثُها.
 */
export function visibleTermIds(
  termIds: readonly number[],
  rowCountByTerm: ReadonlyMap<number, number>,
  newestTermId: number,
): number[] {
  return termIds.filter(id => (rowCountByTerm.get(Number(id)) || 0) > 0 || Number(id) === Number(newestTermId));
}
