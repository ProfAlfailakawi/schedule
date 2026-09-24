/**
 * ── بنودٌ مترابطة بين قسمين ─────────────────────────────────────────────────
 *
 * أستاذٌ يدرّس في كليتين يطلب حذفَ محاضرته هناك وإضافةَ أخرى هنا في الوقت
 * نفسه. كلُّ قسمٍ يرى بندَه وحده، فالقسمُ الذي عنده الحذفُ لا يعرف أنّ قسماً
 * آخر ينتظره. هذه الدالّة تُسمّي البنودَ التي ينتظرها غيرُها: حذفٌ أو نقلٌ لصفٍّ
 * يتقاطع وقتُه مع إضافةٍ أو نقلٍ في قسمٍ آخر من الطلب نفسه.
 */
import type { FSchedule, InstructorRequestItem } from "../types";

const DAY_KEYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
const minutes = (value: string) => {
  const [h, m] = String(value || "").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export interface ItemScope { collegeId: number; sectionId: number }

export function awaitedItemIndexes(
  items: InstructorRequestItem[],
  rowsById: Map<number, FSchedule>,
  scopeOf: (item: InstructorRequestItem) => ItemScope,
): Set<number> {
  const awaited = new Set<number>();
  items.forEach((freeing, index) => {
    if (freeing.decision?.state || freeing.rowId == null) return;
    if (freeing.action !== "delete" && freeing.action !== "change") return;
    const row = rowsById.get(Number(freeing.rowId));
    if (!row) return;
    const home = scopeOf(freeing);
    const busyDays = DAY_KEYS.filter(day => Boolean((row as any)[day]));
    const from = minutes(row.fstarttime), to = minutes(row.fendtime);
    const needed = items.some((taker, at) => {
      if (at === index || taker.decision?.state) return false;
      if (taker.action !== "add" && taker.action !== "change") return false;
      const there = scopeOf(taker);
      if (there.collegeId === home.collegeId && there.sectionId === home.sectionId) return false;
      return (taker.slots || []).some(slot => busyDays.includes(slot.day as any)
        && minutes(slot.start) < to && from < minutes(slot.end));
    });
    if (needed) awaited.add(index);
  });
  return awaited;
}
