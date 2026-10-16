/**
 * ── وارد الأساتذة: خريطةُ التكدّس وطبقةُ عجز القاعات ──
 *   H1 العدّ: كل موعدٍ مطلوب (تغيير/إضافة) في خليّته، والمرسَل غير المُجاب لا يُعدّ، و«احذف» لا يُعدّ.
 *   H2 العجز: ٣ طلباتٍ لقاعتين متاحتين في الخليّة نفسها => عجز؛ ٢ لقاعتين => لا عجز.
 *   H3 التحفّظ: طلبٌ بلا قاعاتٍ معلومة لا يصنع عجزاً.
 */
import { buildInboxHeat } from "../src/utils/inboxHeat";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};
const day = (d: string) => ["0", "1", "2", "3", "4"].includes(d);
const ask = (rooms: string[], start = "09:30", d = 1, action = "change") => ({ action, roomCandidates: rooms, slots: [{ day: d, start }] });

{
  const h = buildInboxHeat([{ status: "answered", items: [ask(["A1", "A2"]), ask(["A1", "A2"]), ask([], "10:00", 2, "delete")] }, { status: "sent", items: [ask(["A1"])] }], day);
  check(h.cells.get("1|09:30") === 2 && !h.cells.has("2|10:00") && h.times.join() === "09:30", "H1 العدّ: يُعدّ المُجاب، ولا «احذف»، ولا المرسَل", [...h.cells]);
  check(h.short.size === 0, "H2 ٢ طلباً لقاعتين: لا عجز");
}
{
  const h = buildInboxHeat([{ status: "answered", items: [ask(["A1", "A2"]), ask(["A1"]), ask(["A2"])] }], day);
  check(h.short.get("1|09:30")?.asks === 3 && h.short.get("1|09:30")?.rooms === 2, "H2 ٣ طلباتٍ لقاعتين: عجز", [...h.short]);
}
{
  const h = buildInboxHeat([{ status: "answered", items: [ask([]), ask([]), ask([]), ask(["A1"])] }], day);
  check(h.cells.get("1|09:30") === 4 && h.short.size === 0, "H3 طلباتٌ بلا قاعاتٍ معلومة لا تصنع عجزاً", [...h.short]);
}
{
  const h = buildInboxHeat([{ status: "answered", items: [ask(["A1"], "09:30", 1), ask(["A1"], "09:30", 2), ask(["A1"], "09:30", 1)] }], day);
  check(h.short.has("1|09:30") && !h.short.has("2|09:30"), "H2 العجز بحسب الخليّة (اليوم × الوقت) لا عالمياً", [...h.short]);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
