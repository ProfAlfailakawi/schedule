/** الفصول ذات مواعيد في النطاق، وآخر فصل أُنشئ دائمًا ولو كان فارغًا. */
export function visibleTermIds(
  termIds: readonly number[],
  rowCountByTerm: ReadonlyMap<number, number>,
  newestTermId: number,
): number[] {
  return termIds.filter(id => (rowCountByTerm.get(Number(id)) || 0) > 0 || Number(id) === Number(newestTermId));
}
