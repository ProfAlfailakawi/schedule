/**
 * ── القصُّ الأعمى يحذف أقساماً بأكملها ──────────────────────────────────────
 *
 * نوافذ الاستعارة تُرتَّب برمز المبنى، فإذا زادت عن سعة الصفحة وقُصَّت من
 * آخرها لم تنقص حصص الأقسام بالتساوي: القسم الذي تقع قاعاته بعد القصّ تختفي
 * نوافذه كلها، ويختفي اسمه من مرشِّح الأقسام، فيبدو للقارئ أن قسماً لا قاعات
 * له وهو مليء بها.
 *
 * فالاختيار بالتناوب: نافذةٌ من كل قسم، ثم دورة أخرى، حتى يمتلئ العدد. إن ضاق
 * المكان نقص نصيب الجميع ولم يسقط أحد؛ ثم تُعاد المختارة إلى ترتيب القراءة
 * الأصلي حتى لا يتبدل شكل الصفحة على القارئ.
 */
export function fairShareByOwner<Row>(
  rows: readonly Row[],
  limit: number,
  ownerOf: (row: Row) => number | string,
): Row[] {
  if (limit <= 0) return [];
  if (rows.length <= limit) return [...rows];

  const queues = new Map<number | string, Row[]>();
  rows.forEach(row => {
    const key = ownerOf(row);
    const queue = queues.get(key);
    if (queue) queue.push(row); else queues.set(key, [row]);
  });

  const order = new Map<Row, number>(rows.map((row, index) => [row, index] as const));
  const lists = [...queues.values()];
  const picked: Row[] = [];
  for (let round = 0; picked.length < limit; round += 1) {
    let added = false;
    for (const list of lists) {
      if (round >= list.length) continue;
      picked.push(list[round]);
      added = true;
      if (picked.length >= limit) break;
    }
    if (!added) break;
  }
  return picked.sort((a, b) => (order.get(a) || 0) - (order.get(b) || 0));
}
