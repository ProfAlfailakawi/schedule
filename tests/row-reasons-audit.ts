/** «لماذا هذه القاعة؟» و«رغبة الأستاذ/أثره»: رقائق محسوبة من بياناتٍ موجودة، وتختفي بغيابها. */
import fs from "fs";
import { SCHEDULE_DAYS } from "../src/utils/scheduleIntelligence";
import { buildRowReasons, instructorLoadUnits } from "../src/utils/rowReasons";
import { hasRowExplanation } from "../src/components/RowHistory";

let failed = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? "\x1b[32m✓" : "\x1b[31m✗"} ${label}\x1b[0m`); if (!ok) failed++; };
const row = (id: number, o: any = {}) => {
  const r: any = { id, AdCollegeId: 1, AdSectionId: 5, AdTermId: 10, AdCourseId: 100, AdCourseName: "م", SCode: "01", AdInstructorId: 7, fstarttime: "10:00", fendtime: "10:50", AdRoomCode: "", AdRoomHall: "", buildingId: "", roomId: "" };
  for (const d of SCHEDULE_DAYS) r[d.key] = false;
  r.fsunday = true;
  return Object.assign(r, o);
};
const kinds = (x: any) => buildRowReasons(x).map(r => r.kind);

/* لا بيانات = لا شيء */
check(buildRowReasons({ row: row(1, { AdInstructorId: 0 }) }).length === 0, "بلا بيانات: لا رقائق");
check(!hasRowExplanation(0, null, buildRowReasons({ row: row(1, { AdInstructorId: 0 }) }) as any), "بلا بيانات: «لماذا؟» مخفية");

/* القاعة */
const sel = row(1, { buildingId: "b1", roomId: "r1", AdRoomCode: "B1", AdRoomHall: "101" });
const room: any = { id: "r1", active: true, sectionIds: [5], capacity: 40 };
check(kinds({ row: sel, room }).includes("hall") && !kinds({ row: sel, room }).includes("seats"), "قاعة القسم المسجلة، وسعة الشعبة مجهولة = لا رقاقة سعة");
check(kinds({ row: sel, room: { ...room, sectionIds: [9] } }).length === 0, "قاعة ليست للقسم ولا مستعارة: لا شيء");
check(buildRowReasons({ row: sel, room, maxStudent: 35 }).find(r => r.kind === "seats")?.tone === "good", "سعة كافية");
check(buildRowReasons({ row: sel, room, maxStudent: 55 }).find(r => r.kind === "seats")?.tone === "warn", "سعة ضيقة");
const bar: any = { status: "approved", requesterSectionId: 5, AdTermId: 10, day: "fsunday", startTime: "09:00", endTime: "12:00", roomId: "r1" };
const b1 = kinds({ row: sel, room: { ...room, sectionIds: [9] }, barter: [bar] });
check(b1.includes("borrow") && !b1.includes("hall"), "قاعة مستعارة معتمدة");
check(!kinds({ row: sel, barter: [{ ...bar, status: "pending" }] }).includes("borrow"), "مقايضة غير معتمدة لا تُعدّ");
check(!kinds({ row: sel, barter: [{ ...bar, startTime: "10:30" }] }).includes("borrow"), "مقايضة لا تغطي الفترة لا تُعدّ");
const next = row(2, { fstarttime: "11:00", fendtime: "11:50", buildingId: "b1", roomId: "r2", AdRoomCode: "B1", AdRoomHall: "102" });
const far = row(3, { fstarttime: "11:00", fendtime: "11:50", buildingId: "b2", roomId: "r3", AdRoomCode: "B2", AdRoomHall: "1" });
check(buildRowReasons({ row: sel, instructorRows: [sel, next] }).find(r => r.kind === "walk")?.tone === "good", "محاضرة مجاورة في المبنى نفسه");
check(buildRowReasons({ row: sel, instructorRows: [sel, far] }).find(r => r.kind === "walk")?.tone === "info", "محاضرة مجاورة في مبنى آخر");
check(!kinds({ row: sel, instructorRows: [sel, row(4, { fstarttime: "14:00", fendtime: "14:50", buildingId: "b2" })] }).includes("walk"), "فجوة كبيرة: لا قرب");

/* الأستاذ */
const plain = row(1);
check(buildRowReasons({ row: plain, quota: 12, loadUnits: 9 }).find(r => r.kind === "load")?.tone === "good", "حمل ضمن النصاب");
check(buildRowReasons({ row: plain, quota: 12, loadUnits: 15 }).find(r => r.kind === "load")?.tone === "warn", "حمل فوق النصاب");
check(!kinds({ row: plain, quota: null, loadUnits: 9 }).includes("load"), "بلا نصاب مسجّل: لا رقاقة حمل");
const old = (term: number, o: any = {}) => row(50 + term, { AdTermId: term, ...o });
check(Boolean(buildRowReasons({ row: plain, history: [old(8), old(9)] }).find(r => r.kind === "pattern")?.label.includes("فصلان")), "نمط مكرر في فصلين");
check(buildRowReasons({ row: plain, history: [old(8, { fstarttime: "08:00" })] }).find(r => r.kind === "pattern")?.tone === "info", "نمط مختلف = جديد");
check(!kinds({ row: plain, history: [old(8, { AdInstructorId: 99 })] }).includes("pattern"), "تاريخ أستاذ آخر لا يُحسب");
const req: any = { AdInstructorId: 7, status: "submitted", items: [{ rowId: 1, action: "change" }] };
check(Boolean(buildRowReasons({ row: plain, requests: [req] }).find(r => r.kind === "request")?.label.includes("تعديل")), "طلب مفتوح يمسّ الصف");
check(!kinds({ row: plain, requests: [{ ...req, status: "settled" }] }).includes("request"), "طلب منتهٍ لا يظهر");
check(!kinds({ row: plain, requests: [{ ...req, items: [{ rowId: 1, action: "change", decision: { state: "fixed" } }] }] }).includes("request"), "بند مقرَّر لا يظهر");
check(!kinds({ row: plain, requests: [{ ...req, items: [{ rowId: 2, action: "change" }] }] }).includes("request"), "طلب لصفٍّ آخر لا يظهر");
const prop: any = { AdInstructorId: 7, status: "sent", ops: [{ source: { id: 1 } }] };
check(kinds({ row: plain, proposals: [prop] }).includes("request"), "مقترح مرسل يمسّ الصف");
check(!kinds({ row: plain, proposals: [{ ...prop, status: "draft" }] }).includes("request"), "مسودة مقترح داخلية لا تظهر");
check(instructorLoadUnits([row(1), row(2), row(3, { SCode: "02" })], 7, () => 3) === 6, "الشعبة (مقرر+رمز) تُحسب مرة");

/* المصدر */
const server = fs.readFileSync("server.ts", "utf8"), sch = fs.readFileSync("src/components/Schedules.tsx", "utf8"), rh = fs.readFileSync("src/components/RowHistory.tsx", "utf8");
check(server.includes("buildRowReasons({") && /decisionCost,whyHere,reasons\}/.test(server), "الخادم يضيف reasons إلى سياق الموعد");
check(server.includes("تعذّر حساب رقائق"), "إخفاق الحساب لا يكسر السياق");
check(sch.includes("context.reasons"), "البطاقة تمرر reasons");
check(rh.includes("title={f.tip") && rh.includes("if (!hasRowExplanation"), "لكل رقاقة تلميح، والكتلة تختفي عند غياب البيانات");
process.exit(failed ? 1 : 0);
