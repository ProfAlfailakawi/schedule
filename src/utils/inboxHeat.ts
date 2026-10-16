/**
 * ── «تكدّس الطلبات» في وارد الأساتذة ───────────────────────────────────────────────
 *
 * كم موعداً مطلوباً يبدأ في كل خليّة (يوم × وقت بداية)، من بنود الطلبات المُجابة المحمَّلة أصلاً:
 * عدٌّ لا غير. بنودُ «أبقِ» و«احذف» لا تُعدّ لأنها ليست موعداً مطلوباً.
 *
 * وطبقةُ «عجز القاعات»: في الخليّة الواحدة كم طلباً عُرفت له قاعاتٌ متاحة، وما اتّحادُ تلك القاعات.
 * الطلباتُ أكثرُ من القاعات => لا بدّ أن يخسر أحدُها قاعتَه، فيُرى قبل التثبيت لا بعده. والتعريفُ متحفّظ:
 * طلبٌ بلا قاعاتٍ معلومة لا يُعدّ، فلا إنذارَ كاذب.
 */
export interface HeatRow { status?: string; items?: Array<{ action?: string; hidden?: boolean; roomCandidates?: string[]; slots?: Array<{ day: string | number; start?: string }> }> }
export interface InboxHeat { cells: Map<string, number>; times: string[]; max: number; short: Map<string, { asks: number; rooms: number }> }

export function buildInboxHeat(rows: readonly HeatRow[], isDay: (day: string) => boolean): InboxHeat {
  const cells = new Map<string, number>();
  const supply = new Map<string, { asks: number; rooms: Set<string> }>();
  const starts = new Set<string>();
  for (const row of rows) {
    if (row.status === "sent") continue;
    for (const item of row.items || []) {
      if ((item.action !== "change" && item.action !== "add") || item.hidden) continue;
      for (const slot of item.slots || []) {
        const match = /^(\d{1,2}):(\d{2})/.exec(String(slot.start || ""));
        const day = String(slot.day);
        if (!isDay(day) || !match) continue;
        const start = `${match[1].padStart(2, "0")}:${match[2]}`;
        const key = `${day}|${start}`;
        starts.add(start);
        cells.set(key, (cells.get(key) || 0) + 1);
        const candidates = (item.roomCandidates || []).map(String).filter(Boolean);
        if (candidates.length) {
          const entry = supply.get(key) || { asks: 0, rooms: new Set<string>() };
          entry.asks += 1; candidates.forEach(room => entry.rooms.add(room));
          supply.set(key, entry);
        }
      }
    }
  }
  const times = [...starts].sort();
  const max = Math.max(0, ...cells.values());
  const short = new Map<string, { asks: number; rooms: number }>();
  for (const [key, entry] of supply) if (entry.asks > entry.rooms.size) short.set(key, { asks: entry.asks, rooms: entry.rooms.size });
  return { cells, times, max, short };
}
