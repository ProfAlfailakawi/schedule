/**
 * أيامُ بند الأستاذ مجموعةً بالوقت: كلُّ وقتٍ مختلف مجموعةٌ بأيامها.
 *
 * الصفُّ الواحد في الجدول له وقتٌ واحد. فبندٌ يطلب الأحد ٨:٠٠ والثلاثاء ١٠:٠٠ هو
 * صفّان، لا صفٌّ بوقت الأحد على اليومين (وهو ما كان يقع فيضيع وقتُ الثلاثاء).
 */
export const WEEK_DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;

export interface SlotTimeGroup { days: string[]; start: string; end: string }

export function slotTimeGroups(slots: ReadonlyArray<{ day: string; start: string; end: string }> | undefined): SlotTimeGroup[] {
  const groups = new Map<string, SlotTimeGroup>();
  for (const slot of slots || []) {
    if (!(WEEK_DAYS as readonly string[]).includes(String(slot?.day)) || !slot.start || !slot.end) continue;
    const key = `${slot.start}-${slot.end}`;
    const group = groups.get(key) || { days: [], start: String(slot.start), end: String(slot.end) };
    if (!group.days.includes(String(slot.day))) group.days.push(String(slot.day));
    groups.set(key, group);
  }
  /* الأيامُ بترتيب الأسبوع، والمجموعاتُ بأول أيامها: خطةٌ ثابتة تُقرأ كما يُقرأ الجدول. */
  const order = (day: string) => (WEEK_DAYS as readonly string[]).indexOf(day);
  return [...groups.values()]
    .map(group => ({ ...group, days: [...group.days].sort((a, b) => order(a) - order(b)) }))
    .sort((a, b) => order(a.days[0]) - order(b.days[0]) || a.start.localeCompare(b.start));
}
