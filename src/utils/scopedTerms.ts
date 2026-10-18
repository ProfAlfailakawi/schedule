/** الفصول ذات مواعيد في النطاق، والفصل الحالي التشغيلي دائمًا ولو كان فارغًا. */
export function visibleTermIds(
  termIds: readonly number[],
  rowCountByTerm: ReadonlyMap<number, number>,
  currentTermId: number,
): number[] {
  return termIds.filter(id => (rowCountByTerm.get(Number(id)) || 0) > 0 || Number(id) === Number(currentTermId));
}
